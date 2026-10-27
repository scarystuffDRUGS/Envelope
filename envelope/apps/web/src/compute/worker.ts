import type { EngineData, EngineInput, ScenarioResult } from '@envelope/models';
import { Engine } from '@envelope/models';
import * as Comlink from 'comlink';

/** Runs the models off the main thread. One engine per loaded site. */
let engine: Engine | null = null;

const api = {
  init(data: EngineData): void {
    engine = new Engine(data);
  },
  run(
    baseline: EngineInput,
    mitigated: EngineInput,
  ): { baseline: ScenarioResult; mitigated: ScenarioResult } {
    if (!engine) throw new Error('Engine not initialised');
    return { baseline: engine.run(baseline), mitigated: engine.run(mitigated) };
  },
};

export type ComputeApi = typeof api;
Comlink.expose(api);
