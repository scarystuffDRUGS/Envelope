import {
  Popover,
  PopoverSurface,
  PopoverTrigger,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import { calendarMonthFor, phaseForMonth, programmeTotal, toSchedule } from '@envelope/models';
import { useAppStore } from '../store/appStore';
import { Icon, IconButton } from './ui';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const useStyles = makeStyles({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    height: '36px',
    padding: '0 12px 0 10px',
    border: '1px solid var(--outline)',
    borderRadius: 'var(--radius-xs)',
    background: 'transparent',
    color: 'var(--on-surface)',
    fontFamily: 'var(--font-plain)',
    fontSize: '14px',
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  surface: {
    width: '328px',
    padding: '12px 12px 8px',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--surface-container-high)',
    boxShadow: 'var(--elevation-3)',
    border: 0,
  },
  supporting: {
    padding: '4px 12px 0',
    fontSize: '12px',
    color: 'var(--on-surface-variant)',
    letterSpacing: '0.4px',
  },
  headline: {
    padding: '4px 12px 12px',
    fontFamily: 'var(--font-brand)',
    fontSize: '24px',
    lineHeight: '32px',
    color: 'var(--on-surface)',
    borderBottom: '1px solid var(--outline-variant)',
  },
  nav: { display: 'flex', alignItems: 'center', padding: '8px 0 4px 12px' },
  navLabel: { flexGrow: 1, fontSize: '14px', fontWeight: 500, color: 'var(--on-surface-variant)' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 40px)',
    justifyContent: 'center',
    rowGap: '2px',
  },
  wd: {
    height: '40px',
    display: 'grid',
    placeItems: 'center',
    fontSize: '14px',
    color: 'var(--on-surface)',
  },
  day: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-full)',
    border: 0,
    background: 'transparent',
    color: 'var(--on-surface)',
    fontFamily: 'var(--font-plain)',
    fontSize: '14px',
    cursor: 'pointer',
    fontVariantNumeric: 'tabular-nums',
  },
  mid: { boxShadow: 'inset 0 0 0 1px var(--primary)', color: 'var(--primary)' },
  selected: { backgroundColor: 'var(--primary)', color: 'var(--on-primary)', boxShadow: 'none' },
  marked: { position: 'relative' },
  foot: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 4px 0 12px',
    fontSize: '12px',
    color: 'var(--on-surface-variant)',
  },
  dot: { width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' },
});

/**
 * Material date picker over the construction programme. Months move through the programme (each
 * construction month maps to a calendar month of the weather year); picking a day sets the analysis day.
 */
export function DatePicker() {
  const s = useStyles();
  const open = useAppStore((st) => st.ui.datePickerOpen);
  const setOpen = useAppStore((st) => st.setDatePickerOpen);
  const { constructionMonth, dayOfMonth, weatherYear } = useAppStore((st) => st.scenario);
  const results = useAppStore((st) => st.results);
  const goToDay = useAppStore((st) => st.goToDay);
  const setMonth = useAppStore((st) => st.setConstructionMonth);
  const effective = results?.baseline.programme.effective;
  const total = effective ? programmeTotal(effective) : 24;
  const month = Math.min(constructionMonth, total);
  const { phase } = phaseForMonth(month, effective ? toSchedule(effective) : undefined);
  const cal = calendarMonthFor(month);
  const days = new Date(weatherYear, cal, 0).getDate();
  const lead = new Date(weatherYear, cal - 1, 1).getDay();
  const day = Math.min(dayOfMonth, days);
  const weekday = new Date(weatherYear, cal - 1, day).toLocaleDateString('en-IN', { weekday: 'short' });
  const worst = results?.baseline.dust.worstDay;
  const hottest = results?.baseline.heat.hottestDay;
  const label = `${day} ${MONTHS[cal - 1]!.slice(0, 3)} ${weatherYear}`;

  return (
    <Popover
      open={open}
      onOpenChange={(_, d) => setOpen(d.open)}
      positioning="below-start"
      trapFocus
      withArrow={false}
    >
      <PopoverTrigger disableButtonEnhancement>
        <button
          type="button"
          className={mergeClasses(s.trigger, 'env-state')}
          data-testid="ctl-date-picker"
          aria-label={`Analysis date ${label}. Change date`}
        >
          <Icon name="calendar_month" className={s.navLabel} />
          {label}
          <Icon name="arrow_drop_down" />
        </button>
      </PopoverTrigger>
      <PopoverSurface className={s.surface} data-testid="date-picker">
        <div className={s.supporting}>
          Construction month {month} of {total} · {phase.label}
        </div>
        <div className={s.headline}>
          {weekday}, {day} {MONTHS[cal - 1]!.slice(0, 3)}
        </div>
        <div className={s.nav}>
          <span className={s.navLabel}>
            {MONTHS[cal - 1]} {weatherYear}
          </span>
          <IconButton
            icon="chevron_left"
            label="Previous construction month"
            testId="ctl-date-prev-month"
            small
            disabled={month <= 1}
            onClick={() => setMonth(month - 1)}
          />
          <IconButton
            icon="chevron_right"
            label="Next construction month"
            testId="ctl-date-next-month"
            small
            disabled={month >= total}
            onClick={() => setMonth(month + 1)}
          />
        </div>
        <div className={s.grid} role="grid" aria-label={`${MONTHS[cal - 1]} ${weatherYear}`}>
          {WEEKDAYS.map((w, i) => (
            <span key={i} className={s.wd} aria-hidden>
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const d = i + 1;
            const isWorst = worst?.month === month && worst.dayOfMonth === d;
            const isHot = hottest?.month === month && hottest.dayOfMonth === d;
            return (
              <button
                key={d}
                type="button"
                className={mergeClasses(
                  s.day,
                  'env-state',
                  d === 15 && s.mid,
                  d === day && s.selected,
                  (isWorst || isHot) && s.marked,
                )}
                aria-pressed={d === day}
                aria-label={`${d} ${MONTHS[cal - 1]}${isWorst ? ', worst dust day' : ''}${isHot ? ', hottest day' : ''}`}
                data-testid={`ctl-date-day-${d}`}
                style={
                  isWorst || isHot
                    ? { textDecoration: 'underline', textDecorationColor: isWorst ? '#cc4c02' : '#e31a1c' }
                    : undefined
                }
                onClick={() => {
                  goToDay(month, d);
                  setOpen(false);
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
        <div className={s.foot}>
          Weather year {weatherYear} (ERA5). Outlined: mid-month. Underlined: worst dust or hottest day.
        </div>
      </PopoverSurface>
    </Popover>
  );
}
