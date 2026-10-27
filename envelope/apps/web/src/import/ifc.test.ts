import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { polygonArea, specFromDraft, takeoff, validateSpec } from '@envelope/models';
import { IfcAPI } from 'web-ifc';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ParsedModel } from './ifc';
import { parseIfc } from './ifc';
import { writeGlb } from './mesh';

const sample = (f: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, '../../../../fixtures/import', f)));

describe('IFC import, hand-built sample (fixtures/import/synthetic-block.ifc)', () => {
  let parsed: ParsedModel;
  beforeAll(async () => {
    const api = new IfcAPI();
    await api.Init();
    parsed = await parseIfc(api, sample('synthetic-block.ifc'), 'synthetic-block.ifc');
  });

  it('counts 3 floors at 3.5 m (millimetre elevations), leaving out the Roof level', () => {
    expect(parsed.draft.floors).toBe(3);
    expect(parsed.draft.floorToFloorM).toBeCloseTo(3.5, 6);
    expect(parsed.draft.warnings.some((w) => w.text.includes('Roof'))).toBe(true);
  });

  it('reads the basement: 1 storey, 3.0 m', () => {
    expect(parsed.draft.basements).toEqual({ count: 1, depthM: 3 });
  });

  it('outlines the 20 m × 10 m ground slab, centred', () => {
    expect(parsed.draft.hull).toHaveLength(4);
    expect(polygonArea(parsed.draft.hull)).toBeCloseTo(200, 3);
    const xs = parsed.draft.hull.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 3);
  });

  it('puts 2 × 1.8 m² of windows on the south edge and 1.8 m² on the north edge', () => {
    const areas = parsed.draft.edgeWindowAreaM2!;
    const total = areas.reduce((s, a) => s + a, 0);
    expect(total).toBeCloseTo(5.4, 6);
    expect(Math.max(...areas)).toBeCloseTo(3.6, 6);
  });

  it('sums 4 slabs × 40 m³ of concrete, reads the site, true north and occupancy', () => {
    expect(parsed.draft.concreteM3).toBeCloseTo(160, 6);
    // 18° 31′ 12″ N = 18.52; 73° 51′ 36″ E = 73.86
    expect(parsed.draft.ifcSite!.lat).toBeCloseTo(18.52, 9);
    expect(parsed.draft.ifcSite!.lon).toBeCloseTo(73.86, 9);
    expect(parsed.draft.northRotationDeg).toBeCloseTo(30, 6);
    expect(parsed.draft.use).toBe('office');
    expect(parsed.draft.name).toBe('Synthetic office block');
  });

  it('places as a valid spec: south WWR 3.6 m² ÷ (20 m × 10.5 m), facing rotated by true north', () => {
    const d = parsed.draft;
    const spec = specFromDraft(
      d,
      { lat: d.ifcSite!.lat, lon: d.ifcSite!.lon, label: 'Pune', rotationDeg: -30, plotBufferM: 15 },
      { name: d.name, use: d.use, floors: d.floors!, floorToFloorM: d.floorToFloorM! },
    );
    expect(validateSpec(spec)).toEqual([]);
    expect(takeoff(spec).footprintAreaM2).toBeCloseTo(200, 0);
    // rotationDeg −30 cancels the 30° true north, so the long faces face due south and north.
    expect(spec.wwr.S).toBeCloseTo(3.6 / (20 * 10.5), 4);
    expect(spec.wwr.N).toBeCloseTo(1.8 / (20 * 10.5), 4);
    expect(spec.quantities?.concreteM3).toBeCloseTo(160, 6);
  });

  it('mesh is centred with the ground at y = 0 and writes a .glb', async () => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of parsed.parts)
      for (let i = 1; i < p.positions.length; i += 3) {
        minY = Math.min(minY, p.positions[i]!);
        maxY = Math.max(maxY, p.positions[i]!);
      }
    // Ground slab bottom at y = 0; basement slab top 3.0 m below the ground slab top (−0.2 m).
    expect(minY).toBeCloseTo(-3.2 + 0.2, 3);
    expect(maxY).toBeCloseTo(7.2, 3);
    const glb = await writeGlb(parsed.parts);
    expect(new TextDecoder().decode(glb.slice(0, 4))).toBe('glTF');
  });
});
