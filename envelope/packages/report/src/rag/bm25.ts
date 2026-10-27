/**
 * Okapi BM25 keyword scoring (MODELS.md A.7).
 * src: Robertson & Zaragoza (2009), "The Probabilistic Relevance Framework: BM25 and Beyond",
 * Foundations and Trends in IR 3(4); IDF as log(1 + (N − n + 0.5)/(n + 0.5)), the non-negative
 * variant used by Lucene, so very common terms never score below zero.
 */

/** src: Manning, Raghavan & Schütze (2008), Introduction to Information Retrieval, §11.4.3. */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

const STOP = new Set(
  'a an and are as at be by for from has have in is it its of on or shall that the this to under was were which with within without not no any all such than other may be been into per'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9.]*[a-z0-9]|[a-z0-9]/g) ?? [])
    .filter((t) => !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

export class Bm25 {
  private readonly tf: Map<string, number>[];
  private readonly len: number[];
  private readonly df = new Map<string, number>();
  private readonly avgdl: number;

  constructor(docs: string[]) {
    this.tf = docs.map((d) => {
      const m = new Map<string, number>();
      for (const t of tokenize(d)) m.set(t, (m.get(t) ?? 0) + 1);
      return m;
    });
    this.len = this.tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
    for (const m of this.tf) for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avgdl = this.len.reduce((a, b) => a + b, 0) / Math.max(1, docs.length);
  }

  idf(term: string): number {
    const n = this.tf.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Score of every document for the query, in document order. */
  scores(query: string): number[] {
    const terms = [...new Set(tokenize(query))];
    return this.tf.map((m, i) => {
      let s = 0;
      for (const t of terms) {
        const f = m.get(t);
        if (!f) continue;
        const norm = BM25_K1 * (1 - BM25_B + (BM25_B * this.len[i]!) / this.avgdl);
        s += (this.idf(t) * f * (BM25_K1 + 1)) / (f + norm);
      }
      return s;
    });
  }
}
