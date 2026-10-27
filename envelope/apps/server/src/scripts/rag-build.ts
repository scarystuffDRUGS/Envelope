/**
 * Builds the report-narrative retrieval index (D-036, MODELS.md A.7):
 *   corpus/manifest.json + corpus/raw/*.pdf → clean text → chunks → embeddings → corpus/index.json
 *
 *   pnpm rag:build            index every manifest document whose PDF is present
 *   pnpm rag:build --probe    print page counts and the cleaned first lines, no embeddings
 *
 * Embeddings: BAAI/bge-small-en-v1.5 (MIT), int8 ONNX via @huggingface/transformers, run locally.
 * The model (~35 MB) is downloaded once into .cache/models.
 */
import type { Chunk, CorpusDoc, RagIndex } from '@envelope/report';
import { allQueryTexts, chunkPages, cleanPages, encodeVector } from '@envelope/report';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../env';

const MODEL = 'Xenova/bge-small-en-v1.5';
/** src: BAAI bge-small-en-v1.5 model card: query instruction for short-query → passage retrieval. */
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

const corpusDir = resolve(repoRoot, 'corpus');
const probe = process.argv.includes('--probe');

interface ManifestDoc extends CorpusDoc {
  file: string;
  pages?: [number, number];
}

interface TextItem {
  str: string;
  hasEOL?: boolean;
  transform: number[];
  width: number;
}

/** Text lines per page, rebuilt from pdf.js text items (spaces from x gaps, breaks from EOL or y jumps). */
async function pdfLines(file: string): Promise<string[][]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
  const pages: string[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items as TextItem[];
    const lines: string[] = [];
    let line = '';
    let prev: TextItem | null = null;
    for (const it of items) {
      if (prev && Math.abs(it.transform[5]! - prev.transform[5]!) > 2 && line) {
        lines.push(line);
        line = '';
      } else if (prev && line && !line.endsWith(' ') && !it.str.startsWith(' ')) {
        const gap = it.transform[4]! - (prev.transform[4]! + prev.width);
        // Relative to font size: kerned glyph runs have small gaps, word spaces about 0.25 em.
        if (gap > 0.15 * Math.abs(it.transform[0]!)) line += ' ';
      }
      line += it.str;
      prev = it;
      if (it.hasEOL) {
        lines.push(line);
        line = '';
        prev = null;
      }
    }
    if (line) lines.push(line);
    pages.push(lines);
  }
  return pages;
}

async function embedder() {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = resolve(repoRoot, '.cache/models');
  const extract = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  return async (texts: string[]): Promise<number[][]> => {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const t = await extract(texts.slice(i, i + 16), { pooling: 'cls', normalize: true });
      out.push(...(t.tolist() as number[][]));
      process.stdout.write(`\r[rag] embedded ${Math.min(i + 16, texts.length)}/${texts.length}`);
    }
    process.stdout.write('\n');
    return out;
  };
}

const manifest = JSON.parse(readFileSync(resolve(corpusDir, 'manifest.json'), 'utf8')) as {
  docs: ManifestDoc[];
};
const docs: CorpusDoc[] = [];
const chunks: Chunk[] = [];
const missing: ManifestDoc[] = [];
for (const d of manifest.docs) {
  const file = resolve(corpusDir, 'raw', d.file);
  if (!existsSync(file)) {
    missing.push(d);
    continue;
  }
  let pages = cleanPages(await pdfLines(file));
  if (d.pages) pages = pages.map((p, i) => (i + 1 >= d.pages![0] && i + 1 <= d.pages![1] ? p : []));
  const c = chunkPages(d.id, pages);
  const words = pages.flat().join(' ').split(' ').length;
  console.log(`[rag] ${d.id}: ${pages.length} pages, ${words} words, ${c.length} chunks`);
  if (probe)
    console.log(
      pages
        .slice(0, 2)
        .flat()
        .slice(0, 25)
        .map((l) => `    | ${l}`)
        .join('\n'),
    );
  if (words < 50 * pages.length * 0.2) console.warn(`[rag] ${d.id}: little text; scanned PDF? needs OCR`);
  const { file: _f, pages: _p, ...meta } = d;
  docs.push(meta);
  chunks.push(...c);
}
for (const d of missing) console.warn(`[rag] missing ${d.file} (${d.id}): download from ${d.url}`);

if (!probe) {
  const embed = await embedder();
  const vectors = (await embed(chunks.map((c) => (c.section ? `${c.section}. ${c.text}` : c.text)))).map(
    encodeVector,
  );
  const qs = allQueryTexts();
  const qv = await embed(qs.map((q) => QUERY_PREFIX + q));
  const index: RagIndex = {
    version: 1,
    model: MODEL,
    dim: qv[0]?.length ?? 0,
    builtAt: new Date().toISOString(),
    docs,
    chunks,
    vectors,
    queries: Object.fromEntries(qs.map((q, i) => [q, encodeVector(qv[i]!)])),
  };
  const out = resolve(corpusDir, 'index.json');
  writeFileSync(out, JSON.stringify(index));
  const mb = (Buffer.byteLength(JSON.stringify(index)) / 1e6).toFixed(2);
  console.log(`[rag] wrote corpus/index.json: ${docs.length} docs, ${chunks.length} chunks, ${mb} MB`);
}
