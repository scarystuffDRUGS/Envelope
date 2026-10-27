/**
 * Hybrid retrieval (MODELS.md A.7): cosine similarity of precomputed embeddings and BM25,
 * merged by reciprocal rank fusion. No model and no network at run time.
 */
import type { Cite } from '../template';
import { Bm25, tokenize } from './bm25';
import type { SectionPlan } from './queries';
import { SECTION_QUERIES } from './queries';
import type { Passage, RagIndex } from './types';

/** src: Cormack, Clarke & Büttcher (2009), "Reciprocal rank fusion outperforms Condorcet and individual rank learning methods", SIGIR, k = 60. */
export const RRF_K = 60;
/** Ranks beyond this depth do not enter the fusion (Envelope default). */
const DEPTH = 50;
/** Relevance floor on query–chunk cosine (Envelope default, calibrated on this corpus; MODELS.md A.7). */
export const MIN_COSINE = 0.72;
export const PER_SECTION = 3;
/** A section with more distinct queries (compliance rows, measures) may take up to this many. */
export const PER_SECTION_MAX = 5;
export const MAX_PASSAGES = 24;
/** Distinct query terms a chunk must share with a payload query that names no document (Envelope default). */
export const MIN_SHARED_TERMS = 3;
/** Words of each passage sent to the LLM (Envelope default; prompt size, MODELS.md A.7). */
export const QUOTE_WORDS = 90;

export function decodeVector(b64: string): Int8Array {
  const bin = atob(b64);
  const out = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
  return out;
}

export function encodeVector(unit: ArrayLike<number>): string {
  let bin = '';
  for (let i = 0; i < unit.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round(unit[i]! * 127)));
    bin += String.fromCharCode(q & 0xff);
  }
  return btoa(bin);
}

function dot(a: Int8Array, b: Int8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** [a1, b1, a2, b2, …], then the rest of the longer list. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

/** 1-based rank of each document in descending score order; documents scoring 0 are unranked. */
function ranks(scores: number[]): Map<number, number> {
  const order = scores
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, DEPTH);
  return new Map(order.map(([, i], r) => [i, r + 1]));
}

export class Retriever {
  private readonly vectors: Int8Array[];
  private readonly queryVecs = new Map<string, Int8Array>();
  private readonly bm25: Bm25;

  constructor(readonly index: RagIndex) {
    this.vectors = index.vectors.map(decodeVector);
    for (const [q, v] of Object.entries(index.queries)) this.queryVecs.set(q, decodeVector(v));
    this.bm25 = new Bm25(index.chunks.map((c) => `${c.section} ${c.text}`));
  }

  /** Cosine similarity of each chunk to its closest query; null when no query has a vector. */
  cosines(queries: string[]): number[] | null {
    const qvs = queries.map((q) => this.queryVecs.get(q)).filter((v): v is Int8Array => Boolean(v));
    if (!qvs.length) return null;
    return this.vectors.map((v) => Math.max(...qvs.map((q) => dot(q, v) / (127 * 127))));
  }

  /**
   * Fused ranking of the chunks for a set of queries, best first. With a relevance floor, chunks
   * below MIN_COSINE to every query are left out, so a section whose source is not in the corpus
   * gets no passages rather than unrelated ones.
   */
  rank(queries: string[], docFilter?: (docId: string) => boolean, floor = true): number[] {
    const n = this.index.chunks.length;
    const lists: Map<number, number>[] = [];
    for (const q of queries) {
      const qv = this.queryVecs.get(q);
      if (qv) lists.push(ranks(this.vectors.map((v) => Math.max(0, dot(qv, v)))));
      lists.push(ranks(this.bm25.scores(q)));
    }
    const cos = floor ? this.cosines(queries) : null;
    const fused = new Array<number>(n).fill(0);
    for (const l of lists) for (const [i, r] of l) fused[i] = fused[i]! + 1 / (RRF_K + r);
    return fused
      .map((s, i) => [s, i] as const)
      .filter(([s, i]) => s > 0 && (!cos || cos[i]! >= MIN_COSINE))
      .filter(([, i]) => !docFilter || docFilter(this.index.chunks[i]!.doc))
      .sort((a, b) => b[0] - a[0])
      .map(([, i]) => i);
  }

  /** Corpus documents a text names through their aliases ("EIA Notification 2006, item 8(a)"). */
  docsNamedIn(text: string): Set<string> {
    const named = new Set<string>();
    for (const d of this.index.docs)
      for (const a of d.aliases ?? []) {
        const re = new RegExp(`(?<![A-Za-z])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i');
        if (re.test(text)) named.add(d.id);
      }
    return named;
  }

  /**
   * BM25 ranking for a payload keyword query (no vector at run time). A query that names a corpus
   * document searches that document; any other is limited to chunks that clear the section's
   * relevance floor and share at least MIN_SHARED_TERMS distinct terms with the query.
   */
  rankKeywords(text: string, eligible: boolean[] | null): number[] {
    const named = this.docsNamedIn(text);
    const terms = new Set(tokenize(text));
    const shared = (i: number) =>
      new Set(
        tokenize(`${this.index.chunks[i]!.section} ${this.index.chunks[i]!.text}`).filter((t) =>
          terms.has(t),
        ),
      ).size;
    return this.bm25
      .scores(text)
      .map((s, i) => [s, i] as const)
      .filter(([s, i]) =>
        s > 0 && named.size
          ? named.has(this.index.chunks[i]!.doc)
          : s > 0 && (!eligible || eligible[i]) && shared(i) >= MIN_SHARED_TERMS,
      )
      .sort((a, b) => b[0] - a[0])
      .slice(0, DEPTH)
      .map(([, i]) => i);
  }

  /**
   * Top passages per section, shared across sections and numbered S1… in order of selection.
   * Two passes: every section first gets up to `perSection`, then sections with more distinct
   * queries take extra passages (up to PER_SECTION_MAX) while the report total allows.
   */
  retrieve(plans: SectionPlan[], perSection = PER_SECTION, max = MAX_PASSAGES): PassageSet {
    const set = new PassageSet(this);
    const sections = plans.map(({ section, queries, keywords }) => {
      const eligible = this.cosines(queries)?.map((c) => c >= MIN_COSINE) ?? null;
      const fixed = queries.map((q) => this.rank([q]));
      const payload = keywords.map((k) => this.rankKeywords(k, eligible));
      // Round robin over the queries' own rankings, payload queries first, so each query's best
      // passage is taken rather than passages that match every query a little.
      const lists = interleave(payload, fixed);
      return {
        section,
        lists,
        taken: new Set<number>(),
        limit: Math.min(PER_SECTION_MAX, Math.max(perSection, lists.length)),
      };
    });
    for (const quota of ['base', 'extra'] as const) {
      for (const s of sections) {
        const upto = quota === 'base' ? Math.min(perSection, s.limit) : s.limit;
        for (let depth = 0; s.taken.size < upto && s.lists.some((l) => depth < l.length); depth++) {
          for (const l of s.lists) {
            const i = l[depth];
            if (i === undefined || s.taken.size >= upto || set.size >= max) continue;
            // Overlapping neighbours of a chunk already taken for this section add little.
            if (s.taken.has(i) || set.hasNeighbour(i, s.section)) continue;
            set.add(i, s.section);
            s.taken.add(i);
          }
          if (set.size >= max) break;
        }
      }
    }
    // The LLM gets the part of each chunk that matches its sections' queries, not all 220 words.
    for (const p of set.passages) {
      const qs = plans
        .filter((pl) => p.forSections.includes(pl.section))
        .flatMap((pl) => [...pl.queries, ...pl.keywords]);
      p.quote = excerpt(p.text, qs, QUOTE_WORDS);
    }
    return set;
  }
}

/**
 * The sentences of a chunk that best match the queries, kept in reading order, up to `words`
 * words: the best-scoring sentence first, then its neighbours. Scores are query-term overlap.
 */
export function excerpt(text: string, queries: string[], words: number): string {
  const sentences = text.split(/(?<=[.;:])\s+(?=[A-Z(0-9])/).filter(Boolean);
  if (text.split(' ').length <= words || sentences.length <= 1)
    return text.split(' ').slice(0, words).join(' ');
  const terms = new Set(queries.flatMap(tokenize));
  const score = sentences.map((s) => tokenize(s).filter((t) => terms.has(t)).length);
  const best = score.indexOf(Math.max(...score));
  let lo = best;
  let hi = best;
  const len = (a: number, b: number) =>
    sentences
      .slice(a, b + 1)
      .join(' ')
      .split(' ').length;
  while (true) {
    const canDown = lo > 0 && len(lo - 1, hi) <= words;
    const canUp = hi < sentences.length - 1 && len(lo, hi + 1) <= words;
    if (!canDown && !canUp) break;
    // Grow toward the better-scoring neighbour.
    if (canUp && (!canDown || score[hi + 1]! >= score[lo - 1]!)) hi++;
    else lo--;
  }
  return sentences
    .slice(lo, hi + 1)
    .join(' ')
    .split(' ')
    .slice(0, words)
    .join(' ');
}

export class PassageSet {
  private readonly byChunk = new Map<number, Passage>();

  constructor(private readonly r: Retriever) {}

  get size(): number {
    return this.byChunk.size;
  }

  get passages(): Passage[] {
    return [...this.byChunk.values()];
  }

  hasNeighbour(i: number, section: string): boolean {
    // Chunk ids are "<doc>#<window>"; windows k and k + 1 overlap.
    const win = (id: string) => Number(id.split('#')[1]);
    const c = this.r.index.chunks[i]!;
    return this.passages.some(
      (p) =>
        p.forSections.includes(section) && p.doc.id === c.doc && Math.abs(win(p.chunk) - win(c.id)) === 1,
    );
  }

  /** Adds chunk i (or records the extra section) and returns its passage id. */
  add(i: number, section: string): string {
    const existing = this.byChunk.get(i);
    if (existing) {
      if (!existing.forSections.includes(section)) existing.forSections.push(section);
      return existing.id;
    }
    const c = this.r.index.chunks[i]!;
    const doc = this.r.index.docs.find((d) => d.id === c.doc)!;
    const p: Passage = {
      id: `S${this.byChunk.size + 1}`,
      chunk: c.id,
      doc,
      section: c.section,
      page: c.page,
      text: c.text,
      forSections: [section],
    };
    this.byChunk.set(i, p);
    return p.id;
  }

  /**
   * Passage id from a given document for the template writer: a passage already retrieved from
   * it, else its best chunk for the queries. Undefined when the document is not in the index.
   */
  forDoc(docId: string, section: string, queries: string[]): string | undefined {
    const have = this.passages.find((p) => p.doc.id === docId);
    if (have) {
      if (!have.forSections.includes(section)) have.forSections.push(section);
      return have.id;
    }
    const best =
      this.r.rank(queries, (d) => d === docId, false)[0] ??
      this.r.index.chunks.findIndex((c) => c.doc === docId);
    return best < 0 ? undefined : this.add(best, section);
  }

  /** Citation callback for the template writer. */
  citer(): Cite {
    return (section, ...docIds) =>
      docIds
        .map((d) => this.forDoc(d, section, SECTION_QUERIES[section] ?? []))
        .filter((id): id is string => Boolean(id));
  }
}
