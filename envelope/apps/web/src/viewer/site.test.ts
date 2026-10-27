import { describe, expect, it } from 'vitest';
import { densify } from './site';

describe('ring densify for ground sampling', () => {
  // 10 m × 4 m ring, counter-clockwise from the south-west corner.
  const ring = [
    { e: 0, n: 0 },
    { e: 10, n: 0 },
    { e: 10, n: 4 },
    { e: 0, n: 4 },
  ];

  it('steps at most 3 m along each side, keeping the corners', () => {
    const pts = densify(ring, 3);
    // 10 m sides → 4 steps (2.5 m), 4 m sides → 2 steps (2 m)
    expect(pts).toHaveLength(4 + 2 + 4 + 2);
    expect(pts[0]).toEqual({ e: 0, n: 0 });
    expect(pts[1]).toEqual({ e: 2.5, n: 0 });
    expect(pts[4]).toEqual({ e: 10, n: 0 });
  });
});
