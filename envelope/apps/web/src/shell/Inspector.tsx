import { Skeleton, SkeletonItem, makeStyles, mergeClasses } from '@fluentui/react-components';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Fragment, useEffect, useRef } from 'react';
import type { KpiRow } from '../analysis/kpis';
import { KPIS, delta, fmt } from '../analysis/kpis';
import type { Results } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { cssToken } from '../theme/theme';
import { Icon, Section, Segmented } from './ui';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const useStyles = makeStyles({
  root: {
    width: '368px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    paddingBottom: '8px',
  },
  scenario: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: 'var(--surface-container-lowest)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    color: 'var(--on-surface-variant)',
    flexShrink: 0,
  },
  running: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' },
  cards: { display: 'flex', flexDirection: 'column', gap: '8px' },
  kpi: {
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--surface-container-low)',
    padding: '12px',
  },
  kpiHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    lineHeight: '18px',
    fontWeight: 500,
    color: 'var(--on-surface-variant)',
    marginBottom: '2px',
  },
  legend: { fontSize: '11px', color: 'var(--on-surface-variant)', margin: '0 0 8px 28px' },
  pair: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  half: { borderRadius: 'var(--radius-sm)', padding: '8px 10px', display: 'flex', flexDirection: 'column' },
  before: { backgroundColor: 'var(--surface-container-lowest)' },
  after: {
    backgroundColor: 'color-mix(in srgb, var(--primary) 12%, var(--surface-container-lowest))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent)',
  },
  halfLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    fontSize: '11px',
    lineHeight: '16px',
    fontWeight: 500,
    letterSpacing: '0.5px',
    color: 'var(--on-surface-variant)',
  },
  big: {
    fontFamily: 'var(--font-brand)',
    fontSize: '24px',
    lineHeight: '32px',
    color: 'var(--on-surface)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  unit: {
    fontFamily: 'var(--font-plain)',
    fontSize: '12px',
    color: 'var(--on-surface-variant)',
    marginLeft: '4px',
  },
  table: { width: '100%' },
  rowUnit: { color: 'var(--on-surface-variant)', fontSize: '11px' },
  afterCol: { backgroundColor: 'color-mix(in srgb, var(--primary) 7%, transparent)' },
  deltaCell: { paddingTop: '2px' },
  missing: { fontSize: '12px', lineHeight: '16px', color: 'var(--on-surface-variant)' },
  chart: { height: '168px', margin: '0 4px' },
  chartTitle: { fontSize: '13px', fontWeight: 500, color: 'var(--on-surface)', margin: '4px 0 0' },
  chartSub: { fontSize: '12px', color: 'var(--on-surface-variant)' },
  note: { fontSize: '12px', lineHeight: '16px', color: 'var(--on-surface-variant)', margin: '12px 0 0' },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  err: {
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--error-container)',
    color: 'var(--on-error-container)',
    fontSize: '13px',
    display: 'flex',
    gap: '8px',
  },
});

const HEADLINE: { id: string; icon: string }[] = [
  { id: 'pm10MaxInc', icon: 'air' },
  { id: 'maxUtci', icon: 'sunny' },
  { id: 'ghgTotal', icon: 'co2' },
];

/** Why an indicator has no value in either scenario, instead of a bare "–" and "no change". */
function missingNote(id: string, receptorStatus: string | undefined): string {
  if (id === 'pm10DaySensitive' || id === 'sensitiveExceed')
    return receptorStatus === 'unavailable'
      ? 'Not checked: OpenStreetMap could not be reached. Add schools and hospitals by hand (Site).'
      : 'No school, college or hospital within 500 m of the site boundary.';
  return 'Not available for this site.';
}

/** Change badge: lower is better for every KPI. */
function DeltaBadge({ b, m, digits }: { b: number; m: number; digits: number }) {
  const d = delta(b, m, digits);
  const better = m < b - 1e-9;
  const worse = m > b + 1e-9;
  return (
    <span
      className={mergeClasses(
        'env-badge',
        better ? 'env-badge--good' : worse ? 'env-badge--bad' : 'env-badge--neutral',
      )}
      title={`Change ${d.abs}`}
    >
      {better && <Icon name="arrow_downward" size={18} />}
      {worse && <Icon name="arrow_upward" size={18} />}
      {d.pct === '–' ? 'no change' : d.pct}
    </span>
  );
}

function KpiCard({ k, icon, results }: { k: KpiRow; icon: string; results: Results }) {
  const s = useStyles();
  const b = k.value(results.baseline);
  const m = k.value(results.mitigated);
  return (
    <article className={s.kpi} data-testid={`kpi-card-${k.id}`}>
      <div className={s.kpiHead}>
        <Icon name={icon} />
        {k.label}
      </div>
      <div className={s.legend}>Before and after mitigation</div>
      <div className={s.pair}>
        <div className={mergeClasses(s.half, s.before)}>
          <span className={s.halfLabel}>Before</span>
          <span className={s.big}>
            {fmt(b, k.digits)}
            <span className={s.unit}>{k.unit}</span>
          </span>
        </div>
        <div className={mergeClasses(s.half, s.after)}>
          <span className={s.halfLabel}>
            After
            <DeltaBadge b={b} m={m} digits={k.digits} />
          </span>
          <span className={s.big}>
            {fmt(m, k.digits)}
            <span className={s.unit}>{k.unit}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function TrendChart({
  title,
  unit,
  baseline,
  mitigated,
  testId,
}: {
  title: string;
  unit: string;
  baseline: number[];
  mitigated: number[];
  testId: string;
}) {
  const s = useStyles();
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const theme = useAppStore((st) => st.ui.theme);
  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
    };
  }, []);
  useEffect(() => {
    // Canvas cannot read CSS variables: resolve the theme tokens now (re-run on theme change).
    const ink = cssToken('on-surface-variant');
    const grid = cssToken('chart-grid');
    const base = cssToken('chart-baseline');
    const mit = cssToken('chart-mitigated');
    const tip = cssToken('inverse-surface');
    const tipInk = cssToken('inverse-on-surface');
    chart.current?.setOption({
      animationDuration: 300,
      textStyle: { fontFamily: 'Roboto, sans-serif', fontSize: 11 },
      grid: { left: 40, right: 8, top: 28, bottom: 22 },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 4,
        textStyle: { fontSize: 11, color: ink },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tip,
        borderWidth: 0,
        textStyle: { color: tipInk, fontSize: 12 },
        valueFormatter: (v: number) => `${v.toFixed(1)} ${unit}`,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: baseline.map((_, i) => `M${i + 1}`),
        axisLabel: { color: ink, fontSize: 10 },
        axisLine: { lineStyle: { color: grid } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: ink, fontSize: 10 },
        splitLine: { lineStyle: { color: grid } },
      },
      series: [
        {
          name: 'Before mitigation',
          type: 'line',
          data: baseline,
          showSymbol: false,
          smooth: 0.25,
          lineStyle: { color: base, width: 2, type: 'dashed' },
          itemStyle: { color: base },
        },
        {
          name: 'After mitigation',
          type: 'line',
          data: mitigated,
          showSymbol: false,
          smooth: 0.25,
          lineStyle: { color: mit, width: 2.5 },
          itemStyle: { color: mit },
          areaStyle: { color: mit, opacity: 0.12 },
        },
      ],
    });
  }, [baseline, mitigated, unit, theme]);
  return (
    <>
      <div className={s.chartTitle}>{title}</div>
      <div className={s.chartSub}>{unit} per construction month</div>
      <div ref={ref} className={s.chart} data-testid={testId} />
    </>
  );
}

/** `width` (px) applies when docked; the dropdown sheet sets its own. */
export function Inspector({ className, width }: { className?: string; width?: number }) {
  const s = useStyles();
  const results = useAppStore((st) => st.results);
  const running = useAppStore((st) => st.running);
  const error = useAppStore((st) => st.computeError);
  const show = useAppStore((st) => st.showScenario);
  const toggleShow = useAppStore((st) => st.toggleShowScenario);
  const overrides = useAppStore((st) => st.assumptions);
  const resetA = useAppStore((st) => st.resetAssumptions);
  const openA = useAppStore((st) => st.setAssumptionsOpen);
  const changed = Object.keys(overrides).length;
  const receptorStatus = useAppStore(
    (st) => st.siteData?.provenance.receptors?.status ?? st.siteData?.provenance.osm?.status,
  );
  const groups = ['Dust', 'Heat', 'GHG'] as const;

  return (
    <aside
      className={mergeClasses(s.root, 'env-scroll', className)}
      style={width ? { width } : undefined}
      data-testid="panel-inspector"
      aria-label="Inspector"
    >
      <div className={s.scenario}>
        <span>Map shows</span>
        <Segmented
          label="Map shows"
          value={show}
          onChange={() => toggleShow()}
          options={[
            { value: 'baseline', label: 'Before', testId: 'ctl-show-baseline' },
            {
              value: 'mitigated',
              label: 'After',
              testId: 'ctl-show-mitigated',
              tooltip: 'Toggle before / after mitigation (M)',
            },
          ]}
        />
        {running && (
          <span className={s.running}>
            <Icon name="progress_activity" size={18} />
            Running…
          </span>
        )}
      </div>

      {error && (
        <div className={s.err} role="alert">
          <Icon name="error" />
          The models could not run: {error}
        </div>
      )}

      <Section id="kpis" title="Key indicators" icon="monitoring" collapsible={false}>
        {!results ? (
          <Skeleton aria-label="Loading indicators">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonItem key={i} size={72} style={{ marginBottom: 8, borderRadius: 12 }} />
            ))}
          </Skeleton>
        ) : (
          <div className={s.cards}>
            {HEADLINE.map((h) => (
              <KpiCard key={h.id} k={KPIS.find((k) => k.id === h.id)!} icon={h.icon} results={results} />
            ))}
          </div>
        )}
      </Section>

      <Section id="all-kpis" title="All indicators" icon="table_rows" flush>
        {!results ? (
          <Skeleton aria-label="Loading indicators" style={{ padding: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonItem key={i} size={16} style={{ marginBottom: 8 }} />
            ))}
          </Skeleton>
        ) : (
          <table className={mergeClasses('env-table', s.table)} data-testid="kpi-table">
            <thead>
              <tr>
                <th>Indicator</th>
                <th>Before</th>
                <th className={s.afterCol}>After</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr>
                    <td colSpan={3} className="env-table__group">
                      {g}
                    </td>
                  </tr>
                  {KPIS.filter((k) => k.group === g).map((k) => {
                    const b = k.value(results.baseline);
                    const m = k.value(results.mitigated);
                    const none = !Number.isFinite(b) && !Number.isFinite(m);
                    return (
                      <tr key={k.id} data-testid={`kpi-${k.id}`}>
                        <td className="env-wrap">
                          {k.label} <span className={s.rowUnit}>({k.unit})</span>
                        </td>
                        {none ? (
                          <td
                            colSpan={2}
                            className={mergeClasses('env-wrap', s.missing)}
                            data-testid={`kpi-missing-${k.id}`}
                          >
                            {missingNote(k.id, receptorStatus)}
                          </td>
                        ) : (
                          <>
                            <td>{fmt(b, k.digits)}</td>
                            <td className={s.afterCol}>
                              <div>{fmt(m, k.digits)}</div>
                              <div className={s.deltaCell}>
                                <DeltaBadge b={b} m={m} digits={k.digits} />
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {results && (
        <Section id="trends" title="Monthly trends" icon="show_chart">
          <TrendChart
            title="Construction emissions"
            unit="tCO2e"
            baseline={results.baseline.ghg.monthly}
            mitigated={results.mitigated.ghg.monthly}
            testId="chart-ghg-monthly"
          />
          {results.baseline.ok && (
            <TrendChart
              title="PM10 emitted"
              unit="t"
              baseline={results.baseline.dust.monthlyPm10T}
              mitigated={results.mitigated.dust.monthlyPm10T}
              testId="chart-dust-monthly"
            />
          )}
        </Section>
      )}

      <Section id="assumptions" title="Assumptions" icon="tune" meta={`${changed} changed`}>
        <div className={s.actions}>
          <button
            type="button"
            className="env-btn env-btn--tonal env-btn--sm env-btn--icon-lead env-state"
            data-testid="ctl-assumptions-open"
            onClick={() => openA(true)}
          >
            <Icon name="edit" size={18} />
            Edit assumptions
          </button>
          <button
            type="button"
            className="env-btn env-btn--text env-btn--sm env-state"
            data-testid="ctl-assumptions-reset"
            disabled={!changed}
            onClick={resetA}
          >
            Reset to default
          </button>
        </div>
        <p className={s.note}>
          Screening-level models (Tier 1–2), not a regulatory dispersion model such as AERMOD. Every default
          has a cited source; values marked unverified are still to be confirmed.
        </p>
      </Section>
    </aside>
  );
}
