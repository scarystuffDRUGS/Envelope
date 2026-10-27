/**
 * Assumptions register: every model coefficient, with unit, source and status
 * (docs/MODELS.md parameter register). The Assumptions panel lists these; users can
 * override any value. `verify` = default from the build brief or common practice whose
 * source has not been confirmed; it is shown as unverified in the UI and report.
 */
export type ParamGroup = 'Programme' | 'Logistics' | 'Dust' | 'Heat' | 'GHG';

export interface ParamDef {
  id: string;
  group: ParamGroup;
  label: string;
  value: number;
  unit: string;
  source: string;
  status: 'cited' | 'verify';
  min?: number;
  max?: number;
}

const P = <I extends string>(
  id: I,
  group: ParamGroup,
  label: string,
  value: number,
  unit: string,
  source: string,
  status: 'cited' | 'verify' = 'verify',
  min = 0,
  max?: number,
): ParamDef & { id: I } => ({
  id,
  group,
  label,
  value,
  unit,
  source,
  status,
  min,
  ...(max !== undefined ? { max } : {}),
});

export const PARAMS = [
  // Programme (A.5)
  P('basements', 'Programme', 'Basement storeys', 1, 'storeys', 'Envelope demo default', 'verify', 0, 4),
  P('basementDepthM', 'Programme', 'Basement storey depth', 3.6, 'm', 'Equal to floor-to-floor (D-004)'),
  P(
    'excavationRate',
    'Programme',
    'Daily excavation rate (bank)',
    400,
    'm³/day',
    'Contractor practice, 2 excavators',
    'verify',
    1,
  ),
  P(
    'floorCycleDays',
    'Programme',
    'RCC floor cycle time',
    21,
    'days/floor',
    'Contractor practice, conventional formwork',
    'verify',
    1,
  ),
  P(
    'finishingShare',
    'Programme',
    'Finishing duration ÷ structure duration',
    0.75,
    '–',
    'HANDOVER A.2.1 ratio (9 ÷ 12 months)',
    'verify',
    0.05,
  ),
  P(
    'workingDaysPerMonth',
    'Programme',
    'Working days per month',
    26,
    'days',
    '6-day working week',
    'verify',
    1,
    31,
  ),
  P(
    'workingHoursPerDay',
    'Programme',
    'Working hours per day (08:00–20:00)',
    12,
    'h',
    'HANDOVER A.2.1',
    'verify',
    1,
    24,
  ),
  // Quantities and logistics (A.4, A.5)
  P('concreteIntensity', 'Logistics', 'Concrete intensity', 0.45, 'm³/m² GFA', 'HANDOVER A.4 (RCC frame)'),
  P('rebarIntensity', 'Logistics', 'Rebar intensity', 45, 'kg/m² GFA', 'HANDOVER A.4 (RCC frame)'),
  P(
    'wallThicknessM',
    'Logistics',
    'Masonry wall thickness',
    0.23,
    'm',
    'One-brick wall, IS 1077 modular brick',
  ),
  P('masonryDensity', 'Logistics', 'Brick masonry density', 1920, 'kg/m³', 'IS 875 Part 1 (brick masonry)'),
  P('glassThicknessM', 'Logistics', 'Glazing thickness', 0.01, 'm', 'HANDOVER A.4'),
  P(
    'aluFrameKgPerM2',
    'Logistics',
    'Aluminium frame per m² window',
    5,
    'kg/m²',
    'Typical curtain-wall framing',
  ),
  P(
    'concreteDensity',
    'Logistics',
    'Concrete density',
    2400,
    'kg/m³',
    'IS 875 Part 1 (RCC 25 kN/m³ incl. steel)',
  ),
  P('soilDensity', 'Logistics', 'Excavated soil bulk density (bank)', 1600, 'kg/m³', 'Typical alluvial soil'),
  P(
    'bulkingFactor',
    'Logistics',
    'Bulking factor, excavated soil',
    1.25,
    '–',
    'Earthworks swell 20–30% for common earth',
    'verify',
    1,
  ),
  P(
    'mixerCapacity',
    'Logistics',
    'Transit mixer capacity',
    6,
    'm³',
    'Common Indian RMC transit mixer',
    'verify',
    0.5,
  ),
  P(
    'tipperCapacity',
    'Logistics',
    'Tipper capacity (loose spoil)',
    10,
    'm³',
    'Common Indian tipper',
    'verify',
    0.5,
  ),
  P(
    'truckPayload',
    'Logistics',
    'Materials truck payload',
    10,
    't',
    'Common Indian rigid truck',
    'verify',
    0.5,
  ),
  P(
    'meanVehicleWeightT',
    'Logistics',
    'Mean haul vehicle weight (AP-42 W)',
    20,
    'tons',
    'Loaded/empty average, tipper and mixer',
  ),
  P('distConcreteKm', 'Logistics', 'Transport distance: RMC plant', 15, 'km', 'Site-specific estimate'),
  P('distSteelKm', 'Logistics', 'Transport distance: steel', 150, 'km', 'Site-specific estimate'),
  P('distMasonryKm', 'Logistics', 'Transport distance: bricks', 50, 'km', 'Site-specific estimate'),
  P(
    'distGlassKm',
    'Logistics',
    'Transport distance: glass and aluminium',
    250,
    'km',
    'Site-specific estimate',
  ),
  P('distSpoilKm', 'Logistics', 'Transport distance: spoil disposal', 20, 'km', 'Site-specific estimate'),
  // Dust (A.2)
  P(
    'wrapGeneral',
    'Dust',
    'General construction PM10 factor',
    0.11,
    'short ton/acre/month',
    'WRAP Fugitive Dust Handbook (2006)',
  ),
  P(
    'wrapEarthmoving',
    'Dust',
    'Large-scale earthmoving PM10 factor',
    0.42,
    'short ton/acre/month',
    'WRAP Fugitive Dust Handbook (2006)',
  ),
  P('pm25ShareActivity', 'Dust', 'PM2.5 / PM10, construction activity', 0.1, '–', 'HANDOVER A.2.1'),
  P(
    'ustarT0',
    'Dust',
    'Threshold friction velocity u*t, exposed soil and stockpiles',
    1.02,
    'm/s',
    'AP-42 13.2.5 Table 13.2.5-2, overburden; replace with a site sieve test (Table 13.2.5-1: 0.43–1.00)',
    'cited',
    0.1,
  ),
  P(
    'fastestMileFactor',
    'Dust',
    'Fastest mile ÷ hourly mean wind at 10 m',
    1.2,
    '–',
    'Durst (1960) gust-factor curve, ~2 min averaging (fastest-mile duration, AP-42 13.2.5)',
    'verify',
    1,
  ),
  P('stockpileAreaM2', 'Dust', 'Open stockpile area', 300, 'm²', 'Envelope demo default'),
  P('materialMoisturePct', 'Dust', 'Handled material moisture M', 2, '%', 'AP-42 13.2.4 default'),
  P(
    'aggregateShare',
    'Dust',
    'Aggregate share of concrete mass handled',
    0.75,
    '–',
    'Typical concrete mix proportions',
  ),
  P('siltPct', 'Dust', 'Haul road silt content s', 8.5, '%', 'HANDOVER A.2.1 (construction sites)'),
  P('trackoutShare', 'Dust', 'Trackout as share of haul-road PM', 0.2, '–', 'Envelope demo default'),
  P(
    'plumeTopM',
    'Dust',
    'Initial plume top height (1.7 × vehicle height)',
    6.8,
    'm',
    'US EPA Haul Road Workgroup (2012): release = top/2, σz0 = top/2.15',
    'cited',
    1,
  ),
  P('dustEventThreshold', 'Dust', 'CAMS dust-event threshold', 100, 'µg/m³', 'HANDOVER A.2.3'),
  // Heat (A.3)
  P('albedoSoil', 'Heat', 'Albedo, bare soil / site', 0.25, '–', 'Oke et al. (2017), HANDOVER A.1'),
  P('efSoil', 'Heat', 'Evaporative fraction, bare soil', 0.1, '–', 'HANDOVER A.1'),
  P('albedoGrass', 'Heat', 'Albedo, grass (pre-development)', 0.23, '–', 'Oke et al. (2017), HANDOVER A.1'),
  P('efGrass', 'Heat', 'Evaporative fraction, grass', 0.5, '–', 'HANDOVER A.1'),
  P('albedoUrban', 'Heat', 'Albedo, urban mixed paved', 0.15, '–', 'Envelope default'),
  P('efUrban', 'Heat', 'Evaporative fraction, urban mixed paved', 0.05, '–', 'Envelope default'),
  P(
    'shadeNetTransmittance',
    'Heat',
    'Shade net direct-beam transmittance',
    0.5,
    '–',
    '"50% shade net" rating',
  ),
  P('efSprinkled', 'Heat', 'Evaporative fraction, sprinkled soil', 0.3, '–', 'Envelope default'),
  P(
    'utciRiskThreshold',
    'Heat',
    'Heat-stress risk threshold (UTCI)',
    32,
    '°C',
    'UTCI scale: strong heat stress',
    'cited',
  ),
  // GHG (A.4)
  P(
    'efConcrete',
    'GHG',
    'Embodied carbon, concrete',
    0.13,
    'kgCO2e/kg',
    'ICE v3.0 (Hammond & Jones), general concrete',
  ),
  P('efRebar', 'GHG', 'Embodied carbon, rebar', 1.99, 'kgCO2e/kg', 'ICE v3.0, steel rebar (world average)'),
  P('efBrick', 'GHG', 'Embodied carbon, clay brick masonry', 0.21, 'kgCO2e/kg', 'ICE v3.0, clay brick'),
  P('efGlass', 'GHG', 'Embodied carbon, glass', 1.44, 'kgCO2e/kg', 'ICE v3.0, general glass'),
  P(
    'efAluminium',
    'GHG',
    'Embodied carbon, aluminium',
    13.1,
    'kgCO2e/kg',
    'ICE v3.0, aluminium (world average)',
  ),
  P('efRoadFreight', 'GHG', 'Road freight factor', 0.1, 'kgCO2e/t·km', 'Heavy goods vehicle, India estimate'),
  P('dieselEf', 'GHG', 'Diesel combustion factor', 2.68, 'kgCO2/L', 'HANDOVER A.4 (IPCC default basis)'),
  P(
    'gridEf',
    'GHG',
    'Grid emission factor',
    0.71,
    'kgCO2/kWh',
    'CEA CO2 Baseline Database v21.0, FY 2024-25',
  ),
  P('dgLitresPerKwh', 'GHG', 'DG set fuel use', 0.3, 'L/kWh', 'HANDOVER A.4'),
  P('haulLitresPerKm', 'GHG', 'Haul vehicle fuel use', 0.35, 'L/km', 'Heavy truck estimate'),
  P(
    'plantDieselExcavation',
    'GHG',
    'Plant diesel, excavation',
    6000,
    'L/month',
    'Excavators and loaders estimate',
  ),
  P(
    'plantDieselStructure',
    'GHG',
    'Plant diesel, structure',
    3000,
    'L/month',
    'Cranes, pumps, hoists estimate',
  ),
  P('plantDieselFinishing', 'GHG', 'Plant diesel, finishing', 1000, 'L/month', 'Light plant estimate'),
  P(
    'siteKwhPerMonth',
    'GHG',
    'Site electricity demand',
    8000,
    'kWh/month',
    'Lighting, welding, hoists estimate',
  ),
  P('wasteRate', 'GHG', 'Material wastage rate', 0.05, '–', 'Typical site wastage 3–8%'),
] as const satisfies readonly ParamDef[];

export type ParamId = (typeof PARAMS)[number]['id'];
export type Assumptions = Record<ParamId, number>;

export const PARAM_BY_ID: Record<ParamId, ParamDef> = Object.fromEntries(
  PARAMS.map((p) => [p.id, p]),
) as Record<ParamId, ParamDef>;

export function defaultAssumptions(): Assumptions {
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.value])) as Assumptions;
}

export function withOverrides(overrides: Partial<Assumptions>): Assumptions {
  return { ...defaultAssumptions(), ...overrides };
}
