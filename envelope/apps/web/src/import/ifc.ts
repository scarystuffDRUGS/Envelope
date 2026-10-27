/**
 * IFC → ImportDraft + mesh, with web-ifc (IFC2x3 / IFC4). Runs in the import Web Worker and in
 * Node tests. The draft is what the import dialog shows for confirmation (D-027):
 *   floors          storeys at or above ground, without roof-like levels and empty storeys
 *   floorToFloorM   median gap between those storey elevations
 *   basements       storeys below ground → the Basements assumptions
 *   hull            convex plan outline of the ground storey's elements
 *   windows         IfcWindow area (OverallWidth × OverallHeight, else mesh box) on the nearest
 *                   hull edge
 *   concreteM3      Net/GrossVolume base quantities of concrete elements
 *   site, north     IfcSite RefLatitude/RefLongitude and the model context's TrueNorth
 * Attribute values (elevations, window sizes) are in the file's length unit; web-ifc meshes are
 * already in metres, Y-up.
 */
import type { DraftField, ImportDraft, Point2 } from '@envelope/models';
import { dmsToDegrees, lengthUnitToMetres, nearestEdge, polygonArea } from '@envelope/models';
import type { IfcAPI } from 'web-ifc';
import * as W from 'web-ifc';
import type { MeshPart } from './mesh';
import { centreParts, footprintHull, plan, ringCentroid } from './mesh';

export interface ParsedModel {
  draft: ImportDraft;
  /** Centred on the footprint centroid, ground at y = 0. */
  parts: MeshPart[];
}

interface ElementMesh extends MeshPart {
  id: number;
  type: number;
}

/** Storeys named like these are roof structures, not floors (common in Indian models too). */
const ROOF_LIKE = /roof|terrace|parapet|top of|mumty|machine room|lift room|\bo\.?h\.?t\b|overhead|headroom/i;
const CONCRETE = /concrete|\brcc\b|r\.c\.c|beton|\bm\s?\d{2}\b|\bc\s?\d{2}\b/i;
const STEEL = /steel|\bms\b|metal|timber|wood/i;
/** Load-bearing types that are concrete unless their material says otherwise. */
const STRUCTURAL = new Set([W.IFCSLAB, W.IFCBEAM, W.IFCCOLUMN, W.IFCFOOTING, W.IFCPILE]);
const WALLS = new Set([W.IFCWALL, W.IFCWALLSTANDARDCASE]);

const num = (v: unknown): number | null => {
  const x = (v as { value?: unknown } | null)?.value ?? v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};
const str = (v: unknown): string | null => {
  const x = (v as { value?: unknown } | null)?.value ?? v;
  return typeof x === 'string' && x.trim() ? x.trim() : null;
};
const ref = (v: unknown): number | null => num(v);
const refs = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(ref).filter((x): x is number => x !== null) : [];
/** Numeric list attribute: web-ifc gives either an array of values or { value: [...] }. */
const numbers = (v: unknown): number[] | null => {
  const a = Array.isArray(v) ? v : (v as { value?: unknown } | null)?.value;
  return Array.isArray(a) ? a.map((x) => num(x) ?? 0) : null;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}

export async function parseIfc(api: IfcAPI, data: Uint8Array, fileName: string): Promise<ParsedModel> {
  const model = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true });
  try {
    return readModel(api, model, fileName);
  } finally {
    api.CloseModel(model);
  }
}

function readModel(api: IfcAPI, model: number, fileName: string): ParsedModel {
  const warnings: { field: DraftField; text: string }[] = [];
  const warn = (field: DraftField, text: string) => warnings.push({ field, text });
  const line = (id: number) => api.GetLine(model, id) as Record<string, unknown>;
  const ids = (type: number, inherited = false) => {
    const v = api.GetLineIDsWithType(model, type, inherited);
    const out: number[] = [];
    for (let i = 0; i < v.size(); i++) out.push(v.get(i));
    return out;
  };
  const typeOf = (id: number) => api.GetLineType(model, id) as number;

  // ---------- Units ----------
  let lengthM = 1;
  let volumeM3 = 1;
  for (const ua of ids(W.IFCUNITASSIGNMENT)) {
    for (const uid of refs(line(ua).Units)) {
      const u = line(uid);
      const kind = str(u.UnitType);
      if (typeOf(uid) === W.IFCSIUNIT) {
        const prefix = str(u.Prefix);
        if (kind === 'LENGTHUNIT') lengthM = lengthUnitToMetres({ prefix });
        if (kind === 'VOLUMEUNIT') volumeM3 = lengthUnitToMetres({ prefix }) ** 3;
      } else if (typeOf(uid) === W.IFCCONVERSIONBASEDUNIT) {
        const cfId = ref(u.ConversionFactor);
        const factor = cfId !== null ? num(line(cfId).ValueComponent) : null;
        if (kind === 'LENGTHUNIT' && factor) lengthM = lengthUnitToMetres({ conversionFactor: factor });
        if (kind === 'VOLUMEUNIT' && factor) volumeM3 = factor;
      }
    }
  }

  // ---------- Spatial structure ----------
  const storeys = ids(W.IFCBUILDINGSTOREY).map((id) => {
    const l = line(id);
    const e = num(l.Elevation);
    return { id, name: str(l.Name) ?? `Storey ${id}`, elev: e === null ? null : e * lengthM };
  });
  const storeyOf = new Map<number, number>();
  for (const rel of ids(W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const l = line(rel);
    const s = ref(l.RelatingStructure);
    if (s !== null) for (const e of refs(l.RelatedElements)) storeyOf.set(e, s);
  }

  // ---------- Meshes (metres, Y-up, placed) ----------
  const meshes = new Map<number, ElementMesh[]>();
  api.StreamAllMeshes(model, (fm) => {
    const type = typeOf(fm.expressID);
    if (type === W.IFCOPENINGELEMENT || type === W.IFCSPACE) return;
    const list: ElementMesh[] = [];
    for (let g = 0; g < fm.geometries.size(); g++) {
      const pg = fm.geometries.get(g);
      const geom = api.GetGeometry(model, pg.geometryExpressID);
      const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
      const m = pg.flatTransformation;
      const n = v.length / 6;
      const positions = new Float32Array(n * 3);
      const normals = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const [x, y, z, nx, ny, nz] = [
          v[i * 6]!,
          v[i * 6 + 1]!,
          v[i * 6 + 2]!,
          v[i * 6 + 3]!,
          v[i * 6 + 4]!,
          v[i * 6 + 5]!,
        ];
        positions[i * 3] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
        positions[i * 3 + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
        positions[i * 3 + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
        normals[i * 3] = m[0]! * nx + m[4]! * ny + m[8]! * nz;
        normals[i * 3 + 1] = m[1]! * nx + m[5]! * ny + m[9]! * nz;
        normals[i * 3 + 2] = m[2]! * nx + m[6]! * ny + m[10]! * nz;
      }
      list.push({
        id: fm.expressID,
        type,
        positions,
        normals,
        indices: new Uint32Array(idx),
        color: [pg.color.x, pg.color.y, pg.color.z, pg.color.w],
      });
      geom.delete();
    }
    if (list.length) meshes.set(fm.expressID, [...(meshes.get(fm.expressID) ?? []), ...list]);
  });
  const allParts = [...meshes.values()].flat();
  if (!allParts.length) throw new Error('The IFC file contains no 3D geometry to import.');

  // ---------- Floors, floor height, basements ----------
  const hasMesh = (storeyId: number) => [...storeyOf].some(([e, s]) => s === storeyId && meshes.has(e));
  const withElev = storeys.filter((s) => s.elev !== null).sort((a, b) => a.elev! - b.elev!);
  if (withElev.length < storeys.length) warn('floors', 'Some storeys have no elevation and were skipped.');
  const above = withElev.filter((s) => s.elev! >= -0.05);
  const roofLike = above.filter((s) => ROOF_LIKE.test(s.name));
  const empty = above.filter((s) => !ROOF_LIKE.test(s.name) && !hasMesh(s.id));
  const counted = above.filter((s) => !ROOF_LIKE.test(s.name) && hasMesh(s.id));
  if (roofLike.length)
    warn('floors', `Not counted as floors (roof levels): ${roofLike.map((s) => s.name).join(', ')}.`);
  if (empty.length)
    warn('floors', `Not counted as floors (no elements): ${empty.map((s) => s.name).join(', ')}.`);
  let floors: number | null = counted.length || null;
  // Gaps between counted storeys and up to the next level above (often the roof level).
  const levels = [...counted, ...roofLike].map((s) => s.elev!).sort((a, b) => a - b);
  const gaps = levels
    .slice(1)
    .map((e, i) => e - levels[i]!)
    .filter((g) => g > 0.5);
  let floorToFloorM = median(gaps);
  const below = withElev.filter((s) => s.elev! < -0.05);
  const groundElev = counted[0]?.elev ?? 0;
  const basements = below.length
    ? { count: below.length, depthM: (groundElev - below[0]!.elev!) / below.length }
    : null;

  // ---------- Ground level and footprint ----------
  const ground = counted[0];
  const groundParts = ground
    ? allParts.filter(
        (p) => storeyOf.get(p.id) === ground.id && p.type !== W.IFCWINDOW && p.type !== W.IFCDOOR,
      )
    : [];
  const minY = (ps: MeshPart[]) => {
    let y = Infinity;
    for (const p of ps) for (let i = 1; i < p.positions.length; i += 3) y = Math.min(y, p.positions[i]!);
    return y;
  };
  const verticals = groundParts.filter(
    (p) => WALLS.has((p as ElementMesh).type) || (p as ElementMesh).type === W.IFCCOLUMN,
  );
  let groundY = minY(verticals.length ? verticals : groundParts.length ? groundParts : allParts);
  const footprintSource = groundParts.length ? groundParts : allParts;
  if (!groundParts.length)
    warn('footprint', 'Ground-storey elements could not be identified; the outline uses the whole model.');
  const pts: Point2[] = [];
  for (const p of footprintSource)
    for (let i = 0; i < p.positions.length; i += 3) pts.push(plan(p.positions[i]!, p.positions[i + 2]!));
  let hull = footprintHull(pts);
  const centroid = ringCentroid(hull);
  hull = hull.map(([x, y]) => [x - centroid[0], y - centroid[1]]);

  // Slab check: upward faces of ground-storey slabs vs the hull (L/U shapes, overhangs).
  let slabArea = 0;
  for (const p of groundParts.filter((q) => (q as ElementMesh).type === W.IFCSLAB)) {
    const v = p.positions;
    for (let t = 0; t < p.indices.length; t += 3) {
      const [a, b, c] = [p.indices[t]! * 3, p.indices[t + 1]! * 3, p.indices[t + 2]! * 3];
      const ux = v[b]! - v[a]!,
        uy = v[b + 1]! - v[a + 1]!,
        uz = v[b + 2]! - v[a + 2]!;
      const wx = v[c]! - v[a]!,
        wy = v[c + 1]! - v[a + 1]!,
        wz = v[c + 2]! - v[a + 2]!;
      const cx = uy * wz - uz * wy,
        cy = uz * wx - ux * wz,
        cz = ux * wy - uy * wx;
      const len = Math.hypot(cx, cy, cz);
      if (len > 0 && cy / len > 0.7) slabArea += Math.abs(cy) / 2;
    }
  }
  const hullArea = Math.abs(polygonArea(hull));
  if (slabArea > 0 && hullArea > 1.15 * slabArea)
    warn(
      'footprint',
      `The convex outline (${hullArea.toFixed(0)} m²) is over 15% larger than the ground slab (${slabArea.toFixed(0)} m²): the building is probably L- or U-shaped, and areas will be overstated.`,
    );
  if (floors === null) warn('floors', 'No storeys found: enter the number of floors.');
  if (floorToFloorM === null && floors === 1) {
    let maxY = -Infinity;
    for (const p of allParts)
      for (let i = 1; i < p.positions.length; i += 3) maxY = Math.max(maxY, p.positions[i]!);
    const h = maxY - groundY;
    floorToFloorM = h > 0 ? h : null;
  }
  if (floorToFloorM === null) warn('floorToFloorM', 'Floor height could not be read: enter it.');
  if (floors !== null && floors > 100) {
    warn('floors', `${floors} storeys found, more than the 100 the models support.`);
    floors = null;
  }

  // ---------- Windows ----------
  const edgeArea = new Array<number>(hull.length).fill(0);
  let windows = 0;
  let unplaced = 0;
  for (const id of ids(W.IFCWINDOW, true)) {
    const parts = meshes.get(id);
    const l = line(id);
    let area = (num(l.OverallWidth) ?? 0) * (num(l.OverallHeight) ?? 0) * lengthM * lengthM;
    if (!parts) {
      unplaced++;
      continue;
    }
    let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of parts)
      for (let i = 0; i < p.positions.length; i += 3) {
        x0 = Math.min(x0, p.positions[i]!);
        x1 = Math.max(x1, p.positions[i]!);
        y0 = Math.min(y0, p.positions[i + 1]!);
        y1 = Math.max(y1, p.positions[i + 1]!);
        z0 = Math.min(z0, p.positions[i + 2]!);
        z1 = Math.max(z1, p.positions[i + 2]!);
      }
    if (!(area > 0)) area = Math.max(x1 - x0, z1 - z0) * (y1 - y0); // box face as the glazing
    const [px, py] = plan((x0 + x1) / 2, (z0 + z1) / 2);
    edgeArea[nearestEdge(hull, [px - centroid[0], py - centroid[1]])]! += area;
    windows++;
  }
  if (unplaced) warn('wwr', `${unplaced} window(s) have no geometry and were left out.`);
  const edgeWindowAreaM2 = windows ? edgeArea : null;
  if (!windows) warn('wwr', 'No windows found: window-to-wall ratio set to 0.4 on every facade.');

  // ---------- Concrete base quantities, materials, occupancy ----------
  const volume = new Map<number, { net?: number; gross?: number }>();
  let occupancy: string | null = null;
  const buildingIds = ids(W.IFCBUILDING);
  for (const rel of ids(W.IFCRELDEFINESBYPROPERTIES)) {
    const l = line(rel);
    const pd = ref(l.RelatingPropertyDefinition);
    if (pd === null) continue;
    const related = refs(l.RelatedObjects);
    const pt = typeOf(pd);
    if (pt === W.IFCELEMENTQUANTITY) {
      for (const qid of refs(line(pd).Quantities)) {
        if (typeOf(qid) !== W.IFCQUANTITYVOLUME) continue;
        const q = line(qid);
        const name = str(q.Name);
        const value = num(q.VolumeValue);
        if (value === null || (name !== 'NetVolume' && name !== 'GrossVolume')) continue;
        for (const e of related) {
          const v = volume.get(e) ?? {};
          v[name === 'NetVolume' ? 'net' : 'gross'] = value * volumeM3;
          volume.set(e, v);
        }
      }
    } else if (pt === W.IFCPROPERTYSET && related.some((r) => buildingIds.includes(r))) {
      const ps = line(pd);
      if (str(ps.Name) === 'Pset_BuildingCommon')
        for (const pid of refs(ps.HasProperties)) {
          const p = line(pid);
          if (str(p.Name) === 'OccupancyType') occupancy = str(p.NominalValue);
        }
    }
  }
  const material = new Map<number, string>();
  for (const rel of ids(W.IFCRELASSOCIATESMATERIAL)) {
    const l = line(rel);
    const m = ref(l.RelatingMaterial);
    if (m === null) continue;
    const names = JSON.stringify(api.GetLine(model, m, true)).match(/"Name":\{[^}]*"value":"([^"]*)"/g) ?? [];
    const text = names.join(' ');
    for (const e of refs(l.RelatedObjects)) material.set(e, `${material.get(e) ?? ''} ${text}`);
  }
  let concrete = 0;
  for (const [id, v] of volume) {
    const vol = v.net ?? v.gross ?? 0;
    const type = typeOf(id);
    const mat = material.get(id);
    const isConcrete = mat
      ? CONCRETE.test(mat) || (STRUCTURAL.has(type) && !STEEL.test(mat))
      : STRUCTURAL.has(type);
    if (isConcrete && (STRUCTURAL.has(type) || WALLS.has(type))) concrete += vol;
  }
  let concreteM3: number | null = concrete > 0 ? concrete : null;
  if (concreteM3 && floors) {
    const perM2 = concreteM3 / (hullArea * floors);
    if (perM2 < 0.15 || perM2 > 1.2) {
      warn(
        'quantities',
        `The model's concrete volume (${concreteM3.toFixed(0)} m³, ${perM2.toFixed(2)} m³ per m² of floor) is outside the usual 0.15–1.2 range, so the per-m² intensity is used instead.`,
      );
      concreteM3 = null;
    }
  }
  if (!concreteM3 && !warnings.some((w) => w.field === 'quantities'))
    warn('quantities', 'No concrete base quantities in the model: concrete comes from the per-m² intensity.');

  // ---------- Names, use, site, true north ----------
  const building = buildingIds[0] !== undefined ? line(buildingIds[0]) : null;
  const project = ids(W.IFCPROJECT)[0];
  const name =
    str(building?.Name) ??
    (project !== undefined ? str(line(project).Name) : null) ??
    fileName.replace(/\.[^.]+$/, '');
  const use: ImportDraft['use'] = !occupancy
    ? 'office'
    : /resid|apartment|housing|dwelling|flat/i.test(occupancy)
      ? 'residential'
      : /retail|shop|mall|store/i.test(occupancy)
        ? 'retail'
        : /mixed/i.test(occupancy)
          ? 'mixed'
          : 'office';

  let ifcSite: ImportDraft['ifcSite'] = null;
  const siteId = ids(W.IFCSITE)[0];
  if (siteId !== undefined) {
    const s = line(siteId);
    const latParts = numbers(s.RefLatitude);
    const lonParts = numbers(s.RefLongitude);
    const lat = latParts ? dmsToDegrees(latParts) : null;
    const lon = lonParts ? dmsToDegrees(lonParts) : null;
    if (lat !== null && lon !== null && (Math.abs(lat) > 1e-6 || Math.abs(lon) > 1e-6))
      ifcSite = { lat, lon };
  }
  warn(
    'location',
    ifcSite
      ? 'The file has site coordinates; check them, as many files keep the architect’s office or a default location.'
      : 'The file has no site coordinates: search for the address or type latitude and longitude.',
  );

  let northRotationDeg = 0;
  for (const ctx of ids(W.IFCGEOMETRICREPRESENTATIONCONTEXT)) {
    const tn = ref(line(ctx).TrueNorth);
    if (tn === null) continue;
    const d = numbers(line(tn).DirectionRatios);
    if (!d) continue;
    const [tx = 0, ty = 1] = d;
    if (Math.hypot(tx, ty) > 0) northRotationDeg = (-Math.atan2(tx, ty) * 180) / Math.PI;
    break;
  }

  centreParts(allParts, centroid, groundY);
  groundY = 0;
  return {
    draft: {
      kind: 'ifc',
      fileName,
      name,
      use,
      floors,
      floorToFloorM,
      basements,
      hull,
      edgeWindowAreaM2,
      northRotationDeg,
      ifcSite,
      concreteM3,
      warnings,
    },
    parts: allParts,
  };
}
