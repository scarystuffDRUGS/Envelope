import { describe, expect, it } from 'vitest';
import type { EN } from './geometry';
import { fromLocalEN } from './geometry';
import type { ReceptorCandidate } from './receptors';
import { distanceToPolygon, selectReceptors } from './receptors';

const origin = { lon: 77.085, lat: 28.406 };
// 60 m × 50 m plot centred on the origin, counter-clockwise.
const plot: EN[] = [
  { e: -30, n: -25 },
  { e: 30, n: -25 },
  { e: 30, n: 25 },
  { e: -30, n: 25 },
];
const ll = (e: number, n: number) => fromLocalEN({ e, n }, origin);
const point = (
  id: string,
  kind: string,
  e: number,
  n: number,
  source: 'osm' | 'user' = 'osm',
): ReceptorCandidate => {
  const p = ll(e, n);
  return { id, name: id, kind, lat: p.lat, lon: p.lon, source };
};
const campus = (
  id: string,
  kind: string,
  e0: number,
  n0: number,
  e1: number,
  n1: number,
): ReceptorCandidate => {
  const ring = [ll(e0, n0), ll(e1, n0), ll(e1, n1), ll(e0, n1)].map(
    (p) => [p.lon, p.lat] as [number, number],
  );
  const c = ll((e0 + e1) / 2, (n0 + n1) / 2);
  return { id, name: id, kind, lat: c.lat, lon: c.lon, ring, source: 'osm' };
};

const pick = (c: ReceptorCandidate[], p: EN[], o: typeof origin) => selectReceptors(c, p, o).receptors;

describe('sensitive receptors (D-029)', () => {
  it('distance to the plot boundary: 0 inside, 75 m from 100 m north of the centre', () => {
    expect(distanceToPolygon({ e: 0, n: 0 }, plot)).toBe(0);
    expect(distanceToPolygon({ e: 0, n: 100 }, plot)).toBeCloseTo(75, 6); // 100 − 25
  });

  it('keeps a campus whose centre is 550 m away but whose edge is 425 m from the plot', () => {
    // Campus 200 m × 200 m from n = 450 to 650: centre 550 m north (over 500 m, missed before),
    // nearest edge at n = 450, i.e. 450 − 25 = 425 m from the plot boundary.
    const [r] = pick([campus('College campus', 'college', -100, 450, 100, 650)], plot, origin);
    expect(r?.kind).toBe('college');
    expect(r!.distanceM).toBeCloseTo(425, 0);
    expect(r!.n).toBeCloseTo(450, 0);
  });

  it('drops OSM receptors beyond 500 m and areas covering the plot; keeps user receptors to 1 km', () => {
    const out = pick(
      [
        point('Far school', 'school', 0, 600), // 575 m
        campus('Site itself', 'school', -50, -50, 50, 50),
        point('Added school', 'school', 0, 800, 'user'), // 775 m
        point('Added clinic on plot', 'clinic', 5, 5, 'user'),
      ],
      plot,
      origin,
    );
    expect(out.map((r) => r.name)).toEqual(['Added clinic on plot', 'Added school']);
  });

  it('names a campus that contains the plot instead of placing it as a receptor', () => {
    const sel = selectReceptors([campus('Host college', 'college', -200, -200, 200, 200)], plot, origin);
    expect(sel.receptors).toEqual([]);
    expect(sel.siteWithin).toEqual(['Host college']);
  });

  it('orders schools, colleges and hospitals before nearer residential areas', () => {
    const out = pick(
      [
        point('Housing', 'residential', 0, 60),
        point('School', 'school', 0, 300),
        point('Hospital', 'hospital', 200, 0),
      ],
      plot,
      origin,
    );
    expect(out.map((r) => r.name)).toEqual(['Hospital', 'School', 'Housing']);
  });

  it('collapses a school mapped as a point and as an outline, keeping the nearer placement', () => {
    const node = { ...point('DPS', 'school', 0, 300), name: 'DPS' };
    const way = { ...campus('DPS way', 'school', -40, 150, 40, 320), name: 'DPS' };
    const out = pick([node, way], plot, origin);
    expect(out).toHaveLength(1);
    expect(out[0]!.distanceM).toBeCloseTo(125, 0); // 150 − 25
  });

  it('caps the list at 32, sensitive receptors first', () => {
    const many = Array.from({ length: 40 }, (_, i) => point(`Area ${i}`, 'residential', 0, 40 + i * 5));
    const out = pick([...many, point('Last school', 'school', 0, 450)], plot, origin);
    expect(out).toHaveLength(32);
    expect(out[0]!.name).toBe('Last school');
  });
});
