import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { buildPayload } from '../analysis/payload';
import type { ImpactLayerId } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { viewerCommands } from '../viewer/controller';
import { EmptyState } from './EmptyState';
import { Icon, IconButton } from './ui';

const useStyles = makeStyles({
  surface: { width: '1120px', maxWidth: '96vw', height: '90vh', padding: 0, overflow: 'hidden' },
  body: { height: '100%', display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 'none' },
  cols: { flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '380px 1fr' },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px 12px 24px',
    borderBottom: '1px solid var(--outline-variant)',
  },
  title: {
    flexGrow: 1,
    fontFamily: 'var(--font-brand)',
    fontSize: '22px',
    lineHeight: '28px',
    fontWeight: 400,
  },
  side: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
    maxHeight: 'none',
    borderRight: '1px solid var(--outline-variant)',
    // DialogContent brings grid-area: content; place it in the first column explicitly.
    gridColumnStart: 1,
    gridColumnEnd: 2,
    gridRowStart: 1,
    gridRowEnd: 2,
  },
  stepHead: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', fontWeight: 500 },
  num: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: '12px',
    backgroundColor: 'var(--surface-container-highest)',
    color: 'var(--on-surface-variant)',
    flexShrink: 0,
  },
  numOn: { backgroundColor: 'var(--primary)', color: 'var(--on-primary)' },
  numDone: { backgroundColor: 'var(--primary-container)', color: 'var(--on-primary-container)' },
  stepBody: {
    marginLeft: '11px',
    paddingLeft: '23px',
    paddingBottom: '4px',
    borderLeft: '1px solid var(--outline-variant)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  steps: { listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 0',
    color: 'var(--on-surface-variant)',
  },
  done: { color: 'var(--primary)' },
  active: { color: 'var(--on-surface)', fontWeight: 500 },
  meta: { fontSize: '13px', lineHeight: '18px', color: 'var(--on-surface-variant)', margin: 0 },
  err: {
    fontSize: '13px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--error-container)',
    color: 'var(--on-error-container)',
  },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  previewPane: {
    backgroundColor: 'var(--surface-container)',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: '16px',
    minHeight: 0,
    gridColumnStart: 2,
    gridColumnEnd: 3,
    gridRowStart: 1,
    gridRowEnd: 2,
  },
  preview: {
    width: '100%',
    maxWidth: '820px',
    height: '100%',
    border: 0,
    borderRadius: 'var(--radius-sm)',
    backgroundColor: '#ffffff',
    boxShadow: 'var(--elevation-2)',
  },
  empty: { alignSelf: 'center' },
});

const STEPS = [
  'Building payload',
  'Capturing maps',
  'Writing narrative',
  'Validating figures',
  'Rendering PDF',
];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A readable message for a failed report request (rate limit, size limit, server error). */
async function reportError(res: Response): Promise<string> {
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? 0);
    return `Report limit reached for now. Try again in ${Math.max(1, Math.ceil(wait / 60))} min.`;
  }
  if (res.status === 413)
    return 'The map snapshots are too large to send. Make the window smaller and try again.';
  return `Report service returned ${res.status}`;
}

/**
 * Full-screen report view: 1 details → 2 generate → 3 preview and download. The 3D map keeps rendering
 * behind the dialog, so the map figures can be captured while it is open.
 */
export function ReportDialog() {
  const s = useStyles();
  const open = useAppStore((st) => st.ui.reportOpen);
  const setOpen = useAppStore((st) => st.setReportOpen);
  const results = useAppStore((st) => st.results);
  const projectName = useAppStore((st) => st.projectName);
  const [title, setTitle] = useState('Environmental Sustainability Assessment Report');
  const [company, setCompany] = useState('Demo Developers Pvt. Ltd.');
  const [preparedBy, setPreparedBy] = useState('Envelope assessment team');
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  // The PDF arrives as the response body and is shown and downloaded from a blob URL.
  const [report, setReport] = useState<{ url: string; narrativeSource: string; dropped: number } | null>(
    null,
  );
  useEffect(() => () => void (report && URL.revokeObjectURL(report.url)), [report]);

  const run = async () => {
    const st = useAppStore.getState();
    if (!st.results) return;
    setError(null);
    setReport(null);
    try {
      setStep(0);
      const payload = buildPayload({
        results: st.results,
        mitigations: st.mitigations,
        assumptions: st.assumptions,
        siteData: st.siteData,
        projectName,
        title,
        company,
        preparedBy,
        building: st.building,
        buildingSource: st.buildingSource,
      });
      setStep(1);
      const prev = { layer: st.impactLayer, show: st.showScenario, metric: st.dustMetric };
      st.setDustMetric('day');
      if (st.showScenario !== 'mitigated') st.toggleShowScenario();
      viewerCommands.fitToSite();
      await wait(1400);
      const images: Record<string, string> = {};
      const keys: [string, ImpactLayerId][] = [
        ['dust', 'dust'],
        ['heat', 'ts'],
        ['utci', 'utci'],
        ['ghg', 'ghg'],
      ];
      for (const [key, id] of keys) {
        useAppStore.getState().setImpactLayer(id);
        await wait(900);
        const img = viewerCommands.capture();
        if (img) images[key] = img;
      }
      const after = useAppStore.getState();
      after.setImpactLayer(prev.layer);
      after.setDustMetric(prev.metric);
      if (after.showScenario !== prev.show) after.toggleShowScenario();
      setStep(2);
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, images }),
      });
      setStep(3);
      if (!res.ok) throw new Error(await reportError(res));
      const pdf = await res.blob();
      setStep(4);
      await wait(300);
      setReport({
        url: URL.createObjectURL(pdf),
        narrativeSource: decodeURIComponent(res.headers.get('X-Narrative-Source') ?? 'unknown'),
        dropped: Number(res.headers.get('X-Narrative-Dropped') ?? 0),
      });
      setStep(5);
    } catch (e) {
      setError((e as Error).message);
      setStep(-1);
    }
  };

  const generating = step >= 0 && step < 5;
  const phase = report ? 3 : generating ? 2 : 1;
  const num = (n: number) => (
    <span className={mergeClasses(s.num, phase === n && s.numOn, phase > n && s.numDone)}>
      {phase > n ? <Icon name="check" size={18} /> : n}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface className={s.surface} data-testid="dialog-report">
        <DialogBody className={s.body}>
          <div className={s.head}>
            <Icon name="description" size={24} />
            <DialogTitle className={s.title}>Export assessment report</DialogTitle>
            <IconButton icon="close" label="Close" testId="ctl-report-close" onClick={() => setOpen(false)} />
          </div>
          <div className={s.cols}>
            <DialogContent className={mergeClasses(s.side, 'env-scroll')}>
              <div className={s.stepHead}>
                {num(1)}
                Report details
              </div>
              <div className={s.stepBody}>
                <Field label="Report title">
                  <Input
                    value={title}
                    onChange={(_, d) => setTitle(d.value)}
                    data-testid="ctl-report-title"
                  />
                </Field>
                <Field label="Company">
                  <Input
                    value={company}
                    onChange={(_, d) => setCompany(d.value)}
                    data-testid="ctl-report-company"
                  />
                </Field>
                <Field label="Prepared by">
                  <Input
                    value={preparedBy}
                    onChange={(_, d) => setPreparedBy(d.value)}
                    data-testid="ctl-report-preparedby"
                  />
                </Field>
                <p className={s.meta}>
                  Before and after mitigation, A4 PDF. Numbers, tables and maps come from the model results;
                  the narrative is checked so that every figure in it appears in the tables.
                </p>
              </div>
              <div className={s.stepHead}>
                {num(2)}
                Generate
              </div>
              <div className={s.stepBody}>
                {step >= 0 && (
                  <ul className={s.steps} data-testid="report-steps">
                    {STEPS.map((label, i) => (
                      <li
                        key={label}
                        className={mergeClasses(s.step, i < step && s.done, i === step && s.active)}
                      >
                        <Icon
                          name={
                            i < step
                              ? 'check_circle'
                              : i === step && step < 5
                                ? 'progress_activity'
                                : 'radio_button_unchecked'
                          }
                          size={18}
                        />
                        {label}
                        {i === step && step < 5 ? '…' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {error && <div className={s.err}>Export failed: {error}</div>}
                <div className={s.actions}>
                  <button
                    type="button"
                    className={mergeClasses(
                      'env-btn env-btn--icon-lead env-state',
                      report ? 'env-btn--outlined' : 'env-btn--filled',
                    )}
                    disabled={!results || generating}
                    onClick={run}
                    data-testid="ctl-report-generate"
                  >
                    <Icon name={report ? 'refresh' : 'play_arrow'} size={18} />
                    {report ? 'Generate again' : 'Generate report'}
                  </button>
                </div>
              </div>
              <div className={s.stepHead}>
                {num(3)}
                Preview and download
              </div>
              <div className={s.stepBody}>
                {report ? (
                  <>
                    <p className={s.meta} data-testid="report-ready">
                      Narrative: {report.narrativeSource}. Sentences removed by the figure check:{' '}
                      {report.dropped}.
                    </p>
                    <div className={s.actions}>
                      <a
                        className="env-btn env-btn--filled env-btn--icon-lead env-state"
                        href={report.url}
                        download="Envelope-assessment-report.pdf"
                        data-testid="ctl-report-download"
                      >
                        <Icon name="download" size={18} />
                        Download PDF
                      </a>
                    </div>
                  </>
                ) : (
                  <p className={s.meta}>The preview appears on the right once the report is generated.</p>
                )}
              </div>
            </DialogContent>
            <div className={s.previewPane}>
              {report ? (
                <iframe className={s.preview} title="Report preview" src={report.url} />
              ) : (
                <div className={s.empty}>
                  <EmptyState
                    icon="article"
                    title={generating ? 'Generating the report…' : 'No preview yet'}
                    text="Fill in the details and generate the report to preview it page by page."
                  />
                </div>
              )}
            </div>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
