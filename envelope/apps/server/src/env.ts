import { config } from 'dotenv';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '../../..');

/**
 * On Vercel the server runs as one bundled function (scripts/build-vercel.mjs): the file system
 * is read-only except the OS temp dir, and the demo snapshot is copied next to the bundle.
 */
export const onVercel = Boolean(process.env.VERCEL);

if (!onVercel) config({ path: resolve(repoRoot, '.env'), quiet: true });

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

function num(name: string, fallback: number): number {
  const v = Number(opt(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  port: Number(opt('SERVER_PORT') ?? 8787),
  cesiumIonToken: opt('CESIUM_ION_TOKEN'),
  googleMapsApiKey: opt('GOOGLE_MAPS_API_KEY'),
  geminiApiKey: opt('GEMINI_API_KEY'),
  geminiModel: opt('GEMINI_MODEL'),
  groqApiKey: opt('GROQ_API_KEY'),
  groqModel: opt('GROQ_MODEL'),
  openAqApiKey: opt('OPENAQ_API_KEY'),
  cacheDir: onVercel ? resolve(tmpdir(), 'envelope-cache') : resolve(repoRoot, '.cache'),
  snapshotDir: onVercel ? resolve(here, 'fixtures/demo') : resolve(repoRoot, 'fixtures/demo'),
  /** Report-narrative retrieval index (D-036), copied next to the bundle on Vercel. */
  corpusDir: onVercel ? resolve(here, 'corpus') : resolve(repoRoot, 'corpus'),
  /** Live fetches refresh the committed snapshot only in local runs. */
  writeSnapshots: !onVercel,
  /**
   * Per-visitor (IP) rate limits, best effort per server instance. Only on Vercel: locally they
   * guard nothing and the e2e suite reloads the app dozens of times from one address.
   */
  rateLimits: onVercel,
  reportLimit: num('REPORT_RATE_LIMIT', 5),
  reportWindowMs: num('REPORT_RATE_WINDOW_MIN', 10) * 60_000,
  siteDataLimit: num('SITE_DATA_RATE_LIMIT', 60),
};
