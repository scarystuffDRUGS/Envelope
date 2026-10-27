/** Display units. Values are stored in SI internally. */
export type DisplayUnit =
  | 'µg/m³'
  | '°C'
  | 'W/m²'
  | 'm/s'
  | '%'
  | 'kWh/m²·yr'
  | 'tCO2e'
  | 'tCO2e/yr'
  | 'kgCO2e/m²'
  | 'm'
  | 'm²'
  | 'h'
  | 'mm';

const formatters = new Map<number, Intl.NumberFormat>();

function formatter(digits: number): Intl.NumberFormat {
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, f);
  }
  return f;
}

/** Formats a number with fixed decimals (en-IN grouping). Non-finite values render as an en dash. */
export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '–';
  return formatter(digits).format(value);
}

/** Formats a value with its unit, e.g. "1,471 µg/m³". Every displayed number carries a unit. */
export function formatValue(value: number, unit: DisplayUnit, digits = 0): string {
  const n = formatNumber(value, digits);
  if (n === '–') return n;
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
}

/** Signed delta with a true minus sign, e.g. "−12.5 µg/m³" or "+3 °C". */
export function formatDelta(value: number, unit: DisplayUnit, digits = 0): string {
  if (!Number.isFinite(value)) return '–';
  const abs = formatValue(Math.abs(value), unit, digits);
  if (Number(value.toFixed(digits)) === 0) return abs;
  return `${value < 0 ? '−' : '+'}${abs}`;
}

/** Hour 0–23 as "HH:00". */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
