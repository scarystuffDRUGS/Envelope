/**
 * Regulatory references used by the indicative compliance checks.
 * Every entry carries a citation and the date its values were checked against the
 * source document. `verifiedOn: null` means not yet checked; the UI and report must
 * show it as unverified. Wording is always "indicative", never "compliant".
 */
export interface RuleReference {
  id: string;
  title: string;
  citation: string;
  url?: string;
  verifiedOn: string | null; // ISO date
}

export interface ConcentrationLimit {
  ref: RuleReference;
  pollutant: 'PM10' | 'PM2.5';
  averaging: '24h' | 'annual';
  limitUgM3: number;
}

const NAAQS_2009: RuleReference = {
  id: 'naaqs-2009',
  title: 'National Ambient Air Quality Standards, 2009',
  citation: 'CPCB notification, Gazette of India, 18 November 2009 (NAAQS 2009)',
  verifiedOn: null,
};

const WHO_AQG_2021: RuleReference = {
  id: 'who-aqg-2021',
  title: 'WHO global air quality guidelines, 2021',
  citation: 'World Health Organization (2021), WHO global air quality guidelines',
  verifiedOn: null,
};

/** Values from HANDOVER A.2.2; checked against the source documents before first use (checkpoint 2). */
export const PM_LIMITS: readonly ConcentrationLimit[] = [
  { ref: NAAQS_2009, pollutant: 'PM10', averaging: '24h', limitUgM3: 100 },
  { ref: NAAQS_2009, pollutant: 'PM10', averaging: 'annual', limitUgM3: 60 },
  { ref: NAAQS_2009, pollutant: 'PM2.5', averaging: '24h', limitUgM3: 60 },
  { ref: NAAQS_2009, pollutant: 'PM2.5', averaging: 'annual', limitUgM3: 40 },
  { ref: WHO_AQG_2021, pollutant: 'PM10', averaging: '24h', limitUgM3: 45 },
  { ref: WHO_AQG_2021, pollutant: 'PM10', averaging: 'annual', limitUgM3: 15 },
  { ref: WHO_AQG_2021, pollutant: 'PM2.5', averaging: '24h', limitUgM3: 15 },
  { ref: WHO_AQG_2021, pollutant: 'PM2.5', averaging: 'annual', limitUgM3: 5 },
];

/**
 * NAAQS 2009 note 2: 24-hourly values shall be met 98% of the time in a year; they may be exceeded
 * on 2% of days, but not on two consecutive days. Scaled to the programme length (indicative).
 */
export const NAAQS_24H_COMPLIANCE = { ref: NAAQS_2009, allowedExceedShare: 0.02 } as const;

/** Days a programme of `months` may exceed a 24 h NAAQS limit: 2% of its days (365 / 12 per month). */
export function naaqsAllowedExceedDays(months: number): number {
  return NAAQS_24H_COMPLIANCE.allowedExceedShare * months * (365 / 12);
}

/** IMD heat-wave criterion for the plains: maximum temperature of at least 40 °C (with departure ≥ 4.5 °C, or ≥ 45 °C). */
export const HEAT_WAVE = {
  ref: {
    id: 'imd-ndma-heatwave',
    title: 'IMD heat-wave criteria; NDMA guidelines for heat-wave action plans (2019)',
    citation:
      'India Meteorological Department heat-wave criteria (plains: Tmax ≥ 40 °C); NDMA (2019) Guidelines for Preparation of Action Plan – Prevention and Management of Heat Wave',
    verifiedOn: null,
  } satisfies RuleReference,
  plainsTmaxC: 40,
} as const;

/**
 * LETI upfront embodied carbon targets (A1–A5, excluding sequestration), kgCO2e/m² GIA. Office values
 * are used for retail and mixed use until checked against the source.
 */
export const UPFRONT_CARBON_TARGETS = {
  ref: {
    id: 'leti-2020',
    title: 'LETI upfront embodied carbon targets',
    citation: 'LETI (2020) Climate Emergency Design Guide; LETI (2020) Embodied Carbon Primer',
    verifiedOn: null,
  } satisfies RuleReference,
  byUse: {
    office: { y2020: 600, y2030: 350 },
    residential: { y2020: 500, y2030: 300 },
    retail: { y2020: 600, y2030: 350 },
    mixed: { y2020: 600, y2030: 350 },
  },
} as const;

/**
 * CAQM directions for construction and demolition sites in the National Capital Region: sites of
 * 500 m² or more register on the dust-control portal; anti-smog guns scale with site area.
 */
export const CAQM_CND = {
  ref: {
    id: 'caqm-cnd',
    title: 'CAQM directions on dust control at C&D sites in NCR',
    citation:
      'Commission for Air Quality Management in NCR and Adjoining Areas, statutory directions on C&D dust control (with DPCC directions for Delhi)',
    verifiedOn: null,
  } satisfies RuleReference,
  registrationMinAreaM2: 500,
  /** Minimum anti-smog guns: [site area from (m²), guns]. */
  antiSmogGuns: [
    [20000, 4],
    [15000, 3],
    [10000, 2],
    [5000, 1],
  ] as const,
  /** Approximate NCR extent (Delhi and the NCR districts of Haryana, Uttar Pradesh and Rajasthan). */
  bounds: { latMin: 27.6, latMax: 29.6, lonMin: 75.9, lonMax: 78.4 },
} as const;

export function antiSmogGunsRequired(siteAreaM2: number): number {
  for (const [from, guns] of CAQM_CND.antiSmogGuns) if (siteAreaM2 >= from) return guns;
  return 0;
}

export function insideNcr(lat: number, lon: number): boolean {
  const b = CAQM_CND.bounds;
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}
