import { describe, expect, it } from 'vitest';
import { antiSmogGunsRequired, insideNcr, naaqsAllowedExceedDays } from './rules';

describe('compliance rules', () => {
  it('allows NAAQS 24 h exceedance on 2% of programme days', () => {
    // 7 months × 365/12 = 212.9 days; 2% = 4.26 days
    expect(naaqsAllowedExceedDays(7)).toBeCloseTo(4.258, 3);
    expect(naaqsAllowedExceedDays(12)).toBeCloseTo(7.3, 6);
  });

  it('scales CAQM anti-smog guns with site area', () => {
    expect(antiSmogGunsRequired(1820)).toBe(0);
    expect(antiSmogGunsRequired(4999)).toBe(0);
    expect(antiSmogGunsRequired(5000)).toBe(1);
    expect(antiSmogGunsRequired(12000)).toBe(2);
    expect(antiSmogGunsRequired(19999)).toBe(3);
    expect(antiSmogGunsRequired(45000)).toBe(4);
  });

  it('places central Delhi and Gurugram in NCR, Mumbai outside', () => {
    expect(insideNcr(28.6448, 77.2167)).toBe(true);
    expect(insideNcr(28.406, 77.085)).toBe(true);
    expect(insideNcr(19.076, 72.8777)).toBe(false);
  });
});
