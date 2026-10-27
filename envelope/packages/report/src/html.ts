/** Report HTML with print CSS (A4), rendered to PDF by the server (Playwright). */
import { LOGO_SVG } from './logo';
import type { NarrativeSection, ReportPayload, Table } from './payload';
import type { Passage } from './rag/types';

/** Words of the passage quoted under References, so a reader can find the cited place. */
const EXCERPT_WORDS = 25;

function references(refs: Passage[]): string {
  const items = refs.map((r) => {
    const words = (r.quote ?? r.text).split(' ');
    const excerpt = words.slice(0, EXCERPT_WORDS).join(' ') + (words.length > EXCERPT_WORDS ? ' …' : '');
    const where = [r.section && `section “${r.section}”`, `p. ${r.page}`].filter(Boolean).join(', ');
    return `<li><span class="ref-id">[${esc(r.id)}]</span> ${esc(r.doc.title)}. ${esc(r.doc.issuer)}, ${esc(r.doc.year)}. ${esc(where)}.${
      r.doc.officialRef ? ` ${esc(r.doc.officialRef)}.` : ''
    } <span class="url">${esc(r.doc.url)}</span> (accessed ${esc(r.doc.accessed)}).<div class="excerpt">“${esc(excerpt)}”</div></li>`;
  });
  return `<section><h2>References</h2><p class="note">Passages retrieved from the reference corpus and cited in the text as [S1], [S2] and so on. Page numbers refer to the cited copy.</p><ol class="refs">${items.join('')}</ol></section>`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function table(t: Table, n: number): string {
  return `<figure class="tbl"><figcaption>Table ${n}. ${esc(t.title)}</figcaption><table><thead><tr>${t.head
    .map((h, i) => `<th class="${i ? 'r' : ''}">${esc(h)}</th>`)
    .join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'r' : ''}">${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}</figure>`;
}

export interface ReportImages {
  [key: string]: string | undefined; // data URLs: dust, heat, utci, ghg
}

export function renderReportHtml(
  p: ReportPayload,
  sections: NarrativeSection[],
  images: ReportImages,
  narrativeSource: string,
  refs: Passage[] = [],
): string {
  const tables = p.tables;
  const tIndex = (id: string) => tables.findIndex((t) => t.id === id) + 1;
  const tableAfter: Record<string, string[]> = {
    executive: ['kpi'],
    project: ['logistics'],
    site: ['climate', 'backgroundModel'],
    dust: ['receptors', 'dustSources'],
    ghg: ['ghg'],
    method: ['sources'],
    emp: ['emp'],
    compliance: ['compliance'],
  };
  const figures: Record<string, { key: string; caption: string }[]> = {
    dust: [{ key: 'dust', caption: 'PM10 site increment, 24 h mean, mitigated scenario (µg/m³)' }],
    heat: [
      { key: 'heat', caption: 'Surface temperature at the selected hour, mitigated scenario (°C)' },
      { key: 'utci', caption: 'Worker heat stress (UTCI) at the selected hour, mitigated scenario (°C)' },
    ],
    ghg: [{ key: 'ghg', caption: 'Embodied carbon on the building envelope (kgCO2e/m²)' }],
  };
  let fig = 0;
  const body = sections
    .map((s, i) => {
      const paras = s.paragraphs.map((x) => `<p>${esc(x)}</p>`).join('');
      const tbls = (tableAfter[s.id] ?? []).map((id) => {
        const t = tables.find((x) => x.id === id);
        return t ? table(t, tIndex(id)) : '';
      });
      const figs = (figures[s.id] ?? [])
        .filter((f) => images[f.key])
        .map(
          (f) =>
            `<figure class="fig"><img src="${images[f.key]}" alt=""/><figcaption>Figure ${++fig}. ${esc(f.caption)}</figcaption></figure>`,
        );
      return `<section><h2>${i + 1}. ${esc(s.title)}</h2>${paras}${figs.join('')}${tbls.join('')}</section>`;
    })
    .join('');
  const contents = sections.map((s, i) => `<li>${i + 1}. ${esc(s.title)}</li>`).join('');
  const assumptions = tables.find((t) => t.id === 'assumptions');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(p.meta.title)}</title><style>
@page { size: A4; margin: 18mm 16mm 20mm; }
body { font-family: "Segoe UI", Inter, Arial, sans-serif; font-size: 10pt; color: #1f1f1f; line-height: 1.45; margin: 0; }
h1 { font-size: 22pt; font-weight: 600; margin: 0 0 6mm; }
h2 { font-size: 13pt; font-weight: 600; margin: 8mm 0 3mm; border-bottom: 1px solid #d0d0d0; padding-bottom: 1.5mm; break-after: avoid; }
p { margin: 0 0 2.5mm; text-align: justify; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
.mark { display: flex; align-items: center; gap: 3mm; font-size: 16pt; font-weight: 600; } .mark span { color: #237A45; }
.mark svg { width: 20mm; height: auto; }
.cover .meta td { padding: 1mm 4mm 1mm 0; font-size: 10pt; } .cover .meta td:first-child { color: #616161; }
.sub { color: #616161; font-size: 11pt; margin-bottom: 10mm; }
.disclaimer { font-size: 8.5pt; color: #616161; border-top: 1px solid #d0d0d0; padding-top: 3mm; }
.toc { break-after: page; } .toc ol { list-style: none; padding: 0; } .toc li { padding: 1mm 0; border-bottom: 1px dotted #ccc; }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; font-variant-numeric: tabular-nums; }
th { text-align: left; background: #f3f3f3; font-weight: 600; padding: 1.2mm 1.5mm; border-bottom: 1px solid #c8c8c8; }
td { padding: 1mm 1.5mm; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
.r { text-align: right; }
figure { margin: 3mm 0 5mm; break-inside: avoid; } figcaption { font-size: 8.5pt; color: #444; margin-bottom: 1.5mm; font-weight: 600; }
.fig figcaption { margin-top: 1.5mm; } .fig img { width: 100%; border: 1px solid #ddd; }
.note { font-size: 8pt; color: #616161; margin-top: 1mm; }
.doc td { font-size: 9pt; }
.refs { padding: 0; list-style: none; font-size: 8.5pt; } .refs li { margin: 0 0 2.5mm; break-inside: avoid; }
.ref-id { font-weight: 600; } .url { word-break: break-all; color: #444; } .excerpt { color: #616161; margin-top: 0.8mm; }
</style></head><body>
<div class="cover"><div><div class="mark">${LOGO_SVG}<div><span>Env</span>elope</div></div></div>
<div><h1>${esc(p.meta.title)}</h1><div class="sub">${esc(p.project.name)} · ${esc(p.project.site)}<br/>Construction-phase screening assessment: dust, heat and greenhouse gases</div>
<table class="meta"><tr><td>Prepared for</td><td>${esc(p.meta.company)}</td></tr><tr><td>Prepared by</td><td>${esc(p.meta.preparedBy)}</td></tr><tr><td>Date</td><td>${esc(p.meta.date)}</td></tr><tr><td>Version</td><td>${esc(p.meta.version)}</td></tr></table></div>
<div class="disclaimer">Screening-level (Tier 1–2) assessment. It is not a substitute for an Environmental Impact Assessment by a NABET-accredited consultant or an AERMOD-based dispersion study. All compliance statements are indicative.</div></div>
<div class="toc"><h2>Document control</h2><table class="doc"><tr><th>Version</th><th>Date</th><th>Description</th><th>Narrative</th></tr><tr><td>${esc(p.meta.version)}</td><td>${esc(p.meta.date)}</td><td>Issued for review</td><td>${esc(narrativeSource)}</td></tr></table>
<h2>Contents</h2><ol>${contents}${refs.length ? '<li>References</li>' : ''}<li>Annex A. Assumptions register</li></ol></div>
${body}
${refs.length ? references(refs) : ''}
${assumptions ? `<section style="break-before: page"><h2>Annex A. Assumptions register</h2>${table(assumptions, tIndex('assumptions'))}</section>` : ''}
</body></html>`;
}
