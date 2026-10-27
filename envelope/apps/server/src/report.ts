import type { NarrativeSection, Passage, PassageSet, ReportImages, ReportPayload } from '@envelope/report';
import {
  SECTION_IDS,
  finaliseCitations,
  llmView,
  renderReportHtml,
  templateNarrative,
  validateNarrative,
} from '@envelope/report';
import { launchBrowser } from './browser';
import { env } from './env';
import { retrievePassages } from './rag';

/**
 * Time budget for the narrative (ms). The Vercel function allows 120 s (scripts/build-vercel.mjs);
 * PDF rendering and a Chromium cold start need about 20 s of that.
 */
const NARRATIVE_BUDGET_MS = 80_000;
const PROVIDER_CAP_MS = { gemini: 45_000, groq: 25_000 };
/** A validator retry is attempted only with at least this much budget left. */
const RETRY_MIN_MS = 30_000;

const SYSTEM_PROMPT = `You are a senior Indian environmental consultant writing a construction-phase environmental assessment for submission to a regulator.
Write formal, concise prose in the third person. Use ONLY numbers that appear in the JSON payload, exactly as written there, with their units. Do not compute new numbers, totals, differences or percentages.
Refer to tables by number: payload.tables[0] is Table 1, payload.tables[1] is Table 2, and so on. Read each table's note; it defines the period and assumptions behind its figures.
Say "indicative" for any comparison with limits. Never say "compliant" or "guaranteed". No marketing language. Do not mention AI or language models.
Return JSON {"sections":[{"id","title","paragraphs":[...]}]} with these sections in order: ${SECTION_IDS.map((s) => `${s.id} (${s.title})`).join(', ')}. Two or three short paragraphs per section.`;

/** Added when retrieved passages are sent (D-036). */
const CITATION_PROMPT = `The input also lists "sources": passages from regulations, guidelines and method documents, each with an id (S1, S2, ...) and the report sections it was retrieved for.
Support every statement about a law, notification, standard, regulator, guideline or estimation method with a citation of the passage that supports it, in square brackets before the full stop, for example "... at construction sites [S3]." or "[S1, S4]". Cite only ids listed in sources, and only passages that support the statement. Do not cite the payload.
Do not copy numbers from the passages: numbers may come only from the payload. Do not mention documents that are not in sources.`;

/**
 * Passages each provider is sent (D-036). Retrieval order puts each section's first passage
 * ahead of the extras, so a prefix keeps one per section. Groq's free tier allows 8,000 tokens per
 * minute: with 8 excerpts requests were 8,040–8,452 tokens (413, measured 2026-10-26), so it gets 3
 * (about 170 tokens each, leaving roughly 7,600).
 */
const SOURCE_BUDGET = { Gemini: 24, Groq: 3 } as const;

function userText(full: ReportPayload, sources: Passage[]): string {
  const payload = llmView(full);
  if (!sources.length) return JSON.stringify(payload);
  return JSON.stringify({
    payload,
    sources: sources.map((p) => ({
      id: p.id,
      document: p.doc.title,
      section: p.section,
      page: p.page,
      forSections: p.forSections,
      text: p.quote ?? p.text,
    })),
  });
}

const SECTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', enum: SECTION_IDS.map((s) => s.id) },
          title: { type: 'STRING' },
          paragraphs: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['id', 'title', 'paragraphs'],
      },
    },
  },
  required: ['sections'],
};

function parseSections(text: string): NarrativeSection[] {
  const json = JSON.parse(text.replace(/^```json\s*|```$/g, '')) as { sections?: NarrativeSection[] };
  const secs = (json.sections ?? []).filter(
    (s) => s && typeof s.id === 'string' && Array.isArray(s.paragraphs),
  );
  if (secs.length < 5) throw new Error('too few sections');
  return secs.map((s) => ({ id: s.id, title: s.title ?? s.id, paragraphs: s.paragraphs.map(String) }));
}

async function geminiCall(
  model: string,
  system: string,
  userText: string,
  signal: AbortSignal,
): Promise<NarrativeSection[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey ?? '' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: SECTIONS_SCHEMA,
        // Gemini 3 thinks at length by default: a report took 154 s, with low thinking 27 s
        // (measured 2026-10-26, gemini-3.5-flash, 19 KB payload). The prose needs no deep reasoning.
        ...(/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
      },
    }),
  });
  if (!res.ok) {
    // Google's message names the quota hit (per minute or per day); it carries no secrets.
    const msg = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
    throw new Error(`gemini ${model} ${res.status}${msg ? `: ${msg.slice(0, 160)}` : ''}`);
  }
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return parseSections(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '');
}

/** Model from env first, then a stable fallback model. */
async function gemini(system: string, userText: string, signal: AbortSignal): Promise<NarrativeSection[]> {
  // Models available to the key on 2026-10-07; 2.5 Flash is closed to new keys (404).
  const models = [
    ...new Set([
      env.geminiModel ?? 'gemini-3.5-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-flash-latest',
    ]),
  ];
  let last: unknown = new Error('no model');
  for (const m of models) {
    // 503 = model overloaded, usually for seconds: one more try of the same model first.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await geminiCall(m, system, userText, signal);
      } catch (err) {
        last = err;
        console.warn('[report]', (err as Error).message);
        if (signal.aborted || attempt > 0 || !/ 503\b/.test((err as Error).message)) break;
        await new Promise((r) => setTimeout(r, 1_500));
      }
    }
    if (signal.aborted) break;
  }
  throw last;
}

async function groq(system: string, userText: string, signal: AbortSignal): Promise<NarrativeSection[]> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.groqApiKey ?? ''}` },
    body: JSON.stringify({
      model: env.groqModel ?? 'openai/gpt-oss-120b',
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!res.ok) {
    // Groq's error message states the limit hit (e.g. tokens per minute); it carries no secrets.
    const msg = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
    throw new Error(`groq ${res.status}${msg ? `: ${msg.slice(0, 200)}` : ''}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseSections(body.choices?.[0]?.message?.content ?? '');
}

/**
 * Gemini → Groq within the deadline; null when no LLM is reachable. Each call gets
 * an AbortSignal, so a timed-out request is cancelled rather than left running.
 */
async function llm(
  system: string,
  text: (sent: Passage[]) => string,
  sources: Passage[],
  deadline: number,
): Promise<{ sections: NarrativeSection[]; source: string; sent: Passage[] } | null> {
  const providers = [
    { name: 'Gemini', key: env.geminiApiKey, cap: PROVIDER_CAP_MS.gemini, call: gemini },
    { name: 'Groq', key: env.groqApiKey, cap: PROVIDER_CAP_MS.groq, call: groq },
  ] as const;
  for (const p of providers) {
    const left = deadline - Date.now();
    if (!p.key || left < 5_000) continue;
    const sent = sources.slice(0, SOURCE_BUDGET[p.name]);
    try {
      const signal = AbortSignal.timeout(Math.min(p.cap, left));
      return { sections: await p.call(system, text(sent), signal), source: p.name, sent };
    } catch (err) {
      console.warn(`[report] ${p.name} failed:`, (err as Error).message);
    }
  }
  return null;
}

/**
 * LLM narrative checked by the number and citation validators (HANDOVER Appendix B, D-036): on
 * failure, one retry with the error list; then a strict pass drops anything still failing,
 * including regulatory claims without a citation. No LLM → template writer with fixed citations.
 * `rag: false` skips retrieval and `llm: false` forces the template (evaluation arms).
 */
export async function narrative(payload: ReportPayload, opts: { rag?: boolean; llm?: boolean } = {}) {
  const deadline = Date.now() + NARRATIVE_BUDGET_MS;
  const set: PassageSet | null = opts.rag === false ? null : retrievePassages(payload);
  const sources = set?.passages ?? [];
  const system = sources.length ? `${SYSTEM_PROMPT}\n${CITATION_PROMPT}` : SYSTEM_PROMPT;
  const first =
    opts.llm === false ? null : await llm(system, (sent) => userText(payload, sent), sources, deadline);
  if (!first) {
    const sections = templateNarrative(payload, set?.citer());
    // The template's regulatory sentences are flagged, never dropped: it is fixed, reviewed text.
    const checked = validateNarrative(sections, payload, { sources: set?.passages ?? [], uncited: 'flag' });
    return { ...checked, source: 'Deterministic template', retried: false, set, sent: set?.passages ?? [] };
  }
  const problems = (c: { dropped: unknown[]; flagged: unknown[] }) => c.dropped.length + c.flagged.length;
  // Citations are checked against the passages that provider was actually sent.
  let sent = first.sent;
  let checked = validateNarrative(first.sections, payload, { sources: sent, uncited: 'flag' });
  let retried = false;
  if (problems(checked) && deadline - Date.now() >= RETRY_MIN_MS) {
    retried = true;
    const errors = [...checked.dropped, ...checked.flagged]
      .map((d) => `- "${d.sentence}" (${d.reason})`)
      .join('\n');
    const prompt = (src: Passage[]) =>
      [
        userText(payload, src),
        'Your previous draft contained sentences with numbers, wording or citations that are not allowed:',
        errors,
        src.length
          ? 'Rewrite all sections using only numbers that appear in the payload, exactly as written, and cite a listed source for every regulatory statement.'
          : 'Rewrite all sections using only numbers that appear in the payload, exactly as written.',
      ].join('\n\n');
    const second = await llm(system, prompt, sources, deadline);
    if (second) {
      const again = validateNarrative(second.sections, payload, { sources: second.sent, uncited: 'flag' });
      if (problems(again) <= problems(checked)) {
        checked = again;
        sent = second.sent;
      }
    }
  }
  // Strict pass on the surviving text: regulatory claims still without a citation are dropped.
  const strict = validateNarrative(checked.sections, payload, { sources: sent, uncited: 'drop' });
  const dropped = [...checked.dropped, ...strict.dropped];
  for (const d of dropped) console.warn(`[report] dropped sentence (${d.reason}): ${d.sentence}`);
  return {
    sections: strict.sections,
    dropped,
    flagged: checked.flagged,
    citations: checked.citations,
    source: `${first.source}, figures${sources.length ? ' and citations' : ''} validated`,
    retried,
    set,
    sent,
  };
}

export async function buildReport(payload: ReportPayload, images: ReportImages) {
  const checked = await narrative(payload);
  // Any section the LLM omitted, or that validation emptied, comes from the template writer.
  const fallback = templateNarrative(payload, checked.set?.citer());
  const merged = SECTION_IDS.map(({ id, title }) => {
    const s = checked.sections.find((x) => x.id === id);
    return s && s.paragraphs.length ? { ...s, title } : fallback.find((x) => x.id === id)!;
  });
  // Cited passages are renumbered S1…Sn in reading order; uncited ones are not listed.
  const { sections, references } = finaliseCitations(merged, checked.set?.passages ?? []);
  const html = renderReportHtml(payload, sections, images, checked.source, references);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const name = payload.project.name.replace(/[<>&]/g, '');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7pt;color:#888;width:100%;padding:0 16mm;font-family:Segoe UI,Arial">${name} · v${payload.meta.version}</div>`,
      footerTemplate:
        '<div style="font-size:7pt;color:#888;width:100%;padding:0 16mm;text-align:right;font-family:Segoe UI,Arial">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
    // Returned in the response, not stored: serverless instances share no disk between requests.
    return {
      pdf,
      narrativeSource: checked.source,
      dropped: checked.dropped.length,
      retried: checked.retried,
      references: references.length,
    };
  } finally {
    await browser.close();
  }
}

/** The system prompt and user text a provider is sent for a payload and its passages (evaluation, probes). */
export function llmPrompt(payload: ReportPayload, sources: Passage[]): { system: string; user: string } {
  return {
    system: sources.length ? `${SYSTEM_PROMPT}\n${CITATION_PROMPT}` : SYSTEM_PROMPT,
    user: userText(payload, sources),
  };
}
