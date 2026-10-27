import * as Comlink from 'comlink';
import type { ComputeApi } from './worker';

let remote: Comlink.Remote<ComputeApi> | null = null;

export function compute(): Comlink.Remote<ComputeApi> {
  if (!remote) {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    remote = Comlink.wrap<ComputeApi>(worker);
  }
  return remote;
}
