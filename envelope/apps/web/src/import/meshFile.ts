/**
 * Mesh-only uploads (.glb, .gltf with embedded buffers, .obj): the footprint comes from the mesh
 * outline; floors and floor height are typed by the user (import plan, phase 1). glTF is metres and
 * Y-up by specification; OBJ has no units or axes, so the dialog shows the size for checking.
 */
import type { ImportDraft, Point2 } from '@envelope/models';
import { WebIO } from '@gltf-transform/core';
import type { MeshPart } from './mesh';
import { centreParts, footprintHull, plan, ringCentroid } from './mesh';
import type { ParsedModel } from './ifc';

const GREY: MeshPart['color'] = [0.78, 0.77, 0.74, 1];

async function readGltf(data: Uint8Array, ext: 'glb' | 'gltf'): Promise<MeshPart[]> {
  const io = new WebIO();
  const doc =
    ext === 'glb'
      ? await io.readBinary(data)
      : await io.readJSON({ json: JSON.parse(new TextDecoder().decode(data)), resources: {} });
  const parts: MeshPart[] = [];
  for (const scene of doc.getRoot().listScenes())
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')?.getArray();
        if (!pos) continue;
        const n = pos.length / 3;
        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const [x, y, z] = [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
          positions[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
          positions[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          positions[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        const idx = prim.getIndices()?.getArray();
        const indices = idx ? Uint32Array.from(idx) : Uint32Array.from({ length: n }, (_, i) => i);
        const c = prim.getMaterial()?.getBaseColorFactor() ?? GREY;
        parts.push({ positions, normals: null, indices, color: [c[0]!, c[1]!, c[2]!, c[3]!] });
      }
    });
  return parts;
}

/** Wavefront OBJ: vertices and faces only (fan-triangulated; v, v/vt, v//vn, v/vt/vn; negative indices). */
export function readObj(text: string): MeshPart[] {
  const verts: number[] = [];
  const indices: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/);
      verts.push(Number(x), Number(y), Number(z));
    } else if (line.startsWith('f ')) {
      const count = verts.length / 3;
      const face = line
        .split(/\s+/)
        .slice(1)
        .map((t) => {
          const i = Number(t.split('/')[0]);
          return i < 0 ? count + i : i - 1;
        });
      for (let k = 1; k + 1 < face.length; k++) indices.push(face[0]!, face[k]!, face[k + 1]!);
    }
  }
  if (!indices.length) return [];
  return [
    { positions: Float32Array.from(verts), normals: null, indices: Uint32Array.from(indices), color: GREY },
  ];
}

/**
 * Ground level of a Y-up mesh. Authors usually model the ground at y = 0 and sink foundations and
 * paving below it, so y = 0 is taken when it lies in the lowest quarter of the model's height;
 * otherwise (models centred on the origin, or drawn wholly above it) the lowest point is.
 */
export function meshGroundY(lowY: number, topY: number): number {
  return lowY < 0 && topY > 0 && -lowY <= 0.25 * (topY - lowY) ? 0 : lowY;
}

export async function parseMeshFile(data: Uint8Array, fileName: string): Promise<ParsedModel> {
  const ext = fileName.toLowerCase().split('.').pop();
  const parts =
    ext === 'obj'
      ? readObj(new TextDecoder().decode(data))
      : await readGltf(data, ext === 'gltf' ? 'gltf' : 'glb');
  if (!parts.length) throw new Error('The file contains no triangle meshes to import.');
  let lowY = Infinity;
  let topY = -Infinity;
  for (const p of parts)
    for (let i = 1; i < p.positions.length; i += 3) {
      lowY = Math.min(lowY, p.positions[i]!);
      topY = Math.max(topY, p.positions[i]!);
    }
  const groundY = meshGroundY(lowY, topY);
  const heightM = topY - groundY;
  // Footprint from what stands clear of the ground, so paving, foundations and plant pots do not widen it.
  const cutY = groundY + Math.min(2.5, 0.3 * heightM);
  const pick = (minY: number) => {
    const pts: Point2[] = [];
    for (const p of parts)
      for (let i = 0; i < p.positions.length; i += 3)
        if (p.positions[i + 1]! >= minY) pts.push(plan(p.positions[i]!, p.positions[i + 2]!));
    return pts;
  };
  const upper = pick(cutY);
  let hull = footprintHull(upper.length >= 3 ? upper : pick(-Infinity));
  const centroid = ringCentroid(hull);
  hull = hull.map(([x, y]) => [x - centroid[0], y - centroid[1]]);
  centreParts(parts, centroid, groundY);
  const draft: ImportDraft = {
    kind: 'mesh',
    fileName,
    name: fileName.replace(/\.[^.]+$/, ''),
    use: 'office',
    floors: null,
    floorToFloorM: null,
    basements: null,
    hull,
    edgeWindowAreaM2: null,
    northRotationDeg: 0,
    ifcSite: null,
    concreteM3: null,
    heightM,
    warnings: [
      { field: 'floors', text: 'Mesh files have no storeys: enter the number of floors.' },
      {
        field: 'floorToFloorM',
        text: "The floor-to-floor height is filled in from the model's height above ground once the floors are entered; check it.",
      },
      {
        field: 'basements',
        text: 'Mesh files have no basement data: basements set to 0. Change it under Assumptions if the building has one.',
      },
      {
        field: 'wwr',
        text: 'Mesh files have no windows data: window-to-wall ratio set to 0.4; adjust if needed.',
      },
      {
        field: 'footprint',
        text:
          ext === 'obj'
            ? 'OBJ files carry no units: check the footprint size below and pick the unit the model was drawn in.'
            : 'The outline is the convex hull of what stands above ground (paving and foundations left out), so overhangs widen it.',
      },
      {
        field: 'location',
        text: 'Mesh files have no site coordinates: search for the address or type them.',
      },
      {
        field: 'quantities',
        text: 'Concrete comes from the per-m² intensity (no quantities in mesh files).',
      },
    ],
  };
  return { draft, parts };
}
