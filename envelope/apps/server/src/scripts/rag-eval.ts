/**
 * Evaluates the cited narrative (D-036): five scenarios on the 2025 demo snapshot, each written
 * by the LLM with and without retrieval and by the template with retrieval. Writes
 * docs/rag-eval.json and docs/RAG_EVAL.md.
 *
 *   pnpm rag:eval            all arms (needs GEMINI_API_KEY or GROQ_API_KEY in .env)
 *   pnpm rag:eval --template only the template arm, no LLM calls
 *   pnpm rag:eval --pace 30  seconds to wait between LLM runs (default 20), to stay under
 *                            free-tier request-per-minute limits (Gemini answered 429 back to back)
 *
 * At most 2 LLM calls per LLM run (draft + one retry): 20 calls for the full set.
 */
import type { SiteData } from '@envelope/data';
import type { Mitigations } from '@envelope/models';
import { Engine, NO_MITIGATIONS, defaultAssumptions } from '@envelope/models';
import type { NarrativeSection } from '@envelope/report';
import {
  finaliseCitations,
  isRegulatoryClaim,
  planRetrieval,
  splitSentences,
  CITE_RE,
} from '@envelope/report';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPayload } from '../../../web/src/analysis/payload';
import { env, repoRoot } from '../env';
import { getRetriever } from '../rag';
import { narrative } from '../report';

const fx = (f: string) => JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/demo', f), 'utf8'));
const spec = fx('building.json');
const weather = fx('weather.json').data.series;
const air = fx('airQuality.json').data;
const engine = new Engine({ spec, weatherYear: 2025, weather: weather.values, air: air.values, osm: null });
const siteData = { weatherYear: 2025, weather, airQuality: air, provenance: {} } as unknown as SiteData;

const on = (...keys: (keyof Mitigations)[]): Mitigations => ({
  ...NO_MITIGATIONS,
  ...Object.fromEntries(keys.map((k) => [k, true])),
});
const DUST = ['sprinkling', 'windBarriers', 'coverStockpiles', 'greenNetting', 'wheelWashing'] as const;
const HEAT = ['shadeNets', 'retainTrees', 'rescheduleWork'] as const;
const GHG = ['lowCarbonConcrete', 'recycledRebar', 'gridPower', 'localSourcing', 'wasteReduction'] as const;
const SCENARIOS: { id: string; label: string; mitigations: Mitigations }[] = [
  { id: 'none', label: 'No mitigation', mitigations: NO_MITIGATIONS },
  { id: 'dust', label: 'Dust measures', mitigations: on(...DUST) },
  { id: 'heat', label: 'Heat measures', mitigations: on(...HEAT) },
  { id: 'ghg', label: 'GHG measures', mitigations: on(...GHG) },
  {
    id: 'all',
    label: 'All measures',
    mitigations: on(...DUST, ...HEAT, ...GHG, 'pavedRoads', 'highWindStop'),
  },
];

function payloadFor(mitigations: Mitigations) {
  const input = {
    assumptions: defaultAssumptions(),
    programmeOverride: null,
    constructionMonth: 7,
    dayOfMonth: 15,
    hour: 14,
  };
  const results = {
    baseline: engine.run({ ...input, mitigations: NO_MITIGATIONS }),
    mitigated: engine.run({ ...input, mitigations }),
  };
  return buildPayload({
    results,
    mitigations,
    assumptions: {},
    siteData,
    projectName: 'Gurugram office (demo)',
    title: 'Environmental Sustainability Assessment Report',
    company: 'Demo company',
    preparedBy: 'Envelope',
  });
}

/** Regulatory claims in the final text, and how many of them carry a citation. */
function claims(sections: NarrativeSection[]) {
  const sentences = sections.flatMap((s) => s.paragraphs.flatMap(splitSentences));
  const reg = sentences.filter(isRegulatoryClaim);
  return {
    sentences: sentences.length,
    regulatory: reg.length,
    regulatoryCited: reg.filter((x) => new RegExp(CITE_RE.source).test(x)).length,
  };
}

const ARMS = process.argv.includes('--template')
  ? [{ id: 'template+rag', rag: true, llm: false }]
  : [
      { id: 'llm+rag', rag: true, llm: true },
      { id: 'llm', rag: false, llm: true },
      { id: 'template+rag', rag: true, llm: false },
    ];
if (ARMS.some((a) => a.llm) && !env.geminiApiKey && !env.groqApiKey)
  throw new Error('No GEMINI_API_KEY or GROQ_API_KEY in .env; run with --template');

async function evaluate(
  sc: (typeof SCENARIOS)[number],
  arm: (typeof ARMS)[number],
  payload: ReturnType<typeof payloadFor>,
) {
  const t0 = Date.now();
  const n = await narrative(payload, { rag: arm.rag, llm: arm.llm });
  const ms = Date.now() - t0;
  const { sections, references } = finaliseCitations(n.sections, n.set?.passages ?? []);
  const byReason = (re: RegExp) => n.dropped.filter((d) => re.test(d.reason)).length;
  const run = {
    scenario: sc.id,
    arm: arm.id,
    writer: n.source,
    retried: n.retried,
    seconds: Math.round(ms / 100) / 10,
    passages: n.set?.size ?? 0,
    /** Passages the writer was given (provider budget) and their characters in the prompt. */
    sent: n.sent.length,
    sourceChars: n.sent.reduce((c, p) => c + (p.quote ?? p.text).length, 0),
    /** An LLM arm whose providers all failed, so the template wrote the report. */
    fellBack: arm.llm && n.source === 'Deterministic template',
    references: references.length,
    citations: n.citations,
    citationValidity: n.citations.total ? n.citations.valid / n.citations.total : null,
    weakSupportRate: n.citations.total ? n.citations.weak / n.citations.total : null,
    flaggedUncited: n.flagged.length,
    dropped: {
      total: n.dropped.length,
      numbers: byReason(/numbers not in payload/),
      banned: byReason(/banned/),
      unknownCitation: byReason(/unknown citation|without a corpus/),
      uncitedRegulatory: byReason(/regulatory claim/),
    },
    ...claims(sections),
  };
  console.log(
    `[eval] ${sc.id.padEnd(5)} ${arm.id.padEnd(13)} ${n.source.padEnd(40)} ${run.seconds}s cites ${n.citations.valid}/${n.citations.total} dropped ${n.dropped.length}`,
  );
  return run;
}

const paceArg = process.argv.indexOf('--pace');
const PACE_S = paceArg > 0 ? Number(process.argv[paceArg + 1]) : 20;
const runs: Awaited<ReturnType<typeof evaluate>>[] = [];
for (const sc of SCENARIOS) {
  const payload = payloadFor(sc.mitigations);
  for (const arm of ARMS) {
    if (arm.llm && runs.some((r) => r.arm !== 'template+rag'))
      await new Promise((r) => setTimeout(r, PACE_S * 1000));
    runs.push(await evaluate(sc, arm, payload));
  }
}

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
type Run = Partial<(typeof runs)[number]> &
  Pick<
    (typeof runs)[number],
    'citations' | 'dropped' | 'retried' | 'seconds' | 'regulatory' | 'regulatoryCited' | 'writer'
  >;

/** Summary of one arm. LLM metrics only over reports the LLM wrote; fallbacks are counted apart. */
function summarise(arm: string, all: Run[], llm: boolean) {
  const rs = llm ? all.filter((r) => r.writer !== 'Deterministic template') : all;
  const total = rs.reduce((s, r) => s + r.citations.total, 0);
  const valid = rs.reduce((s, r) => s + r.citations.valid, 0);
  const weak = rs.reduce((s, r) => s + r.citations.weak, 0);
  const reg = rs.reduce((s, r) => s + r.regulatory, 0);
  const regCited = rs.reduce((s, r) => s + r.regulatoryCited, 0);
  return {
    arm,
    runs: all.length,
    fallbacks: all.length - rs.length,
    sourceCharsPerReport: mean(rs.map((r) => r.sourceChars ?? 0)),
    citationValidity: total ? valid / total : null,
    weakSupportRate: total ? weak / total : null,
    citationsPerReport: mean(rs.map((r) => r.citations.total)),
    regulatoryCitedShare: reg ? regCited / reg : null,
    droppedPerReport: mean(rs.map((r) => r.dropped.total)),
    droppedNumbersPerReport: mean(rs.map((r) => r.dropped.numbers)),
    droppedUncitedPerReport: mean(rs.map((r) => r.dropped.uncitedRegulatory)),
    retryRate: mean(rs.map((r) => (r.retried ? 1 : 0))),
    meanSeconds: mean(rs.map((r) => r.seconds)),
  };
}
const summary = ARMS.map((a) =>
  summarise(
    a.id,
    runs.filter((r) => r.arm === a.id),
    a.llm,
  ),
);

/**
 * Retrieval only (deterministic, no LLM): fixed queries vs fixed + payload keyword queries.
 * Lower overlap between scenarios means the passages follow the report's content.
 */
const retriever = getRetriever();
const retrieval = (['fixed', 'payload'] as const).map((mode) => {
  const sets = SCENARIOS.map((sc) => {
    const p = payloadFor(sc.mitigations);
    const set = retriever?.retrieve(planRetrieval(p, { dynamic: mode === 'payload' }));
    return { scenario: sc.id, passages: set?.passages ?? [] };
  });
  const ids = sets.map((s) => new Set(s.passages.map((p) => p.chunk)));
  const jaccard: number[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      const inter = [...a].filter((x) => b.has(x)).length;
      jaccard.push(inter / (a.size + b.size - inter || 1));
    }
  const docsFor = (section: string, scenario: string) => [
    ...new Set(
      sets
        .find((s) => s.scenario === scenario)!
        .passages.filter((p) => p.forSections.includes(section))
        .map((p) => p.doc.id),
    ),
  ];
  return {
    mode,
    passagesPerReport: mean(sets.map((s) => s.passages.length)),
    distinctAcrossScenarios: new Set(ids.flatMap((s) => [...s])).size,
    meanPairwiseJaccard: mean(jaccard),
    complianceDocs: docsFor('compliance', 'all'),
    dustDocs: docsFor('dust', 'all'),
    perScenario: sets.map((s) => ({ scenario: s.scenario, chunks: s.passages.map((p) => p.chunk) })),
  };
});

/** The LLM run with fixed queries only, kept from before payload queries (D-036). */
const fixedBaseline = (() => {
  try {
    const j = JSON.parse(readFileSync(resolve(repoRoot, 'docs/rag-eval-fixed.json'), 'utf8')) as {
      generatedAt: string;
      runs: (Run & { arm: string })[];
    };
    // Re-scored from its runs, so template fallbacks are excluded the same way.
    const rs = j.runs.filter((r) => r.arm === 'llm+rag');
    return { generatedAt: j.generatedAt, llmRag: rs.length ? summarise('llm+rag', rs, true) : null };
  } catch {
    return null;
  }
})();

const out = {
  generatedAt: new Date().toISOString(),
  weatherYear: 2025,
  scenarios: SCENARIOS.map((s) => s.id),
  summary,
  retrieval,
  runs,
};
writeFileSync(resolve(repoRoot, 'docs/rag-eval.json'), JSON.stringify(out, null, 2) + '\n');

const f1 = (x: number) => x.toFixed(1);
const md = `# RAG_EVAL.md: cited report narrative, evaluation

Generated by \`pnpm rag:eval\` on ${out.generatedAt.slice(0, 10)} (D-036). Five scenarios on the 2025 Gurugram demo
snapshot (${SCENARIOS.map((s) => s.label.toLowerCase()).join(', ')}), each written three ways: the LLM with retrieved
passages (llm+rag), the LLM without them (llm, the previous behaviour) and the deterministic template with fixed
citations (template+rag). Raw results: \`docs/rag-eval.json\`.

## Summary

| Arm | Runs | Template fallbacks | Source chars / prompt | Citation validity | Weak support | Citations / report | Regulatory sentences cited | Dropped / report | of which numbers | of which uncited claims | Retry rate | Mean time (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${summary
  .map(
    (s) =>
      `| ${s.arm} | ${s.runs} | ${s.fallbacks} | ${Math.round(s.sourceCharsPerReport)} | ${pct(s.citationValidity)} | ${pct(s.weakSupportRate)} | ${f1(s.citationsPerReport)} | ${pct(s.regulatoryCitedShare)} | ${f1(s.droppedPerReport)} | ${f1(s.droppedNumbersPerReport)} | ${f1(s.droppedUncitedPerReport)} | ${pct(s.retryRate)} | ${f1(s.meanSeconds)} |`,
  )
  .join('\n')}

- LLM arms are scored only on reports the LLM wrote; **template fallbacks** (all providers failed or timed out) are counted
  separately.
- **Citation validity**: share of [Sn] markers in the draft that name a retrieved passage (invalid ones drop their sentence).
- **Weak support**: share of valid citations whose sentence shares fewer than two content words with the cited passage
  (paraphrase is allowed, so this is a review signal, not an error).
- **Regulatory sentences cited**: share of sentences in the final text that mention a law, standard or regulator and
  carry a citation. Without retrieval there is nothing to cite.
- **Dropped**: sentences removed by the validators across draft, retry and the strict pass.

## Retrieval: fixed queries vs payload queries

Deterministic, no LLM. *Fixed*: one set of queries per section, plus one per enabled dust measure. *Payload*: the
same plus BM25 keyword queries built from each report (compliance rows, EIA built-up area check, exceedance days,
background PM10, dominant dust sources, enabled measures, receptors, limitations). Lower overlap between scenarios
means the passages follow the report's content.

| Queries | Passages / report | Distinct passages over 5 scenarios | Mean overlap between scenarios (Jaccard) | Compliance section draws on ("all measures") | Dust section draws on ("all measures") |
|---|---|---|---|---|---|
${retrieval
  .map(
    (r) =>
      `| ${r.mode} | ${f1(r.passagesPerReport)} | ${r.distinctAcrossScenarios} | ${r.meanPairwiseJaccard.toFixed(2)} | ${r.complianceDocs.join(', ') || '–'} | ${r.dustDocs.join(', ') || '–'} |`,
  )
  .join('\n')}
${
  fixedBaseline?.llmRag
    ? `
## LLM with retrieval: fixed queries (${fixedBaseline.generatedAt.slice(0, 16).replace('T', ' ')} UTC) vs payload queries (this run)

| Queries | LLM-written reports | Citation validity | Weak support | Citations / report | Regulatory sentences cited | Dropped / report | of which uncited claims | Retry rate | Mean time (s) |
|---|---|---|---|---|---|---|---|---|---|
${[
  { name: 'fixed', s: fixedBaseline.llmRag },
  { name: 'payload', s: summary.find((x) => x.arm === 'llm+rag') },
]
  .filter((x) => x.s)
  .map(
    ({ name, s }) =>
      `| ${name} | ${s!.runs - s!.fallbacks} of ${s!.runs} | ${pct(s!.citationValidity)} | ${pct(s!.weakSupportRate)} | ${f1(s!.citationsPerReport)} | ${pct(s!.regulatoryCitedShare)} | ${f1(s!.droppedPerReport)} | ${f1(s!.droppedUncitedPerReport)} | ${pct(s!.retryRate)} | ${f1(s!.meanSeconds)} |`,
  )
  .join('\n')}

Raw results of the fixed-query run: \`docs/rag-eval-fixed.json\`.
`
    : ''
}
## Runs

| Scenario | Arm | Writer | Passages | References | Citations valid / total | Weak | Flagged uncited | Dropped (numbers / citation / uncited) | Retried | Time (s) |
|---|---|---|---|---|---|---|---|---|---|---|
${runs
  .map(
    (r) =>
      `| ${r.scenario} | ${r.arm} | ${r.writer} | ${r.passages} | ${r.references} | ${r.citations.valid} / ${r.citations.total} | ${r.citations.weak} | ${r.flaggedUncited} | ${r.dropped.total} (${r.dropped.numbers} / ${r.dropped.unknownCitation} / ${r.dropped.uncitedRegulatory}) | ${r.retried ? 'yes' : 'no'} | ${r.seconds} |`,
  )
  .join('\n')}

## Limits of this evaluation

- Five scenarios on one site and one weather year; LLM output varies between runs, so small differences are noise.
- Template fallbacks in the LLM arms come from the providers, not the validator: Gemini free-tier rate limits (429),
  overload (503), the 45 s Gemini cap, and Groq's 8,000 tokens-per-minute limit (413). The server log of the run
  names each. LLM metrics over one or two written reports are anecdotal.
- The corpus holds the documents listed as indexed in \`docs/DATA_SOURCES.md\`; sections whose sources are missing
  (heat, GHG grid factor, CAMS/ERA5 data quality) get few or no passages.
- Citation validity checks that a marker names a retrieved passage, not that the passage proves the sentence; weak
  support is a lexical proxy for that.
`;
writeFileSync(resolve(repoRoot, 'docs/RAG_EVAL.md'), md);
console.log('[eval] wrote docs/RAG_EVAL.md and docs/rag-eval.json');
