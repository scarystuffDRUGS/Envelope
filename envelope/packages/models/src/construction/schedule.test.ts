import { describe, expect, it } from 'vitest';
import { calendarMonthFor, phaseForMonth, totalMonths, weatherYearFor } from './schedule';

describe('construction month → weather-year calendar month', () => {
  it('starts in January by default and wraps every 12 months', () => {
    expect(calendarMonthFor(1)).toBe(1);
    expect(calendarMonthFor(7)).toBe(7);
    expect(calendarMonthFor(12)).toBe(12);
    expect(calendarMonthFor(13)).toBe(1);
    expect(calendarMonthFor(24)).toBe(12);
  });

  it('honours a different start month: start October, month 4 → January', () => {
    expect(calendarMonthFor(4, 10)).toBe(1);
  });

  it('weather year is the last complete calendar year', () => {
    expect(weatherYearFor(new Date('2026-10-07T00:00:00Z'))).toBe(2025);
  });
});

describe('construction schedule', () => {
  it('totals 24 months by default', () => {
    expect(totalMonths()).toBe(24);
  });

  it('maps months to phases at the boundaries', () => {
    expect(phaseForMonth(1).phase.id).toBe('excavation');
    expect(phaseForMonth(3)).toMatchObject({ phase: { id: 'excavation' }, monthInPhase: 3 });
    expect(phaseForMonth(4)).toMatchObject({ phase: { id: 'structure' }, monthInPhase: 1 });
    expect(phaseForMonth(15)).toMatchObject({ phase: { id: 'structure' }, monthInPhase: 12 });
    expect(phaseForMonth(16)).toMatchObject({ phase: { id: 'finishing' }, monthInPhase: 1 });
    expect(phaseForMonth(24)).toMatchObject({ phase: { id: 'finishing' }, monthInPhase: 9 });
  });

  it('clamps out-of-range months', () => {
    expect(phaseForMonth(0).phase.id).toBe('excavation');
    expect(phaseForMonth(99)).toMatchObject({ phase: { id: 'finishing' }, monthInPhase: 9 });
  });
});
