/**
 * ReportPayload: everything the report states, as display strings, built deterministically
 * from model output (HANDOVER Appendix B). The LLM only writes prose around it.
 */
export interface Row {
  cells: string[];
}

export interface Table {
  id: string;
  title: string;
  head: string[];
  rows: string[][];
  note?: string;
}

/**
 * Table ids in the order they appear in the report. Tables are numbered by this order, so
 * prose refers to them through `tableRef`, never a hard-coded number.
 */
export const TABLE_ORDER = [
  'kpi',
  'logistics',
  'climate',
  'backgroundModel',
  'sources',
  'receptors',
  'dustSources',
  'ghg',
  'emp',
  'compliance',
  'assumptions',
] as const;

export function tableRef(id: (typeof TABLE_ORDER)[number]): string {
  return `Table ${TABLE_ORDER.indexOf(id) + 1}`;
}

export interface ComplianceRow {
  regulation: string;
  requirement: string;
  status: string;
  evidence: string;
}

export interface ReportPayload {
  meta: {
    title: string;
    company: string;
    preparedBy: string;
    date: string;
    version: string;
    scenario: 'baseline' | 'mitigated' | 'both';
  };
  project: {
    name: string;
    site: string;
    coordinates: string;
    use: string;
    structure: string;
    floors: string;
    gfa: string;
    footprint: string;
    height: string;
    programme: string;
    programmeSource: string;
  };
  headline: {
    label: string;
    unit: string;
    baseline: string;
    mitigated: string;
    delta: string;
    deltaPct: string;
  }[];
  mitigations: string[];
  /** Keys of the enabled measures (keyof Mitigations), for retrieval queries. */
  mitigationIds?: string[];
  /** Site climate and background air quality; `limit` is the threshold it is compared with, or '–'. */
  climate: { label: string; value: string; limit: string }[];
  /** Which background PM the dust results use (D-038); the note is the sentence shown in the app. */
  background?: { corrected: boolean; note: string };
  tables: Table[];
  compliance: ComplianceRow[];
  provenance: { source: string; status: string; fetchedAt: string; attribution: string }[];
  assumptionsUnverified: number;
  limitations: string[];
}

export interface NarrativeSection {
  id: string;
  title: string;
  paragraphs: string[];
}

export const SECTION_IDS = [
  { id: 'executive', title: 'Executive summary' },
  { id: 'project', title: 'Project description' },
  { id: 'site', title: 'Site and baseline environment' },
  { id: 'method', title: 'Methodology and data sources' },
  { id: 'dust', title: 'Dust impact assessment' },
  { id: 'heat', title: 'Heat impact assessment' },
  { id: 'ghg', title: 'Greenhouse-gas assessment' },
  { id: 'emp', title: 'Mitigation measures and Environmental Management Plan' },
  { id: 'compliance', title: 'Indicative compliance matrix' },
  { id: 'monitoring', title: 'Monitoring plan' },
  { id: 'limitations', title: 'Limitations and uncertainty' },
] as const;

/**
 * What the LLM is sent: the payload without the assumptions register rows (Annex A is rendered from
 * the payload, the narrative only needs `assumptionsUnverified`) and without `compliance`, which
 * repeats the compliance table. About 30% smaller, so Groq's free tier (8,000 tokens per minute)
 * takes a report with its passages (D-037). The table stays in place, so table numbers do not
 * shift. Numbers are still validated against the full payload.
 */
export function llmView(p: ReportPayload): Omit<ReportPayload, 'compliance'> {
  const { compliance: _compliance, ...rest } = p;
  return {
    ...rest,
    tables: p.tables.map((t) =>
      t.id === 'assumptions'
        ? {
            ...t,
            rows: [],
            note: `${t.rows.length} parameters, listed in Annex A; not needed for the narrative.`,
          }
        : t,
    ),
  };
}
