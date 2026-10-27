import { describe, expect, it } from 'vitest';
import {
  applyNominatimOutlines,
  nominatimReceptorUrl,
  normaliseNominatimReceptors,
  normaliseOverpass,
  receptorQuery,
} from './clients';

describe('Overpass receptors (D-029)', () => {
  it('queries education and health amenities with an anchored pattern', () => {
    const q = receptorQuery(18.52, 73.86, 700);
    expect(q).toContain('"^(school|college|university|kindergarten|hospital|clinic|nursing_home)$"');
    expect(q).toContain('around:700,18.52,73.86');
  });

  it('reads nodes, way outlines and multipolygon campuses, keeping outlines and kinds', () => {
    const square = [
      { lat: 18.52, lon: 73.86 },
      { lat: 18.52, lon: 73.861 },
      { lat: 18.521, lon: 73.861 },
      { lat: 18.521, lon: 73.86 },
      { lat: 18.52, lon: 73.86 },
    ];
    const osm = normaliseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 18.5, lon: 73.85, tags: { amenity: 'school', name: 'Node school' } },
        { type: 'way', id: 2, geometry: square, tags: { amenity: 'college', name: 'Way college' } },
        {
          type: 'relation',
          id: 3,
          bounds: { minlat: 18.52, minlon: 73.86, maxlat: 18.521, maxlon: 73.861 },
          members: [
            { type: 'way', role: 'outer', geometry: square },
            { type: 'way', role: 'inner', geometry: square.slice(0, 3) },
          ],
          tags: { amenity: 'university', name: 'Campus' },
        },
        { type: 'node', id: 4, lat: 18.51, lon: 73.85, tags: { amenity: 'hospital' } },
        { type: 'node', id: 5, lat: 18.51, lon: 73.85, tags: { amenity: 'driving_school' } },
      ],
    });
    const byName = Object.fromEntries(osm.receptors.map((r) => [r.name, r]));
    expect(Object.keys(byName).sort()).toEqual(['Campus', 'Node school', 'Unnamed hospital', 'Way college']);
    expect(byName['Way college']!.kind).toBe('college'); // no longer relabelled as a school
    expect(byName['Way college']!.ring).toHaveLength(5);
    expect(byName['Campus']!.kind).toBe('university');
    expect(byName['Campus']!.ring).toHaveLength(5); // outer member only
    expect(byName['Node school']!.ring).toBeUndefined();
  });
});

describe('Nominatim receptor fallback (D-031)', () => {
  it('searches one amenity inside a bounded box of the radius', () => {
    const u = new URL(nominatimReceptorUrl(28.6448, 77.216721, 700, 'hospital'));
    expect(u.searchParams.get('amenity')).toBe('hospital');
    expect(u.searchParams.get('bounded')).toBe('1');
    // 700 m = 0.00629° of latitude and 0.00717° of longitude at 28.6° N; west, north, east, south
    expect(u.searchParams.get('viewbox')).toBe('77.20956,28.65109,77.22389,28.63851');
  });

  it('keeps only that amenity, uses a box wider than 15 m as the outline, names the unnamed', () => {
    const r = normaliseNominatimReceptors('school', [
      {
        osm_id: 1,
        category: 'amenity',
        type: 'school',
        name: 'Big campus',
        lat: '28.64',
        lon: '77.21',
        boundingbox: ['28.6395', '28.6405', '77.2095', '77.2105'],
      },
      {
        osm_id: 2,
        category: 'amenity',
        type: 'school',
        lat: '28.641',
        lon: '77.211',
        boundingbox: ['28.64095', '28.64105', '77.21095', '77.21105'],
      },
      { osm_id: 3, category: 'amenity', type: 'clinic', name: 'Clinic', lat: '28.64', lon: '77.21' },
    ]);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
    expect(r[0]!.ring).toHaveLength(5);
    expect(r[0]!.source).toBe('nominatim');
    expect(r[1]!.ring).toBeUndefined();
    expect(r[1]!.name).toMatch(/school/i);
  });

  it('swaps the box for the outline from /lookup, matched by OSM reference', () => {
    const [r] = normaliseNominatimReceptors('school', [
      {
        osm_type: 'way',
        osm_id: 7,
        category: 'amenity',
        type: 'school',
        name: 'S',
        lat: '28.64',
        lon: '77.21',
        boundingbox: ['28.6395', '28.6405', '77.2095', '77.2105'],
      },
    ]);
    expect(r!.osmRef).toBe('W7');
    const tri: [number, number][] = [
      [77.21, 28.64],
      [77.2101, 28.64],
      [77.21, 28.6401],
      [77.21, 28.64],
    ];
    const [out] = applyNominatimOutlines(
      [r!],
      [{ osm_type: 'way', osm_id: 7, geojson: { type: 'Polygon', coordinates: [tri] } }],
    );
    expect(out!.ring).toEqual(tri);
  });
});
