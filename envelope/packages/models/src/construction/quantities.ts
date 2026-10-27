import type { BuildingTakeoff } from '../building';
import type { Assumptions } from '../params';

/** Material quantities from geometry (MODELS.md A.5.1). Masses in kg, volumes in m³. */
export interface Quantities {
  gfaM2: number;
  concreteM3: number;
  concreteKg: number;
  rebarKg: number;
  masonryM3: number;
  masonryKg: number;
  glassKg: number;
  aluminiumKg: number;
  excavationBankM3: number;
  excavationLooseM3: number;
  spoilKg: number;
}

/**
 * `concreteM3` overrides the per-m² concrete intensity with a volume read from an imported
 * model's base quantities (MODELS.md A.6).
 */
export function quantities(
  t: BuildingTakeoff,
  floors: number,
  a: Assumptions,
  concreteM3Override?: number,
): Quantities {
  const gfaM2 = t.footprintAreaM2 * floors; // MODELS A.5.1: GFA = footprint × floors
  const concreteM3 = concreteM3Override ?? a.concreteIntensity * gfaM2; // src: HANDOVER A.4, 0.45 m³/m² [verify]
  const masonryM3 = (t.facadeAreaM2 - t.windowAreaM2) * a.wallThicknessM;
  const excavationBankM3 = t.footprintAreaM2 * a.basements * a.basementDepthM;
  return {
    gfaM2,
    concreteM3,
    concreteKg: concreteM3 * a.concreteDensity,
    rebarKg: a.rebarIntensity * gfaM2, // src: HANDOVER A.4, 45 kg/m² [verify]
    masonryM3,
    masonryKg: masonryM3 * a.masonryDensity,
    glassKg: t.windowAreaM2 * a.glassThicknessM * 2500, // src: HANDOVER A.4, 2,500 kg/m³ glass
    aluminiumKg: t.windowAreaM2 * a.aluFrameKgPerM2,
    excavationBankM3,
    excavationLooseM3: excavationBankM3 * a.bulkingFactor,
    spoilKg: excavationBankM3 * a.soilDensity,
  };
}
