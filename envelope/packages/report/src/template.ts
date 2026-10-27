/** Deterministic narrative writer: used when no LLM is reachable, so export always works. */
import type { NarrativeSection, ReportPayload } from './payload';
import { tableRef } from './payload';
import { withCitation } from './rag/citations';

/**
 * Passage ids for statements drawn from the given corpus documents (D-036); none when the
 * documents are not indexed, so the template still works without a corpus.
 */
export type Cite = (section: string, ...docIds: string[]) => string[];
const noCite: Cite = () => [];

const h = (p: ReportPayload, label: string) => p.headline.find((x) => x.label.startsWith(label));

export function templateNarrative(p: ReportPayload, cite: Cite = noCite): NarrativeSection[] {
  const c = (sentence: string, section: string, ...docs: string[]) =>
    withCitation(sentence, cite(section, ...docs));
  const pm = h(p, 'PM10 emitted');
  const inc = h(p, 'P98 of 24 h PM10 increment');
  const exceed = h(p, 'Site-caused');
  const ts = h(p, 'Site surface temperature');
  const risk = h(p, 'Working hours at heat-stress risk');
  const ghg = h(p, 'Construction emissions');
  const per = h(p, 'A1–A5 intensity');
  const s1 = h(p, 'Scope 1');
  const s2 = h(p, 'Scope 2');
  const school = h(p, 'PM10 24 h increment at the most affected school');
  const schoolDays = h(p, 'Site-caused NAAQS PM10 exceedance days at schools');
  const erosionShare = p.tables.find((t) => t.id === 'dustSources')?.rows[1]?.[2];
  const mits = p.mitigations.length ? p.mitigations.join('; ') : 'no mitigation measures';
  return [
    {
      id: 'executive',
      title: 'Executive summary',
      paragraphs: [
        `This report presents a screening-level assessment of construction-phase dust, heat and greenhouse-gas impacts for ${p.project.name} at ${p.project.site}. The assessment compares a baseline without mitigation against a mitigated scenario with the following measures: ${mits}.`,
        pm && inc
          ? `Site PM10 emissions over the construction programme are estimated at ${pm.baseline} ${pm.unit} in the baseline and ${pm.mitigated} ${pm.unit} with mitigation (${pm.deltaPct}). ${c(`The 98th-percentile 24-hour PM10 increment at the site boundary, the statistic used by the NAAQS, is ${inc.baseline} ${inc.unit} in the baseline and ${inc.mitigated} ${inc.unit} with mitigation.`, 'executive', 'naaqs-2009')}`
          : 'Dust results are not available because weather data could not be loaded.',
        ghg && per
          ? `Construction-stage greenhouse-gas emissions (modules A1–A5) are estimated at ${ghg.baseline} ${ghg.unit} in the baseline and ${ghg.mitigated} ${ghg.unit} with mitigation, an intensity of ${per.mitigated} ${per.unit} of gross floor area.`
          : '',
        `Key indicators are summarised in ${tableRef('kpi')}. All comparisons with regulatory limits are indicative.`,
      ].filter(Boolean),
    },
    {
      id: 'project',
      title: 'Project description',
      paragraphs: [
        `The project is a ${p.project.floors}-storey ${p.project.use} building with a ${p.project.structure} structure, a footprint of ${p.project.footprint} and a gross floor area of ${p.project.gfa}. The construction programme is ${p.project.programme} (${p.project.programmeSource}).`,
        `Material quantities and the vehicle movements derived from them are given in ${tableRef('logistics')}. Vehicle trips are calculated from quantities and vehicle capacities, not entered directly.`,
      ],
    },
    {
      id: 'site',
      title: 'Site and baseline environment',
      paragraphs: [
        `The site lies at ${p.project.coordinates}. Hourly weather for the reference year was taken from the ERA5 reanalysis and background air quality from the CAMS global model, as summarised in ${tableRef('climate')}.`,
        ...p.climate.slice(0, 1).map((c) => `The ${c.label.toLowerCase()} is ${c.value}.`),
        ...(p.background
          ? [
              `${p.background.note} The correction and its test against stations it was not trained on are described in ${tableRef('backgroundModel')}.`,
            ]
          : []),
      ],
    },
    {
      id: 'method',
      title: 'Methodology and data sources',
      paragraphs: [
        `${c('Dust emissions follow the WRAP Fugitive Dust Handbook for general construction activity, AP-42 Section 13.2.4 for material handling, AP-42 Section 13.2.2 for haul traffic on unpaved roads, and AP-42 Section 13.2.5 for wind erosion of exposed soil and stockpiles.', 'method', 'ap42-13.2.4', 'ap42-13.2.2', 'ap42-13.2.5')} Dispersion uses a steady-state Gaussian plume with Pasquill–Turner stability classes and Briggs urban dispersion coefficients.`,
        `Heat is assessed with a steady-state surface energy balance per grid cell, a simplified mean radiant temperature for a standing worker and the Universal Thermal Climate Index. ${c('Greenhouse-gas emissions cover modules A1–A5 of EN 15978 using ICE v3 emission factors and the CEA grid emission factor.', 'method', 'cea-v21')}`,
        `Data sources and their fetch times are listed in ${tableRef('sources')}. ${p.assumptionsUnverified} default parameters are marked as unverified in the assumptions register and should be confirmed before submission.`,
      ],
    },
    {
      id: 'dust',
      title: 'Dust impact assessment',
      paragraphs: [
        pm
          ? `Total PM10 emitted over the programme is ${pm.baseline} ${pm.unit} in the baseline and ${pm.mitigated} ${pm.unit} with mitigation. Concentrations at the site boundary and at sensitive receptors are given in ${tableRef('receptors')}.`
          : 'Dust results are not available.',
        pm && erosionShare
          ? `${tableRef('dustSources')} breaks the emissions down by source. Wind erosion accounts for ${erosionShare} of the baseline total; general construction activity is the main source on ordinary days and sets the 98th-percentile statistic.`
          : '',
        school && school.mitigated !== '–'
          ? `At the most affected school, college or hospital the site adds ${school.baseline} ${school.unit} to the 24-hour PM10 mean on the selected day in the baseline and ${school.mitigated} ${school.unit} with mitigation${schoolDays && schoolDays.mitigated !== '–' ? `; over the programme the site causes ${schoolDays.baseline} NAAQS exceedance days there in the baseline and ${schoolDays.mitigated} with mitigation` : ''}. How these receptors were found is stated under ${tableRef('receptors')}.`
          : `The note to ${tableRef('receptors')} states whether schools, colleges and hospitals near the site could be checked.`,
        exceed
          ? c(
              `The number of days on which site emissions are estimated to raise the 24-hour PM10 concentration above the NAAQS limit, on days when the background alone is below it, is ${exceed.baseline} in the baseline and ${exceed.mitigated} with mitigation at the most affected point.`,
              'dust',
              'naaqs-2009',
            )
          : '',
      ].filter(Boolean),
    },
    {
      id: 'heat',
      title: 'Heat impact assessment',
      paragraphs: [
        ts
          ? `At the selected hour, the mean surface temperature of the cleared site is ${ts.baseline} ${ts.unit} in the baseline and ${ts.mitigated} ${ts.unit} with mitigation.`
          : 'Heat results are not available.',
        risk
          ? `Working hours with a UTCI above the strong heat-stress threshold total ${risk.baseline} ${risk.unit} in the baseline and ${risk.mitigated} ${risk.unit} with mitigation, counted over the whole programme for an unshaded worker; the note to ${tableRef('kpi')} gives the total working hours and the selected hour.`
          : '',
      ].filter(Boolean),
    },
    {
      id: 'ghg',
      title: 'Greenhouse-gas assessment',
      paragraphs: [
        ghg
          ? `Construction-stage emissions total ${ghg.baseline} ${ghg.unit} in the baseline and ${ghg.mitigated} ${ghg.unit} with mitigation. The breakdown by module and scope is given in ${tableRef('ghg')}.`
          : '',
        s1 && s2
          ? `Scope 1 site diesel is ${s1.baseline} ${s1.unit} in the baseline and covers construction plant, site vehicles and the DG sets that supply site power. Scope 2 grid electricity is ${s2.baseline} ${s2.unit} in the baseline because no grid connection is assumed; the note to ${tableRef('ghg')} gives the litres and kWh behind these figures.`
          : '',
      ].filter(Boolean),
    },
    {
      id: 'emp',
      title: 'Mitigation measures and Environmental Management Plan',
      paragraphs: [
        `${c(`The mitigated scenario includes: ${mits}.`, 'emp', 'gsr-94e-2018', 'cpcb-dust-2017', 'caqm-97-2026', 'cpcb-cd-2017')} Responsibilities and monitoring for each measure are set out in ${tableRef('emp')}.`,
      ],
    },
    {
      id: 'compliance',
      title: 'Indicative compliance matrix',
      paragraphs: [
        `${c(`${tableRef('compliance')} compares the project with the applicable requirements.`, 'compliance', 'naaqs-2009', 'eia-2006', 'gsr-94e-2018')} The comparison is indicative and does not constitute a determination by a regulator.`,
        ...p.compliance.map((row) => `${row.regulation}: ${row.status}.`),
      ],
    },
    {
      id: 'monitoring',
      title: 'Monitoring plan',
      paragraphs: [
        `${c('Continuous PM10 and PM2.5 monitoring at the site boundary on the downwind side, daily inspection of dust controls, and a record of water used for sprinkling are recommended.', 'monitoring', 'cpcb-dust-2017', 'cpcb-cd-2017')} Worker heat stress should be tracked with a site wet-bulb globe temperature meter during the hot season.`,
      ],
    },
    {
      id: 'limitations',
      title: 'Limitations and uncertainty',
      paragraphs: p.limitations,
    },
  ];
}
