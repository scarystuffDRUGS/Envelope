import { describe, expect, it } from 'vitest';
import type { ReportPayload } from './payload';
import { parseNumbers, validateNarrative } from './validator';

const payload = {
  meta: { title: 'T', company: 'C', preparedBy: 'P', date: '7 Oct 2026', version: '1.0', scenario: 'both' },
  headline: [
    {
      label: 'PM10 emitted',
      unit: 't',
      baseline: '7.27',
      mitigated: '4.76',
      delta: '−2.51',
      deltaPct: '−35%',
    },
  ],
} as unknown as ReportPayload;

describe('report number validator', () => {
  it('parses Indian grouping, decimals and true minus signs, ignoring table references', () => {
    expect(parseNumbers('Emissions of 1,23,456.5 t fell by −35% (see Table 3).')).toEqual([123456.5, -35]);
  });

  it('ignores identifiers of standards and methods', () => {
    expect(
      parseNumbers('Modules A1–A5 of EN 15978, AP-42 Section 13.2.4, IS 875 and ICE v3.0 give 302 kg.'),
    ).toEqual([302]);
  });

  it('keeps sentences whose numbers are in the payload (±0.5%)', () => {
    const r = validateNarrative(
      [{ id: 'x', title: 'X', paragraphs: ['PM10 emissions fall from 7.27 t to 4.76 t.'] }],
      payload,
    );
    expect(r.dropped).toHaveLength(0);
    expect(r.sections[0]!.paragraphs[0]).toContain('7.27');
  });

  it('rejects a sentence containing a number absent from the payload', () => {
    const r = validateNarrative(
      [{ id: 'x', title: 'X', paragraphs: ['PM10 emissions fall to 4.76 t. Dust drops by 80% on site.'] }],
      payload,
    );
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0]!.sentence).toContain('80%');
    expect(r.sections[0]!.paragraphs[0]).toBe('PM10 emissions fall to 4.76 t.');
  });

  it('removes banned wording', () => {
    const r = validateNarrative(
      [{ id: 'x', title: 'X', paragraphs: ['The project is compliant.'] }],
      payload,
    );
    expect(r.dropped[0]!.reason).toContain('banned');
  });
});
