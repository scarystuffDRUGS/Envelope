import type { Assumptions } from '../params';
import type { ProgrammeMonths } from './programme';
import type { Quantities } from './quantities';
import type { ConstructionPhaseId } from './schedule';

/**
 * Vehicle movement, always derived from quantities and programme (MODELS.md A.5.3, D-020):
 * loads = quantity ÷ capacity (rounded up); trips = 2 × loads (empty return);
 * trips/day = trips ÷ working days of the phase that uses the material;
 * on-site VKT/day = trips/day × haul route length; off-site t·km = mass × distance.
 */
export type Material = 'spoil' | 'concrete' | 'rebar' | 'masonry' | 'glass';

export interface VehicleFlow {
  material: Material;
  label: string;
  vehicle: string;
  phase: ConstructionPhaseId;
  quantity: number;
  quantityUnit: string;
  massT: number;
  capacity: number;
  loads: number;
  trips: number;
  tripsPerDay: number;
  vktPerDay: number;
  totalVkt: number;
  offsiteKm: number;
  offsiteTkm: number;
}

export function vehicleFlows(
  q: Quantities,
  programme: ProgrammeMonths,
  a: Assumptions,
  haulRouteM: number,
): VehicleFlow[] {
  const rows: Omit<
    VehicleFlow,
    'loads' | 'trips' | 'tripsPerDay' | 'vktPerDay' | 'totalVkt' | 'offsiteTkm'
  >[] = [
    {
      material: 'spoil',
      label: 'Excavated spoil',
      vehicle: 'Tipper',
      phase: 'excavation',
      quantity: q.excavationLooseM3,
      quantityUnit: 'm³ loose',
      massT: q.spoilKg / 1000,
      capacity: a.tipperCapacity,
      offsiteKm: a.distSpoilKm,
    },
    {
      material: 'concrete',
      label: 'Ready-mix concrete',
      vehicle: 'Transit mixer',
      phase: 'structure',
      quantity: q.concreteM3,
      quantityUnit: 'm³',
      massT: q.concreteKg / 1000,
      capacity: a.mixerCapacity,
      offsiteKm: a.distConcreteKm,
    },
    {
      material: 'rebar',
      label: 'Reinforcement steel',
      vehicle: 'Materials truck',
      phase: 'structure',
      quantity: q.rebarKg / 1000,
      quantityUnit: 't',
      massT: q.rebarKg / 1000,
      capacity: a.truckPayload,
      offsiteKm: a.distSteelKm,
    },
    {
      material: 'masonry',
      label: 'Brick masonry',
      vehicle: 'Materials truck',
      phase: 'finishing',
      quantity: q.masonryKg / 1000,
      quantityUnit: 't',
      massT: q.masonryKg / 1000,
      capacity: a.truckPayload,
      offsiteKm: a.distMasonryKm,
    },
    {
      material: 'glass',
      label: 'Glass and aluminium',
      vehicle: 'Materials truck',
      phase: 'finishing',
      quantity: (q.glassKg + q.aluminiumKg) / 1000,
      quantityUnit: 't',
      massT: (q.glassKg + q.aluminiumKg) / 1000,
      capacity: a.truckPayload,
      offsiteKm: a.distGlassKm,
    },
  ];
  return rows.map((r) => {
    // Tolerance stops float noise (e.g. 1,215.00002) adding a whole load.
    const loads = Math.ceil(r.quantity / r.capacity - 1e-6);
    const trips = 2 * loads;
    const days = programme[r.phase] * a.workingDaysPerMonth;
    const tripsPerDay = trips / days;
    const vktPerDay = (tripsPerDay * haulRouteM) / 1000;
    return {
      ...r,
      loads,
      trips,
      tripsPerDay,
      vktPerDay,
      totalVkt: (trips * haulRouteM) / 1000,
      offsiteTkm: r.massT * r.offsiteKm,
    };
  });
}

/** On-site VKT per working day in a phase, summed over materials. */
export function vktPerDayInPhase(flows: VehicleFlow[], phase: ConstructionPhaseId): number {
  return flows.filter((f) => f.phase === phase).reduce((s, f) => s + f.vktPerDay, 0);
}
