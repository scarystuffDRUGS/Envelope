import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { PARAMS, toSchedule } from '@envelope/models';
import { describeStage } from '../analysis/stage';
import { Icon, IconButton } from '../shell/ui';
import { useAppStore } from '../store/appStore';

const useStyles = makeStyles({
  root: {
    width: '360px',
    maxWidth: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'var(--surface-container-lowest)',
    color: 'var(--on-surface)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--elevation-1)',
    padding: '8px 8px 12px 16px',
    fontSize: '13px',
    lineHeight: '18px',
  },
  folded: { paddingBottom: '8px' },
  head: { display: 'flex', alignItems: 'center', gap: '8px' },
  title: { flexGrow: 1, fontWeight: 500, fontSize: '14px', fontVariantNumeric: 'tabular-nums' },
  timeline: { display: 'flex', gap: '2px', margin: '6px 8px 8px 0' },
  seg: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
  bar: {
    height: '6px',
    borderRadius: '3px',
    backgroundColor: 'var(--surface-container-highest)',
    position: 'relative',
  },
  barDone: { backgroundColor: 'var(--primary-container)' },
  marker: {
    position: 'absolute',
    top: '-3px',
    width: '4px',
    height: '12px',
    marginLeft: '-2px',
    borderRadius: '2px',
    backgroundColor: 'var(--primary)',
  },
  segLabel: {
    fontSize: '11px',
    lineHeight: '14px',
    color: 'var(--on-surface-variant)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  line: { display: 'flex', gap: '8px', marginTop: '6px', paddingRight: '8px' },
  icon: { color: 'var(--on-surface-variant)', flexShrink: 0, marginTop: '-1px' },
});

/**
 * What is being built this construction month, in words (D-034): a phase timeline with the
 * current month, what stands on site, the main dust sources at the selected hour, and what
 * comes next. Folds to its title.
 */
export function StageCard() {
  const s = useStyles();
  const open = useAppStore((st) => st.ui.stageOpen);
  const toggle = useAppStore((st) => st.toggleStage);
  const month = useAppStore((st) => st.scenario.constructionMonth);
  const floors = useAppStore((st) => st.building.floors);
  const basements = useAppStore(
    (st) => st.assumptions.basements ?? PARAMS.find((p) => p.id === 'basements')!.value,
  );
  const shown = useAppStore((st) => (st.results ? st.results[st.showScenario] : null));
  if (!shown) return null;

  const schedule = toSchedule(shown.programme.effective);
  const total = schedule.reduce((n, p) => n + p.months, 0);
  const t = describeStage({
    month,
    floors,
    basements,
    schedule,
    emissions: shown.ok ? shown.dust.emissionsNow : null,
  });
  let start = 0;

  return (
    <section
      className={mergeClasses(s.root, !open && s.folded)}
      aria-label="Construction stage"
      data-testid="stage-card"
    >
      <div className={s.head}>
        <Icon name="construction" size={18} className={s.icon} />
        <span className={s.title} data-testid="stage-title">
          {t.title}
        </span>
        <IconButton
          icon={open ? 'expand_less' : 'expand_more'}
          label={open ? 'Fold the construction stage' : 'Show what is being built'}
          testId="ctl-stage-toggle"
          pressed={open}
          onClick={toggle}
        />
      </div>
      {open && (
        <>
          <div className={s.timeline} aria-hidden>
            {schedule
              .filter((p) => p.months > 0)
              .map((p) => {
                const from = start;
                start += p.months;
                const at = month > from && month <= start ? (month - from - 0.5) / p.months : null;
                return (
                  <div key={p.id} className={s.seg} style={{ flexGrow: p.months, flexBasis: 0 }}>
                    <div className={mergeClasses(s.bar, month > from && s.barDone)}>
                      {at !== null && <span className={s.marker} style={{ left: `${at * 100}%` }} />}
                    </div>
                    <span className={s.segLabel}>
                      {p.label} · {p.months} mo
                    </span>
                  </div>
                );
              })}
          </div>
          <div className={s.line} data-testid="stage-now">
            <Icon name="foundation" size={18} className={s.icon} />
            <span>{t.now}</span>
          </div>
          {t.dust && (
            <div className={s.line} data-testid="stage-dust">
              <Icon name="air" size={18} className={s.icon} />
              <span>{t.dust}</span>
            </div>
          )}
          <div className={s.line} data-testid="stage-next">
            <Icon name="event_upcoming" size={18} className={s.icon} />
            <span>
              {t.next} Use the construction month slider to step through the {total} months.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
