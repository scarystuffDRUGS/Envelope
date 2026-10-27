import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildingSpec } from './building';
import { takeoff, validateSpec } from './building';
import type { ImportDraft, Point2 } from './import';
import {
  convexHull,
  dmsToDegrees,
  hullToEN,
  insideIndia,
  lengthUnitToMetres,
  nearestEdge,
  polygonArea,
  simplifyConvex,
  specFromDraft,
  wwrFromEdges,
} from './import';

const demo = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/demo/building.json'), 'utf8'),
) as BuildingSpec;

describe('import helpers (hand-checked)', () => {
  it('DMS → degrees: 28° 24′ 21.6″ = 28.406°; negative parts keep their sign', () => {
    expect(dmsToDegrees([28, 24, 21, 600000])).toBeCloseTo(28.406, 9);
    expect(dmsToDegrees([-77, -5, -6, 0])).toBeCloseTo(-77.085, 9);
  });

  it('length units: millimetres 0.001, feet 0.3048, metres 1', () => {
    expect(lengthUnitToMetres({ prefix: 'MILLI' })).toBe(0.001);
    expect(lengthUnitToMetres({ conversionFactor: 0.3048 })).toBe(0.3048);
    expect(lengthUnitToMetres({ prefix: null })).toBe(1);
  });

  it('convex hull drops interior and collinear points and runs counter-clockwise', () => {
    const pts: Point2[] = [
      [0, 0],
      [10, 0],
      [5, 0],
      [10, 6],
      [0, 6],
      [5, 3],
      [2, 2],
    ];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBeCloseTo(60, 9); // positive = CCW
  });

  it('simplifies a 64-gon circle to 12 vertices, keeping it convex and close in area', () => {
    const circle: Point2[] = Array.from({ length: 64 }, (_, i) => [
      10 * Math.cos((2 * Math.PI * i) / 64),
      10 * Math.sin((2 * Math.PI * i) / 64),
    ]);
    const s = simplifyConvex(circle, 12);
    expect(s).toHaveLength(12);
    // A regular 12-gon inscribed in r = 10 has area 3·r² = 300; π·r² = 314.2.
    expect(polygonArea(s)).toBeGreaterThan(290);
    expect(polygonArea(s)).toBeLessThan(314.2);
  });

  it('assigns a window to the nearest footprint edge', () => {
    const rect: Point2[] = [
      [-10, -5],
      [10, -5],
      [10, 5],
      [-10, 5],
    ];
    expect(nearestEdge(rect, [0, -5.2])).toBe(0); // south edge
    expect(nearestEdge(rect, [9.9, 1])).toBe(1); // east edge
    expect(nearestEdge(rect, [-3, 5.1])).toBe(2); // north edge
  });

  it('rotates the plan by bearing: model +Y at 90° points east', () => {
    const [p] = hullToEN([[0, 10]], 90);
    expect(p!.e).toBeCloseTo(10, 9);
    expect(p!.n).toBeCloseTo(0, 9);
  });

  it('WWR from windows on edges: 60 m² on a 20 m × 10 m high south wall → 0.3', () => {
    const en = hullToEN(
      [
        [-10, -5],
        [10, -5],
        [10, 5],
        [-10, 5],
      ],
      0,
    );
    const wwr = wwrFromEdges(en, [60, 0, 20, 0], 10);
    expect(wwr.S).toBeCloseTo(0.3, 9); // 60 / (20 × 10)
    expect(wwr.N).toBeCloseTo(0.1, 9); // 20 / 200
    expect(wwr.E).toBe(0);
    expect(wwrFromEdges(en, null, 10)).toEqual({ N: 0.4, E: 0.4, S: 0.4, W: 0.4 });
  });

  it('India bounds', () => {
    expect(insideIndia(28.406, 77.085)).toBe(true);
    expect(insideIndia(51.5, -0.12)).toBe(false);
  });
});

describe('specFromDraft', () => {
  const draft: ImportDraft = {
    kind: 'ifc',
    fileName: 'test.ifc',
    name: 'Test block',
    use: 'office',
    floors: 3,
    floorToFloorM: 3.5,
    basements: { count: 1, depthM: 3 },
    hull: [
      [-10, -5],
      [10, -5],
      [10, 5],
      [-10, 5],
    ],
    edgeWindowAreaM2: [21, 0, 21, 0],
    northRotationDeg: 0,
    ifcSite: null,
    concreteM3: 180,
    warnings: [],
  };
  const place = { lat: 28.5, lon: 77.2, label: 'Test site', rotationDeg: 0, plotBufferM: 15 };
  const edits = { name: 'Test block', use: 'office' as const, floors: 3, floorToFloorM: 3.5 };

  it('keeps the 20 m × 10 m footprint, WWR from windows and the IFC concrete volume', () => {
    const spec = specFromDraft(draft, place, edits);
    const t = takeoff(spec);
    expect(t.footprintAreaM2).toBeCloseTo(200, 1);
    expect(t.heightM).toBeCloseTo(10.5, 9);
    expect(spec.wwr.S).toBeCloseTo(21 / (20 * 10.5), 6); // 0.1
    expect(spec.wwr.E).toBe(0);
    expect(spec.quantities?.concreteM3).toBe(180);
    expect(validateSpec(spec)).toEqual([]);
  });

  it('a 90° rotation turns the long south face to the west', () => {
    const spec = specFromDraft(draft, { ...place, rotationDeg: 90 }, edits);
    const t = takeoff(spec);
    const west = t.facades.filter((f) => f.orientation === 'W').reduce((s, f) => s + f.lengthM, 0);
    expect(west).toBeCloseTo(20, 1);
    expect(spec.wwr.W).toBeCloseTo(0.1, 6);
  });

  it('typed WWR values override the model', () => {
    expect(specFromDraft(draft, place, { ...edits, wwr: { E: 0.25 } }).wwr.E).toBe(0.25);
  });
});

describe('validateSpec', () => {
  it('accepts the demo building', () => {
    expect(validateSpec(demo)).toEqual([]);
  });

  it('rejects bad floors, floor height, WWR, a clockwise ring and a site outside India', () => {
    const bad: BuildingSpec = {
      ...demo,
      floors: 0,
      floorToFloorM: 9,
      wwr: { ...demo.wwr, N: 0.95 },
      footprint: [...demo.footprint].reverse(),
      site: { ...demo.site, lat: 51.5, lon: -0.12 },
    };
    const problems = validateSpec(bad).join(' ');
    expect(problems).toMatch(/Floors/);
    expect(problems).toMatch(/Floor-to-floor/);
    expect(problems).toMatch(/ratio N/);
    expect(problems).toMatch(/India/);
  });

  it('rejects a clockwise footprint at a valid site', () => {
    expect(validateSpec({ ...demo, footprint: [...demo.footprint].reverse() }).join(' ')).toMatch(
      /counter-clockwise/,
    );
  });
});
