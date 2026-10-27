import type { Mitigations } from '@envelope/models';
import type { ImpactLayerId, SiteLayerId } from '../store/appStore';

export type BoolMeasure = {
  [K in keyof Mitigations]: Mitigations[K] extends boolean ? K : never;
}[keyof Mitigations];

export interface Measure {
  id: BoolMeasure;
  label: string;
  /** Model effect, as the models apply it (docs/MODELS.md). */
  effect: string;
  icon: string;
  flag?: string;
}

/** Mitigation measures by impact (HANDOVER Appendix C, construction scope). */
export const MEASURES: { group: 'Dust' | 'Heat' | 'GHG'; icon: string; items: Measure[] }[] = [
  {
    group: 'Dust',
    icon: 'air',
    items: [
      {
        id: 'sprinkling',
        label: 'Water sprinkling of site and haul roads',
        effect: '−50% activity, −55% haul',
        icon: 'water_drop',
      },
      { id: 'pavedRoads', label: 'Paved or WMM haul roads', effect: '−90% haul', icon: 'add_road' },
      {
        id: 'windBarriers',
        label: 'Wind barriers / barricading',
        effect: '−50% erosion, handling',
        icon: 'fence',
      },
      { id: 'coverStockpiles', label: 'Cover stockpiles', effect: '−90% stockpile', icon: 'landslide' },
      {
        id: 'greenNetting',
        label: 'Green netting on scaffolding',
        effect: '−30% handling',
        icon: 'grid_on',
      },
      {
        id: 'antiSmogGun',
        label: 'Anti-smog gun',
        effect: '−30% increment',
        icon: 'shower',
        flag: 'low evidence',
      },
      { id: 'wheelWashing', label: 'Wheel washing at exit', effect: '−80% trackout', icon: 'local_car_wash' },
      { id: 'highWindStop', label: 'Stop dusty work in high wind', effect: 'rule', icon: 'wind_power' },
    ],
  },
  {
    group: 'Heat',
    icon: 'thermostat',
    items: [
      { id: 'shadeNets', label: 'Shade nets over work areas', effect: 'beam × 0.5', icon: 'beach_access' },
      { id: 'retainTrees', label: 'Retain trees along boundary', effect: 'shade, EF', icon: 'park' },
      { id: 'rescheduleWork', label: 'No heavy work 12:00–15:00', effect: 'exposure', icon: 'schedule' },
    ],
  },
  {
    group: 'GHG',
    icon: 'co2',
    items: [
      {
        id: 'lowCarbonConcrete',
        label: 'Low-carbon concrete (GGBS / fly ash)',
        effect: 'factor −%',
        icon: 'foundation',
      },
      { id: 'recycledRebar', label: 'Recycled-content rebar', effect: '−40% rebar', icon: 'recycling' },
      {
        id: 'gridPower',
        label: 'Grid connection instead of DG',
        effect: 'Scope 1 → 2',
        icon: 'electrical_services',
      },
      { id: 'solarHybridDg', label: 'Solar-hybrid site power', effect: '−30% kWh', icon: 'solar_power' },
      { id: 'localSourcing', label: 'Local sourcing', effect: '−50% distance', icon: 'local_shipping' },
      { id: 'wasteReduction', label: 'Waste reduction plan', effect: 'wastage × 0.5', icon: 'delete_sweep' },
    ],
  },
];

export const ALL_MEASURES = MEASURES.flatMap((g) => g.items);

export const IMPACT_LAYERS: {
  id: ImpactLayerId;
  label: string;
  short: string;
  unit: string;
  key: string;
  icon: string;
  /** Colour-map tokens for the chip swatch (theme/tokens.css has none: these are literal stops). */
  swatch: string[];
}[] = [
  {
    id: 'dust',
    label: 'Dust (PM10)',
    short: 'Dust',
    unit: 'µg/m³',
    key: 'D',
    icon: 'air',
    swatch: ['#fff7bc', '#fe9929', '#8c2d04'],
  },
  {
    id: 'ts',
    label: 'Surface temperature',
    short: 'Surface temp.',
    unit: '°C',
    key: 'H',
    icon: 'thermostat',
    swatch: ['#320a5e', '#bc3754', '#fbb61a'],
  },
  {
    id: 'utci',
    label: 'Worker heat stress (UTCI)',
    short: 'Heat stress',
    unit: '°C',
    key: 'U',
    icon: 'sunny',
    swatch: ['#41ab5d', '#fd8d3c', '#8b0000'],
  },
  {
    id: 'ghg',
    label: 'GHG on envelope',
    short: 'GHG',
    unit: 'kgCO2e/m²',
    key: 'G',
    icon: 'co2',
    swatch: ['#dadaeb', '#807dba', '#4a1486'],
  },
];

export const SITE_LAYERS: { id: SiteLayerId; label: string; hint: string; icon: string }[] = [
  { id: 'basemap', label: '3D basemap', hint: 'Google / OSM', icon: 'public' },
  { id: 'building', label: 'Building and plot', hint: 'By month', icon: 'domain' },
  { id: 'shadows', label: 'Shadows', hint: 'Sun at hour', icon: 'contrast' },
  { id: 'receptors', label: 'Schools and hospitals', hint: 'Within 500 m', icon: 'school' },
];
