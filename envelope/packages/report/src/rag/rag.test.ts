import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReportPayload } from '../payload';
import { renderReportHtml } from '../html';
import { templateNarrative } from '../template';
import { parseNumbers, validateNarrative } from '../validator';
import { Bm25, tokenize } from './bm25';
import { chunkPages, cleanPages, isReferenceOrTable } from './chunk';
import { citedIds, finaliseCitations, isRegulatoryClaim, withCitation } from './citations';
import { allQueryTexts, payloadKeywords, planRetrieval } from './queries';
import { Retriever, decodeVector, encodeVector, excerpt } from './retrieve';
import type { CorpusDoc, Passage, RagIndex } from './types';

const doc: CorpusDoc = {
  id: 'naaqs-2009',
  title: 'National Ambient Air Quality Standards',
  issuer: 'CPCB',
  year: '2009',
  url: 'https://example.org/naaqs.pdf',
  licence: 'Gazette',
  kind: 'regulation',
  accessed: '2026-10-26',
};
const passage = (id: string, text: string): Passage => ({
  id,
  chunk: `naaqs-2009#${id}`,
  doc,
  section: '',
  page: 1,
  text,
  forSections: ['dust'],
});
const payload = {
  meta: { title: 'T', company: 'C', preparedBy: 'P', date: '7 Oct 2026', version: '1.0', scenario: 'both' },
  headline: [
    { label: 'PM10', unit: 'µg/m³', baseline: '120', mitigated: '96', delta: '−24', deltaPct: '−20%' },
  ],
} as unknown as ReportPayload;

describe('BM25 (hand-checked)', () => {
  it('scores a two-document corpus as Robertson & Zaragoza with k1 1.2, b 0.75', () => {
    // N = 2, "dust" in doc 0 only: idf = ln(1 + 1.5/1.5) = ln 2. Doc lengths 3 and 2 tokens
    // (stopwords "the", "on" removed), avgdl 2.5, so norm = 1.2·(0.25 + 0.75·3/2.5) = 1.38.
    // score = ln2 · 1·2.2/(1 + 1.38) = 0.6407.
    const bm = new Bm25(['dust on site roads', 'the heat stress']);
    expect(tokenize('dust on site roads')).toEqual(['dust', 'site', 'road']);
    const [a, b] = bm.scores('dust');
    expect(a).toBeCloseTo((Math.LN2 * 2.2) / 2.38, 4);
    expect(b).toBe(0);
  });
});

describe('chunking', () => {
  it('drops running headers, page numbers and Hindi lines and rejoins hyphenation', () => {
    const page = (n: number, body: string[]) => ['THE GAZETTE OF INDIA : EXTRAORDINARY', ...body, String(n)];
    const pages = cleanPages([
      page(1, ['भारत का राजपत्र असाधारण', 'Dust mitigation meas-', 'ures shall be taken.']),
      page(2, ['Second page text.']),
      page(3, ['Third page text', 'th']),
    ]);
    expect(pages[0]).toEqual(['Dust mitigation measures shall be taken.']);
    expect(pages[2]).toEqual(['Third page textth']);
  });

  it('tags chunks with the heading above them and their start page', () => {
    const words = (n: number, w: string) => Array.from({ length: n }, () => w).join(' ');
    const chunks = chunkPages('d', [['13.2.4 Aggregate Handling', words(150, 'pile')], [words(150, 'wind')]]);
    expect(chunks[0]).toMatchObject({ id: 'd#1', section: '13.2.4 Aggregate Handling', page: 1 });
    // 220-word windows every 180 words: the second starts at word 180, past page 1's 153 words.
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toMatchObject({ id: 'd#2', page: 2 });
    expect(chunks.every((c) => c.text.split(' ').length <= 220)).toBe(true);
  });

  it('treats bibliographies and numeric tables as non-citable', () => {
    expect(isReferenceOrTable('Smith 1990. Jones 1991. Lee 1992. Wu 1993. Roe 1994. Doe 1995.')).toBe(true);
    expect(isReferenceOrTable('0.25 4.8 0.6 6.7 1.3 15 silt')).toBe(true);
    expect(isReferenceOrTable('Water sprinkling shall be carried out on all haul roads.')).toBe(false);
    expect(isReferenceOrTable('Any text', 'References For Section 13.2.2')).toBe(true);
    // Consolidated notifications cite many amendment dates; that is not a bibliography.
    const amended =
      'inserted vide S.O. 3999(E) dated 9 December, 2016, S.O. 980(E) dated 2nd March, 2021, S.O. 1 of 2018, 2019, 2020 and 2022, for built up area';
    expect(isReferenceOrTable(amended)).toBe(false);
  });
});

describe('citations', () => {
  it('reads [S1] and [S1, S4] markers and never parses them as figures', () => {
    expect(citedIds('Limits apply [S1, S4]. See also [S12].')).toEqual(['S1', 'S4', 'S12']);
    expect(parseNumbers('The limit applies at receptors [S3].')).toEqual([]);
  });

  it('places a citation before the full stop', () => {
    expect(withCitation('Dust measures are mandatory.', ['S2', 'S2', undefined])).toBe(
      'Dust measures are mandatory [S2].',
    );
  });

  it('recognises regulatory claims', () => {
    expect(isRegulatoryClaim('The NAAQS set a 24-hour limit.')).toBe(true);
    expect(isRegulatoryClaim('Emissions fall with sprinkling.')).toBe(false);
  });

  it('drops unknown citations, flags uncited regulatory claims and counts weak support', () => {
    const sources = [
      passage('S1', 'National Ambient Air Quality Standards PM10 24 hourly limit notification'),
    ];
    const sections = [
      {
        id: 'dust',
        title: 'Dust',
        paragraphs: [
          'The National Ambient Air Quality Standards set a PM10 limit [S1]. The baseline is 120 µg/m³ [S7]. The NAAQS apply to the boundary. Sprinkling reduces dust [S1].',
        ],
      },
    ];
    const flag = validateNarrative(sections, payload, { sources, uncited: 'flag' });
    expect(flag.dropped.map((d) => d.reason)).toEqual(['unknown citation S7']);
    expect(flag.flagged).toHaveLength(1);
    expect(flag.citations).toEqual({ total: 3, valid: 2, weak: 1 });
    expect(flag.sections[0]!.paragraphs[0]).toContain('The NAAQS apply to the boundary.');

    const strict = validateNarrative(sections, payload, { sources, uncited: 'drop' });
    expect(strict.sections[0]!.paragraphs[0]).not.toContain('The NAAQS apply');
  });

  it('leaves text uncited and unchecked when there is no corpus, but rejects stray markers', () => {
    const r = validateNarrative(
      [{ id: 'x', title: 'X', paragraphs: ['The NAAQS apply. A limit exists [S1].'] }],
      payload,
    );
    expect(r.flagged).toHaveLength(0);
    expect(r.dropped.map((d) => d.reason)).toEqual(['citation without a corpus']);
  });

  it('renumbers cited passages in reading order and lists only those', () => {
    const passages = [passage('S1', 'a'), passage('S2', 'b'), passage('S3', 'c')];
    const { sections, references } = finaliseCitations(
      [{ paragraphs: ['First claim [S3]. Second [S1, S3].'] }],
      passages,
    );
    expect(sections[0]!.paragraphs[0]).toBe('First claim [S1]. Second [S2, S1].');
    expect(references.map((r) => [r.id, r.text])).toEqual([
      ['S1', 'c'],
      ['S2', 'a'],
    ]);
  });
});

describe('vector encoding', () => {
  it('round-trips int8 quantisation', () => {
    const v = decodeVector(encodeVector([1, -1, 0.5, 0]));
    expect([...v]).toEqual([127, -127, 64, 0]);
  });
});

const indexPath = resolve(__dirname, '../../../../corpus/index.json');
describe.runIf(existsSync(indexPath))('committed corpus index', () => {
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as RagIndex;
  const r = new Retriever(index);

  it('has a vector for every query (rebuild with pnpm rag:build after editing queries.ts)', () => {
    expect(allQueryTexts().filter((q) => !index.queries[q])).toEqual([]);
    expect(index.vectors).toHaveLength(index.chunks.length);
  });

  it('retrieves the NAAQS notification for the dust and compliance sections, within the cap', () => {
    const set = r.retrieve(planRetrieval({ mitigationIds: ['sprinkling'] } as unknown as ReportPayload));
    const naaqs = set.passages.find((p) => p.doc.id === 'naaqs-2009');
    expect(naaqs?.forSections).toEqual(expect.arrayContaining(['dust', 'compliance']));
    expect(set.size).toBeLessThanOrEqual(24);
  });

  it('gives the template valid citations that pass the validator', () => {
    const set = r.retrieve(planRetrieval({ mitigationIds: [] } as unknown as ReportPayload));
    const p = {
      ...payload,
      project: { name: 'P', site: 'S', coordinates: 'c', floors: '12', use: 'office', structure: 'RCC' },
      mitigations: [],
      // Real payloads carry "PM2.5" and "ERA5" in labels and attributions; the template uses both.
      climate: [{ label: 'PM2.5 background, ERA5 year', value: '–', limit: '–' }],
      compliance: [],
      tables: [],
      limitations: [],
      assumptionsUnverified: 3,
    } as unknown as ReportPayload;
    const sections = templateNarrative(p, set.citer());
    const v = validateNarrative(sections, p, { sources: set.passages, uncited: 'flag' });
    expect(v.citations.total).toBeGreaterThan(0);
    expect(v.citations.valid).toBe(v.citations.total);
    expect(v.dropped).toEqual([]);
  });
});

describe('References section', () => {
  it('lists cited passages with document, page, URL and an excerpt, and adds it to the contents', () => {
    const p = {
      ...payload,
      project: { name: 'P', site: 'S' },
      tables: [],
    } as unknown as ReportPayload;
    const html = renderReportHtml(p, [{ id: 'dust', title: 'Dust', paragraphs: ['Limit [S1].'] }], {}, 'T', [
      passage('S1', 'National Ambient Air Quality Standards'),
    ]);
    expect(html).toContain('<li>References</li>');
    expect(html).toContain(
      '<span class="ref-id">[S1]</span> National Ambient Air Quality Standards. CPCB, 2009. p. 1.',
    );
    expect(html).toContain('https://example.org/naaqs.pdf');
    expect(renderReportHtml(p, [], {}, 'T')).not.toContain('References');
  });
});

describe('payload keyword queries', () => {
  const p = {
    project: { use: 'office' },
    mitigations: ['Water sprinkling of the work area and haul roads', 'Grid connection instead of DG sets'],
    mitigationIds: ['sprinkling', 'gridPower'],
    compliance: [
      {
        regulation: 'EIA Notification 2006, item 8(a)',
        requirement: 'Prior environmental clearance for built-up area at or above 20,000 m² [verify]',
        status: 'Built-up area 17,550 m² including basement: indicatively below the threshold',
        evidence: 'Table 2',
      },
    ],
    headline: [{ label: 'Site-caused NAAQS PM10 exceedance days (worst point)', mitigated: '3' }],
    climate: [{ label: 'Mean background PM10 (CAMS)', value: '402 µg/m³' }],
    tables: [
      {
        id: 'dustSources',
        rows: [
          ['General construction activity (WRAP)', '4.1', '56%'],
          ['Trackout onto public roads', '0.00', '0%'],
          ['Total', '7.3', '100%'],
        ],
      },
      {
        id: 'receptors',
        rows: [
          ['Boundary N', 'boundary'],
          ['DPS school', 'school'],
        ],
      },
    ],
    limitations: ['Background PM10 is from the CAMS global model. It is not validated.'],
  } as unknown as ReportPayload;
  const kw = payloadKeywords(p);

  it('builds queries from compliance rows, the EIA check, exceedances, background, sources, measures and receptors', () => {
    expect(kw.compliance).toEqual([
      'EIA Notification 2006, item 8(a) Prior environmental clearance for built-up area at or above 20,000 m²',
    ]);
    expect(kw.project![0]).toContain('Built-up area 17,550 m²');
    expect(kw.dust).toEqual(
      expect.arrayContaining([
        'site exceedance of the 24 hourly PM10 ambient air quality standard',
        'General construction activity (WRAP) dust emissions control',
        'Water sprinkling of the work area and haul roads',
      ]),
    );
    expect(kw.dust!.some((k) => k.includes('exceeds the National Ambient Air Quality Standards'))).toBe(true);
    expect(kw.dust).not.toContain('Grid connection instead of DG sets');
    expect(kw.ghg).toEqual(['Grid connection instead of DG sets']);
    expect(kw.method).toEqual(['General construction activity (WRAP)']);
    expect(kw.monitoring).toEqual([
      'ambient air monitoring near boundary',
      'ambient air monitoring near school',
    ]);
    expect(kw.limitations).toEqual(['Background PM10 is from the CAMS global model.']);
  });

  it('is left out when dynamic is false', () => {
    expect(planRetrieval(p, { dynamic: false }).every((s) => s.keywords.length === 0)).toBe(true);
    expect(planRetrieval(p).find((s) => s.section === 'compliance')!.keywords).toHaveLength(1);
  });
});

describe('passage excerpt for the prompt', () => {
  it('keeps the best-matching sentence and grows toward its better neighbour within the word limit', () => {
    const text =
      'Noise limits apply at night. Water sprinkling shall be done twice daily on haul roads. Sprinkling records shall be kept. Fencing is optional here.';
    expect(excerpt(text, ['water sprinkling on haul roads'], 16)).toBe(
      'Water sprinkling shall be done twice daily on haul roads. Sprinkling records shall be kept.',
    );
    expect(excerpt('Short text.', ['anything'], 90)).toBe('Short text.');
  });
});
