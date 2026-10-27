/**
 * Mesh plumbing shared by the IFC and mesh-only readers: triangle parts in Y-up metres (glTF
 * convention: plan = x and −z, height = y), footprint hull and centring, and the .glb writer.
 * The mesh is only for looks; the maths uses the spec built from the hull.
 */
import type { Point2 } from '@envelope/models';
import { convexHull, polygonArea, simplifyConvex } from '@envelope/models';
import { Document, WebIO } from '@gltf-transform/core';

export interface MeshPart {
  /** xyz per vertex, Y-up metres. */
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array;
  /** Linear RGBA, 0–1. */
  color: [number, number, number, number];
}

/** Plan point of a Y-up vertex: x east-ish, model Y = −z. */
export const plan = (x: number, z: number): Point2 => [x, -z];

/** Convex hull of plan points, de-duplicated on a 1 cm grid, simplified to ≤ 12 vertices. */
export function footprintHull(points: Iterable<Point2>): Point2[] {
  const seen = new Map<string, Point2>();
  for (const [x, y] of points) {
    const k = `${Math.round(x * 100)},${Math.round(y * 100)}`;
    if (!seen.has(k)) seen.set(k, [x, y]);
  }
  return simplifyConvex(convexHull([...seen.values()]), 12);
}

/** Area-weighted centroid of a ring. */
export function ringCentroid(ring: readonly Point2[]): Point2 {
  const a = polygonArea(ring);
  if (Math.abs(a) < 1e-9) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Moves parts so the footprint centroid sits at x = z = 0 and ground level at y = 0. */
export function centreParts(parts: MeshPart[], centroid: Point2, groundY: number): void {
  const [cx, cy] = centroid;
  for (const p of parts) {
    const v = p.positions;
    for (let i = 0; i < v.length; i += 3) {
      v[i] = v[i]! - cx;
      v[i + 1] = v[i + 1]! - groundY;
      v[i + 2] = v[i + 2]! + cy; // plan y = −z, so z shifts by +cy
    }
  }
}

/** Merges parts of the same colour, so the .glb has a handful of primitives, not one per element. */
export function mergeByColour(parts: MeshPart[]): MeshPart[] {
  const groups = new Map<string, MeshPart[]>();
  for (const p of parts) {
    const k = p.color.map((c) => c.toFixed(3)).join(',');
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.values()].map((g) => {
    const nv = g.reduce((s, p) => s + p.positions.length, 0);
    const ni = g.reduce((s, p) => s + p.indices.length, 0);
    const withNormals = g.every((p) => p.normals);
    const positions = new Float32Array(nv);
    const normals = withNormals ? new Float32Array(nv) : null;
    const indices = new Uint32Array(ni);
    let vo = 0;
    let io = 0;
    for (const p of g) {
      positions.set(p.positions, vo);
      if (normals && p.normals) normals.set(p.normals, vo);
      const base = vo / 3;
      for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i]! + base;
      vo += p.positions.length;
      io += p.indices.length;
    }
    return { positions, normals, indices, color: g[0]!.color };
  });
}

/** Writes parts as a binary glTF (.glb). */
export async function writeGlb(parts: MeshPart[]): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('model');
  for (const p of mergeByColour(parts)) {
    if (!p.indices.length) continue;
    const [r, g, b, a] = p.color;
    const material = doc
      .createMaterial()
      .setBaseColorFactor([r, g, b, a])
      .setAlphaMode(a < 0.99 ? 'BLEND' : 'OPAQUE')
      .setDoubleSided(true)
      .setMetallicFactor(0)
      .setRoughnessFactor(0.9);
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(p.positions).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(p.indices).setBuffer(buffer))
      .setMaterial(material);
    if (p.normals)
      prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(p.normals).setBuffer(buffer));
    scene.addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  }
  return new WebIO().writeBinary(doc);
}
