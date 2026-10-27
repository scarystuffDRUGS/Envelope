import { describe, expect, it } from 'vitest';
import { meshGroundY, parseMeshFile } from './meshFile';

/** Axis-aligned box as OBJ text (Y up), vertex indices offset by `base`. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, base: number): string {
  const v = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const f = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 4, 8, 7],
    [4, 1, 5, 8],
  ];
  return [...v.map((p) => `v ${p.join(' ')}`), ...f.map((q) => `f ${q.map((i) => i + base).join(' ')}`)].join(
    '\n',
  );
}

describe('mesh import', () => {
  it('takes y = 0 as ground when only foundations go below it', () => {
    expect(meshGroundY(-1.3, 7.34)).toBe(0);
    expect(meshGroundY(-4, 4)).toBe(-4); // centred on the origin
    expect(meshGroundY(0.2, 9)).toBe(0.2); // drawn above the origin
  });

  // Like the Stone Atelier shop: 10 m × 8 m walls to 7.3 m, a 13.4 m × 11.4 m paving slab and a
  // foundation below y = 0, and a 1.8 m plant pot outside the walls.
  const obj = [
    box(-5, 0, -4, 5, 7.3, 4, 0),
    box(-6.7, -1.3, -5.7, 6.7, -0.05, 5.7, 8),
    box(5.6, 0, 0, 6.3, 1.8, 0.8, 16),
  ].join('\n');

  it('outlines the walls, not the paving or the plant pot, and measures height from y = 0', async () => {
    const { draft } = await parseMeshFile(new TextEncoder().encode(obj), 'shop.obj');
    expect(draft.heightM).toBeCloseTo(7.3, 6);
    const xs = draft.hull.map((p) => p[0]);
    const ys = draft.hull.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(8, 6);
  });
});
