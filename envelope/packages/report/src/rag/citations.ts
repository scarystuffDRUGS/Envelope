/**
 * Citation rules for the narrative (D-036): markers are [S1] or [S1, S4]; every marker must name
 * a retrieved passage; statements about laws, standards and regulators need one.
 */
import { tokenize } from './bm25';
import type { Passage } from './types';

export const CITE_RE = /\[\s*S\d+(?:\s*[,;]\s*S?\d+)*\s*\]/g;

/**
 * Wording that marks a regulatory claim. A sentence matching it without a citation is flagged
 * (and dropped from LLM text after the retry).
 */
export const REGULATORY_RE =
  /\b(NAAQS|National Ambient Air Quality|EIA Notification|Environment(al)? Impact Assessment Notification|Environment \(Protection\)|CPCB|Central Pollution Control Board|MoEFCC|Ministry of Environment|CAQM|Commission for Air Quality|GRAP|Gazette|notified|notification|statutory|mandatory|prohibited|required under|Rules,? (19|20)\d\d)\b/i;

export function citedIds(text: string): string[] {
  return (text.match(CITE_RE) ?? []).flatMap((m) => (m.match(/\d+/g) ?? []).map((n) => `S${n}`));
}

export function stripCitations(text: string): string {
  return text.replace(/\s*\[\s*S\d+(?:\s*[,;]\s*S?\d+)*\s*\]/g, '');
}

export function isRegulatoryClaim(sentence: string): boolean {
  return REGULATORY_RE.test(stripCitations(sentence));
}

/**
 * Weak support: the sentence shares fewer than two content words with every passage it cites.
 * Counted in the evaluation, not dropped: paraphrase is allowed.
 */
export function supported(sentence: string, cited: Passage[]): boolean {
  const words = new Set(tokenize(stripCitations(sentence)).filter((t) => t.length > 3 && !/^\d/.test(t)));
  return cited.some((p) => tokenize(p.quote ?? p.text).filter((t) => words.has(t)).length >= 2);
}

/** Puts a citation before a sentence's closing punctuation: "… limits." → "… limits [S2]." */
export function withCitation(sentence: string, ids: (string | undefined)[]): string {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!list.length) return sentence;
  const m = /([.!?])$/.exec(sentence);
  return m ? `${sentence.slice(0, -1)} [${list.join(', ')}]${m[1]}` : `${sentence} [${list.join(', ')}]`;
}

/**
 * Renumbers cited passages S1…Sn in order of first citation and rewrites the markers, so the
 * References list has no gaps. Uncited passages are left out.
 */
export function finaliseCitations<T extends { paragraphs: string[] }>(
  sections: T[],
  passages: Passage[],
): { sections: T[]; references: Passage[] } {
  const order: string[] = [];
  for (const s of sections)
    for (const p of s.paragraphs) for (const id of citedIds(p)) if (!order.includes(id)) order.push(id);
  const byId = new Map(passages.map((p) => [p.id, p]));
  const kept = order.filter((id) => byId.has(id));
  const rename = new Map(kept.map((id, i) => [id, `S${i + 1}`]));
  const rewrite = (text: string) =>
    text.replace(CITE_RE, (m) => {
      const ids = [...new Set((m.match(/\d+/g) ?? []).map((n) => rename.get(`S${n}`)).filter(Boolean))];
      return ids.length ? `[${ids.join(', ')}]` : '';
    });
  return {
    sections: sections.map((s) => ({ ...s, paragraphs: s.paragraphs.map(rewrite) })),
    references: kept.map((id) => ({ ...byId.get(id)!, id: rename.get(id)! })),
  };
}
