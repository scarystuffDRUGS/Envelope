import type { DisplayUnit, ScenarioResult } from '@envelope/models';
import { isSensitive } from '@envelope/models';

export interface KpiRow {
  id: string;
  group: 'Dust' | 'Heat' | 'GHG' | 'Logistics';
  label: string;
  unit: DisplayUnit | 'days' | 'trips/day' | 'months' | 'kgCO2e/m²' | 'tCO2e' | 't';
  digits: number;
  value: (r: ScenarioResult) => number;
}

const boundary = (r: ScenarioResult) => r.dust.receptors.filter((x) => x.kind === 'boundary');
/** Schools, colleges, universities, kindergartens, hospitals, clinics, nursing homes (D-029). */
const sensitive = (r: ScenarioResult) => r.dust.receptors.filter((x) => isSensitive(x.kind));
const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : Number.NaN);

/** Key indicators shown baseline vs mitigated (Inspector, report). Lower is better for all. */
export const KPIS: KpiRow[] = [
  {
    id: 'pm10Total',
    group: 'Dust',
    label: 'PM10 emitted over the programme',
    unit: 't',
    digits: 2,
    value: (r) => r.dust.totalPm10T,
  },
  {
    id: 'pm10MaxInc',
    group: 'Dust',
    label: 'P98 of 24 h PM10 increment at site boundary',
    unit: 'µg/m³',
    digits: 1,
    value: (r) => maxOf(boundary(r).map((x) => x.period.p98Pm10Inc24h)),
  },
  {
    id: 'siteExceed',
    group: 'Dust',
    label: 'Site-caused NAAQS PM10 exceedance days (worst point)',
    unit: 'days',
    digits: 0,
    value: (r) => maxOf(r.dust.receptors.map((x) => x.period.exceedDaysSiteCaused)),
  },
  {
    id: 'pm10DayBoundary',
    group: 'Dust',
    label: 'PM10 24 h increment at boundary, selected day',
    unit: 'µg/m³',
    digits: 1,
    value: (r) => maxOf(boundary(r).map((x) => x.day.pm10Inc)),
  },
  {
    id: 'pm10DaySensitive',
    group: 'Dust',
    label: 'PM10 24 h increment at the most affected school, college or hospital, selected day',
    unit: 'µg/m³',
    digits: 1,
    value: (r) => maxOf(sensitive(r).map((x) => x.day.pm10Inc)),
  },
  {
    id: 'sensitiveExceed',
    group: 'Dust',
    label: 'Site-caused NAAQS PM10 exceedance days at schools, colleges and hospitals',
    unit: 'days',
    digits: 0,
    value: (r) => maxOf(sensitive(r).map((x) => x.period.exceedDaysSiteCaused)),
  },
  {
    id: 'plotTs',
    group: 'Heat',
    label: 'Site surface temperature, selected hour',
    unit: '°C',
    digits: 1,
    value: (r) => r.heat.plotTsC,
  },
  {
    id: 'maxUtci',
    group: 'Heat',
    label: 'Max worker UTCI on site, selected hour',
    unit: '°C',
    digits: 1,
    value: (r) => r.heat.maxWorkerUtci,
  },
  {
    id: 'riskHours',
    group: 'Heat',
    label: 'Working hours at heat-stress risk (UTCI > 32 °C)',
    unit: 'h',
    digits: 0,
    value: (r) => r.heat.riskHours,
  },
  {
    id: 'ghgTotal',
    group: 'GHG',
    label: 'Construction emissions A1–A5',
    unit: 'tCO2e',
    digits: 0,
    value: (r) => r.ghg.total / 1000,
  },
  {
    id: 'ghgPerM2',
    group: 'GHG',
    label: 'A1–A5 intensity per m² GFA',
    unit: 'kgCO2e/m²',
    digits: 0,
    value: (r) => r.ghg.perM2Gfa,
  },
  {
    id: 'scope1',
    group: 'GHG',
    label: 'Scope 1, site diesel (plant, DG sets, site vehicles)',
    unit: 'tCO2e',
    digits: 0,
    value: (r) => r.ghg.scope1 / 1000,
  },
  {
    id: 'scope2',
    group: 'GHG',
    label: 'Scope 2, grid electricity',
    unit: 'tCO2e',
    digits: 0,
    value: (r) => r.ghg.scope2 / 1000,
  },
  {
    id: 'scope3',
    group: 'GHG',
    label: 'Scope 3, materials, transport, waste',
    unit: 'tCO2e',
    digits: 0,
    value: (r) => r.ghg.scope3 / 1000,
  },
];

export function fmt(v: number, digits: number): string {
  if (!Number.isFinite(v)) return '–';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

export function delta(b: number, m: number, digits: number): { abs: string; pct: string } {
  if (!Number.isFinite(b) || !Number.isFinite(m)) return { abs: '–', pct: '–' };
  // Both values show as zero at this precision: a percentage of a rounding residue is meaningless.
  if (Number(b.toFixed(digits)) === 0 && Number(m.toFixed(digits)) === 0) return { abs: '0', pct: '–' };
  const d = m - b;
  const sign = Number(d.toFixed(digits)) === 0 ? '' : d < 0 ? '−' : '+';
  const pct = b !== 0 ? (d / Math.abs(b)) * 100 : 0;
  const psign = Number(pct.toFixed(0)) === 0 ? '' : pct < 0 ? '−' : '+';
  return {
    abs: `${sign}${fmt(Math.abs(d), digits)}`,
    pct: b !== 0 ? `${psign}${fmt(Math.abs(pct), 0)}%` : '–',
  };
}
