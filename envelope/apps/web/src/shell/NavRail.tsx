import { Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { RibbonTab } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { Icon } from './ui';

export const WORKSPACES: { id: RibbonTab; label: string; icon: string; hint: string }[] = [
  { id: 'project', label: 'Project', icon: 'domain', hint: 'Building and construction programme' },
  { id: 'site', label: 'Site', icon: 'map', hint: 'Location and view' },
  { id: 'analysis', label: 'Analysis', icon: 'query_stats', hint: 'Date, hour and construction month' },
  { id: 'mitigation', label: 'Mitigation', icon: 'shield', hint: 'Presets and measures' },
  { id: 'report', label: 'Report', icon: 'description', hint: 'Export the assessment report' },
];

const useStyles = makeStyles({
  root: {
    width: '88px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    paddingTop: '4px',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '80px',
    padding: 0,
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: 'var(--on-surface-variant)',
    fontFamily: 'var(--font-plain)',
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: 500,
    letterSpacing: '0.5px',
    ':focus-visible': { outlineStyle: 'none' },
    ':focus-visible > span:first-child': { outline: '3px solid var(--tertiary)', outlineOffset: '2px' },
  },
  current: { color: 'var(--on-surface)', fontWeight: 700 },
  pill: {
    width: '56px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    display: 'grid',
    placeItems: 'center',
    transitionProperty: 'background-color',
    transitionDuration: 'var(--duration-medium)',
    transitionTimingFunction: 'var(--ease-standard)',
  },
  pillOn: { backgroundColor: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
});

/** Navigation rail: the five workspaces (it replaces the ribbon tabs; test ids keep the ribbon names). */
export function NavRail() {
  const s = useStyles();
  const tab = useAppStore((st) => st.ui.ribbonTab);
  const setTab = useAppStore((st) => st.setRibbonTab);
  const setSectionOpen = useAppStore((st) => st.setSectionOpen);
  return (
    <nav
      className={s.root}
      role="tablist"
      aria-orientation="vertical"
      aria-label="Workspaces"
      data-testid="panel-ribbon"
    >
      {WORKSPACES.map((w) => {
        const on = w.id === tab;
        return (
          <Tooltip key={w.id} content={w.hint} relationship="description" positioning="after" withArrow>
            <button
              type="button"
              role="tab"
              aria-selected={on}
              className={mergeClasses(s.item, on && s.current)}
              data-testid={`ctl-ribbon-tab-${w.id}`}
              onClick={() => {
                setTab(w.id);
                // The Mitigation workspace opens the measure cards in the Layers sheet.
                if (w.id === 'mitigation') setSectionOpen('mitigation', true);
              }}
            >
              <span className={mergeClasses(s.pill, on && s.pillOn, 'env-state')}>
                <Icon name={w.icon} size={24} filled={on} />
              </span>
              {w.label}
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
