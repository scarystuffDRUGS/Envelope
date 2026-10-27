/**
 * Packs the project into ../Envelope-share.zip for testing on another computer: everything except
 * installed dependencies, build output, caches and git history. A local .env (API keys) is
 * included when it exists, so the copy runs with the same keys; anyone with the zip can use them.
 *
 *   pnpm pack:share
 *
 * The recipient follows TESTING.md (pnpm i, playwright install chromium, pnpm dev).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '..', 'Envelope-share.zip');

/**
 * Directories left out anywhere in the tree (recreated by pnpm i, builds or tests). Hidden
 * directories (.git, .cache, local tool settings) are always left out; hidden files such as .env stay.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'blob-report',
  'coverage',
]);
const SKIP_FILES = [/\.tsbuildinfo$/, /^\.DS_Store$/];

const stage = mkdtempSync(join(tmpdir(), 'envelope-share-'));
const target = join(stage, 'envelope');
cpSync(root, target, {
  recursive: true,
  filter: (src) => {
    const rel = relative(root, src);
    if (!rel) return true;
    const parts = rel.split(sep);
    if (parts.some((p) => SKIP_DIRS.has(p))) return false;
    if (basename(src).startsWith('.') && statSync(src).isDirectory()) return false;
    return !SKIP_FILES.some((re) => re.test(basename(src)));
  },
});

rmSync(out, { force: true });
if (process.platform === 'win32') {
  // Windows 10+ ships bsdtar, which writes zip archives with -a and a .zip name.
  execFileSync(
    join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
    ['-a', '-cf', out, '-C', stage, 'envelope'],
    {
      stdio: 'inherit',
    },
  );
} else {
  execFileSync('zip', ['-qr', out, 'envelope'], { cwd: stage, stdio: 'inherit' });
}
rmSync(stage, { recursive: true, force: true });

console.log(`[pack-share] wrote ${out}`);
console.log(
  existsSync(resolve(root, '.env'))
    ? '[pack-share] .env included: the API keys in it travel with the zip.'
    : '[pack-share] no .env found: the copy runs without keys (OpenStreetMap map, template report narrative).',
);
