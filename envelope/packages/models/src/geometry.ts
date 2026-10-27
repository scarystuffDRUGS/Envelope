/**
 * Site geometry: WGS84 ↔ local ENU tangent plane, and building takeoff (MODELS.md A.1).
 * Pure functions, no Cesium dependency.
 */

// src: WGS84 defining parameters (NIMA TR8350.2): a = 6378137 m, f = 1/298.257223563
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

const DEG = Math.PI / 180;

export interface LonLat {
  lon: number;
  lat: number;
}

/** Local east/north metres relative to an origin. */
export interface EN {
  e: number;
  n: number;
}

type Vec3 = [number, number, number];

function toEcef(lon: number, lat: number, h = 0): Vec3 {
  const sl = Math.sin(lat * DEG);
  const cl = Math.cos(lat * DEG);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sl * sl);
  return [
    (N + h) * cl * Math.cos(lon * DEG),
    (N + h) * cl * Math.sin(lon * DEG),
    (N * (1 - WGS84_E2) + h) * sl,
  ];
}

/** WGS84 lon/lat → local east/north metres on the tangent plane at `origin` (height 0). */
export function toLocalEN(p: LonLat, origin: LonLat): EN {
  const [x, y, z] = toEcef(p.lon, p.lat);
  const [x0, y0, z0] = toEcef(origin.lon, origin.lat);
  const dx = x - x0;
  const dy = y - y0;
  const dz = z - z0;
  const sl = Math.sin(origin.lat * DEG);
  const cl = Math.cos(origin.lat * DEG);
  const so = Math.sin(origin.lon * DEG);
  const co = Math.cos(origin.lon * DEG);
  return {
    e: -so * dx + co * dy,
    n: -sl * co * dx - sl * so * dy + cl * dz,
  };
}

/** Inverse of toLocalEN for points near the origin (iterative; < 1 mm error within a few km). */
export function fromLocalEN(p: EN, origin: LonLat): LonLat {
  // Start from a spherical guess, then correct with the forward transform.
  let guess: LonLat = {
    lat: origin.lat + p.n / 111_000,
    lon: origin.lon + p.e / (111_000 * Math.cos(origin.lat * DEG)),
  };
  for (let i = 0; i < 5; i++) {
    const back = toLocalEN(guess, origin);
    const mPerDegLat = 111_000;
    const mPerDegLon = 111_000 * Math.cos(guess.lat * DEG);
    guess = { lat: guess.lat + (p.n - back.n) / mPerDegLat, lon: guess.lon + (p.e - back.e) / mPerDegLon };
  }
  return guess;
}

/** Signed shoelace area (m²); positive when the ring is counter-clockwise. Ring may be open or closed. */
export function signedArea(ring: readonly EN[]): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    a += p.e * q.n - q.e * p.n;
  }
  return a / 2;
}

export function centroid(ring: readonly EN[]): EN {
  const a = signedArea(ring);
  let ce = 0;
  let cn = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const cross = p.e * q.n - q.e * p.n;
    ce += (p.e + q.e) * cross;
    cn += (p.n + q.n) * cross;
  }
  return { e: ce / (6 * a), n: cn / (6 * a) };
}

/** Drops a duplicated closing vertex. */
export function openRing<T extends EN | LonLat>(ring: readonly T[]): T[] {
  if (ring.length < 2) return [...ring];
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  const same =
    'e' in a
      ? a.e === (b as EN).e && a.n === (b as EN).n
      : a.lon === (b as LonLat).lon && a.lat === (b as LonLat).lat;
  return same ? ring.slice(0, -1) : [...ring];
}

export interface FacadeEdge {
  index: number;
  start: EN;
  end: EN;
  lengthM: number;
  /** Outward normal as a compass azimuth: 0 = north, 90 = east, clockwise. */
  normalAzimuthDeg: number;
}

/** Edges of a footprint ring with outward-normal compass azimuths. */
export function facadeEdges(ring: readonly EN[]): FacadeEdge[] {
  const pts = openRing(ring);
  const ccw = signedArea(pts) > 0;
  return pts.map((start, index) => {
    const end = pts[(index + 1) % pts.length]!;
    const de = end.e - start.e;
    const dn = end.n - start.n;
    // For a CCW ring the outward normal is the edge direction rotated clockwise: (dn, −de).
    const ne = ccw ? dn : -dn;
    const nn = ccw ? -de : de;
    const az = (Math.atan2(ne, nn) / DEG + 360) % 360;
    return { index, start, end, lengthM: Math.hypot(de, dn), normalAzimuthDeg: az };
  });
}

/**
 * Offsets a convex ring outward by `d` metres (mitred corners). Used for the plot
 * boundary around the footprint. Each vertex moves along the corner bisector by
 * d / cos(half the turning angle), i.e. v + d·(n1 + n2)/(1 + n1·n2).
 */
export function bufferConvex(ring: readonly EN[], d: number): EN[] {
  const pts = openRing(ring);
  const edges = facadeEdges(pts);
  const normals = edges.map((e) => ({
    e: Math.sin(e.normalAzimuthDeg * DEG),
    n: Math.cos(e.normalAzimuthDeg * DEG),
  }));
  return pts.map((p, i) => {
    const n1 = normals[(i - 1 + pts.length) % pts.length]!;
    const n2 = normals[i]!;
    const k = d / (1 + n1.e * n2.e + n1.n * n2.n);
    return { e: p.e + k * (n1.e + n2.e), n: p.n + k * (n1.n + n2.n) };
  });
}

export type Orientation = 'N' | 'E' | 'S' | 'W';

/** Nearest cardinal orientation for a compass azimuth (45° sectors). */
export function orientationOf(azimuthDeg: number): Orientation {
  const a = ((azimuthDeg % 360) + 360) % 360;
  if (a >= 315 || a < 45) return 'N';
  if (a < 135) return 'E';
  if (a < 225) return 'S';
  return 'W';
}

/**
 * Open-Meteo tilted-irradiance azimuth from a compass azimuth:
 * Open-Meteo uses 0 = south, −90 = east, 90 = west, ±180 = north.
 */
export function compassToOpenMeteoAzimuth(compassDeg: number): number {
  const v = ((((compassDeg - 180) % 360) + 540) % 360) - 180;
  return v === -180 ? 180 : v;
}
