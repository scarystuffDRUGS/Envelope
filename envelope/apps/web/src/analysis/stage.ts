import type { BuildingState, ConstructionPhase, EmissionBreakdown } from '@envelope/models';
import { buildingStateForMonth } from '@envelope/models';

export interface StageText {
  title: string;
  /** What stands on site and what work is going on this month. */
  now: string;
  /** Main dust sources at the selected hour, or why there are none. */
  dust: string | null;
  /** What the next month brings, or that this is the last. */
  next: string;
}

const SOURCE_LABELS: Record<keyof Omit<EmissionBreakdown, 'total'>, string> = {
  activity: 'general construction activity',
  erosion: 'wind erosion of exposed soil',
  handling: 'material handling',
  haul: 'haul traffic on site',
  trackout: 'mud tracked onto the road',
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

function onSite(s: BuildingState, floors: number, basements: number): string {
  if (s.phase === 'excavation')
    return basements > 0
      ? `Digging the ${basements === 1 ? 'basement' : `${basements}-storey basement`}: ${pct(s.excavationProgress)} dug. Tippers carry the spoil away.`
      : `Clearing the plot and digging the foundations: ${pct(s.excavationProgress)} done.`;
  if (s.phase === 'structure') {
    const cast = Math.floor(s.frameFloors + 1e-9);
    const casting = s.frameFloors - cast > 1e-6;
    return casting
      ? `RCC frame: ${cast} of ${floors} floors cast; floor ${cast + 1} is in formwork, with rebar and concrete arriving.`
      : `RCC frame: ${cast} of ${floors} floors cast (columns, beams and slabs).`;
  }
  return s.envelopeProgress >= 1
    ? 'Building complete: walls, glazing and services finished; snagging and handover.'
    : `Walls, glazing and services: the envelope is ${pct(s.envelopeProgress)} closed, from the ground up.`;
}

/** Plain-language description of a construction month for the stage card on the map (D-034). */
export function describeStage(opts: {
  month: number;
  floors: number;
  basements: number;
  schedule: readonly ConstructionPhase[];
  /** Emissions at the selected hour, kg/h by source; null when the dust model has not run. */
  emissions: EmissionBreakdown | null;
}): StageText {
  const { floors, schedule } = opts;
  const total = schedule.reduce((n, p) => n + p.months, 0);
  const month = Math.min(Math.max(1, Math.round(opts.month)), total);
  const s = buildingStateForMonth(month, floors, schedule);

  let dust: string | null = null;
  if (opts.emissions) {
    const ranked = (Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[])
      .filter((k) => opts.emissions![k] > 0.05 * opts.emissions!.total)
      .sort((a, b) => opts.emissions![b] - opts.emissions![a])
      .slice(0, 2)
      .map((k) => SOURCE_LABELS[k]);
    dust =
      opts.emissions.total <= 0 || !ranked.length
        ? 'No dusty work at the selected hour: the site works 08:00–20:00, Monday to Saturday.'
        : `Main dust sources at the selected hour: ${ranked.join(' and ')}.`;
  }

  let next: string;
  if (month >= total) next = 'Last month of the programme.';
  else {
    const n = buildingStateForMonth(month + 1, floors, schedule);
    const lead =
      n.phase !== s.phase
        ? `Next month the ${n.phaseLabel.toLowerCase()} phase starts.`
        : n.phase === 'structure'
          ? `Next month the frame reaches ${Math.floor(n.frameFloors + 1e-9) || 1} of ${floors} floors.`
          : n.phase === 'finishing'
            ? `Next month the envelope is ${pct(n.envelopeProgress)} closed.`
            : `Next month the dig is ${pct(n.excavationProgress)} done.`;
    next = `${lead} The building is complete in month ${total}.`;
  }

  return {
    title: `Month ${month} of ${total} · ${s.phaseLabel}`,
    now: onSite(s, floors, opts.basements),
    dust,
    next,
  };
}
