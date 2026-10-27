import { describe, expect, it } from 'vitest';
import { formatDelta, formatHour, formatNumber, formatValue } from './units';

describe('units formatting', () => {
  it('formats with Indian digit grouping and fixed decimals', () => {
    expect(formatNumber(1471.2)).toBe('1,471');
    expect(formatNumber(1234567, 0)).toBe('12,34,567');
    expect(formatNumber(0.000838, 6)).toBe('0.000838');
  });

  it('always attaches the unit', () => {
    expect(formatValue(1471, 'µg/m³')).toBe('1,471 µg/m³');
    expect(formatValue(40, '%')).toBe('40%');
    expect(formatValue(35.25, '°C', 1)).toBe('35.3 °C');
  });

  it('formats signed deltas with a true minus sign', () => {
    expect(formatDelta(-12.5, 'µg/m³', 1)).toBe('−12.5 µg/m³');
    expect(formatDelta(3, '°C')).toBe('+3 °C');
    expect(formatDelta(0.01, '°C')).toBe('0 °C');
  });

  it('handles non-finite values', () => {
    expect(formatValue(Number.NaN, 'm')).toBe('–');
  });

  it('formats hours', () => {
    expect(formatHour(7)).toBe('07:00');
  });
});
