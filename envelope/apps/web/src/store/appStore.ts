import type { SiteData } from '@envelope/data';
import type {
  Assumptions,
  BuildingSpec,
  Mitigations,
  ProgrammeMonths,
  ScenarioResult,
} from '@envelope/models';
import { NO_MITIGATIONS, hashObject, weatherYearFor } from '@envelope/models';
import { create } from 'zustand';
import { DATA_SHEET_OPEN_MIN_HEIGHT } from '../hooks/useLayoutMode';
import { clearImportedModel } from '../import/persist';
import type { ThemeMode } from '../theme/theme';
import { loadThemeMode, saveThemeMode } from '../theme/theme';
import { demoBuilding } from '../viewer/site';

export type RibbonTab = 'project' | 'site' | 'analysis' | 'mitigation' | 'report';
export type DataSheetTab = 'climate' | 'dust' | 'heat' | 'ghg' | 'assumptions';

/**
 * The Scenario is the single input to the models: it is hashed and the
 * hash keys cached results. It grows as modules arrive; UI-only state stays out of it.
 */
export interface Scenario {
  /** Local hour of day at the site, 0–23. */
  hour: number;
  /** 1-based month of the construction programme. */
  constructionMonth: number;
  /** Day of the calendar month shown (weather year). */
  dayOfMonth: number;
  /** Calendar year of hourly weather used as the typical year. */
  weatherYear: number;
}

/** Which basemap is showing. `google` = Photorealistic 3D Tiles; `ion-fallback` = World Terrain + OSM Buildings. */
export type BasemapKind = 'google' | 'ion-fallback' | 'osm' | 'none';

export interface BasemapStatus {
  state: 'loading' | 'ready';
  kind: BasemapKind | null;
  /** Shown in the viewport when the preferred basemap could not be used. */
  notice: string | null;
}

export interface CameraView {
  headingDeg: number;
  pitchDeg: number;
  /** Straight-line distance from the camera to the site centre (m). */
  rangeM: number;
  /** Ground metres per screen pixel at the site centre. */
  metresPerPixel: number;
}

export type SiteLayerId = 'basemap' | 'building' | 'shadows' | 'model' | 'receptors';

/** A school, college or hospital the user added by hand (D-029). */
export interface UserReceptor {
  id: string;
  name: string;
  kind: 'school' | 'college' | 'university' | 'kindergarten' | 'hospital' | 'clinic' | 'nursing_home';
  lat: number;
  lon: number;
}

/** Where the building spec came from: the committed demo, an IFC file or a mesh-only file (D-027). */
export interface BuildingSource {
  kind: 'demo' | 'ifc' | 'mesh';
  fileName?: string;
  /** Bearing of the mesh's model +Y axis (true north + dialog rotation), degrees clockwise. */
  modelHeadingDeg?: number;
  /** Metres per mesh unit (OBJ files drawn in centimetres or millimetres); 1 for IFC and glTF. */
  modelScale?: number;
  /** Height of the imported mesh above its ground level, m (mesh imports). */
  modelHeightM?: number;
}
export type ImpactLayerId = 'dust' | 'ts' | 'utci' | 'ghg';
export type DustMetric = 'hour' | 'day';

export interface Results {
  baseline: ScenarioResult;
  mitigated: ScenarioResult;
}

export type PresetId = 'none' | 'cpcb' | 'best' | 'netzero';

export interface UiState {
  ribbonTab: RibbonTab;
  leftPanelOpen: boolean;
  inspectorOpen: boolean;
  dataSheetOpen: boolean;
  dataSheetTab: DataSheetTab;
  playing: boolean;
  helpOpen: boolean;
  reportOpen: boolean;
  assumptionsOpen: boolean;
  importOpen: boolean;
  receptorsOpen: boolean;
  datePickerOpen: boolean;
  theme: ThemeMode;
  /** Open state of collapsible sheet sections, by section id (absent = the section's default). */
  sections: Record<string, boolean>;
  searchQuery: string;
  /** Widths of the docked Layers and Inspector panels (px), set by dragging their edge. */
  panelWidths: PanelWidths;
  /** Construction stage card on the map: expanded or folded to its title (D-034). */
  stageOpen: boolean;
}

export type PanelId = 'layers' | 'inspector';
export type PanelWidths = Record<PanelId, number>;
/** Default and allowed widths of the docked side panels (px). */
export const PANEL_WIDTHS: Record<PanelId, { initial: number; min: number; max: number }> = {
  layers: { initial: 312, min: 264, max: 560 },
  inspector: { initial: 368, min: 320, max: 640 },
};
const PANEL_WIDTHS_KEY = 'envelope.panelWidths';

export function clampPanelWidth(id: PanelId, w: number): number {
  const { min, max } = PANEL_WIDTHS[id];
  return Math.round(Math.min(max, Math.max(min, w)));
}

function loadPanelWidths(): PanelWidths {
  const out: PanelWidths = { layers: PANEL_WIDTHS.layers.initial, inspector: PANEL_WIDTHS.inspector.initial };
  try {
    const raw = JSON.parse(window.localStorage.getItem(PANEL_WIDTHS_KEY) ?? '{}') as Partial<PanelWidths>;
    for (const id of ['layers', 'inspector'] as const)
      if (typeof raw[id] === 'number' && Number.isFinite(raw[id])) out[id] = clampPanelWidth(id, raw[id]);
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return out;
}

function savePanelWidths(w: PanelWidths): void {
  try {
    window.localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(w));
  } catch {
    // Storage unavailable: the widths still apply for this session.
  }
}

export interface AppState {
  projectName: string;
  scenario: Scenario;
  ui: UiState;
  layers: Record<SiteLayerId, boolean>;
  basemap: BasemapStatus;
  view: CameraView | null;
  cursor: { lat: number; lon: number } | null;
  /** The building every model, the map and the report read. Starts as the demo. */
  building: BuildingSpec;
  buildingSource: BuildingSource;
  /** Blob URL of the imported model's mesh (.glb), shown in the finishing phase; null for the demo. */
  modelUrl: string | null;
  /** Assumption ids the import set (basements), cleared again by resetBuilding. */
  importedAssumptions: (keyof Assumptions)[];
  /** Schools, colleges and hospitals added by hand; kept in this browser, used within 1 km of a site. */
  userReceptors: UserReceptor[];
  /** True once the building has been placed on the ground. */
  buildingPlaced: boolean;
  /** Ground height used for placement (ellipsoidal m) and where it came from. */
  ground: { heightM: number; source: 'snapshot' | 'sampled' | 'ellipsoid' } | null;
  setProjectName: (name: string) => void;
  setHour: (hour: number) => void;
  stepHour: (delta: number) => void;
  setConstructionMonth: (month: number) => void;
  setRibbonTab: (tab: RibbonTab) => void;
  toggleLeftPanel: () => void;
  toggleInspector: () => void;
  toggleDataSheet: () => void;
  openDataSheetTab: (tab: DataSheetTab) => void;
  togglePlaying: () => void;
  setHelpOpen: (open: boolean) => void;
  setReportOpen: (open: boolean) => void;
  setAssumptionsOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  setReceptorsOpen: (open: boolean) => void;
  addUserReceptor: (r: Omit<UserReceptor, 'id'>) => void;
  removeUserReceptor: (id: string) => void;
  /** Replaces the building after the import dialog validated it; the pipeline reruns from it. */
  setBuilding: (
    spec: BuildingSpec,
    source: BuildingSource,
    opts?: { modelUrl?: string | null; assumptions?: Partial<Assumptions> },
  ) => void;
  resetBuilding: () => void;
  /** Restores the persisted mesh of an imported building after a reload. */
  setModelUrl: (url: string | null) => void;
  setDatePickerOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setSectionOpen: (id: string, open: boolean) => void;
  setSearchQuery: (q: string) => void;
  /** Width of a docked side panel; clamped to PANEL_WIDTHS and kept in this browser. */
  setPanelWidth: (id: PanelId, width: number) => void;
  toggleStage: () => void;
  toggleLayer: (id: SiteLayerId) => void;
  setBasemap: (status: BasemapStatus) => void;
  setView: (view: CameraView) => void;
  setCursor: (cursor: { lat: number; lon: number } | null) => void;
  setBuildingPlaced: (placed: boolean) => void;
  setGround: (ground: AppState['ground']) => void;

  // Analysis
  siteData: SiteData | null;
  dataState: 'loading' | 'ready' | 'error';
  assumptions: Partial<Assumptions>;
  mitigations: Mitigations;
  preset: PresetId | 'custom';
  programmeOverride: ProgrammeMonths | null;
  results: Results | null;
  running: boolean;
  runMs: number | null;
  computeError: string | null;
  impactLayer: ImpactLayerId | null;
  dustMetric: DustMetric;
  layerOpacity: number;
  showScenario: 'baseline' | 'mitigated';
  setSiteData: (d: SiteData | null, state: AppState['dataState']) => void;
  setAssumption: (id: keyof Assumptions, value: number | null) => void;
  resetAssumptions: () => void;
  setMitigation: <K extends keyof Mitigations>(id: K, value: Mitigations[K]) => void;
  applyPreset: (preset: PresetId) => void;
  setProgrammeOverride: (p: ProgrammeMonths | null) => void;
  setResults: (r: Results | null, ms: number | null, error?: string | null) => void;
  setRunning: (running: boolean) => void;
  setImpactLayer: (id: ImpactLayerId | null) => void;
  setDustMetric: (m: DustMetric) => void;
  setLayerOpacity: (v: number) => void;
  toggleShowScenario: () => void;
  goToDay: (month: number, dayOfMonth: number) => void;
}

/** Mitigation presets (HANDOVER Appendix C, adapted to construction scope). */
export const PRESETS: Record<PresetId, Partial<Mitigations>> = {
  none: {},
  cpcb: {
    sprinkling: true,
    windBarriers: true,
    coverStockpiles: true,
    greenNetting: true,
    wheelWashing: true,
  },
  best: {
    sprinkling: true,
    pavedRoads: true,
    windBarriers: true,
    coverStockpiles: true,
    greenNetting: true,
    antiSmogGun: true,
    wheelWashing: true,
    highWindStop: true,
    shadeNets: true,
    rescheduleWork: true,
    gridPower: true,
    localSourcing: true,
  },
  netzero: {
    sprinkling: true,
    pavedRoads: true,
    windBarriers: true,
    coverStockpiles: true,
    greenNetting: true,
    antiSmogGun: true,
    wheelWashing: true,
    highWindStop: true,
    shadeNets: true,
    retainTrees: true,
    rescheduleWork: true,
    lowCarbonConcrete: true,
    lowCarbonConcretePct: 40,
    recycledRebar: true,
    gridPower: true,
    solarHybridDg: true,
    localSourcing: true,
    wasteReduction: true,
  },
};

const PROJECT_NAME_KEY = 'envelope.projectName';
export const DEFAULT_PROJECT_NAME = 'Gurugram office, construction phase';

function loadProjectName(): string {
  try {
    return window.localStorage.getItem(PROJECT_NAME_KEY) || DEFAULT_PROJECT_NAME;
  } catch {
    return DEFAULT_PROJECT_NAME;
  }
}

function saveProjectName(name: string): void {
  try {
    window.localStorage.setItem(PROJECT_NAME_KEY, name);
  } catch {
    // Storage unavailable (private mode): the name still applies for this session.
  }
}

const BUILDING_KEY = 'envelope.building';

interface SavedBuilding {
  spec: BuildingSpec;
  source: BuildingSource;
  importedAssumptions: (keyof Assumptions)[];
  assumptions: Partial<Assumptions>;
}

/** The imported building survives a reload (per-viewer convenience); the demo is the fallback. */
function loadBuilding(): SavedBuilding | null {
  try {
    const raw = window.localStorage.getItem(BUILDING_KEY);
    return raw ? (JSON.parse(raw) as SavedBuilding) : null;
  } catch {
    return null;
  }
}

function saveBuilding(saved: SavedBuilding | null): void {
  try {
    if (saved) window.localStorage.setItem(BUILDING_KEY, JSON.stringify(saved));
    else window.localStorage.removeItem(BUILDING_KEY);
  } catch {
    // Storage unavailable: the import still applies for this session.
  }
}

const saved = loadBuilding();

const RECEPTORS_KEY = 'envelope.receptors';

function loadReceptors(): UserReceptor[] {
  try {
    const raw = window.localStorage.getItem(RECEPTORS_KEY);
    return raw ? (JSON.parse(raw) as UserReceptor[]) : [];
  } catch {
    return [];
  }
}

function saveReceptors(list: UserReceptor[]): void {
  try {
    window.localStorage.setItem(RECEPTORS_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the receptors still apply for this session.
  }
}

const wrapHour = (h: number) => ((Math.round(h) % 24) + 24) % 24;

export const useAppStore = create<AppState>()((set) => ({
  projectName: loadProjectName(),
  scenario: { hour: 14, constructionMonth: 7, dayOfMonth: 15, weatherYear: weatherYearFor(new Date()) },
  ui: {
    ribbonTab: 'project',
    // Dropdown state of Layers and Inspector when they are not docked (hooks/useLayoutMode, D-028).
    leftPanelOpen: false,
    inspectorOpen: false,
    // Short windows start with the data sheet collapsed so the map keeps its height.
    dataSheetOpen: typeof window === 'undefined' || window.innerHeight >= DATA_SHEET_OPEN_MIN_HEIGHT,
    dataSheetTab: 'climate',
    playing: false,
    helpOpen: false,
    reportOpen: false,
    assumptionsOpen: false,
    importOpen: false,
    receptorsOpen: false,
    datePickerOpen: false,
    theme: loadThemeMode(),
    sections: {},
    searchQuery: '',
    panelWidths:
      typeof window === 'undefined'
        ? { layers: PANEL_WIDTHS.layers.initial, inspector: PANEL_WIDTHS.inspector.initial }
        : loadPanelWidths(),
    stageOpen: true,
  },
  layers: { basemap: true, building: true, shadows: true, model: true, receptors: true },
  basemap: { state: 'loading', kind: null, notice: null },
  view: null,
  cursor: null,
  building: saved?.spec ?? demoBuilding,
  buildingSource: saved?.source ?? { kind: 'demo' },
  modelUrl: null,
  importedAssumptions: saved?.importedAssumptions ?? [],
  userReceptors: loadReceptors(),
  buildingPlaced: false,
  ground: null,
  setProjectName: (name) => {
    const trimmed = name.trim() || DEFAULT_PROJECT_NAME;
    saveProjectName(trimmed);
    set({ projectName: trimmed });
  },
  setHour: (hour) => set((s) => ({ scenario: { ...s.scenario, hour: wrapHour(hour) } })),
  stepHour: (delta) => set((s) => ({ scenario: { ...s.scenario, hour: wrapHour(s.scenario.hour + delta) } })),
  setConstructionMonth: (month) =>
    set((s) => ({
      scenario: { ...s.scenario, constructionMonth: Math.max(1, Math.round(month)) },
    })),
  setRibbonTab: (tab) => set((s) => ({ ui: { ...s.ui, ribbonTab: tab } })),
  toggleLeftPanel: () => set((s) => ({ ui: { ...s.ui, leftPanelOpen: !s.ui.leftPanelOpen } })),
  toggleInspector: () => set((s) => ({ ui: { ...s.ui, inspectorOpen: !s.ui.inspectorOpen } })),
  toggleDataSheet: () => set((s) => ({ ui: { ...s.ui, dataSheetOpen: !s.ui.dataSheetOpen } })),
  openDataSheetTab: (tab) => set((s) => ({ ui: { ...s.ui, dataSheetOpen: true, dataSheetTab: tab } })),
  togglePlaying: () => set((s) => ({ ui: { ...s.ui, playing: !s.ui.playing } })),
  setHelpOpen: (open) => set((s) => ({ ui: { ...s.ui, helpOpen: open } })),
  setReportOpen: (open) => set((s) => ({ ui: { ...s.ui, reportOpen: open } })),
  setAssumptionsOpen: (open) => set((s) => ({ ui: { ...s.ui, assumptionsOpen: open } })),
  setImportOpen: (open) => set((s) => ({ ui: { ...s.ui, importOpen: open } })),
  setReceptorsOpen: (open) => set((s) => ({ ui: { ...s.ui, receptorsOpen: open } })),
  addUserReceptor: (r) =>
    set((s) => {
      const userReceptors = [
        ...s.userReceptors,
        { ...r, id: `${Date.now().toString(36)}${s.userReceptors.length}` },
      ];
      saveReceptors(userReceptors);
      return { userReceptors };
    }),
  removeUserReceptor: (id) =>
    set((s) => {
      const userReceptors = s.userReceptors.filter((r) => r.id !== id);
      saveReceptors(userReceptors);
      return { userReceptors };
    }),
  setBuilding: (spec, source, opts = {}) =>
    set((s) => {
      if (s.modelUrl && s.modelUrl !== opts.modelUrl) URL.revokeObjectURL(s.modelUrl);
      const assumptions = { ...s.assumptions };
      for (const k of s.importedAssumptions) delete assumptions[k];
      Object.assign(assumptions, opts.assumptions ?? {});
      const importedAssumptions = Object.keys(opts.assumptions ?? {}) as (keyof Assumptions)[];
      saveBuilding({
        spec,
        source,
        importedAssumptions,
        assumptions: opts.assumptions ?? {},
      });
      const moved = spec.site.lat !== s.building.site.lat || spec.site.lon !== s.building.site.lon;
      const projectName = `${spec.name}, construction phase`;
      saveProjectName(projectName);
      return {
        building: spec,
        buildingSource: source,
        modelUrl: opts.modelUrl ?? null,
        importedAssumptions,
        assumptions,
        projectName,
        programmeOverride: null,
        results: null,
        buildingPlaced: false,
        ...(moved ? { siteData: null, dataState: 'loading' as const } : {}),
      };
    }),
  resetBuilding: () =>
    set((s) => {
      if (s.modelUrl) URL.revokeObjectURL(s.modelUrl);
      saveBuilding(null);
      void clearImportedModel();
      const assumptions = { ...s.assumptions };
      for (const k of s.importedAssumptions) delete assumptions[k];
      const moved =
        s.building.site.lat !== demoBuilding.site.lat || s.building.site.lon !== demoBuilding.site.lon;
      saveProjectName(DEFAULT_PROJECT_NAME);
      return {
        building: demoBuilding,
        buildingSource: { kind: 'demo' },
        modelUrl: null,
        importedAssumptions: [],
        assumptions,
        projectName: DEFAULT_PROJECT_NAME,
        programmeOverride: null,
        results: null,
        buildingPlaced: false,
        ...(moved ? { siteData: null, dataState: 'loading' as const } : {}),
      };
    }),
  setModelUrl: (modelUrl) => set({ modelUrl }),
  setDatePickerOpen: (open) => set((s) => ({ ui: { ...s.ui, datePickerOpen: open } })),
  toggleTheme: () =>
    set((s) => {
      const theme: ThemeMode = s.ui.theme === 'dark' ? 'light' : 'dark';
      saveThemeMode(theme);
      return { ui: { ...s.ui, theme } };
    }),
  setSectionOpen: (id, open) => set((s) => ({ ui: { ...s.ui, sections: { ...s.ui.sections, [id]: open } } })),
  setSearchQuery: (searchQuery) => set((s) => ({ ui: { ...s.ui, searchQuery } })),
  toggleStage: () => set((s) => ({ ui: { ...s.ui, stageOpen: !s.ui.stageOpen } })),
  setPanelWidth: (id, width) =>
    set((s) => {
      const panelWidths = { ...s.ui.panelWidths, [id]: clampPanelWidth(id, width) };
      savePanelWidths(panelWidths);
      return { ui: { ...s.ui, panelWidths } };
    }),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setBasemap: (basemap) => set({ basemap }),
  setView: (view) => set({ view }),
  setCursor: (cursor) => set({ cursor }),
  setBuildingPlaced: (buildingPlaced) => set({ buildingPlaced }),
  setGround: (ground) => set({ ground }),

  siteData: null,
  dataState: 'loading',
  // Assumptions an import set (basements) are restored with the imported building.
  assumptions: saved?.assumptions ?? {},
  // Demo default: the mitigated scenario starts from the CPCB minimum dust measures.
  mitigations: { ...NO_MITIGATIONS, ...PRESETS.cpcb },
  preset: 'cpcb',
  programmeOverride: null,
  results: null,
  running: false,
  runMs: null,
  computeError: null,
  impactLayer: 'dust',
  dustMetric: 'day',
  layerOpacity: 0.75,
  showScenario: 'mitigated',
  setSiteData: (siteData, dataState) => set({ siteData, dataState }),
  setAssumption: (id, value) =>
    set((s) => {
      const next = { ...s.assumptions };
      if (value === null) delete next[id];
      else next[id] = value;
      return { assumptions: next };
    }),
  resetAssumptions: () => set({ assumptions: {} }),
  setMitigation: (id, value) =>
    set((s) => ({ mitigations: { ...s.mitigations, [id]: value }, preset: 'custom' })),
  applyPreset: (preset) => set({ mitigations: { ...NO_MITIGATIONS, ...PRESETS[preset] }, preset }),
  setProgrammeOverride: (programmeOverride) => set({ programmeOverride }),
  setResults: (results, runMs, computeError = null) => set({ results, runMs, computeError, running: false }),
  setRunning: (running) => set({ running }),
  setImpactLayer: (impactLayer) => set({ impactLayer }),
  setDustMetric: (dustMetric) => set({ dustMetric }),
  setLayerOpacity: (layerOpacity) => set({ layerOpacity }),
  toggleShowScenario: () =>
    set((s) => ({ showScenario: s.showScenario === 'baseline' ? 'mitigated' : 'baseline' })),
  goToDay: (constructionMonth, dayOfMonth) =>
    set((s) => ({ scenario: { ...s.scenario, constructionMonth, dayOfMonth } })),
}));

export const scenarioHash = (scenario: Scenario) => hashObject(scenario);
