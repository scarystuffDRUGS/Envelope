import { describe, expect, it } from 'vitest';
import type { ReportPayload } from './payload';
import { llmView, TABLE_ORDER } from './payload';

const payload = {
  meta: { title: 'T' },
  compliance: [{ regulation: 'NAAQS 2009', requirement: 'r', status: 's', evidence: 'Table 9' }],
  tables: TABLE_ORDER.map((id) => ({
    id,
    title: id,
    head: ['a'],
    rows: id === 'assumptions' ? [['p1'], ['p2'], ['p3']] : [['x']],
  })),
  assumptionsUnverified: 2,
} as unknown as ReportPayload;

describe('payload sent to the LLM', () => {
  const v = llmView(payload);

  it('drops the assumptions rows and the duplicate compliance list, keeping table positions', () => {
    expect('compliance' in v).toBe(false);
    expect(v.tables.map((t) => t.id)).toEqual(TABLE_ORDER);
    const a = v.tables.find((t) => t.id === 'assumptions')!;
    expect(a.rows).toEqual([]);
    expect(a.note).toContain('3 parameters');
    expect(v.assumptionsUnverified).toBe(2);
  });

  it('leaves the full payload unchanged for validation and rendering', () => {
    expect(payload.compliance).toHaveLength(1);
    expect(payload.tables.find((t) => t.id === 'assumptions')!.rows).toHaveLength(3);
  });
});
