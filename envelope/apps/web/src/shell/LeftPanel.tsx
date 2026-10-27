import { Slider, Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { Mitigations } from '@envelope/models';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import type { Measure } from './measures';
import { ALL_MEASURES, IMPACT_LAYERS, MEASURES, SITE_LAYERS } from './measures';
import { Icon, Section, Segmented } from './ui';

const useStyles = makeStyles({
  root: {
    width: '312px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    paddingBottom: '8px',
  },
  chips: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  chip: { justifyContent: 'flex-start', width: '100%', paddingRight: '8px' },
  swatch: { width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0 },
  key: { marginLeft: 'auto', fontSize: '11px', color: 'var(--on-surface-variant)' },
  sub: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12px' },
  subLabel: { color: 'var(--on-surface-variant)', minWidth: '52px' },
  slider: { flexGrow: 1 },
  pct: { width: '36px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minHeight: '48px',
    padding: '0 12px 0 16px',
    cursor: 'pointer',
  },
  rowIcon: { color: 'var(--on-surface-variant)' },
  rowText: { flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  rowLabel: { fontSize: '14px', lineHeight: '20px', color: 'var(--on-surface)' },
  rowHint: { fontSize: '12px', lineHeight: '16px', color: 'var(--on-surface-variant)' },
  groups: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 8px' },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    height: '40px',
    padding: '0 8px',
    border: 0,
    background: 'transparent',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--on-surface-variant)',
    fontFamily: 'var(--font-plain)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  groupTitle: { flexGrow: 1, textAlign: 'left' },
  cards: { display: 'flex', flexDirection: 'column', gap: '6px', paddingBottom: '8px' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--surface-container-low)',
    transitionProperty: 'background-color',
    transitionDuration: 'var(--duration-medium)',
  },
  cardOn: { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, var(--surface-container-low))' },
  cardMain: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer' },
  cardIcon: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    backgroundColor: 'var(--surface-container-highest)',
    color: 'var(--on-surface-variant)',
  },
  cardIconOn: { backgroundColor: 'var(--primary-container)', color: 'var(--on-primary-container)' },
  cardText: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  cardLabel: { fontSize: '13px', lineHeight: '18px', color: 'var(--on-surface)' },
  cardEffect: { fontSize: '12px', lineHeight: '16px', color: 'var(--on-surface-variant)' },
  flag: { marginLeft: '4px' },
  param: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 12px 10px 60px',
    fontSize: '12px',
    color: 'var(--on-surface-variant)',
  },
  field: { width: '64px', height: '32px', padding: '0 8px', textAlign: 'right' },
});

function MeasureCard({ it, children }: { it: Measure; children?: ReactNode }) {
  const s = useStyles();
  const on = useAppStore((st) => Boolean(st.mitigations[it.id]));
  const setM = useAppStore((st) => st.setMitigation);
  const inputId = `mit-${it.id}`;
  return (
    <div className={mergeClasses(s.card, on && s.cardOn)}>
      <label className={s.cardMain} htmlFor={inputId}>
        <span className={mergeClasses(s.cardIcon, on && s.cardIconOn)}>
          <Icon name={it.icon} filled={on} />
        </span>
        <span className={s.cardText}>
          <span className={s.cardLabel}>{it.label}</span>
          <span className={s.cardEffect}>
            {it.effect}
            {it.flag && <span className={mergeClasses('env-badge env-badge--warn', s.flag)}>{it.flag}</span>}
          </span>
        </span>
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          className="env-switch env-switch--sm"
          checked={on}
          data-testid={`ctl-mit-${it.id}`}
          onChange={(e) => setM(it.id, e.target.checked)}
        />
      </label>
      {on && children}
    </div>
  );
}

function NumberParam({
  id,
  min,
  max,
  before,
  after,
}: {
  id: 'highWindStopMs' | 'lowCarbonConcretePct';
  min: number;
  max: number;
  before: string;
  after: string;
}) {
  const s = useStyles();
  const value = useAppStore((st) => st.mitigations[id]);
  const setM = useAppStore((st) => st.setMitigation);
  return (
    <div className={s.param}>
      <span>{before}</span>
      <input
        className={mergeClasses('env-field', s.field)}
        type="number"
        min={min}
        max={max}
        aria-label={`${before} ${after}`}
        value={String(value)}
        data-testid={`ctl-mit-${id}`}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) setM(id, v as Mitigations[typeof id]);
        }}
      />
      <span>{after}</span>
    </div>
  );
}

function MeasureGroup({ group }: { group: (typeof MEASURES)[number] }) {
  const s = useStyles();
  const id = `mitigation-${group.group.toLowerCase()}`;
  const stored = useAppStore((st) => st.ui.sections[id]);
  const setOpen = useAppStore((st) => st.setSectionOpen);
  const m = useAppStore((st) => st.mitigations);
  const open = stored ?? group.group === 'Dust';
  const count = group.items.filter((x) => m[x.id]).length;
  return (
    <div>
      <button
        type="button"
        className={mergeClasses(s.groupHead, 'env-state')}
        aria-expanded={open}
        data-testid={`ctl-section-${id}`}
        onClick={() => setOpen(id, !open)}
      >
        <Icon name={group.icon} />
        <span className={s.groupTitle}>{group.group}</span>
        <span className={mergeClasses('env-badge', count ? 'env-badge--good' : 'env-badge--neutral')}>
          {count} on
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} />
      </button>
      {open && (
        <div className={mergeClasses(s.cards, 'env-enter')}>
          {group.items.map((it) => (
            <MeasureCard key={it.id} it={it}>
              {it.id === 'highWindStop' && (
                <NumberParam id="highWindStopMs" min={0.1} max={50} before="Stop above" after="m/s (U10)" />
              )}
              {it.id === 'lowCarbonConcrete' && (
                <NumberParam
                  id="lowCarbonConcretePct"
                  min={0}
                  max={60}
                  before="Factor reduction"
                  after="% (20–40 typical)"
                />
              )}
            </MeasureCard>
          ))}
        </div>
      )}
    </div>
  );
}

/** Layers sheet: impact layer chips, site layer switches and the mitigation measure cards. */
/** `width` (px) applies when docked; the dropdown sheet sets its own. */
export function LeftPanel({ className, width }: { className?: string; width?: number }) {
  const s = useStyles();
  const layers = useAppStore((st) => st.layers);
  const toggleLayer = useAppStore((st) => st.toggleLayer);
  const impact = useAppStore((st) => st.impactLayer);
  const setImpact = useAppStore((st) => st.setImpactLayer);
  const metric = useAppStore((st) => st.dustMetric);
  const setMetric = useAppStore((st) => st.setDustMetric);
  const opacity = useAppStore((st) => st.layerOpacity);
  const setOpacity = useAppStore((st) => st.setLayerOpacity);
  const m = useAppStore((st) => st.mitigations);
  const onCount = ALL_MEASURES.filter((x) => m[x.id]).length;

  return (
    <aside
      className={mergeClasses(s.root, 'env-scroll', className)}
      style={width ? { width } : undefined}
      data-testid="panel-left"
      aria-label="Layers and mitigation"
    >
      <Section id="impact" title="Impact layer" icon="layers" collapsible={false}>
        <div className={s.chips}>
          {IMPACT_LAYERS.map((l) => {
            const on = impact === l.id;
            return (
              <Tooltip
                key={l.id}
                content={`${on ? 'Hide' : 'Show'} ${l.label.toLowerCase()} layer (${l.key})`}
                relationship="label"
                withArrow
              >
                <button
                  type="button"
                  className={mergeClasses('env-chip env-state', s.chip)}
                  aria-pressed={on}
                  data-testid={`ctl-layer-${l.id}`}
                  onClick={() => setImpact(on ? null : l.id)}
                >
                  <span
                    className={s.swatch}
                    style={{ background: `linear-gradient(90deg, ${l.swatch.join(',')})` }}
                  />
                  {l.short}
                  <span className={s.key}>{l.key}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>
        {impact === 'dust' && (
          <div className={s.sub}>
            <span className={s.subLabel}>Metric</span>
            <Segmented
              label="Dust metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'hour', label: 'Selected hour', testId: 'ctl-dust-metric-hour' },
                { value: 'day', label: '24 h mean', testId: 'ctl-dust-metric-day' },
              ]}
            />
          </div>
        )}
        {impact && impact !== 'ghg' && (
          <div className={s.sub}>
            <span className={s.subLabel}>Opacity</span>
            <Slider
              className={s.slider}
              aria-label="Layer opacity"
              size="small"
              min={10}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              data-testid="ctl-layer-opacity"
              onChange={(_, d) => setOpacity(d.value / 100)}
            />
            <span className={s.pct}>{Math.round(opacity * 100)}%</span>
          </div>
        )}
      </Section>

      <Section id="site-layers" title="Site layers" icon="map" flush>
        {SITE_LAYERS.map((l) => (
          <label key={l.id} className={mergeClasses(s.row, 'env-state')} htmlFor={`layer-${l.id}`}>
            <Icon name={l.icon} className={s.rowIcon} />
            <span className={s.rowText}>
              <span className={s.rowLabel}>{l.label}</span>
              <span className={s.rowHint}>{l.hint}</span>
            </span>
            <input
              id={`layer-${l.id}`}
              type="checkbox"
              role="switch"
              className="env-switch env-switch--sm"
              checked={layers[l.id]}
              data-testid={`ctl-layer-${l.id}`}
              onChange={() => toggleLayer(l.id)}
            />
          </label>
        ))}
      </Section>

      <Section
        id="mitigation"
        title="Mitigation"
        icon="shield"
        meta={`${onCount} of ${ALL_MEASURES.length} on`}
        flush
        testId="section-mitigation"
      >
        <div className={s.groups}>
          {MEASURES.map((g) => (
            <MeasureGroup key={g.group} group={g} />
          ))}
        </div>
      </Section>
    </aside>
  );
}
