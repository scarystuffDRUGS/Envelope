/**
 * GHG module, construction stage EN 15978 A1–A5 (MODELS.md A.4). All results in kgCO2e
 * unless noted. Scope 1 = site diesel; Scope 2 = grid electricity; Scope 3 = materials,
 * transport and waste.
 */
import type { BuildingTakeoff } from './building';
import type { ProgrammeMonths } from './construction/programme';
import type { Quantities } from './construction/quantities';
import type { ConstructionPhaseId } from './construction/schedule';
import type { VehicleFlow } from './construction/vehicles';
import type { Assumptions } from './params';

export interface GhgControls {
  lowCarbonConcrete: boolean;
  /** GGBS / fly-ash replacement effect on the concrete factor, % (20–40). */
  lowCarbonConcretePct: number;
  recycledRebar: boolean;
  gridPower: boolean;
  solarHybridDg: boolean;
  localSourcing: boolean;
  wasteReduction: boolean;
}

export const NO_GHG_CONTROLS: GhgControls = {
  lowCarbonConcrete: false,
  lowCarbonConcretePct: 30,
  recycledRebar: false,
  gridPower: false,
  solarHybridDg: false,
  localSourcing: false,
  wasteReduction: false,
};

/** Mitigation effects, HANDOVER Appendix C defaults [verify]. */
export const GHG_EFFECT = {
  recycledRebarReduction: 0.4,
  solarHybridShare: 0.3,
  localSourcingDistanceFactor: 0.5,
  wasteReductionFactor: 0.5,
} as const;

export interface GhgResult {
  a1a3: { concrete: number; rebar: number; masonry: number; glass: number; aluminium: number; total: number };
  a4: number;
  a5Diesel: number;
  a5Electricity: number;
  a5DieselLitres: number;
  /** Diesel litres by use: plant, DG sets for site power (zero with grid power), on-site haul vehicles. */
  a5DieselLitresBy: { plant: number; dg: number; haul: number };
  a5GridKwh: number;
  /** Site electricity over the programme, whether from DG sets or the grid. */
  siteKwh: number;
  waste: number;
  total: number;
  scope1: number;
  scope2: number;
  scope3: number;
  perM2Gfa: number;
  /** tCO2e per construction month. */
  monthly: number[];
  facades: { index: number; orientation: string; kgPerM2: number }[];
  roofKgPerM2: number;
}

const PHASE_ORDER: ConstructionPhaseId[] = ['excavation', 'structure', 'finishing'];

export function ghgResult(
  t: BuildingTakeoff,
  q: Quantities,
  flows: VehicleFlow[],
  programme: ProgrammeMonths,
  a: Assumptions,
  c: GhgControls,
): GhgResult {
  const efConcrete = a.efConcrete * (c.lowCarbonConcrete ? 1 - c.lowCarbonConcretePct / 100 : 1);
  const efRebar = a.efRebar * (c.recycledRebar ? 1 - GHG_EFFECT.recycledRebarReduction : 1);
  const a1a3 = {
    concrete: q.concreteKg * efConcrete,
    rebar: q.rebarKg * efRebar,
    masonry: q.masonryKg * a.efBrick,
    glass: q.glassKg * a.efGlass,
    aluminium: q.aluminiumKg * a.efAluminium,
    total: 0,
  };
  a1a3.total = a1a3.concrete + a1a3.rebar + a1a3.masonry + a1a3.glass + a1a3.aluminium;

  const distFactor = c.localSourcing ? GHG_EFFECT.localSourcingDistanceFactor : 1;
  const a4ByFlow = flows.map((f) => f.offsiteTkm * distFactor * a.efRoadFreight);
  const a4 = a4ByFlow.reduce((s, v) => s + v, 0);

  const wasteRate = a.wasteRate * (c.wasteReduction ? GHG_EFFECT.wasteReductionFactor : 1);
  const waste = wasteRate * (a1a3.total + a4);

  // A5: plant diesel by phase, site electricity from DG (baseline) or grid.
  const plant: Record<ConstructionPhaseId, number> = {
    excavation: a.plantDieselExcavation,
    structure: a.plantDieselStructure,
    finishing: a.plantDieselFinishing,
  };
  const monthsTotal = programme.excavation + programme.structure + programme.finishing;
  const kwhTotal = a.siteKwhPerMonth * monthsTotal * (c.solarHybridDg ? 1 - GHG_EFFECT.solarHybridShare : 1);
  const haulLitres = flows.reduce((s, f) => s + f.totalVkt * a.haulLitresPerKm, 0);
  const plantLitres = PHASE_ORDER.reduce((s, p) => s + plant[p] * programme[p], 0);
  const dgLitres = c.gridPower ? 0 : kwhTotal * a.dgLitresPerKwh;
  const a5DieselLitres = plantLitres + dgLitres + haulLitres;
  const a5Diesel = a5DieselLitres * a.dieselEf;
  const a5GridKwh = c.gridPower ? kwhTotal : 0;
  const a5Electricity = a5GridKwh * a.gridEf;

  const total = a1a3.total + a4 + a5Diesel + a5Electricity + waste;

  // Monthly profile (tCO2e): materials and their transport spread over the phase that uses them.
  const materialPhase: Record<string, ConstructionPhaseId> = {
    concrete: 'structure',
    rebar: 'structure',
    masonry: 'finishing',
    glass: 'finishing',
    aluminium: 'finishing',
  };
  const phaseMaterial: Record<ConstructionPhaseId, number> = { excavation: 0, structure: 0, finishing: 0 };
  for (const [k, phase] of Object.entries(materialPhase))
    phaseMaterial[phase] += (a1a3[k as keyof typeof a1a3] as number) * (1 + wasteRate);
  flows.forEach((f, i) => (phaseMaterial[f.phase] += a4ByFlow[i]! * (1 + wasteRate)));
  const monthly: number[] = [];
  const kwhPerMonth = kwhTotal / monthsTotal;
  for (const p of PHASE_ORDER) {
    const haulP = flows.filter((f) => f.phase === p).reduce((s, f) => s + f.totalVkt * a.haulLitresPerKm, 0);
    for (let m = 0; m < programme[p]; m++) {
      const diesel =
        (plant[p] + (c.gridPower ? 0 : kwhPerMonth * a.dgLitresPerKwh) + haulP / programme[p]) * a.dieselEf;
      const elec = c.gridPower ? kwhPerMonth * a.gridEf : 0;
      monthly.push((phaseMaterial[p] / programme[p] + diesel + elec) / 1000);
    }
  }

  // Envelope colouring: embodied kgCO2e per m² of each facade and the roof.
  const structure = a1a3.concrete + a1a3.rebar;
  const surfaceArea = t.facadeAreaM2 + t.roofAreaM2;
  const opaqueTotal = t.facadeAreaM2 - t.windowAreaM2;
  const facades = t.facades.map((f) => {
    const kg =
      (structure * f.areaM2) / surfaceArea +
      (opaqueTotal > 0 ? (a1a3.masonry * f.opaqueAreaM2) / opaqueTotal : 0) +
      (t.windowAreaM2 > 0 ? ((a1a3.glass + a1a3.aluminium) * f.windowAreaM2) / t.windowAreaM2 : 0);
    return { index: f.index, orientation: f.orientation, kgPerM2: kg / f.areaM2 };
  });

  return {
    a1a3,
    a4,
    a5Diesel,
    a5Electricity,
    a5DieselLitres,
    a5DieselLitresBy: { plant: plantLitres, dg: dgLitres, haul: haulLitres },
    a5GridKwh,
    siteKwh: kwhTotal,
    waste,
    total,
    scope1: a5Diesel,
    scope2: a5Electricity,
    scope3: a1a3.total + a4 + waste,
    perM2Gfa: total / q.gfaM2,
    monthly,
    facades,
    roofKgPerM2: (structure * t.roofAreaM2) / surfaceArea / t.roofAreaM2,
  };
}
