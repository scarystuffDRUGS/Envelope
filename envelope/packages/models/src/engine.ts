/**
 * Scenario engine: runs programme → logistics → dust → heat → GHG for one scenario.
 * Pure and deterministic; runs in a Web Worker. Expensive met-only quantities (unit
 * dispersion fields, sky view factor) are cached between runs, so mitigation toggles
 * only rescale emissions.
 */
import type { BuildingSpec, BuildingTakeoff } from './building';
import { buildingStateForMonth, takeoff } from './building';
import type { ProgrammeMonths } from './construction/programme';
import { autoProgramme, checkProgramme, programmeTotal, toSchedule } from './construction/programme';
import { quantities } from './construction/quantities';
import type { Quantities } from './construction/quantities';
import { calendarMonthFor, phaseForMonth } from './construction/schedule';
import type { ConstructionPhaseId } from './construction/schedule';
import type { VehicleFlow } from './construction/vehicles';
import { vehicleFlows, vktPerDayInPhase } from './construction/vehicles';
import type { DustControls, EmissionBreakdown, HourMet, SiteDustContext, SubSource } from './dust';
import {
  CONTROL_EFFICIENCY,
  DEFAULT_MIXING_HEIGHT_M,
  erosionEventPm10G,
  briggsGroup,
  plotSubSources,
  siteEmissions,
  stabilityClass,
  unitConcentration,
  windAtHeight,
} from './dust';
import type { EN } from './geometry';
import { bufferConvex, facadeEdges, fromLocalEN, toLocalEN } from './geometry';
import type { SurfaceClass } from './heat';
import { SURFACES, longwaveDown, meanRadiantTemp, surfaceTemperature, utci } from './heat';
import type { GhgControls, GhgResult } from './ghg';
import { ghgResult } from './ghg';
import type { Assumptions } from './params';
import type { ReceptorCandidate } from './receptors';
import { selectReceptors } from './receptors';
import { solarPosition } from './solar';

export interface Mitigations extends Omit<DustControls, 'highWindStopMs'>, GhgControls {
  highWindStop: boolean;
  highWindStopMs: number;
  shadeNets: boolean;
  retainTrees: boolean;
  rescheduleWork: boolean;
}

export const NO_MITIGATIONS: Mitigations = {
  sprinkling: false,
  pavedRoads: false,
  windBarriers: false,
  coverStockpiles: false,
  greenNetting: false,
  antiSmogGun: false,
  wheelWashing: false,
  highWindStop: false,
  highWindStopMs: 10,
  shadeNets: false,
  retainTrees: false,
  rescheduleWork: false,
  lowCarbonConcrete: false,
  lowCarbonConcretePct: 30,
  recycledRebar: false,
  gridPower: false,
  solarHybridDg: false,
  localSourcing: false,
  wasteReduction: false,
};

export interface EngineData {
  spec: BuildingSpec;
  weatherYear: number;
  weather: Record<string, number[]> | null;
  air: Record<string, number[]> | null;
  osm: {
    buildings: { ring: [number, number][]; heightM: number }[];
    roads?: { line: [number, number][]; widthM: number }[];
    areas: { kind: 'green' | 'water' | 'residential'; ring: [number, number][] }[];
    receptors: {
      id: number;
      name: string;
      kind: string;
      lon: number;
      lat: number;
      ring?: [number, number][];
    }[];
  } | null;
  /** Schools, colleges or hospitals the user added by hand (D-029). */
  userReceptors?: { id: string; name: string; kind: string; lat: number; lon: number }[];
}

export interface EngineInput {
  assumptions: Assumptions;
  programmeOverride: ProgrammeMonths | null;
  constructionMonth: number;
  dayOfMonth: number;
  hour: number;
  mitigations: Mitigations;
}

export interface Receptor {
  id: string;
  name: string;
  kind: string;
  e: number;
  n: number;
  /** From the plot boundary (m); boundary receptors are 10 m outside it. */
  distanceM: number;
  source: 'boundary' | 'osm' | 'user';
}

export interface ReceptorResult extends Receptor {
  /** Selected day, 24 h means (µg/m³). */
  day: { pm10Inc: number; pm10Total: number; pm25Inc: number; pm25Total: number };
  /** Over the programme. */
  period: {
    maxPm10Total24h: number;
    p98Pm10Total24h: number;
    exceedDaysNaaqs: number;
    /** Days the site pushed the 24 h total over the NAAQS while background alone was under it. */
    exceedDaysSiteCaused: number;
    maxPm10Inc24h: number;
    /** 98th percentile of 24 h increments (the NAAQS statistic). */
    p98Pm10Inc24h: number;
  };
}

export interface GridSpec {
  cellM: number;
  n: number;
  /** South-west corner of the domain, local metres. */
  e0: number;
  n0: number;
  /** Domain corners in degrees for draping: west, south, east, north. */
  rect: [number, number, number, number];
}

export interface ScenarioResult {
  ok: boolean;
  message: string | null;
  programme: {
    auto: ProgrammeMonths;
    effective: ProgrammeMonths;
    source: 'auto' | 'user';
    errors: string[];
    warnings: string[];
  };
  quantities: Quantities;
  flows: VehicleFlow[];
  haulRouteM: number;
  /** Plot area (footprint plus the plot buffer), m²; sets the CAQM anti-smog gun count. */
  plotAreaM2: number;
  selected: {
    month: number;
    phase: ConstructionPhaseId;
    dateLabel: string;
    dayIndex: number;
    utcIndex: number;
    /** Local hour (IST) of the hourly indicators. */
    hour: number;
  };
  met: HourMet & { taC: number; rh: number; stability: string; calm: boolean };
  grid: GridSpec;
  dust: {
    hourPm10: Float32Array;
    dayPm10: Float32Array;
    emissionsNow: EmissionBreakdown;
    background: { hourPm10: number; dayPm10: number; dayPm25: number; periodMeanPm10: number };
    receptors: ReceptorResult[];
    /** Schools, colleges or hospitals whose mapped grounds contain the plot (D-029). */
    siteWithin: string[];
    totalPm10T: number;
    totalPm25T: number;
    bySourceT: Record<keyof Omit<EmissionBreakdown, 'total'>, number>;
    calmHours: number;
    /** Days in the programme with a wind-erosion event above threshold (AP-42 13.2.5). */
    erosionEvents: number;
    dsi: {
      value: number;
      parts: { background: number; dustEvents: number; erosion: number; dryDays: number };
    };
    worstDay: { month: number; dayOfMonth: number; pm10Inc: number } | null;
    monthlyPm10T: number[];
  };
  heat: {
    ts: Float32Array;
    utci: Float32Array;
    plotTsC: number;
    plotTsPreC: number;
    maxWorkerUtci: number;
    meanWorkerUtci: number;
    riskHours: number;
    workingHours: number;
    sunAltDeg: number;
    hottestDay: { month: number; dayOfMonth: number; taMax: number } | null;
  };
  ghg: GhgResult;
  timingsMs: Record<string, number>;
}

const HOURS_LOCAL_TO_UTC = -5; // IST = UTC+05:30; nearest hourly index (D-015)
const WORK_START = 8;
const WORK_END = 20;

function pointInRing(e: number, n: number, ring: readonly EN[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.n > n !== b.n > n && e < ((b.e - a.e) * (n - a.n)) / (b.n - a.n) + a.e) inside = !inside;
  }
  return inside;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx]!;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class Engine {
  readonly t: BuildingTakeoff;
  readonly origin: { lon: number; lat: number };
  readonly plotEN: EN[];
  readonly grid: GridSpec;
  private readonly receptors: Receptor[];
  /** Schools, colleges or hospitals whose grounds contain the plot. */
  private siteWithin: string[] = [];
  private readonly hours: number;
  private subSourcesKey = '';
  private subSources: SubSource[] = [];
  private unitTable: Float32Array | null = null; // hours × receptors
  private dayFieldKey = '';
  private dayField: Float32Array | null = null; // 24 × cells
  private svfCache = new Map<string, Float32Array>();
  private baseClass: Uint8Array;
  private baseHeight: Float32Array;
  private plotMask: Uint8Array;
  private footMask: Uint8Array;
  private edgeMask: Uint8Array;

  constructor(
    readonly data: EngineData,
    sizeM = 1200,
    cellM = 10,
  ) {
    this.t = takeoff(data.spec);
    this.origin = this.t.origin;
    this.plotEN = bufferConvex(this.t.footprintEN, data.spec.site.plotBufferM);
    const n = Math.round(sizeM / cellM);
    const e0 = -sizeM / 2;
    const sw = fromLocalEN({ e: e0, n: e0 }, this.origin);
    const ne = fromLocalEN({ e: -e0, n: -e0 }, this.origin);
    this.grid = { cellM, n, e0, n0: e0, rect: [sw.lon, sw.lat, ne.lon, ne.lat] };
    this.hours = data.weather?.temperature_2m?.length ?? 0;
    this.receptors = this.buildReceptors();
    const cells = n * n;
    this.baseClass = new Uint8Array(cells).fill(CLASS.urban);
    this.baseHeight = new Float32Array(cells);
    this.plotMask = new Uint8Array(cells);
    this.footMask = new Uint8Array(cells);
    this.edgeMask = new Uint8Array(cells);
    this.rasterise();
  }

  private cellCentre(i: number, j: number): EN {
    return { e: this.grid.e0 + (i + 0.5) * this.grid.cellM, n: this.grid.n0 + (j + 0.5) * this.grid.cellM };
  }

  private buildReceptors(): Receptor[] {
    const out: Receptor[] = [];
    const ring = bufferConvex(this.plotEN, 10);
    const names = ['South-west', 'South-east', 'North-east', 'North-west'];
    ring.forEach((p, k) => {
      out.push({
        id: `b${k}`,
        name: `Site boundary ${names[k] ?? k + 1} corner`,
        kind: 'boundary',
        e: p.e,
        n: p.n,
        distanceM: 10,
        source: 'boundary',
      });
      const q = ring[(k + 1) % ring.length]!;
      out.push({
        id: `m${k}`,
        name: `Site boundary edge ${k + 1} midpoint`,
        kind: 'boundary',
        e: (p.e + q.e) / 2,
        n: (p.n + q.n) / 2,
        distanceM: 10,
        source: 'boundary',
      });
    });
    const candidates: ReceptorCandidate[] = [
      ...(this.data.osm?.receptors ?? []).map((r) => ({ ...r, id: `osm${r.id}`, source: 'osm' as const })),
      ...(this.data.userReceptors ?? []).map((r) => ({ ...r, id: `user${r.id}`, source: 'user' as const })),
    ];
    const sel = selectReceptors(candidates, this.plotEN, this.origin);
    this.siteWithin = sel.siteWithin;
    return [...out, ...sel.receptors];
  }

  private rasterise(): void {
    const { n } = this.grid;
    const polys = (this.data.osm?.buildings ?? []).map((b) => ({
      ring: b.ring.map(([lon, lat]) => toLocalEN({ lon, lat }, this.origin)),
      h: b.heightM,
      cls: CLASS.roof,
    }));
    const areas = (this.data.osm?.areas ?? [])
      .filter((a) => a.kind !== 'residential')
      .map((a) => ({
        ring: a.ring.map(([lon, lat]) => toLocalEN({ lon, lat }, this.origin)),
        h: 0,
        cls: a.kind === 'water' ? CLASS.water : CLASS.grass,
      }));
    const plotEdgeInner = bufferConvex(this.plotEN, -10);
    // Roads (asphalt): cells within half the carriageway width of a segment (HANDOVER A.1).
    for (const road of this.data.osm?.roads ?? []) {
      const pts = road.line.map(([lon, lat]) => toLocalEN({ lon, lat }, this.origin));
      const half = Math.max(road.widthM / 2, this.grid.cellM / 2);
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s]!;
        const b = pts[s + 1]!;
        const i0 = Math.max(0, Math.floor((Math.min(a.e, b.e) - half - this.grid.e0) / this.grid.cellM));
        const i1 = Math.min(n - 1, Math.floor((Math.max(a.e, b.e) + half - this.grid.e0) / this.grid.cellM));
        const j0 = Math.max(0, Math.floor((Math.min(a.n, b.n) - half - this.grid.n0) / this.grid.cellM));
        const j1 = Math.min(n - 1, Math.floor((Math.max(a.n, b.n) + half - this.grid.n0) / this.grid.cellM));
        const dx = b.e - a.e;
        const dy = b.n - a.n;
        const len2 = dx * dx + dy * dy || 1;
        for (let i = i0; i <= i1; i++)
          for (let j = j0; j <= j1; j++) {
            const c = this.cellCentre(i, j);
            const t = Math.max(0, Math.min(1, ((c.e - a.e) * dx + (c.n - a.n) * dy) / len2));
            if (Math.hypot(c.e - (a.e + t * dx), c.n - (a.n + t * dy)) <= half)
              this.baseClass[j * n + i] = CLASS.road;
          }
      }
    }
    for (const poly of [...areas, ...polys]) {
      const es = poly.ring.map((p) => p.e);
      const ns = poly.ring.map((p) => p.n);
      const i0 = Math.max(0, Math.floor((Math.min(...es) - this.grid.e0) / this.grid.cellM));
      const i1 = Math.min(n - 1, Math.floor((Math.max(...es) - this.grid.e0) / this.grid.cellM));
      const j0 = Math.max(0, Math.floor((Math.min(...ns) - this.grid.n0) / this.grid.cellM));
      const j1 = Math.min(n - 1, Math.floor((Math.max(...ns) - this.grid.n0) / this.grid.cellM));
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const c = this.cellCentre(i, j);
          if (pointInRing(c.e, c.n, poly.ring)) {
            this.baseClass[j * n + i] = poly.cls;
            this.baseHeight[j * n + i] = poly.h;
          }
        }
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const c = this.cellCentre(i, j);
        const k = j * n + i;
        if (pointInRing(c.e, c.n, this.plotEN)) {
          this.plotMask[k] = 1;
          this.baseHeight[k] = 0;
          if (!pointInRing(c.e, c.n, plotEdgeInner)) this.edgeMask[k] = 1;
        }
        if (pointInRing(c.e, c.n, this.t.footprintEN)) this.footMask[k] = 1;
      }
  }

  private met(
    i: number,
  ): HourMet & { taC: number; rh: number; dewC: number; dni: number; direct: number; diffuse: number } {
    const w = this.data.weather!;
    const v = (k: string, d = 0) => w[k]?.[i] ?? d;
    return {
      U10: v('wind_speed_10m'),
      windFromDeg: v('wind_direction_10m'),
      tempC: v('temperature_2m'),
      taC: v('temperature_2m'),
      rh: v('relative_humidity_2m', 50),
      dewC: v('dew_point_2m'),
      pressureHpa: v('surface_pressure', 980),
      precipMm: v('precipitation'),
      soilMoisture: v('soil_moisture_0_to_7cm', 0.15),
      shortwave: v('shortwave_radiation'),
      cloudPct: v('cloud_cover'),
      blhM: v('boundary_layer_height', 0),
      dni: v('direct_normal_irradiance'),
      direct: v('direct_radiation'),
      diffuse: v('diffuse_radiation'),
    };
  }

  private ensureSubSources(H: number): void {
    const key = `${H}`;
    if (key === this.subSourcesKey) return;
    this.subSources = plotSubSources(this.plotEN, H);
    this.subSourcesKey = key;
    this.unitTable = null;
    this.dayFieldKey = '';
  }

  private disp(i: number) {
    const m = this.met(i);
    const g = briggsGroup(stabilityClass(m.U10, m.shortwave, m.cloudPct));
    const H = this.subSources[0]?.H ?? 1.5;
    const u = windAtHeight(m.U10, H, g);
    const hmix = m.blhM > 50 ? m.blhM : DEFAULT_MIXING_HEIGHT_M[g];
    return { m, g, u, hmix };
  }

  private ensureUnitTable(): Float32Array {
    if (this.unitTable) return this.unitTable;
    const R = this.receptors.length;
    const tab = new Float32Array(this.hours * R);
    for (let i = 0; i < this.hours; i++) {
      const { m, g, u, hmix } = this.disp(i);
      for (let r = 0; r < R; r++) {
        const rc = this.receptors[r]!;
        tab[i * R + r] = unitConcentration(this.subSources, rc.e, rc.n, 1.5, m.windFromDeg, u, g, hmix);
      }
    }
    this.unitTable = tab;
    return tab;
  }

  private ensureDayField(dayIndex: number): Float32Array {
    const key = `${dayIndex}:${this.subSourcesKey}`;
    if (key === this.dayFieldKey && this.dayField) return this.dayField;
    const { n } = this.grid;
    const cells = n * n;
    const out = new Float32Array(24 * cells);
    for (let h = 0; h < 24; h++) {
      const i = this.utcIndex(dayIndex, h);
      const { m, g, u, hmix } = this.disp(i);
      for (let jj = 0; jj < n; jj++)
        for (let ii = 0; ii < n; ii++) {
          const c = this.cellCentre(ii, jj);
          out[h * cells + jj * n + ii] = unitConcentration(
            this.subSources,
            c.e,
            c.n,
            1.5,
            m.windFromDeg,
            u,
            g,
            hmix,
          );
        }
    }
    this.dayField = out;
    this.dayFieldKey = key;
    return out;
  }

  /**
   * Local hour of the day's wind-erosion event: the windiest dry hour (precipitation ≤ 0.25 mm),
   * standing in for the time of the day's fastest mile (AP-42 13.2.5); −1 if every hour is wet.
   */
  erosionPeakHour(dayIndex: number): number {
    let best = -1;
    let bestU = -1;
    for (let h = 0; h < 24; h++) {
      const m = this.met(this.utcIndex(dayIndex, h));
      if (m.precipMm <= 0.25 && m.U10 > bestU) {
        bestU = m.U10;
        best = h;
      }
    }
    return best;
  }

  utcIndex(dayIndex: number, localHour: number): number {
    return Math.min(this.hours - 1, Math.max(0, dayIndex * 24 + localHour + HOURS_LOCAL_TO_UTC));
  }

  dayIndexOf(calMonth: number, dayOfMonth: number): number {
    const y = this.data.weatherYear;
    const dim = new Date(Date.UTC(y, calMonth, 0)).getUTCDate();
    const d = Math.min(dim, Math.max(1, dayOfMonth));
    return Math.round((Date.UTC(y, calMonth - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000);
  }

  private svf(heights: Float32Array, key: string): Float32Array {
    const hit = this.svfCache.get(key);
    if (hit) return hit;
    const { n, cellM } = this.grid;
    const out = new Float32Array(n * n);
    const rays = 36;
    const steps = Math.round(200 / cellM);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const h0 = heights[j * n + i]!;
        let sum = 0;
        for (let r = 0; r < rays; r++) {
          const az = (2 * Math.PI * r) / rays;
          const se = Math.sin(az);
          const sn = Math.cos(az);
          let maxTan = 0;
          for (let s = 1; s <= steps; s++) {
            const ii = Math.round(i + se * s);
            const jj = Math.round(j + sn * s);
            if (ii < 0 || jj < 0 || ii >= n || jj >= n) break;
            const dh = heights[jj * n + ii]! - h0;
            if (dh > 0) maxTan = Math.max(maxTan, dh / (s * cellM));
          }
          const beta = Math.atan(maxTan);
          sum += Math.sin(beta) ** 2;
        }
        out[j * n + i] = 1 - sum / rays;
      }
    if (this.svfCache.size > 8) this.svfCache.clear();
    this.svfCache.set(key, out);
    return out;
  }

  private shadow(heights: Float32Array, altDeg: number, azDeg: number): Uint8Array {
    const { n, cellM } = this.grid;
    const out = new Uint8Array(n * n);
    if (altDeg <= 0) return out.fill(1);
    const tanAlt = Math.tan((altDeg * Math.PI) / 180);
    const se = Math.sin((azDeg * Math.PI) / 180);
    const sn = Math.cos((azDeg * Math.PI) / 180);
    let maxH = 0;
    for (const h of heights) maxH = Math.max(maxH, h);
    const steps = Math.min(Math.ceil(maxH / tanAlt / cellM) + 1, 60);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const h0 = heights[j * n + i]!;
        for (let s = 1; s <= steps; s++) {
          const ii = Math.round(i + se * s);
          const jj = Math.round(j + sn * s);
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) break;
          if (heights[jj * n + ii]! > h0 + s * cellM * tanAlt) {
            out[j * n + i] = 1;
            break;
          }
        }
      }
    return out;
  }

  run(input: EngineInput): ScenarioResult {
    const T0 = performance.now();
    const timings: Record<string, number> = {};
    const a = input.assumptions;
    const mit = input.mitigations;
    const spec = this.data.spec;

    // Programme and logistics (A.5).
    const q = quantities(this.t, spec.floors, a, spec.quantities?.concreteM3);
    const auto = autoProgramme(q, spec.floors, a);
    const check = input.programmeOverride
      ? checkProgramme(input.programmeOverride, auto)
      : { errors: [], warnings: [] };
    const effective = input.programmeOverride && check.errors.length === 0 ? input.programmeOverride : auto;
    const schedule = toSchedule(effective);
    const total = programmeTotal(effective);
    const haulRouteM = this.haulRoute();
    const flows = vehicleFlows(q, effective, a, haulRouteM);
    const ghg = ghgResult(this.t, q, flows, effective, a, mit);

    const month = Math.min(Math.max(1, input.constructionMonth), total);
    const phase = phaseForMonth(month, schedule).phase.id;
    const calMonth = calendarMonthFor(month);
    const dayIndex = this.dayIndexOf(calMonth, input.dayOfMonth);
    const utcIndex = this.utcIndex(dayIndex, input.hour);
    const dateLabel = `${Math.min(input.dayOfMonth, 31)} ${MONTHS[calMonth - 1]} ${this.data.weatherYear}`;

    const programme = {
      auto,
      effective,
      source: (effective === auto ? 'auto' : 'user') as 'auto' | 'user',
      ...check,
    };
    const empty = new Float32Array(this.grid.n * this.grid.n);
    if (!this.data.weather || this.hours < 24) {
      return {
        ok: false,
        message:
          'Weather data is unavailable, so the dust and heat models cannot run. GHG results are shown.',
        programme,
        quantities: q,
        flows,
        haulRouteM,
        plotAreaM2: this.plotAreaM2(),
        selected: { month, phase, dateLabel, dayIndex, utcIndex, hour: input.hour },
        met: {
          U10: 0,
          windFromDeg: 0,
          tempC: 0,
          taC: 0,
          rh: 0,
          pressureHpa: 0,
          precipMm: 0,
          soilMoisture: 0,
          shortwave: 0,
          cloudPct: 0,
          blhM: 0,
          stability: '–',
          calm: false,
        },
        grid: this.grid,
        dust: {
          hourPm10: empty,
          dayPm10: empty,
          emissionsNow: { activity: 0, erosion: 0, handling: 0, haul: 0, trackout: 0, total: 0 },
          background: { hourPm10: 0, dayPm10: 0, dayPm25: 0, periodMeanPm10: 0 },
          receptors: [],
          siteWithin: [],
          totalPm10T: 0,
          totalPm25T: 0,
          bySourceT: { activity: 0, erosion: 0, handling: 0, haul: 0, trackout: 0 },
          calmHours: 0,
          erosionEvents: 0,
          dsi: { value: 0, parts: { background: 0, dustEvents: 0, erosion: 0, dryDays: 0 } },
          worstDay: null,
          monthlyPm10T: [],
        },
        heat: {
          ts: empty,
          utci: empty,
          plotTsC: 0,
          plotTsPreC: 0,
          maxWorkerUtci: 0,
          meanWorkerUtci: 0,
          riskHours: 0,
          workingHours: 0,
          sunAltDeg: 0,
          hottestDay: null,
        },
        ghg,
        timingsMs: {},
      };
    }

    // ---------- Dust ----------
    let t1 = performance.now();
    this.ensureSubSources(a.plumeTopM);
    const unit = this.ensureUnitTable();
    timings.unitTable = performance.now() - t1;
    t1 = performance.now();
    const ctl: DustControls = { ...mit, highWindStopMs: mit.highWindStop ? mit.highWindStopMs : null };
    const smog = mit.antiSmogGun ? 1 - CONTROL_EFFICIENCY.antiSmogGun : 1;
    const plotArea = this.plotAreaM2();
    const ctxFor = (p: ConstructionPhaseId, working: boolean, erosionEvent: boolean): SiteDustContext => {
      const hoursInPhase = effective[p] * a.workingDaysPerMonth * a.workingHoursPerDay;
      const handledMg =
        p === 'excavation'
          ? q.spoilKg / 1000
          : p === 'structure'
            ? (q.concreteKg * a.aggregateShare) / 1000
            : q.masonryKg / 1000;
      return {
        phase: p,
        working,
        plotAreaM2: plotArea,
        footprintAreaM2: this.t.footprintAreaM2,
        handledMgPerHour: handledMg / hoursInPhase,
        vktPerHour: vktPerDayInPhase(flows, p) / a.workingHoursPerDay,
        workingHoursPerMonth: a.workingDaysPerMonth * a.workingHoursPerDay,
        erosionEvent,
      };
    };
    const isWorking = (dayIdx: number, localHour: number) => {
      const dow = new Date(Date.UTC(this.data.weatherYear, 0, 1 + dayIdx)).getUTCDay();
      return dow !== 0 && localHour >= WORK_START && localHour < WORK_END;
    };
    const air = this.data.air;
    const bg10 = (i: number) => air?.pm10?.[i] ?? 0;
    const bg25 = (i: number) => air?.pm2_5?.[i] ?? 0;

    const R = this.receptors.length;
    const daily10: number[][] = this.receptors.map(() => []);
    const dailyInc: number[][] = this.receptors.map(() => []);
    const dailyBg: number[] = [];
    const bySource = { activity: 0, erosion: 0, handling: 0, haul: 0, trackout: 0 };
    const monthlyPm10T: number[] = [];
    let total10 = 0;
    let total25 = 0;
    let calmHours = 0;
    let erosionEvents = 0;
    let worstDay: { month: number; dayOfMonth: number; pm10Inc: number } | null = null;
    let hottestDay: { month: number; dayOfMonth: number; taMax: number } | null = null;
    const pv = { dustParams: a };
    for (let m = 1; m <= total; m++) {
      const ph = phaseForMonth(m, schedule).phase.id;
      const cm = calendarMonthFor(m);
      const dim = new Date(Date.UTC(this.data.weatherYear, cm, 0)).getUTCDate();
      let monthKg = 0;
      for (let d = 1; d <= dim; d++) {
        const di = this.dayIndexOf(cm, d);
        const peak = this.erosionPeakHour(di);
        const inc = new Float64Array(R);
        let bgSum = 0;
        let taMax = -99;
        for (let h = 0; h < 24; h++) {
          const i = this.utcIndex(di, h);
          const met = this.met(i);
          if (met.U10 < 0.5) calmHours++;
          taMax = Math.max(taMax, met.taC);
          const e = siteEmissions(met, ctxFor(ph, isWorking(di, h), h === peak), pv.dustParams, ctl);
          total10 += e.pm10.total * 3600;
          total25 += e.pm25.total * 3600;
          if (e.pm10.erosion > 0) erosionEvents++;
          monthKg += (e.pm10.total * 3600) / 1000;
          bySource.activity += e.pm10.activity * 3600;
          bySource.erosion += e.pm10.erosion * 3600;
          bySource.handling += e.pm10.handling * 3600;
          bySource.haul += e.pm10.haul * 3600;
          bySource.trackout += e.pm10.trackout * 3600;
          bgSum += bg10(i);
          for (let r = 0; r < R; r++) inc[r] = inc[r]! + unit[i * R + r]! * e.pm10.total * smog;
        }
        dailyBg.push(bgSum / 24);
        let dayMax = 0;
        for (let r = 0; r < R; r++) {
          const incMean = inc[r]! / 24;
          dailyInc[r]!.push(incMean);
          daily10[r]!.push(incMean + bgSum / 24);
          dayMax = Math.max(dayMax, incMean);
        }
        if (!worstDay || dayMax > worstDay.pm10Inc) worstDay = { month: m, dayOfMonth: d, pm10Inc: dayMax };
        if (!hottestDay || taMax > hottestDay.taMax) hottestDay = { month: m, dayOfMonth: d, taMax };
      }
      monthlyPm10T.push(monthKg / 1000);
    }
    timings.period = performance.now() - t1;

    // Selected day and hour.
    t1 = performance.now();
    const dayField = this.ensureDayField(dayIndex);
    timings.dayField = performance.now() - t1;
    const cells = this.grid.n * this.grid.n;
    const hourPm10 = new Float32Array(cells);
    const dayPm10 = new Float32Array(cells);
    const selInc10 = new Float64Array(R);
    const selInc25 = new Float64Array(R);
    let bgDay10 = 0;
    let bgDay25 = 0;
    let emissionsNow: EmissionBreakdown = {
      activity: 0,
      erosion: 0,
      handling: 0,
      haul: 0,
      trackout: 0,
      total: 0,
    };
    const selPeak = this.erosionPeakHour(dayIndex);
    for (let h = 0; h < 24; h++) {
      const i = this.utcIndex(dayIndex, h);
      const e = siteEmissions(this.met(i), ctxFor(phase, isWorking(dayIndex, h), h === selPeak), a, ctl);
      if (h === input.hour) emissionsNow = e.pm10;
      const q10 = e.pm10.total * smog;
      for (let k = 0; k < cells; k++) {
        const v = dayField[h * cells + k]! * q10;
        dayPm10[k] = dayPm10[k]! + v / 24;
        if (h === input.hour) hourPm10[k] = v;
      }
      for (let r = 0; r < R; r++) {
        selInc10[r] = selInc10[r]! + (unit[i * R + r]! * q10) / 24;
        selInc25[r] = selInc25[r]! + (unit[i * R + r]! * e.pm25.total * smog) / 24;
      }
      bgDay10 += bg10(i) / 24;
      bgDay25 += bg25(i) / 24;
    }
    const receptors: ReceptorResult[] = this.receptors.map((rc, r) => ({
      ...rc,
      day: {
        pm10Inc: selInc10[r]!,
        pm10Total: selInc10[r]! + bgDay10,
        pm25Inc: selInc25[r]!,
        pm25Total: selInc25[r]! + bgDay25,
      },
      period: {
        maxPm10Total24h: Math.max(...daily10[r]!),
        p98Pm10Total24h: percentile(daily10[r]!, 0.98),
        exceedDaysNaaqs: daily10[r]!.filter((v) => v > 100).length, // src: NAAQS 2009 PM10 24 h limit
        exceedDaysSiteCaused: daily10[r]!.filter((v, d) => v > 100 && dailyBg[d]! <= 100).length,
        maxPm10Inc24h: Math.max(...dailyInc[r]!),
        p98Pm10Inc24h: percentile(dailyInc[r]!, 0.98),
      },
    }));

    // Dust susceptibility index (heuristic, A.2.3).
    const yearPm10 = air?.pm10 ?? [];
    const periodMeanPm10 = yearPm10.length ? yearPm10.reduce((s, v) => s + v, 0) / yearPm10.length : 0;
    const dustEventHours = (air?.dust ?? []).filter((v) => v > a.dustEventThreshold).length;
    let erodibleDays = 0;
    let dryDays = 0;
    const days = Math.floor(this.hours / 24);
    for (let d = 0; d < days; d++) {
      let p = 0;
      for (let h = 0; h < 24; h++) p += this.met(d * 24 + h).precipMm;
      if (p < 1) dryDays++;
      // Days whose windiest dry hour erodes flat soil or a stockpile (AP-42 13.2.5, per unit area).
      const peak = this.erosionPeakHour(d);
      if (
        peak >= 0 &&
        erosionEventPm10G(this.met(this.utcIndex(d, peak)).U10 * a.fastestMileFactor, a.ustarT0, 1, 1, 1, 1) >
          0
      )
        erodibleDays++;
    }
    const parts = {
      background: 35 * Math.min(1, periodMeanPm10 / 60),
      dustEvents: 25 * Math.min(1, dustEventHours / 500),
      erosion: 20 * (erodibleDays / days),
      dryDays: 20 * (dryDays / Math.floor(this.hours / 24)),
    };

    // ---------- Heat ----------
    t1 = performance.now();
    const heat = this.heat(input, a, mit, schedule, effective, dayIndex, utcIndex, month);
    timings.heat = performance.now() - t1;
    timings.total = performance.now() - T0;

    const m0 = this.met(utcIndex);
    return {
      ok: true,
      message: null,
      programme,
      quantities: q,
      flows,
      haulRouteM,
      plotAreaM2: this.plotAreaM2(),
      selected: { month, phase, dateLabel, dayIndex, utcIndex, hour: input.hour },
      met: { ...m0, stability: stabilityClass(m0.U10, m0.shortwave, m0.cloudPct), calm: m0.U10 < 0.5 },
      grid: this.grid,
      dust: {
        hourPm10,
        dayPm10,
        emissionsNow,
        background: { hourPm10: bg10(utcIndex), dayPm10: bgDay10, dayPm25: bgDay25, periodMeanPm10 },
        receptors,
        siteWithin: this.siteWithin,
        totalPm10T: total10 / 1e6,
        totalPm25T: total25 / 1e6,
        bySourceT: {
          activity: bySource.activity / 1e6,
          erosion: bySource.erosion / 1e6,
          handling: bySource.handling / 1e6,
          haul: bySource.haul / 1e6,
          trackout: bySource.trackout / 1e6,
        },
        calmHours,
        erosionEvents,
        dsi: { value: parts.background + parts.dustEvents + parts.erosion + parts.dryDays, parts },
        worstDay,
        monthlyPm10T,
      },
      heat: { ...heat, hottestDay },
      ghg,
      timingsMs: timings,
    };
  }

  private plotAreaM2(): number {
    let a = 0;
    const r = this.plotEN;
    for (let i = 0; i < r.length; i++) {
      const p = r[i]!;
      const q = r[(i + 1) % r.length]!;
      a += p.e * q.n - q.e * p.n;
    }
    return Math.abs(a / 2);
  }

  /** Haul route: site gate (midpoint of the plot edge facing south) to the footprint centroid. */
  private haulRoute(): number {
    const edges = facadeEdges(this.plotEN);
    const gateEdge = edges.reduce((best, e) =>
      Math.abs(e.normalAzimuthDeg - 180) < Math.abs(best.normalAzimuthDeg - 180) ? e : best,
    );
    const gate = { e: (gateEdge.start.e + gateEdge.end.e) / 2, n: (gateEdge.start.n + gateEdge.end.n) / 2 };
    const c = this.t.footprintCentroidEN;
    return Math.hypot(gate.e - c.e, gate.n - c.n);
  }

  private heat(
    input: EngineInput,
    a: Assumptions,
    mit: Mitigations,
    schedule: ReturnType<typeof toSchedule>,
    effective: ProgrammeMonths,
    dayIndex: number,
    utcIndex: number,
    month: number,
  ) {
    const { n } = this.grid;
    const cells = n * n;
    const spec = this.data.spec;
    const state = buildingStateForMonth(month, spec.floors, schedule);
    const bh = state.floorsBuilt * spec.floorToFloorM;
    const heights = new Float32Array(this.baseHeight);
    for (let k = 0; k < cells; k++) if (this.footMask[k]) heights[k] = bh;
    const svf = this.svf(heights, `${bh}`);
    const met = this.met(utcIndex);
    const when = new Date(Date.UTC(this.data.weatherYear, 0, 1) + utcIndex * 3600_000 + 1800_000);
    const sun = solarPosition(when, this.origin.lat, this.origin.lon);
    const shade = this.shadow(heights, sun.altitudeDeg, sun.azimuthDeg);
    const working = input.hour >= WORK_START && input.hour < WORK_END;
    const soil: SurfaceClass = {
      ...SURFACES.soil,
      albedo: a.albedoSoil,
      ef: mit.sprinkling && working ? a.efSprinkled : a.efSoil,
    };
    const grass: SurfaceClass = { ...SURFACES.grass, albedo: a.albedoGrass, ef: a.efGrass };
    const urban: SurfaceClass = { ...SURFACES.urban, albedo: a.albedoUrban, ef: a.efUrban };
    const netShade = 1 - a.shadeNetTransmittance;
    const cloud = met.cloudPct / 100;
    const uLocal = 0.5 * met.U10; // src: HANDOVER A.3.4 (u_local = 0.5·U10) [verify]
    const ts = new Float32Array(cells);
    const ut = new Float32Array(cells);
    let plotSum = 0;
    let plotPre = 0;
    let plotN = 0;
    let maxU = -99;
    let sumU = 0;
    let nU = 0;
    for (let k = 0; k < cells; k++) {
      const inPlot = this.plotMask[k] === 1;
      const isFoot = this.footMask[k] === 1 && bh > 0;
      const tree = inPlot && mit.retainTrees && this.edgeMask[k] === 1;
      let cls: SurfaceClass;
      if (isFoot) cls = SURFACES.roof;
      else if (inPlot) cls = tree ? SURFACES.trees : soil;
      else
        cls =
          this.baseClass[k] === CLASS.roof
            ? SURFACES.roof
            : this.baseClass[k] === CLASS.grass
              ? grass
              : this.baseClass[k] === CLASS.water
                ? SURFACES.water
                : this.baseClass[k] === CLASS.road
                  ? SURFACES.road
                  : urban;
      let sh = shade[k]!;
      if (inPlot && !isFoot && mit.shadeNets) sh = Math.max(sh, netShade);
      if (tree) sh = Math.max(sh, 0.8);
      const s = isFoot ? 1 : svf[k]!;
      const lDown = longwaveDown(met.taC, met.dewC, cloud, s);
      const tsk = surfaceTemperature({
        directH: met.direct,
        diffuse: met.diffuse,
        shade: sh,
        svf: s,
        taC: met.taC,
        lDown,
        uLocal,
        surface: cls,
      });
      ts[k] = tsk;
      if (inPlot && !isFoot) {
        plotSum += tsk;
        plotPre += surfaceTemperature({
          directH: met.direct,
          diffuse: met.diffuse,
          shade: shade[k]!,
          svf: s,
          taC: met.taC,
          lDown,
          uLocal,
          surface: grass,
        });
        plotN++;
      }
      if (isFoot || (this.baseHeight[k]! > 0 && !inPlot)) {
        ut[k] = Number.NaN;
        continue;
      }
      const tmrt = meanRadiantTemp({
        dni: met.dni,
        diffuse: met.diffuse,
        globalH: met.direct + met.diffuse,
        altDeg: sun.altitudeDeg,
        shade: sh,
        svf: s,
        lDown,
        groundTsC: tsk,
        groundAlbedo: cls.albedo,
        groundEmissivity: cls.emissivity,
      });
      const u = utci(met.taC, tmrt, met.U10, met.rh) ?? Number.NaN;
      ut[k] = u;
      if (inPlot && Number.isFinite(u)) {
        maxU = Math.max(maxU, u);
        sumU += u;
        nU++;
      }
    }

    // Working hours at heat-stress risk over the programme, at a representative sunlit worker point.
    let plotSvf = 0;
    let ns = 0;
    for (let k = 0; k < cells; k++)
      if (this.plotMask[k] && !this.footMask[k]) {
        plotSvf += svf[k]!;
        ns++;
      }
    plotSvf = ns ? plotSvf / ns : 1;
    let risk = 0;
    let workHours = 0;
    const total = programmeTotal(effective);
    for (let m = 1; m <= total; m++) {
      const cm = calendarMonthFor(m);
      const dim = new Date(Date.UTC(this.data.weatherYear, cm, 0)).getUTCDate();
      for (let d = 1; d <= dim; d++) {
        const di = this.dayIndexOf(cm, d);
        if (new Date(Date.UTC(this.data.weatherYear, 0, 1 + di)).getUTCDay() === 0) continue;
        for (let h = WORK_START; h < WORK_END; h++) {
          if (mit.rescheduleWork && h >= 12 && h < 15) continue;
          workHours++;
          const i = this.utcIndex(di, h);
          const mt = this.met(i);
          const when2 = new Date(Date.UTC(this.data.weatherYear, 0, 1) + i * 3600_000 + 1800_000);
          const alt = solarPosition(when2, this.origin.lat, this.origin.lon).altitudeDeg;
          const sh = mit.shadeNets ? netShade : 0;
          const lD = longwaveDown(mt.taC, mt.dewC, mt.cloudPct / 100, plotSvf);
          const sClass = { ...soil, ef: mit.sprinkling ? a.efSprinkled : a.efSoil };
          const g = surfaceTemperature({
            directH: mt.direct,
            diffuse: mt.diffuse,
            shade: sh,
            svf: plotSvf,
            taC: mt.taC,
            lDown: lD,
            uLocal: 0.5 * mt.U10,
            surface: sClass,
          });
          const tm = meanRadiantTemp({
            dni: mt.dni,
            diffuse: mt.diffuse,
            globalH: mt.direct + mt.diffuse,
            altDeg: alt,
            shade: sh,
            svf: plotSvf,
            lDown: lD,
            groundTsC: g,
            groundAlbedo: sClass.albedo,
            groundEmissivity: sClass.emissivity,
          });
          const u = utci(mt.taC, tm, mt.U10, mt.rh);
          if (u !== null && u > a.utciRiskThreshold) risk++;
        }
      }
    }
    return {
      ts,
      utci: ut,
      plotTsC: plotN ? plotSum / plotN : Number.NaN,
      plotTsPreC: plotN ? plotPre / plotN : Number.NaN,
      maxWorkerUtci: maxU,
      meanWorkerUtci: nU ? sumU / nU : Number.NaN,
      riskHours: risk,
      workingHours: workHours,
      sunAltDeg: sun.altitudeDeg,
    };
  }
}

const CLASS = { urban: 0, roof: 1, grass: 2, water: 3, road: 4 } as const;
