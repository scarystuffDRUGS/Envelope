declare module 'jsthermalcomfort/lib/esm/models/utci.js' {
  /** Universal Thermal Climate Index (°C); null outside the validity range. */
  export function utci(
    tdb: number,
    tr: number,
    v: number,
    rh: number,
    units?: string,
    returnStressCategory?: boolean,
    limitInputs?: boolean,
  ): { utci: number | null; stress_category?: string };
}
