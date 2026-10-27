import type { Assumptions } from '../params';
import type { Quantities } from './quantities';
import type { ConstructionPhase, ConstructionPhaseId } from './schedule';

/** Whole months per phase (MODELS.md A.5.2). */
export type ProgrammeMonths = Record<ConstructionPhaseId, number>;

export const PHASE_LABELS: Record<ConstructionPhaseId, string> = {
  excavation: 'Excavation',
  structure: 'Structure',
  finishing: 'Finishing',
};

export function programmeTotal(p: ProgrammeMonths): number {
  return p.excavation + p.structure + p.finishing;
}

/** Auto-derived programme from the building: excavation rate, floor cycle, finishing share. */
export function autoProgramme(q: Quantities, floors: number, a: Assumptions): ProgrammeMonths {
  const days = a.workingDaysPerMonth;
  const excavation = Math.max(1, Math.ceil(q.excavationBankM3 / a.excavationRate / days));
  const structure = Math.max(1, Math.ceil(((floors + a.basements) * a.floorCycleDays) / days));
  const finishing = Math.max(1, Math.ceil(structure * a.finishingShare));
  return { excavation, structure, finishing };
}

/**
 * Scales phases to a new total, keeping their proportions. Phases are whole months
 * (≥ 1); the rounding remainder goes to the structure phase.
 */
export function scaleProgramme(p: ProgrammeMonths, newTotal: number): ProgrammeMonths {
  const total = programmeTotal(p);
  const target = Math.max(3, Math.round(newTotal));
  const excavation = Math.max(1, Math.round((p.excavation * target) / total));
  const finishing = Math.max(1, Math.round((p.finishing * target) / total));
  const structure = Math.max(1, target - excavation - finishing);
  return { excavation, structure, finishing };
}

export interface ProgrammeCheck {
  errors: string[];
  warnings: string[];
}

/** Rejects non-positive phases; warns when a phase is below half its auto value (unrealistic trip rates). */
export function checkProgramme(user: ProgrammeMonths, auto: ProgrammeMonths): ProgrammeCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const id of ['excavation', 'structure', 'finishing'] as const) {
    const v = user[id];
    if (!Number.isFinite(v) || v <= 0) errors.push(`${PHASE_LABELS[id]} must be at least 1 month.`);
    else if (v < 0.5 * auto[id])
      warnings.push(
        `${PHASE_LABELS[id]} is under half the derived ${auto[id]} months, which implies a very high daily truck rate.`,
      );
  }
  return { errors, warnings };
}

export function toSchedule(p: ProgrammeMonths): ConstructionPhase[] {
  return (['excavation', 'structure', 'finishing'] as const).map((id) => ({
    id,
    label: PHASE_LABELS[id],
    months: p[id],
  }));
}
