import type { BackgroundCorrection, SiteData } from '@envelope/data';
import type { Assumptions, BuildingSpec, Mitigations } from '@envelope/models';
import {
  HEAT_WAVE,
  PARAMS,
  PM_LIMITS,
  UPFRONT_CARBON_TARGETS,
  antiSmogGunsRequired,
  CAQM_CND,
  insideNcr,
  isSensitive,
  naaqsAllowedExceedDays,
  programmeTotal,
} from '@envelope/models';
import type { ComplianceRow, ReportPayload, Table } from '@envelope/report';
import { TABLE_ORDER, tableRef as ref } from '@envelope/report';
import type { BuildingSource, Results } from '../store/appStore';
import { demoBuilding } from '../viewer/site';
import { backgroundNote } from './background';
import { KPIS, delta, fmt } from './kpis';

const MIT_LABELS: Partial<Record<keyof Mitigations, string>> = {
  sprinkling: 'Water sprinkling of the work area and haul roads',
  pavedRoads: 'Paved or WMM haul roads',
  windBarriers: 'Wind barriers and site barricading',
  coverStockpiles: 'Covered stockpiles and materials',
  greenNetting: 'Green netting on scaffolding',
  antiSmogGun: 'Anti-smog gun (low evidence)',
  wheelWashing: 'Wheel washing at site exit',
  highWindStop: 'Stopping dusty work in high wind',
  shadeNets: 'Shade nets over work areas',
  retainTrees: 'Retained trees along the boundary',
  rescheduleWork: 'No heavy work 12:00–15:00',
  lowCarbonConcrete: 'Low-carbon concrete (GGBS / fly ash)',
  recycledRebar: 'Recycled-content rebar',
  gridPower: 'Grid connection instead of DG sets',
  solarHybridDg: 'Solar-hybrid site power',
  localSourcing: 'Local sourcing of materials',
  wasteReduction: 'Construction waste reduction plan',
};

const RECEPTOR_LABEL: Record<string, string> = {
  boundary: 'site boundary',
  school: 'school',
  college: 'college',
  university: 'university',
  kindergarten: 'kindergarten',
  hospital: 'hospital',
  clinic: 'clinic',
  nursing_home: 'nursing home',
  residential: 'residential area',
};

const EMP: Partial<Record<keyof Mitigations, [string, string, string, string]>> = {
  sprinkling: ['All phases', 'Site contractor', 'Twice daily, logged', 'Haul-road PM10 at boundary'],
  pavedRoads: ['From mobilisation', 'Site contractor', 'Weekly inspection', 'Silt on haul road'],
  windBarriers: ['All phases', 'Site contractor', 'Weekly inspection', 'Barrier continuity'],
  coverStockpiles: ['All phases', 'Site contractor', 'Daily inspection', 'Share of stockpiles covered'],
  greenNetting: ['Structure, finishing', 'Site contractor', 'Weekly inspection', 'Netting coverage'],
  antiSmogGun: ['Excavation, structure', 'Site contractor', 'Daily log', 'Hours operated'],
  wheelWashing: ['All phases', 'Site contractor', 'Each vehicle exit', 'Trackout on public road'],
  highWindStop: ['All phases', 'Site manager', 'Hourly wind check', 'Hours stopped'],
  shadeNets: ['Hot season', 'EHS officer', 'Daily', 'UTCI at work areas'],
  retainTrees: ['All phases', 'Developer', 'Monthly', 'Trees retained'],
  rescheduleWork: ['Hot season', 'Site manager', 'Daily', 'Heavy work hours 12:00–15:00'],
  lowCarbonConcrete: ['Structure', 'Developer, RMC supplier', 'Per batch', 'GGBS / fly-ash content'],
  recycledRebar: ['Structure', 'Developer', 'Per delivery', 'Mill certificates'],
  gridPower: ['All phases', 'Developer', 'Monthly', 'kWh from grid vs DG'],
  solarHybridDg: ['All phases', 'Site contractor', 'Monthly', 'Solar kWh'],
  localSourcing: ['All phases', 'Procurement', 'Per order', 'Haul distance'],
  wasteReduction: ['All phases', 'Site contractor', 'Monthly', 'Wastage %'],
};

/**
 * Model card of the background PM correction (D-038): status for this site, training data and the
 * held-out test against stations it never saw. Always present, so table numbers stay stable.
 */
function backgroundModelTable(bg: BackgroundCorrection | null, note: string): Table {
  const head = ['Item', 'Value'];
  if (!bg)
    return {
      id: 'backgroundModel',
      title: 'Background PM correction (model card)',
      head,
      rows: [['Status', 'Not available for this data; raw CAMS is used']],
    };
  const c = bg.card;
  const pair = (x: { cams: number | null; corrected: number | null }, d: number, signed = false) => {
    const v = (n: number | null) => (n === null ? '–' : `${signed && n > 0 ? '+' : ''}${fmt(n, d)}`);
    return `CAMS ${v(x.cams)}, corrected ${v(x.corrected)}`;
  };
  const rows = (pol: 'pm10' | 'pm25', label: string) => {
    const t = c.metrics[pol].spatialTest;
    const e = t.exceedance;
    const pf = (x: { pod: number | null; far: number | null }) =>
      `${x.pod === null ? '–' : fmt(x.pod, 2)} / ${x.far === null ? '–' : fmt(x.far, 2)}`;
    return [
      [`${label} hourly RMSE, held-out stations (µg/m³)`, pair(t.hourlyRmse, 0)],
      [`${label} mean bias, held-out stations (µg/m³)`, pair(t.hourlyBias, 0, true)],
      [`${label} daily R², held-out stations`, pair(t.dailyR2, 2)],
      [
        `${label} days above ${fmt(e.limit, 0)} µg/m³ (24 h), hit rate / false alarm rate`,
        `CAMS ${pf(e.cams)}, corrected ${pf(e.corrected)} (${fmt(e.obsDays, 0)} observed station-days)`,
      ],
    ];
  };
  return {
    id: 'backgroundModel',
    title: 'Background PM correction (model card)',
    head,
    rows: [
      [
        'Status for this site',
        bg.status === 'corrected' ? 'Applied: station-corrected CAMS' : 'Not applied: raw CAMS',
      ],
      [
        'Trained area',
        `${c.region}, within ${fmt(c.trainedAreaKm, 0)} km of a training station${bg.nearestStation ? `; nearest: ${bg.nearestStation.name}, ${fmt(bg.nearestStation.km, 1)} km` : ''}`,
      ],
      ['Training data', `${c.target}, ${c.period.from} to ${c.period.to}`],
      ['Held-out test stations', c.heldOutStations.join('; ')],
      ['Method', c.method],
      ['Inputs', c.inputs],
      ...rows('pm10', 'PM10'),
      ...rows('pm25', 'PM2.5'),
    ],
    note: `${note} Held-out stations were never used for training; the shipped model is refit on all stations. ${c.limitations.join(' ')}`,
  };
}

export function buildPayload(opts: {
  results: Results;
  mitigations: Mitigations;
  assumptions: Partial<Assumptions>;
  siteData: SiteData | null;
  projectName: string;
  title: string;
  company: string;
  preparedBy: string;
  /** Defaults to the demo building (tests). */
  building?: BuildingSpec;
  buildingSource?: BuildingSource;
}): ReportPayload {
  const { results, mitigations } = opts;
  const b = results.baseline;
  const m = results.mitigated;
  const spec = opts.building ?? demoBuilding;
  const source = opts.buildingSource ?? { kind: 'demo' };
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const enabled = (Object.keys(MIT_LABELS) as (keyof Mitigations)[]).filter((k) => mitigations[k] === true);

  const headline = KPIS.map((k) => {
    const bv = k.value(b);
    const mv = k.value(m);
    const d = delta(bv, mv, k.digits);
    return {
      label: k.label,
      unit: k.unit,
      baseline: fmt(bv, k.digits),
      mitigated: fmt(mv, k.digits),
      delta: d.abs,
      deltaPct: d.pct,
    };
  });

  const tables: Table[] = [];
  const order: readonly string[] = TABLE_ORDER;
  const months = programmeTotal(m.programme.effective);
  const hours = (r: typeof b) => `${fmt(r.heat.riskHours, 0)} of ${fmt(r.heat.workingHours, 0)} h`;
  tables.push({
    id: 'kpi',
    title: 'Key indicators, baseline and mitigated',
    head: ['Indicator', 'Unit', 'Baseline', 'Mitigated', 'Δ', 'Δ%'],
    rows: headline.map((h) => [h.label, h.unit, h.baseline, h.mitigated, h.delta, h.deltaPct]),
    note:
      `Selected day and hour for daily and hourly indicators: ${m.selected.dateLabel}, ${String(m.selected.hour).padStart(2, '0')}:00 IST. ` +
      `Heat-stress hours count working hours (Monday to Saturday, 08:00–20:00) over the ${months}-month programme for an unshaded worker on bare soil: ${hours(b)} in the baseline, ${hours(m)} with mitigation. ` +
      `The programme is taken to start in January; the reference-year weather repeats for months after the twelfth.`,
  });
  tables.push({
    id: 'logistics',
    title: 'Material quantities and derived vehicle movements',
    head: [
      'Material',
      'Vehicle',
      'Phase',
      'Quantity',
      'Loads',
      'Trips (with returns)',
      'Trips per day',
      'On-site VKT per day',
    ],
    rows: m.flows.map((f) => [
      f.label,
      f.vehicle,
      f.phase,
      `${fmt(f.quantity, 0)} ${f.quantityUnit}`,
      fmt(f.loads, 0),
      fmt(f.trips, 0),
      fmt(f.tripsPerDay, 1),
      fmt(f.vktPerDay, 2),
    ]),
    note:
      `Programme ${programmeTotal(m.programme.effective)} months (${m.programme.source === 'auto' ? 'derived from the building' : 'user-set'}); haul route ${fmt(m.haulRouteM, 0)} m from gate to building. ` +
      (spec.quantities
        ? `Concrete volume from the imported model's base quantities (${spec.quantities.source}); other materials from per-m² intensities.`
        : 'Material quantities from per-m² intensities of gross floor area (Annex A).'),
  });
  const w = opts.siteData?.weather?.values;
  const mean = (xs: number[] | undefined) =>
    xs && xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : Number.NaN;
  const median = (xs: number[] | undefined) => {
    if (!xs || !xs.length) return Number.NaN;
    const s = [...xs].sort((x, y) => x - y);
    const k = s.length >> 1;
    return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
  };
  // Station-corrected background (D-038) when the site is inside the trained area.
  const bgInfo = opts.siteData?.background;
  const corr = bgInfo?.status === 'corrected' && bgInfo.pm10 && bgInfo.pm2_5 ? bgInfo : null;
  const bgNote = backgroundNote(opts.siteData);
  // CAMS desert-dust events skew the mean, so the report also gives the median and the peak month.
  const aq = opts.siteData?.airQuality?.values;
  const aqTime = opts.siteData?.airQuality?.time;
  const peakMonth = (() => {
    if (!aq?.pm10?.length || !aqTime?.length) return null;
    const sums = new Array<number>(12).fill(0);
    const counts = new Array<number>(12).fill(0);
    aqTime.forEach((ts, i) => {
      const mo = Number(ts.slice(5, 7)) - 1;
      const v = aq.pm10[i];
      if (mo >= 0 && mo < 12 && v !== undefined && Number.isFinite(v)) {
        sums[mo]! += v;
        counts[mo]!++;
      }
    });
    let best = -1;
    for (let k = 0; k < 12; k++)
      if (counts[k]! && (best < 0 || sums[k]! / counts[k]! > sums[best]! / counts[best]!)) best = k;
    if (best < 0) return null;
    const label = new Date(Date.UTC(2000, best, 1)).toLocaleDateString('en-IN', { month: 'long' });
    return { mean: sums[best]! / counts[best]!, label };
  })();
  // Daily values in IST (UTC+05:30) for the 24 h limit and the heat-wave threshold.
  const daily = (time: string[] | undefined, xs: number[] | undefined, f: 'max' | 'mean') => {
    if (!time?.length || !xs?.length) return [];
    const days = new Map<string, number[]>();
    time.forEach((ts, i) => {
      const v = xs[i];
      if (v === undefined || !Number.isFinite(v)) return;
      const key = new Date(Date.parse(`${ts}Z`) + 330 * 60_000).toISOString().slice(0, 10);
      const d = days.get(key);
      if (d) d.push(v);
      else days.set(key, [v]);
    });
    return [...days.values()].map((d) => (f === 'max' ? Math.max(...d) : mean(d)));
  };
  const naaqs24 = PM_LIMITS.find(
    (l) => l.ref.id === 'naaqs-2009' && l.pollutant === 'PM10' && l.averaging === '24h',
  )!;
  const naaqsAnnual = PM_LIMITS.find(
    (l) => l.ref.id === 'naaqs-2009' && l.pollutant === 'PM10' && l.averaging === 'annual',
  )!;
  const naaqsAnnualPm25 = PM_LIMITS.find(
    (l) => l.ref.id === 'naaqs-2009' && l.pollutant === 'PM2.5' && l.averaging === 'annual',
  )!;
  const who24 = PM_LIMITS.find(
    (l) => l.ref.id === 'who-aqg-2021' && l.pollutant === 'PM10' && l.averaging === '24h',
  )!;
  const taMaxDaily = daily(opts.siteData?.weather?.time, w?.temperature_2m, 'max');
  const hotDays = taMaxDaily.filter((v) => v >= HEAT_WAVE.plainsTmaxC).length;
  const bgDaily = daily(aqTime, aq?.pm10, 'mean');
  const bgOverDays = bgDaily.filter((v) => v > naaqs24.limitUgM3).length;
  const taMax = w ? Math.max(...w.temperature_2m) : Number.NaN;
  const heatLimit = `IMD heat-wave threshold, plains: ${HEAT_WAVE.plainsTmaxC} °C`;
  const pm24Limit = `NAAQS 24 h: ${naaqs24.limitUgM3} µg/m³`;
  const climate = [
    { label: 'Mean air temperature', value: `${fmt(mean(w?.temperature_2m), 1)} °C`, limit: '–' },
    { label: 'Maximum air temperature', value: `${fmt(taMax, 1)} °C`, limit: heatLimit },
    {
      label: `Days with maximum air temperature of ${HEAT_WAVE.plainsTmaxC} °C or more`,
      value: taMaxDaily.length ? `${fmt(hotDays, 0)} of ${fmt(taMaxDaily.length, 0)} days` : '–',
      limit: heatLimit,
    },
    { label: 'Mean wind speed at 10 m', value: `${fmt(mean(w?.wind_speed_10m), 1)} m/s`, limit: '–' },
    {
      label: 'Total precipitation',
      value: `${fmt(w ? w.precipitation.reduce((s, v) => s + v, 0) : Number.NaN, 0)} mm`,
      limit: '–',
    },
    {
      label: `Mean background PM10 used for dust (${corr ? 'station-corrected CAMS' : 'CAMS'})`,
      value: `${fmt(b.dust.background.periodMeanPm10, 0)} µg/m³`,
      limit: `NAAQS annual: ${naaqsAnnual.limitUgM3} µg/m³`,
    },
    ...(corr
      ? [
          {
            label: 'Mean background PM10, reference year: raw CAMS / station-corrected',
            value: `${fmt(mean(aq?.pm10), 0)} / ${fmt(mean(corr.pm10), 0)} µg/m³`,
            limit: `NAAQS annual: ${naaqsAnnual.limitUgM3} µg/m³`,
          },
          {
            label: 'Mean background PM2.5, reference year: raw CAMS / station-corrected',
            value: `${fmt(mean(aq?.pm2_5), 0)} / ${fmt(mean(corr.pm2_5), 0)} µg/m³`,
            limit: `NAAQS annual: ${naaqsAnnualPm25.limitUgM3} µg/m³`,
          },
        ]
      : []),
    {
      label: 'Median background PM10 (raw CAMS)',
      value: `${fmt(median(aq?.pm10), 0)} µg/m³`,
      limit: pm24Limit,
    },
    {
      label: 'Highest monthly mean background PM10 (raw CAMS)',
      value: peakMonth ? `${fmt(peakMonth.mean, 0)} µg/m³ (${peakMonth.label})` : '–',
      limit: pm24Limit,
    },
    {
      label: `Days with background 24 h PM10 above ${naaqs24.limitUgM3} µg/m³ (raw CAMS)`,
      value: bgDaily.length ? `${fmt(bgOverDays, 0)} of ${fmt(bgDaily.length, 0)} days` : '–',
      limit: `NAAQS: at most 2% of days (${fmt(naaqsAllowedExceedDays(12), 1)} a year)`,
    },
    { label: 'Calm hours in the programme', value: `${fmt(b.dust.calmHours, 0)} h`, limit: '–' },
    {
      label: 'Dust susceptibility index (heuristic)',
      value: `${fmt(b.dust.dsi.value, 0)} of 100`,
      limit: '–',
    },
  ];
  const overHeat = taMax >= HEAT_WAVE.plainsTmaxC;
  const overBg = median(aq?.pm10) > naaqs24.limitUgM3;
  tables.push({
    id: 'climate',
    title: `Site climate and background air quality, reference year ${opts.siteData?.weatherYear ?? ''}`,
    head: ['Parameter', 'Value', 'Limit or threshold'],
    rows: climate.map((c) => [c.label, c.value, c.limit]),
    note:
      (overHeat
        ? `The maximum air temperature is above the ${HEAT_WAVE.plainsTmaxC} °C heat-wave threshold on ${fmt(hotDays, 0)} days of the reference year, so the programme needs a heat action plan for workers (Section 6). `
        : '') +
      (overBg
        ? `Background PM10 alone is above the NAAQS 24 h limit on ${fmt(bgOverDays, 0)} days of the reference year and its median is above the limit, so site-caused exceedances are counted only on days when the background is below it. `
        : '') +
      'Days are counted in IST. CAMS is a global model at about 45 km resolution; comparisons with limits are indicative.',
  });
  tables.push(backgroundModelTable(bgInfo ?? null, bgNote.long));
  // What the school / college / hospital check covered (D-029): found, none mapped, or not checked.
  const sensitiveN = m.dust.receptors.filter((r) => isSensitive(r.kind)).length;
  const userN = m.dust.receptors.filter((r) => r.source === 'user').length;
  const receptorStatus = opts.siteData?.provenance.receptors?.status ?? opts.siteData?.provenance.osm?.status;
  const within = m.dust.siteWithin.length
    ? `The plot lies within ${m.dust.siteWithin.join(', ')}; the site-boundary values apply to it. `
    : '';
  const receptorCheck =
    within +
    (receptorStatus === 'unavailable'
      ? `OpenStreetMap could not be reached, so nearby schools, colleges and hospitals were not looked up${userN ? `; ${userN} were added by the user` : ''}. Add them by hand before submission. `
      : sensitiveN
        ? `${sensitiveN} schools, colleges or hospitals within 500 m of the site boundary (OpenStreetMap${userN ? ' and user additions' : ''}), each at its point nearest the site. `
        : 'No schools, colleges or hospitals are mapped in OpenStreetMap within 500 m of the site boundary; check on site and add any by hand. ');
  tables.push({
    id: 'receptors',
    title: 'PM10 at the site boundary and sensitive receptors (mitigated scenario)',
    head: [
      'Receptor',
      'Type',
      'Distance from site boundary',
      'Selected day 24 h total',
      'Selected day site increment',
      'Max 24 h increment',
      'Site-caused NAAQS exceedance days',
    ],
    rows: m.dust.receptors.map((r) => [
      r.source === 'user' ? `${r.name} (added by the user)` : r.name,
      RECEPTOR_LABEL[r.kind] ?? r.kind,
      `${fmt(r.distanceM, 0)} m`,
      `${fmt(r.day.pm10Total, 0)} µg/m³`,
      `${fmt(r.day.pm10Inc, 1)} µg/m³`,
      `${fmt(r.period.maxPm10Inc24h, 1)} µg/m³`,
      fmt(r.period.exceedDaysSiteCaused, 0),
    ]),
    note: `${receptorCheck} NAAQS 2009 PM10 24 h limit 100 µg/m³; WHO 2021 guideline 45 µg/m³. Comparison is indicative. A steady-state plume gives no increment at a receptor that is upwind of the site in every hour of the day.`,
  });
  const sources = [
    ['activity', 'General construction activity (WRAP)'],
    ['erosion', 'Wind erosion of exposed soil and stockpiles'],
    ['handling', 'Material handling (AP-42 13.2.4)'],
    ['haul', 'Haul traffic on site (AP-42 13.2.2)'],
    ['trackout', 'Trackout onto public roads'],
  ] as const;
  const share = (r: typeof b, k: (typeof sources)[number][0]) =>
    r.dust.totalPm10T > 0 ? `${fmt((100 * r.dust.bySourceT[k]) / r.dust.totalPm10T, 0)}%` : '–';
  tables.push({
    id: 'dustSources',
    title: 'PM10 emitted over the programme by source (t)',
    head: ['Source', 'Baseline', 'Share', 'Mitigated', 'Share'],
    rows: [
      ...sources.map(([k, label]) => [
        label,
        fmt(b.dust.bySourceT[k], 2),
        share(b, k),
        fmt(m.dust.bySourceT[k], 2),
        share(m, k),
      ]),
      ['Total', fmt(b.dust.totalPm10T, 2), '100%', fmt(m.dust.totalPm10T, 2), '100%'],
    ],
    note: `Wind erosion follows AP-42 Section 13.2.5: one event per daily disturbance of the site, on days when the fastest mile of wind lifts the friction velocity above the threshold (${fmt(b.dust.erosionEvents, 0)} days in the programme in the baseline).`,
  });
  const g = (r: typeof b) => r.ghg;
  const t = (v: number) => fmt(v / 1000, 0);
  // Diesel CO2 split by litres, so the rows add up to the A5 diesel total.
  const diesel = (r: typeof b, use: 'plant' | 'dg' | 'haul') =>
    r.ghg.a5DieselLitres > 0 ? (r.ghg.a5Diesel * r.ghg.a5DieselLitresBy[use]) / r.ghg.a5DieselLitres : 0;
  const ghgMeasures = (
    [
      'lowCarbonConcrete',
      'recycledRebar',
      'gridPower',
      'solarHybridDg',
      'localSourcing',
      'wasteReduction',
    ] as const
  ).filter((k) => mitigations[k]);
  const power = (r: typeof b, grid: boolean) =>
    grid
      ? `grid connection, ${fmt(r.ghg.a5GridKwh, 0)} kWh in Scope 2`
      : `DG sets, ${fmt(r.ghg.a5DieselLitresBy.dg, 0)} L of diesel in Scope 1, so Scope 2 is 0`;
  tables.push({
    id: 'ghg',
    title: 'Construction-stage greenhouse-gas emissions (tCO2e)',
    head: ['Module or scope', 'Baseline', 'Mitigated'],
    rows: [
      ['A1–A3 concrete', t(g(b).a1a3.concrete), t(g(m).a1a3.concrete)],
      ['A1–A3 reinforcement steel', t(g(b).a1a3.rebar), t(g(m).a1a3.rebar)],
      [
        'A1–A3 masonry, glass, aluminium',
        t(g(b).a1a3.masonry + g(b).a1a3.glass + g(b).a1a3.aluminium),
        t(g(m).a1a3.masonry + g(m).a1a3.glass + g(m).a1a3.aluminium),
      ],
      ['A4 transport to site', t(g(b).a4), t(g(m).a4)],
      ['A5 diesel, construction plant', t(diesel(b, 'plant')), t(diesel(m, 'plant'))],
      ['A5 diesel, DG sets for site power', t(diesel(b, 'dg')), t(diesel(m, 'dg'))],
      ['A5 diesel, haul vehicles on site', t(diesel(b, 'haul')), t(diesel(m, 'haul'))],
      ['A5 grid electricity', t(g(b).a5Electricity), t(g(m).a5Electricity)],
      ['A5 waste', t(g(b).waste), t(g(m).waste)],
      ['Total', t(g(b).total), t(g(m).total)],
      [
        'Scope 1 / Scope 2 / Scope 3',
        `${t(g(b).scope1)} / ${t(g(b).scope2)} / ${t(g(b).scope3)}`,
        `${t(g(m).scope1)} / ${t(g(m).scope2)} / ${t(g(m).scope3)}`,
      ],
    ],
    note:
      `Site electricity is ${fmt(g(b).siteKwh, 0)} kWh over the programme. Baseline power: ${power(b, false)}. Mitigated power: ${power(m, mitigations.gridPower)}. ` +
      `Diesel: ${fmt(g(b).a5DieselLitres, 0)} L in the baseline (plant ${fmt(g(b).a5DieselLitresBy.plant, 0)} L, DG sets ${fmt(g(b).a5DieselLitresBy.dg, 0)} L, site vehicles ${fmt(g(b).a5DieselLitresBy.haul, 0)} L); off-site delivery fuel is in A4.` +
      (ghgMeasures.length
        ? ''
        : ' No greenhouse-gas measures are enabled in the mitigated scenario, so both columns are equal.'),
  });
  const prov = opts.siteData ? Object.values(opts.siteData.provenance) : [];
  tables.push({
    id: 'sources',
    title: 'Data sources and fetch times',
    head: ['Source', 'Status', 'Fetched (UTC)', 'Attribution'],
    rows: [
      ...prov.map((p) => [
        p.source,
        p.status,
        p.fetchedAt ? p.fetchedAt.slice(0, 16).replace('T', ' ') : '–',
        p.attribution,
      ]),
      source.kind === 'demo'
        ? ['Building geometry', 'Project file', '–', 'fixtures/demo/building.json']
        : [
            'Building geometry',
            source.kind === 'ifc' ? 'Imported IFC model' : 'Imported mesh, dimensions entered',
            '–',
            source.fileName ?? 'uploaded file',
          ],
      ...(spec.quantities ? [['Concrete volume', 'Imported quantity', '–', spec.quantities.source]] : []),
      [
        'Background PM correction',
        corr ? 'Applied' : 'Not applied',
        '–',
        bgInfo ? `Model ${bgInfo.model.id}, trained on OpenAQ (CPCB) station data` : 'Not available',
      ],
      ['Grid emission factor', 'Constant', '–', 'CEA CO2 Baseline Database v21.0, FY 2024-25'],
    ],
  });
  tables.push({
    id: 'emp',
    title: 'Environmental Management Plan for the mitigated scenario',
    head: ['Measure', 'Phase', 'Responsibility', 'Monitoring', 'KPI'],
    rows: enabled.map((k) => [
      MIT_LABELS[k]!,
      ...(EMP[k] ?? ['All phases', 'Site contractor', 'Monthly', '–']),
    ]),
  });
  const plotArea = (spec.footprint.length && m.quantities.gfaM2 / spec.floors) || 0;
  const basements = opts.assumptions.basements ?? PARAMS.find((p) => p.id === 'basements')!.value;
  const builtUp = m.quantities.gfaM2 + plotArea * basements;
  const dustMeasures = [
    'windBarriers',
    'coverStockpiles',
    'sprinkling',
    'wheelWashing',
    'greenNetting',
  ] as const;
  const dustCount = dustMeasures.filter((k) => mitigations[k]).length;
  const kpi = (id: string, r: typeof b) => KPIS.find((k) => k.id === id)!.value(r);
  const allowed = naaqsAllowedExceedDays(months);
  const exB = kpi('siteExceed', b);
  const exM = kpi('siteExceed', m);
  const p98B = kpi('pm10MaxInc', b);
  const p98M = kpi('pm10MaxInc', m);
  const vs = (v: number, lim: number) => (v > lim ? 'above' : 'within');
  const sensDays = kpi('sensitiveExceed', m);
  const sensInc = kpi('pm10DaySensitive', m);
  const perB = kpi('ghgPerM2', b);
  const perM = kpi('ghgPerM2', m);
  const target = UPFRONT_CARBON_TARGETS.byUse[spec.use];
  const heatMeasures = (['shadeNets', 'rescheduleWork', 'retainTrees'] as const).filter(
    (k) => mitigations[k],
  );
  const ncr = insideNcr(spec.site.lat, spec.site.lon);
  const guns = antiSmogGunsRequired(m.plotAreaM2);
  const compliance: ComplianceRow[] = [
    {
      regulation: `NAAQS 2009 (CPCB), PM10 24 h, ${naaqs24.limitUgM3} µg/m³, met 98% of the time`,
      requirement: `Site-caused exceedance days at most 2% of the ${months}-month programme: ${fmt(allowed, 1)} days`,
      status:
        `Worst point: ${fmt(exB, 0)} days in the baseline and ${fmt(exM, 0)} with mitigation, ${exM > allowed ? 'above' : 'within'} the ${fmt(allowed, 1)} allowed` +
        (exM > allowed
          ? '; add measures (paved haul roads, stopping dusty work in high wind, anti-smog gun) or re-phase dusty work'
          : '') +
        `. Background alone is above the limit on ${fmt(bgOverDays, 0)} days of the reference year`,
      evidence: `${ref('kpi')}, ${ref('receptors')}`,
    },
    {
      regulation: `NAAQS 2009 and WHO 2021 guideline, PM10 24 h (${naaqs24.limitUgM3} and ${who24.limitUgM3} µg/m³)`,
      requirement: '98th-percentile 24 h site increment at the boundary within the limit',
      status: `Baseline ${fmt(p98B, 1)} µg/m³ (${vs(p98B, naaqs24.limitUgM3)} NAAQS); mitigated ${fmt(p98M, 1)} µg/m³ (${vs(p98M, naaqs24.limitUgM3)} NAAQS, ${vs(p98M, who24.limitUgM3)} the WHO guideline)`,
      evidence: ref('kpi'),
    },
    {
      regulation: 'NAAQS 2009 at schools, colleges and hospitals',
      requirement: 'PM10 increment at the most affected sensitive receptor',
      status:
        receptorStatus === 'unavailable' && !sensitiveN
          ? 'Not assessed: OpenStreetMap could not be reached. Add nearby schools, colleges and hospitals by hand (Site workspace, Schools and hospitals) and export again'
          : !sensitiveN
            ? 'None mapped within 500 m of the site boundary; confirm on site'
            : `${fmt(sensitiveN, 0)} within 500 m; most affected: ${fmt(sensInc, 1)} µg/m³ on the selected day and ${fmt(sensDays, 0)} site-caused exceedance days (mitigated)`,
      evidence: ref('receptors'),
    },
    {
      regulation: 'CAQM directions for C&D sites in NCR [verify]',
      requirement: `Sites of ${fmt(CAQM_CND.registrationMinAreaM2, 0)} m² or more register on the dust-control portal; anti-smog guns by site area (1 from 5,000 m², 2 from 10,000 m², 3 from 15,000 m², 4 from 20,000 m²)`,
      status: ncr
        ? `Plot ${fmt(m.plotAreaM2, 0)} m²: ${m.plotAreaM2 >= CAQM_CND.registrationMinAreaM2 ? 'portal registration required' : 'below the registration threshold'}; anti-smog guns required: ${fmt(guns, 0)}${guns > 0 && !mitigations.antiSmogGun ? ' (not in the mitigated scenario)' : ''}`
        : 'Not applicable outside NCR; check the State Pollution Control Board directions',
      evidence: ref('emp'),
    },
    {
      regulation: 'MoEFCC / CPCB dust mitigation measures for construction',
      requirement: 'Barricading, covered stockpiles, sprinkling, wheel washing, green netting',
      status: `${dustCount} of ${dustMeasures.length} listed measures in the mitigated scenario`,
      evidence: ref('emp'),
    },
    {
      regulation: 'EIA Notification 2006, item 8(a)',
      requirement: 'Prior environmental clearance for built-up area at or above 20,000 m² [verify]',
      status: `Built-up area ${fmt(builtUp, 0)} m²${basements > 0 ? ' including basement' : ''}: indicatively ${builtUp >= 20000 ? 'at or above' : 'below'} the threshold`,
      evidence: ref('logistics'),
    },
    {
      regulation: 'BRSR (SEBI), Scope 1 and 2 disclosure',
      requirement: 'Report Scope 1 and Scope 2 emissions',
      status: `Scope 1 ${t(g(m).scope1)} tCO2e and Scope 2 ${t(g(m).scope2)} tCO2e for the construction programme`,
      evidence: ref('ghg'),
    },
    {
      regulation: 'IMD heat-wave criteria; NDMA heat-wave action plan guidelines (2019)',
      requirement: `Heat action plan for outdoor workers where the maximum temperature reaches ${HEAT_WAVE.plainsTmaxC} °C`,
      status:
        `Maximum ${fmt(taMax, 1)} °C, ${fmt(hotDays, 0)} days at or above ${HEAT_WAVE.plainsTmaxC} °C; working hours at heat-stress risk ${fmt(b.heat.riskHours, 0)} (baseline) and ${fmt(m.heat.riskHours, 0)} (mitigated). ` +
        (heatMeasures.length
          ? `Heat measures in the plan: ${heatMeasures.map((k) => MIT_LABELS[k]!.toLowerCase()).join('; ')}`
          : 'No heat measures in the mitigated scenario: add shade nets and a 12:00–15:00 stop on heavy work'),
      evidence: `${ref('climate')}, ${ref('kpi')}`,
    },
    {
      regulation: 'LETI upfront embodied carbon targets (voluntary benchmark) [verify]',
      requirement: `A1–A5 intensity below ${fmt(target.y2020, 0)} kgCO2e/m² (2020 target) and ${fmt(target.y2030, 0)} kgCO2e/m² (2030 target)${spec.use === 'retail' || spec.use === 'mixed' ? '; office targets used' : ''}`,
      status:
        `${fmt(perB, 0)} kgCO2e/m² in the baseline and ${fmt(perM, 0)} with mitigation: ${perM > target.y2020 ? 'above both targets' : perM > target.y2030 ? 'within the 2020 target, above the 2030 target' : 'within both targets'}` +
        (ghgMeasures.length
          ? ''
          : '; no greenhouse-gas measures enabled (low-carbon concrete, recycled rebar, grid power)'),
      evidence: ref('ghg'),
    },
    {
      regulation: 'ECSBC 2024',
      requirement: 'Energy performance of the completed building',
      status: 'Not assessed: operational phase is outside the construction-phase scope',
      evidence: '–',
    },
  ];
  tables.push({
    id: 'compliance',
    title: 'Indicative compliance matrix',
    head: ['Regulation', 'Requirement', 'Project status (indicative)', 'Evidence'],
    rows: compliance.map((c) => [c.regulation, c.requirement, c.status, c.evidence]),
  });
  tables.push({
    id: 'assumptions',
    title: 'Assumptions register',
    head: ['Parameter', 'Value', 'Unit', 'Source', 'Status'],
    rows: PARAMS.map((p) => [
      p.label,
      String(opts.assumptions[p.id as keyof Assumptions] ?? p.value),
      p.unit,
      p.source,
      p.status === 'verify' ? 'unverified' : 'cited',
    ]),
  });

  return {
    meta: {
      title: opts.title,
      company: opts.company,
      preparedBy: opts.preparedBy,
      date: today,
      version: '1.0',
      scenario: 'both',
    },
    project: {
      name: opts.projectName,
      site: spec.site.label,
      coordinates: `${spec.site.lat.toFixed(4)}° N, ${spec.site.lon.toFixed(4)}° E`,
      use: spec.use,
      structure: 'RCC frame',
      floors: String(spec.floors),
      gfa: `${fmt(m.quantities.gfaM2, 0)} m²`,
      footprint: `${fmt(plotArea, 0)} m²`,
      height:
        `${fmt(spec.floors * spec.floorToFloorM, 1)} m` +
        (source.modelHeightM ? ` (imported model ${fmt(source.modelHeightM, 1)} m above ground)` : ''),
      programme: `${programmeTotal(m.programme.effective)} months (excavation ${m.programme.effective.excavation}, structure ${m.programme.effective.structure}, finishing ${m.programme.effective.finishing})`,
      programmeSource: m.programme.source === 'auto' ? 'derived from the building' : 'set by the user',
    },
    headline,
    mitigations: enabled.map((k) => MIT_LABELS[k]!),
    mitigationIds: enabled,
    climate,
    background: { corrected: Boolean(corr), note: bgNote.long },
    compliance,
    provenance: prov.map((p) => ({
      source: p.source,
      status: p.status,
      fetchedAt: p.fetchedAt ?? '–',
      attribution: p.attribution,
    })),
    // Tables are numbered by array position, so the array follows the order they appear in the report.
    tables: [...tables].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)),
    assumptionsUnverified: PARAMS.filter((p) => p.status === 'verify').length,
    limitations: [
      'This is a screening-level (Tier 1–2) assessment. It is not a substitute for an Environmental Impact Assessment by a NABET-accredited consultant or an AERMOD-based dispersion study.',
      'Dispersion uses a steady-state Gaussian plume over flat terrain without building downwash. Boundary receptors are 10 m outside the plot, closer than the 100 m from which the Briggs dispersion curves were fitted, so near-field concentrations are indicative.',
      corr
        ? `Background PM10 and PM2.5 are CAMS global values (about 45 km resolution) corrected with a statistical model trained on ground monitoring stations (${ref('backgroundModel')}). It was trained on about 20 months of data, applies only near the training stations, and undercounts PM2.5 exceedance days at held-out stations; raw CAMS is given alongside in ${ref('climate')}.`
        : `Background PM10 is from the CAMS global model at about 45 km resolution and has not been validated against local stations; the site is not covered by the station correction (${ref('backgroundModel')}). CAMS gives very high hourly values during desert-dust events, which raise the mean well above the median (${ref('climate')}); check against local monitoring data before submission.`,
      'Wind erosion follows AP-42 Section 13.2.5 with the threshold friction velocity of overburden from its field measurements; a sieve test of the site soil should replace it. The fastest mile of wind is estimated from hourly reanalysis wind with a gust factor, and each event is released in a single hour, whereas AP-42 notes that its events are intermittent rather than steady emissions.',
      'Heat results use a steady-state surface energy balance and a simplified mean radiant temperature; they indicate relative change rather than measured values. The evaporative fraction of bare soil is fixed and does not yet follow soil moisture, so surface temperatures on wet days are overestimated. UTCI uses the 10 m reanalysis wind without a reduction for sheltering on site, which can understate heat stress at sheltered work spots.',
      'Default parameters marked unverified in Annex A should be confirmed against project data before submission.',
    ],
  };
}
