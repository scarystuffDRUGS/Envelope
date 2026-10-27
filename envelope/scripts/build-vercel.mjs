/**
 * Builds the Vercel deployment with the Build Output API (https://vercel.com/docs/build-output-api):
 *
 *   .vercel/output/static/                 the Vite web app (apps/web/dist)
 *   .vercel/output/functions/api/index.func one Node function: the Hono server bundled by esbuild,
 *                                           the demo snapshot, the report retrieval index
 *                                           (corpus/index.json), and an npm install of the two
 *                                           packages that cannot be bundled (Chromium locates its
 *                                           binary relative to its own package)
 *   .vercel/output/config.json             routes: /api/* → function, assets, SPA fallback
 *
 * Run by Vercel as the build command (vercel.json); also runs locally with `pnpm build:vercel`.
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '.vercel/output');
const func = resolve(out, 'functions/api/index.func');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

/** Packages the function installs from npm instead of bundling. Versions follow apps/server. */
const UNBUNDLED = ['@sparticuz/chromium', 'playwright-core'];
/** Local-only import (Playwright's own browser); never loaded on Vercel. */
const LOCAL_ONLY = ['playwright'];

rmSync(out, { recursive: true, force: true });

console.log('[build-vercel] web app');
run('pnpm --filter @envelope/web build');
cpSync(resolve(root, 'apps/web/dist'), resolve(out, 'static'), { recursive: true });

console.log('[build-vercel] API function');
mkdirSync(func, { recursive: true });
await build({
  entryPoints: [resolve(root, 'apps/server/src/vercel.ts')],
  outfile: resolve(func, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'linked',
  external: [...UNBUNDLED, ...LOCAL_ONLY],
  // CommonJS dependencies (dotenv) call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
cpSync(resolve(root, 'fixtures/demo'), resolve(func, 'fixtures/demo'), { recursive: true });
// Retrieval index for cited report narrative (D-036); read-only, loaded once per instance.
mkdirSync(resolve(func, 'corpus'), { recursive: true });
cpSync(resolve(root, 'corpus/index.json'), resolve(func, 'corpus/index.json'));

const serverPkg = JSON.parse(readFileSync(resolve(root, 'apps/server/package.json'), 'utf8'));
const dependencies = Object.fromEntries(UNBUNDLED.map((name) => [name, serverPkg.dependencies[name]]));
writeFileSync(
  resolve(func, 'package.json'),
  JSON.stringify({ name: 'envelope-api', private: true, type: 'module', dependencies }, null, 2),
);
run('npm install --omit=dev --no-audit --no-fund --no-package-lock --loglevel=error', func);

writeFileSync(
  resolve(func, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      // Report = LLM narrative (≤ 80 s budget) + Chromium cold start and PDF rendering.
      maxDuration: 120,
    },
    null,
    2,
  ),
);

writeFileSync(
  resolve(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '^/assets/(.*)$',
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
          continue: true,
        },
        { src: '^/cesium/(.*)$', headers: { 'cache-control': 'public, max-age=604800' }, continue: true },
        { src: '^/api/(.*)$', dest: '/api/index' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('[build-vercel] done → .vercel/output');
