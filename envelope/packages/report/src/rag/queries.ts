/**
 * Fixed retrieval queries per report section and per mitigation measure (MODELS.md A.7). Their
 * embeddings are computed by `pnpm rag:build` and stored in the index, so the server needs no
 * embedding model at run time. Changing a text here requires rebuilding the index (a unit test
 * checks that every query has a vector).
 */
import type { Mitigations } from '@envelope/models';
import type { ReportPayload } from '../payload';

export const SECTION_QUERIES: Record<string, string[]> = {
  project: [
    'prior environmental clearance for building and construction projects by built-up area',
    'Schedule item 8 Building and Construction projects Townships and Area Development projects built up area',
  ],
  site: [
    'CAMS global atmospheric composition forecast PM10 aerosol evaluation against observations',
    'ERA5 hourly reanalysis resolution and uncertainty',
  ],
  method: [
    'emission factor equation for vehicles travelling on unpaved surfaces at industrial sites silt content vehicle weight',
    'emissions from aggregate handling and storage pile drop operations moisture content wind speed',
    'wind erosion of exposed surfaces and storage piles threshold friction velocity fastest mile',
  ],
  dust: [
    'dust mitigation measures for construction and demolition activities',
    'national ambient air quality standard for PM10 24 hourly',
  ],
  ghg: ['weighted average CO2 emission factor of the grid for the Indian power sector'],
  emp: [
    'environmental management plan including dust mitigation measures for projects requiring environmental clearance',
  ],
  compliance: [
    'national ambient air quality standards notification PM10 PM2.5 limits',
    'schedule of projects requiring prior environmental clearance building and construction projects',
    'Schedule item 8 Building and Construction projects Townships and Area Development projects built up area',
    'mandatory implementation of dust mitigation measures for construction and demolition activities',
  ],
  monitoring: ['monitoring of particulate matter and dust control at construction sites'],
  limitations: ['emission factor quality rating and limitations of the estimation method'],
};

export const MITIGATION_QUERIES: Partial<Record<keyof Mitigations, string>> = {
  sprinkling: 'water sprinkling to suppress dust on construction sites and haul roads',
  pavedRoads: 'paving or hard surfacing of site roads to reduce dust',
  windBarriers: 'wind breakers and barricading of the construction site boundary',
  coverStockpiles: 'covering stored construction material and stockpiles',
  greenNetting: 'covering of scaffolding and buildings under construction with green net',
  antiSmogGun: 'anti-smog guns at construction sites',
  wheelWashing: 'wheel washing of vehicles leaving the construction site',
  highWindStop: 'stopping dust-generating work during high wind',
  wasteReduction: 'construction and demolition waste management',
};

/** Every query text, for the index build. */
export function allQueryTexts(): string[] {
  return [...new Set([...Object.values(SECTION_QUERIES).flat(), ...Object.values(MITIGATION_QUERIES)])];
}

export interface SectionPlan {
  section: string;
  /** Fixed queries with precomputed vectors; they also set the section's relevance floor. */
  queries: string[];
  /** Queries built from this report's payload, scored by BM25 only (no vector at run time). */
  keywords: string[];
}

const GHG_MEASURES = new Set<string>([
  'lowCarbonConcrete',
  'recycledRebar',
  'gridPower',
  'solarHybridDg',
  'localSourcing',
  'wasteReduction',
]);

/** First number in a display string ("1,234 µg/m³" → 1234), NaN when none. */
const num = (s: string | undefined) =>
  Number(
    (s ?? '')
      .replace(/,/g, '')
      .match(/[-−]?\d+(\.\d+)?/)?.[0]
      ?.replace('−', '-'),
  );
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0] ?? s;

/**
 * Keyword queries from the payload (D-036): what this report actually contains. Compliance rows,
 * the EIA built-up area check, exceedance days and background PM10, the dominant dust sources,
 * enabled measures, sensitive receptors and the stated limitations.
 */
export function payloadKeywords(p: ReportPayload): Record<string, string[]> {
  const ids = p.mitigationIds ?? [];
  const labels = p.mitigations ?? [];
  const measure = (pred: (id: string) => boolean) => labels.filter((_, i) => pred(ids[i] ?? ''));
  const compliance = (p.compliance ?? []).map((c) =>
    `${c.regulation} ${c.requirement}`.replace(/\[verify\]/g, '').trim(),
  );
  const eia = (p.compliance ?? []).find((c) => /^EIA/.test(c.regulation));
  const kpi = (label: string) => (p.headline ?? []).find((h) => h.label.startsWith(label));
  const exceedDays = num(kpi('Site-caused')?.mitigated);
  const backgroundPm10 = num(
    (p.climate ?? []).find((c) => c.label.startsWith('Mean background PM10'))?.value,
  );
  const dustRows =
    (p.tables ?? []).find((t) => t.id === 'dustSources')?.rows.filter((r) => r[0] !== 'Total') ?? [];
  const topSources = [...dustRows]
    .filter((r) => num(r[2]) > 0)
    .sort((a, b) => num(b[2]) - num(a[2]))
    .slice(0, 2)
    .map((r) => `${r[0]} dust emissions control`);
  const receptorKinds = [
    ...new Set(
      ((p.tables ?? []).find((t) => t.id === 'receptors')?.rows ?? []).map((r) => r[1]).filter(Boolean),
    ),
  ];
  // src: NAAQS 2009 annual PM10 limit, 60 µg/m³ (packages/models compliance/rules.ts). G.S.R. 94(E)
  // makes the dust measures mandatory where ambient PM exceeds the NAAQS.
  const nonAttainment =
    backgroundPm10 > 60
      ? [
          'city where ambient PM10 exceeds the National Ambient Air Quality Standards dust mitigation measures',
        ]
      : [];
  return {
    project: eia
      ? [
          `${eia.requirement} ${eia.status}`.replace(/\[verify\]/g, ''),
          `building construction ${p.project?.use ?? ''} built-up area`,
        ]
      : [],
    method: dustRows.filter((r) => num(r[2]) > 0).map((r) => r[0]!),
    dust: [
      ...(exceedDays > 0 ? ['site exceedance of the 24 hourly PM10 ambient air quality standard'] : []),
      ...nonAttainment,
      ...topSources,
      ...measure((id) => !GHG_MEASURES.has(id)),
    ],
    ghg: measure((id) => GHG_MEASURES.has(id)),
    emp: [...measure(() => true), ...nonAttainment],
    compliance,
    monitoring: receptorKinds.map((k) => `ambient air monitoring near ${k}`),
    limitations: (p.limitations ?? []).map(firstSentence),
  };
}

/**
 * Queries for each section of this report: the fixed set (plus a fixed query per enabled dust
 * measure) and, unless `dynamic` is false, keyword queries from the payload.
 */
export function planRetrieval(p: ReportPayload, opts: { dynamic?: boolean } = {}): SectionPlan[] {
  const ids = (p.mitigationIds ?? []) as (keyof Mitigations)[];
  const measures = ids.map((k) => MITIGATION_QUERIES[k]).filter((q): q is string => Boolean(q));
  const kw = opts.dynamic === false ? {} : payloadKeywords(p);
  return Object.entries(SECTION_QUERIES).map(([section, queries]) => ({
    section,
    queries: section === 'emp' || section === 'dust' ? [...queries, ...measures] : queries,
    keywords: [...new Set((kw[section] ?? []).filter((k) => k.trim().length > 0))],
  }));
}
