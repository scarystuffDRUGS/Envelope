import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BackgroundModel, FlatTree } from './background';
import { backgroundFeatures, predictRow } from './background';

const data = (f: string) => resolve(__dirname, 'data', f);
const fx = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/demo', f), 'utf8'));

describe('tree evaluator (hand-checked)', () => {
  // x0 <= 5 → leaf 0.5; else x1 <= 2 (NaN goes left) → leaf 1.0 / leaf 2.0. Leaves are ~index.
  const t: FlatTree = {
    root: 0,
    f: [0, 1],
    t: [5, 2],
    l: [-1, -2],
    r: [1, -3],
    d: [0, 1],
    m: [0, 2],
    v: [0.5, 1, 2],
  };
  const model: BackgroundModel = {
    pollutant: 'pm10',
    transform: 'log1p',
    smear: 1,
    features: ['a', 'b'],
    trees: [t],
  };

  it('walks splits and missing values like LightGBM, then undoes log1p with the smearing factor', () => {
    expect(predictRow(model, Float64Array.from([4, 9]))).toBeCloseTo(Math.expm1(0.5), 9);
    expect(predictRow(model, Float64Array.from([6, 3]))).toBeCloseTo(Math.expm1(2), 9);
    expect(predictRow(model, Float64Array.from([6, Number.NaN]))).toBeCloseTo(Math.expm1(1), 9);
    // Missing type None: NaN is compared as 0, so x0 = NaN goes left (0 <= 5).
    expect(predictRow(model, Float64Array.from([Number.NaN, 9]))).toBeCloseTo(Math.expm1(0.5), 9);
    // Smearing: y = expm1(s)·S + S − 1.
    expect(predictRow({ ...model, smear: 1.1 }, Float64Array.from([4, 9]))).toBeCloseTo(
      Math.expm1(0.5) * 1.1 + 0.1,
      9,
    );
  });
});

describe.runIf(existsSync(data('parity-features.json')))('parity with ml/train.py', () => {
  it('computes the same features as pandas from the demo snapshot', () => {
    const w = fx('weather.json').data.series;
    const a = fx('airQuality.json').data;
    const cols = backgroundFeatures({ time: w.time, weather: w.values, air: a.values });
    const p = JSON.parse(readFileSync(data('parity-features.json'), 'utf8')) as {
      index: number[];
      rows: Record<string, number | null>[];
    };
    p.index.forEach((i, k) => {
      for (const [name, v] of Object.entries(p.rows[k]!)) {
        const got = cols[name]![i]!;
        if (v === null) expect(Number.isNaN(got), `${name}[${i}]`).toBe(true);
        else expect(got, `${name}[${i}]`).toBeCloseTo(v, 6);
      }
    });
  });

  for (const pol of ['pm10', 'pm25'] as const) {
    it(`predicts what LightGBM predicts (${pol})`, () => {
      const model = JSON.parse(readFileSync(data(`background-${pol}.json`), 'utf8')) as BackgroundModel;
      const p = JSON.parse(readFileSync(data(`parity-${pol}.json`), 'utf8')) as {
        rows: Record<string, number | null>[];
        pred: number[];
      };
      p.rows.forEach((row, i) => {
        const x = Float64Array.from(model.features.map((f) => row[f] ?? Number.NaN));
        expect(predictRow(model, x)).toBeCloseTo(p.pred[i]!, 2);
      });
    });
  }
});
