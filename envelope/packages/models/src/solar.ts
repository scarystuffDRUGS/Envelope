/** Sun position, NOAA Solar Calculator algorithm (Meeus-based), accurate to ~0.01° for 1950–2050. */
const D = Math.PI / 180;

export interface SunPosition {
  altitudeDeg: number;
  /** Compass azimuth: 0 = north, 90 = east, clockwise. */
  azimuthDeg: number;
}

export function solarPosition(date: Date, lat: number, lon: number): SunPosition {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C =
    Math.sin(M * D) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * M * D) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * M * D) * 0.000289;
  const appLong = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * D);
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * D);
  const decl = Math.asin(Math.sin(obliq * D) * Math.sin(appLong * D));
  const y = Math.tan((obliq / 2) * D) ** 2;
  const eqTime =
    (4 *
      (y * Math.sin(2 * L0 * D) -
        2 * e * Math.sin(M * D) +
        4 * e * y * Math.sin(M * D) * Math.cos(2 * L0 * D) -
        0.5 * y * y * Math.sin(4 * L0 * D) -
        1.25 * e * e * Math.sin(2 * M * D))) /
    D;
  const minutesUtc = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (((minutesUtc + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cosZen = Math.sin(lat * D) * Math.sin(decl) + Math.cos(lat * D) * Math.cos(decl) * Math.cos(ha * D);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const azCos = (Math.sin(lat * D) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(lat * D) * Math.sin(zen));
  const azBase = Math.acos(Math.min(1, Math.max(-1, azCos))) / D;
  const azimuthDeg = ha > 0 ? (azBase + 180) % 360 : (540 - azBase) % 360;
  return { altitudeDeg: 90 - zen / D, azimuthDeg };
}
