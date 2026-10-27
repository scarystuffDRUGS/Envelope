/**
 * Number validator: every number in generated prose must exist in the payload
 * at displayed precision (±0.5%). Sentences that fail are removed. Also bans wording the
 * report must never use, and checks citations against the retrieved passages (D-036).
 */
import type { NarrativeSection, ReportPayload } from './payload';
import { citedIds, isRegulatoryClaim, stripCitations, supported } from './rag/citations';
import type { Passage } from './rag/types';

const NUM_RE = /[−-]?\d[\d,]*(?:\.\d+)?/g;
export const BANNED = [/\bcompliant\b/i, /\bguarantee[sd]?\b/i, /AI-generated/i, /\bas an AI\b/i];

export function parseNumbers(text: string): number[] {
  // Skip table/figure/section references such as "Table 3" or "Section 5", and identifiers of
  // standards and methods ("EN 15978", "AP-42 Section 13.2.4", "ICE v3"), which are names, not figures.
  // Citation markers ("[S3]") are references, not figures; passage text never joins the payload.
  const cleaned = stripCitations(text)
    .replace(/\bAP-42(\s+Section)?\s+\d+(\.\d+)*/g, '')
    .replace(/\b(EN|ISO|IEC|BS|IS)\s+\d+(?:[-:.]\d+)*/g, '')
    .replace(/\bv\d+(\.\d+)*\b/g, '')
    .replace(/\b[A-D][1-5]([–-][A-D]?[1-5])?\b/g, '') // EN 15978 life-cycle modules, e.g. A1–A5
    .replace(/\b(Table|Figure|Section|Annex|item)\s+\d+(\.\d+)*/gi, '');
  return (cleaned.match(NUM_RE) ?? [])
    .map((s) => Number(s.replace(/,/g, '').replace('−', '-')))
    .filter((n) => Number.isFinite(n));
}

export function payloadNumbers(payload: ReportPayload): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(...parseNumbers(v));
    else if (typeof v === 'number') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(payload);
  return out;
}

function known(n: number, allowed: number[]): boolean {
  const a = Math.abs(n);
  return allowed.some((v) => {
    const b = Math.abs(v);
    if (a === b) return true;
    return b !== 0 && Math.abs(a - b) / b <= 0.005;
  });
}

export function splitSentences(p: string): string[] {
  // Split after . ! ? only when followed by whitespace and a capital, so decimals stay intact.
  return p
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ValidationIssue {
  section: string;
  sentence: string;
  reason: string;
}

export interface ValidationResult {
  sections: NarrativeSection[];
  dropped: ValidationIssue[];
  /** Regulatory claims without a citation (dropped as well when `uncited` is 'drop'). */
  flagged: ValidationIssue[];
  citations: { total: number; valid: number; weak: number };
}

export interface ValidationOptions {
  /** Retrieved passages. Without any, citations are not checked (no corpus, D-036). */
  sources?: Passage[];
  /** 'flag' for a draft that will be retried or for the template writer; 'drop' for final LLM text. */
  uncited?: 'flag' | 'drop';
}

export function validateNarrative(
  sections: NarrativeSection[],
  payload: ReportPayload,
  opts: ValidationOptions = {},
): ValidationResult {
  const allowed = payloadNumbers(payload);
  const sources = new Map((opts.sources ?? []).map((p) => [p.id, p]));
  const checkCitations = sources.size > 0;
  const dropped: ValidationIssue[] = [];
  const flagged: ValidationIssue[] = [];
  const citations = { total: 0, valid: 0, weak: 0 };
  const clean = sections.map((sec) => ({
    ...sec,
    paragraphs: sec.paragraphs
      .map((p) =>
        splitSentences(p)
          .filter((sentence) => {
            const drop = (reason: string): false => {
              dropped.push({ section: sec.id, sentence, reason });
              return false;
            };
            const banned = BANNED.find((re) => re.test(sentence));
            if (banned) {
              dropped.push({ section: sec.id, sentence, reason: `banned wording ${banned}` });
              return false;
            }
            const bad = parseNumbers(sentence).filter((n) => !known(n, allowed));
            if (bad.length) {
              dropped.push({
                section: sec.id,
                sentence,
                reason: `numbers not in payload: ${bad.join(', ')}`,
              });
              return false;
            }
            const ids = citedIds(sentence);
            if (!checkCitations) return ids.length === 0 || drop('citation without a corpus');
            citations.total += ids.length;
            const unknown = ids.filter((id) => !sources.has(id));
            citations.valid += ids.length - unknown.length;
            if (unknown.length) return drop(`unknown citation ${unknown.join(', ')}`);
            if (
              ids.length &&
              !supported(
                sentence,
                ids.map((id) => sources.get(id)!),
              )
            )
              citations.weak++;
            if (!ids.length && isRegulatoryClaim(sentence)) {
              flagged.push({ section: sec.id, sentence, reason: 'regulatory claim without a citation' });
              if (opts.uncited === 'drop') return drop('regulatory claim without a citation');
            }
            return true;
          })
          .join(' '),
      )
      .filter((p) => p.length > 0),
  }));
  return { sections: clean, dropped, flagged, citations };
}
