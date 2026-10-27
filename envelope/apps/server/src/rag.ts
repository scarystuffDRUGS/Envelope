import type { PassageSet, RagIndex, ReportPayload } from '@envelope/report';
import { Retriever, planRetrieval } from '@envelope/report';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from './env';

let cached: Retriever | null | undefined;

/**
 * The committed retrieval index (corpus/index.json, D-036), loaded once per instance. Missing or
 * unreadable → null, and reports are written without citations as before.
 */
export function getRetriever(): Retriever | null {
  if (cached !== undefined) return cached;
  try {
    const index = JSON.parse(readFileSync(resolve(env.corpusDir, 'index.json'), 'utf8')) as RagIndex;
    cached = index.chunks.length ? new Retriever(index) : null;
  } catch (err) {
    console.warn('[rag] no index, narrative without citations:', (err as Error).message);
    cached = null;
  }
  return cached;
}

export function retrievePassages(payload: ReportPayload): PassageSet | null {
  return getRetriever()?.retrieve(planRetrieval(payload)) ?? null;
}

export function ragStatus(): { docs: number; chunks: number; builtAt: string | null } {
  const r = getRetriever();
  return {
    docs: r?.index.docs.length ?? 0,
    chunks: r?.index.chunks.length ?? 0,
    builtAt: r?.index.builtAt ?? null,
  };
}
