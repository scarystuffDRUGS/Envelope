import { Slider, Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ProgrammeMonths } from '@envelope/models';
import {
  checkProgramme,
  formatHour,
  phaseForMonth,
  programmeTotal,
  scaleProgramme,
  toSchedule,
  isSensitive,
} from '@envelope/models';
import { useEffect, useState } from 'react';
import type { PresetId } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { viewerCommands } from '../viewer/controller';
import { DatePicker } from './DatePicker';
import { ALL_MEASURES } from './measures';
import { Icon, IconButton, ToolGroup } from './ui';

const useStyles = makeStyles({
  // Full width above the panels and the map (D-032); segments wrap to a second row rather than
  // scroll, so every control stays in view, and share the spare width.
  root: {
    flexShrink: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: '8px',
    paddingTop: '4px',
    '& > [role="group"]': { flexGrow: 1 },
  },
  text: { fontSize: '14px', lineHeight: '20px', color: 'var(--on-surface)' },
  muted: { fontSize: '12px', lineHeight: '16px', color: 'var(--on-surface-variant)' },
  value: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--on-surface)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    minWidth: '72px',
  },
  slider: { width: '180px' },
  field: { width: '48px', height: '32px', padding: '0 8px', textAlign: 'right' },
  fieldUser: { backgroundColor: 'color-mix(in srgb, var(--tertiary) 10%, transparent)' },
  label: { fontSize: '12px', color: 'var(--on-surface-variant)' },
  warn: { fontSize: '12px', color: 'var(--on-warning-container)', maxWidth: '260px', lineHeight: '16px' },
  chips: { display: 'flex', gap: '8px', flexWrap: 'nowrap' },
  facts: { display: 'flex', gap: '20px' },
  fact: { display: 'flex', flexDirection: 'column' },
  reportText: { maxWidth: '420px' },
});

function NumField({
  value,
  onCommit,
  testId,
  label,
  user,
}: {
  value: number;
  onCommit: (v: number) => void;
  testId: string;
  label: string;
  user: boolean;
}) {
  const s = useStyles();
  const [draft, setDraft] = useState(String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setBad(false);
  }, [value]);
  const commit = () => {
    const v = Math.round(Number(draft));
    if (!Number.isFinite(v) || v <= 0) {
      setBad(true); // rejected: zero or negative
      setDraft(String(value));
      return;
    }
    onCommit(v);
  };
  return (
    <input
      className={mergeClasses('env-field', s.field, user && s.fieldUser)}
      aria-label={label}
      aria-invalid={bad}
      value={draft}
      data-testid={testId}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** Construction programme: auto-derived default, user override (D-020). */
function ProgrammeGroup() {
  const s = useStyles();
  const results = useAppStore((st) => st.results);
  const override = useAppStore((st) => st.programmeOverride);
  const setOverride = useAppStore((st) => st.setProgrammeOverride);
  if (!results)
    return (
      <ToolGroup label="Construction programme">
        <span className={s.muted}>Deriving programme…</span>
      </ToolGroup>
    );
  const { auto, effective } = results.baseline.programme;
  const current = override ?? effective;
  const check = override ? checkProgramme(override, auto) : { errors: [], warnings: [] };
  const set = (p: ProgrammeMonths) => setOverride(p);
  const isUser = override !== null;
  return (
    <ToolGroup label="Construction programme (months)">
      <span className={s.label}>Excav.</span>
      <NumField
        value={current.excavation}
        label="Excavation months"
        testId="ctl-prog-excavation"
        user={isUser}
        onCommit={(v) => set({ ...current, excavation: v })}
      />
      <span className={s.label}>Struct.</span>
      <NumField
        value={current.structure}
        label="Structure months"
        testId="ctl-prog-structure"
        user={isUser}
        onCommit={(v) => set({ ...current, structure: v })}
      />
      <span className={s.label}>Finish.</span>
      <NumField
        value={current.finishing}
        label="Finishing months"
        testId="ctl-prog-finishing"
        user={isUser}
        onCommit={(v) => set({ ...current, finishing: v })}
      />
      <span className={s.label}>Total</span>
      <NumField
        value={programmeTotal(current)}
        label="Total programme months"
        testId="ctl-prog-total"
        user={isUser}
        onCommit={(v) => set(scaleProgramme(current, v))}
      />
      <span
        className={mergeClasses('env-badge', isUser ? 'env-badge--info' : 'env-badge--neutral')}
        data-testid="txt-prog-status"
      >
        {isUser ? 'User-set' : `Auto: ${programmeTotal(auto)} months`}
      </span>
      {check.warnings.length > 0 && <span className={s.warn}>{check.warnings[0]}</span>}
      {isUser && (
        <button
          type="button"
          className="env-btn env-btn--text env-btn--sm env-state"
          data-testid="ctl-prog-reset"
          title={`Return to the derived ${programmeTotal(auto)}-month programme`}
          onClick={() => setOverride(null)}
        >
          <Icon name="restart_alt" size={18} />
          Reset to auto
        </button>
      )}
    </ToolGroup>
  );
}

function ProjectTab() {
  const s = useStyles();
  const b = useAppStore((st) => st.building);
  const source = useAppStore((st) => st.buildingSource);
  const setImportOpen = useAppStore((st) => st.setImportOpen);
  return (
    <>
      <ToolGroup label="Building">
        <div className={s.facts}>
          <div className={s.fact}>
            <span className={s.text}>{b.name}</span>
            <span className={s.muted}>
              {b.use}, {b.structure.replace('-', ' ')}
            </span>
          </div>
          <div className={s.fact}>
            <span className={s.value}>{b.floors} floors</span>
            <span className={s.muted}>{(b.floors * b.floorToFloorM).toFixed(1)} m tall</span>
          </div>
          <div className={s.fact}>
            <span className={s.text}>{source.kind === 'demo' ? 'Demo building' : source.fileName}</span>
            <span className={s.muted}>
              {source.kind === 'demo'
                ? 'fixtures/demo/building.json'
                : source.kind === 'ifc'
                  ? 'IFC import'
                  : 'mesh import'}
            </span>
          </div>
        </div>
        <Tooltip content="Import an IFC or mesh model of your building" relationship="description" withArrow>
          <button
            type="button"
            className="env-btn env-btn--outlined env-btn--sm env-btn--icon-lead env-state"
            data-testid="ctl-import-open"
            onClick={() => setImportOpen(true)}
          >
            <Icon name="upload_file" size={18} />
            Import model
          </button>
        </Tooltip>
      </ToolGroup>
      <ProgrammeGroup />
    </>
  );
}

function SiteTab() {
  const s = useStyles();
  const geo = useAppStore((st) => st.building.site);
  const results = useAppStore((st) => st.results);
  const siteData = useAppStore((st) => st.siteData);
  const setReceptorsOpen = useAppStore((st) => st.setReceptorsOpen);
  const nearby = (results?.mitigated.dust.receptors ?? []).filter((r) => isSensitive(r.kind)).length;
  const status = siteData?.provenance.receptors?.status ?? siteData?.provenance.osm.status;
  return (
    <>
      <ToolGroup label="Site">
        <Icon name="location_on" className={s.muted} />
        <div className={s.fact}>
          <span className={s.text}>{geo.label}</span>
          <span className={mergeClasses(s.muted, 'num')}>
            {geo.lat.toFixed(5)}° N, {geo.lon.toFixed(5)}° E · {geo.timezone}
          </span>
        </div>
      </ToolGroup>
      <ToolGroup label="Schools and hospitals">
        <div className={s.fact}>
          <span className={s.value} data-testid="receptors-count">
            {results ? `${nearby} within 500 m` : 'Checking…'}
          </span>
          <span className={s.muted}>
            {status === 'unavailable'
              ? 'OpenStreetMap unreachable: add by hand'
              : 'OpenStreetMap and your additions'}
          </span>
        </div>
        <button
          type="button"
          className="env-btn env-btn--outlined env-btn--sm env-btn--icon-lead env-state"
          data-testid="ctl-receptors-open"
          onClick={() => setReceptorsOpen(true)}
        >
          <Icon name="add_location_alt" size={18} />
          Schools and hospitals
        </button>
      </ToolGroup>
      <ToolGroup label="View">
        <Tooltip content="Fit to site (F)" relationship="description" withArrow>
          <button
            type="button"
            className="env-btn env-btn--outlined env-btn--sm env-btn--icon-lead env-state"
            data-testid="ctl-fit-site"
            onClick={() => viewerCommands.fitToSite()}
          >
            <Icon name="fit_screen" size={18} />
            Fit to site
          </button>
        </Tooltip>
      </ToolGroup>
    </>
  );
}

function AnalysisTab() {
  const s = useStyles();
  const { hour, constructionMonth } = useAppStore((st) => st.scenario);
  const playing = useAppStore((st) => st.ui.playing);
  const setHour = useAppStore((st) => st.setHour);
  const stepHour = useAppStore((st) => st.stepHour);
  const togglePlaying = useAppStore((st) => st.togglePlaying);
  const setConstructionMonth = useAppStore((st) => st.setConstructionMonth);
  const results = useAppStore((st) => st.results);
  const goToDay = useAppStore((st) => st.goToDay);
  const effective = results?.baseline.programme.effective;
  const total = effective ? programmeTotal(effective) : 24;
  const { phase } = phaseForMonth(constructionMonth, effective ? toSchedule(effective) : undefined);
  const b = results?.baseline;
  return (
    <>
      <ToolGroup label="Date">
        <DatePicker />
      </ToolGroup>
      <ToolGroup label="Hour of day">
        <IconButton
          icon="skip_previous"
          label="Previous hour (←)"
          testId="ctl-hour-prev"
          small
          onClick={() => stepHour(-1)}
        />
        <IconButton
          icon={playing ? 'pause' : 'play_arrow'}
          label={playing ? 'Pause the hour animation' : 'Play through the day, one hour per second'}
          testId="ctl-hour-play"
          small
          pressed={playing}
          onClick={togglePlaying}
        />
        <IconButton
          icon="skip_next"
          label="Next hour (→)"
          testId="ctl-hour-next"
          small
          onClick={() => stepHour(1)}
        />
        <Slider
          className={s.slider}
          aria-label="Hour"
          size="small"
          min={0}
          max={23}
          step={1}
          value={hour}
          data-testid="ctl-hour-slider"
          onChange={(_, d) => setHour(d.value)}
        />
        <span className={s.value}>{formatHour(hour)} IST</span>
      </ToolGroup>
      <ToolGroup label="Construction month">
        <Slider
          className={s.slider}
          aria-label="Construction month"
          size="small"
          min={1}
          max={total}
          step={1}
          value={Math.min(constructionMonth, total)}
          data-testid="ctl-month-slider"
          onChange={(_, d) => setConstructionMonth(d.value)}
        />
        <span className={s.value}>
          {Math.min(constructionMonth, total)} of {total}
        </span>
        <span className="env-badge env-badge--neutral">{phase.label}</span>
      </ToolGroup>
      <ToolGroup label="Jump to">
        <div className={s.chips}>
          <Tooltip
            content="Show the 15th of the current construction month"
            relationship="description"
            withArrow
          >
            <button
              type="button"
              className="env-chip env-state"
              data-testid="ctl-day-typical"
              onClick={() => goToDay(useAppStore.getState().scenario.constructionMonth, 15)}
            >
              <Icon name="calendar_today" size={18} />
              Mid-month
            </button>
          </Tooltip>
          {b?.dust.worstDay && (
            <Tooltip
              content={`Day with the highest 24 h site PM10 increment: month ${b.dust.worstDay.month}, day ${b.dust.worstDay.dayOfMonth}`}
              relationship="description"
              withArrow
            >
              <button
                type="button"
                className="env-chip env-state"
                data-testid="ctl-day-worst-dust"
                onClick={() => goToDay(b.dust.worstDay!.month, b.dust.worstDay!.dayOfMonth)}
              >
                <Icon name="air" size={18} />
                Worst dust day
              </button>
            </Tooltip>
          )}
          {b?.heat.hottestDay && (
            <Tooltip
              content={`Day with the highest air temperature in the programme (${b.heat.hottestDay.taMax.toFixed(1)} °C)`}
              relationship="description"
              withArrow
            >
              <button
                type="button"
                className="env-chip env-state"
                data-testid="ctl-day-hottest"
                onClick={() => goToDay(b.heat.hottestDay!.month, b.heat.hottestDay!.dayOfMonth)}
              >
                <Icon name="sunny" size={18} />
                Hottest day
              </button>
            </Tooltip>
          )}
        </div>
      </ToolGroup>
    </>
  );
}

const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'Baseline only: no measures' },
  { id: 'cpcb', label: 'CPCB minimum', hint: 'CPCB minimum dust measures' },
  { id: 'best', label: 'Best practice', hint: 'Best-practice dust, heat and site power measures' },
  { id: 'netzero', label: 'Net-zero ready', hint: 'Every measure, low-carbon concrete at 40%' },
];

function MitigationTab() {
  const s = useStyles();
  const preset = useAppStore((st) => st.preset);
  const apply = useAppStore((st) => st.applyPreset);
  const m = useAppStore((st) => st.mitigations);
  const on = ALL_MEASURES.filter((x) => m[x.id]).length;
  return (
    <>
      <ToolGroup label="Preset">
        <div className={s.chips} role="radiogroup" aria-label="Mitigation preset">
          {PRESETS.map((p) => (
            <Tooltip key={p.id} content={p.hint} relationship="description" withArrow>
              <button
                type="button"
                className="env-chip env-state"
                aria-pressed={preset === p.id}
                data-testid={`ctl-preset-${p.id}`}
                onClick={() => apply(p.id)}
              >
                {preset === p.id && <Icon name="check" size={18} />}
                {p.label}
              </button>
            </Tooltip>
          ))}
          {preset === 'custom' && (
            <span className="env-chip" aria-pressed="true" data-testid="txt-preset-custom">
              <Icon name="check" size={18} />
              Custom
            </span>
          )}
        </div>
      </ToolGroup>
      <ToolGroup label="Measures on">
        <span className={s.value}>
          {on} of {ALL_MEASURES.length}
        </span>
        <span className={s.muted}>Switch measures on in the Mitigation section of the Layers sheet.</span>
      </ToolGroup>
    </>
  );
}

function ReportTab() {
  const s = useStyles();
  const results = useAppStore((st) => st.results);
  return (
    <ToolGroup label="Environmental sustainability assessment report">
      <span className={mergeClasses(s.muted, s.reportText)}>
        Formal A4 PDF for submission: baseline and mitigated tables, map figures and a narrative whose every
        figure is checked against the model results.
      </span>
      <Tooltip content="Export the assessment report (Ctrl+E)" relationship="description" withArrow>
        <button
          type="button"
          className="env-btn env-btn--filled env-btn--icon-lead env-state"
          data-testid="ctl-export-report"
          disabled={!results}
          onClick={() => useAppStore.getState().setReportOpen(true)}
        >
          <Icon name="picture_as_pdf" />
          Export report
        </button>
      </Tooltip>
    </ToolGroup>
  );
}

/** Contextual controls for the selected workspace, as a row of segment cards above the map. */
export function WorkspaceBar() {
  const s = useStyles();
  const tab = useAppStore((st) => st.ui.ribbonTab);
  return (
    <div className={s.root} role="toolbar" aria-label={`${tab} controls`} data-testid="ribbon-body">
      {tab === 'project' && <ProjectTab />}
      {tab === 'site' && <SiteTab />}
      {tab === 'analysis' && <AnalysisTab />}
      {tab === 'mitigation' && <MitigationTab />}
      {tab === 'report' && <ReportTab />}
    </div>
  );
}
