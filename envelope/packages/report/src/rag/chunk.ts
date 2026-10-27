/**
 * PDF text → clean text → chunks with section and page (MODELS.md A.7). Pure functions: the
 * PDF parsing itself lives in the build script, which hands over the text lines of each page.
 */
import type { Chunk } from './types';

/** Chunk length and overlap in words (Envelope defaults, MODELS.md A.7). */
export const CHUNK_WORDS = 220;
export const OVERLAP_WORDS = 40;

const DEVANAGARI = /[ऀ-ॿ]/g;

/** Digits normalised, so "Page 3 of 20" and "Page 4 of 20" count as the same running header. */
const lineKey = (l: string) => l.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Removes running headers and footers (lines repeated on at least 40% of pages, given 3+ pages),
 * page numbers, mostly-Hindi lines of bilingual Gazette pages, and rejoins hyphenated words.
 */
export function cleanPages(pages: string[][]): string[][] {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    for (const k of new Set(lines.map(lineKey))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const repeated = (l: string) => pages.length >= 3 && (counts.get(lineKey(l)) ?? 0) >= 0.4 * pages.length;
  return pages.map((lines) => {
    const kept = lines
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0)
      .filter((l) => !/^(page\s*)?[\divxlc]+(\s*(of|\/)\s*\d+)?$/i.test(l))
      // Superscript reference numbers ("23, 26", "1-3") come out as lines of their own.
      .filter((l) => !/^\d[\d,\s–-]{0,11}$/.test(l))
      .filter((l) => (l.match(DEVANAGARI) ?? []).length < 0.3 * l.length)
      .filter((l) => !repeated(l));
    const out: string[] = [];
    for (const l of kept) {
      const prev = out[out.length - 1];
      if (prev && /[a-z]-$/.test(prev) && /^[a-z]/.test(l)) out[out.length - 1] = prev.slice(0, -1) + l;
      // Superscript ordinals ("18" + "th") and stray punctuation rejoin the previous line.
      else if (prev && (/^(st|nd|rd|th)$/.test(l) || /^[.,;:)]/.test(l))) out[out.length - 1] = prev + l;
      else out.push(l);
    }
    return out;
  });
}

/**
 * Headings: numbered ("13.2.5.3 Emissions", "8. Building and construction"), schedule and
 * annex titles, or short upper-case lines.
 */
export function isHeading(line: string): boolean {
  if (line.length > 90 || /[.,;:]$/.test(line)) return false;
  if (/^\d+(\.\d+){0,4}\.?\s+[A-Z(][^]{2,}$/.test(line) && line.split(' ').length <= 12) return true;
  if (/^(SCHEDULE|APPENDIX|ANNEX(URE)?|CHAPTER|PART|Schedule|Appendix|Annex(ure)?|Chapter)\b/.test(line))
    return true;
  if (/^(references|bibliography)\b/i.test(line) && line.split(' ').length <= 8) return true;
  const letters = line.replace(/[^A-Za-z]/g, '');
  return letters.length >= 6 && letters === letters.toUpperCase() && line.split(' ').length <= 10;
}

/**
 * Bibliography and numeric-table windows: nothing the narrative can cite as a statement (and
 * their numbers may not be quoted anyway). A window under a "References" heading, with six or
 * more citation-style years ("… May 1984. "), or over 35% numeric tokens. Plain year counts
 * are not used: consolidated notifications cite many amendment dates.
 */
export function isReferenceOrTable(text: string, section = ''): boolean {
  if (/^(references|bibliography)\b/i.test(section)) return true;
  const tokens = text.split(' ');
  const citationYears = (text.match(/\b(19|20)\d\d\.(\s|$)/g) ?? []).length;
  const numeric = tokens.filter((t) => /^[\d.,%<>–-]+$/.test(t)).length;
  return citationYears >= 6 || numeric > 0.35 * tokens.length;
}

/** Splits cleaned pages into overlapping word windows, each tagged with its heading and start page. */
export function chunkPages(docId: string, pages: string[][]): Chunk[] {
  const words: { w: string; page: number; section: string }[] = [];
  let section = '';
  pages.forEach((lines, i) => {
    for (const l of lines) {
      if (isHeading(l)) section = l;
      for (const w of l.split(' ')) if (w) words.push({ w, page: i + 1, section });
    }
  });
  const chunks: Chunk[] = [];
  const step = CHUNK_WORDS - OVERLAP_WORDS;
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + CHUNK_WORDS);
    // A short tail is already covered by the previous window's overlap.
    if (chunks.length && slice.length < OVERLAP_WORDS * 1.5) break;
    const first = slice[0]!;
    const text = slice.map((x) => x.w).join(' ');
    if (isReferenceOrTable(text, first.section)) continue;
    chunks.push({
      id: `${docId}#${start / step + 1}`,
      doc: docId,
      section: first.section,
      page: first.page,
      text,
    });
  }
  return chunks;
}
