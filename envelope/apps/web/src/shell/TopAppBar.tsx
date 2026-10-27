import { Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import logoUrl from '../assets/envelope-icon.svg';
import { useLayoutMode } from '../hooks/useLayoutMode';
import type { DataSheetTab, RibbonTab } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { viewerCommands } from '../viewer/controller';
import { ALL_MEASURES, IMPACT_LAYERS, SITE_LAYERS } from './measures';
import { WORKSPACES } from './NavRail';
import { Icon, IconButton } from './ui';

const useStyles = makeStyles({
  root: {
    height: '64px',
    flexShrink: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(360px, 1fr) minmax(360px, 640px) minmax(200px, 1fr)',
    alignItems: 'center',
    gap: '16px',
    padding: '0 12px 0 20px',
    backgroundColor: 'var(--surface)',
    userSelect: 'none',
  },
  brand: { display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 },
  logo: { width: '44px', height: 'auto', display: 'block', flexShrink: 0 },
  wordmark: {
    fontFamily: 'var(--font-brand)',
    fontSize: '22px',
    lineHeight: '28px',
    fontWeight: 600,
    color: 'var(--on-surface)',
    letterSpacing: '-0.2px',
  },
  env: { color: 'var(--wordmark)' },
  nameBox: { display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: '8px' },
  name: {
    fontFamily: 'var(--font-plain)',
    fontSize: '14px',
    lineHeight: '20px',
    color: 'var(--on-surface)',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-xs)',
    padding: '0 6px',
    width: '260px',
    outlineStyle: 'none',
    ':hover': { border: '1px solid var(--outline-variant)' },
    ':focus': { border: '1px solid var(--primary)', backgroundColor: 'var(--surface-container-lowest)' },
  },
  saved: {
    fontSize: '11px',
    lineHeight: '14px',
    color: 'var(--on-surface-variant)',
    paddingLeft: '7px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  searchWrap: { position: 'relative' },
  search: {
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 4px 0 16px',
    borderRadius: 'var(--radius-xl)',
    backgroundColor: 'var(--surface-container-high)',
    color: 'var(--on-surface-variant)',
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: 'var(--duration-short)',
    ':focus-within': { backgroundColor: 'var(--surface-container-lowest)', boxShadow: 'var(--elevation-2)' },
  },
  searchOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: 'var(--surface-container-lowest)',
    boxShadow: 'var(--elevation-2)',
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    height: '100%',
    border: 0,
    outlineStyle: 'none',
    background: 'transparent',
    color: 'var(--on-surface)',
    fontFamily: 'var(--font-plain)',
    fontSize: '16px',
    '::placeholder': { color: 'var(--on-surface-variant)' },
  },
  kbd: {
    fontFamily: 'var(--font-plain)',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--on-surface-variant)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-xs)',
    padding: '0 6px',
    lineHeight: '18px',
  },
  results: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '48px',
    zIndex: 20,
    maxHeight: '420px',
    overflowY: 'auto',
    backgroundColor: 'var(--surface-container-lowest)',
    borderBottomLeftRadius: 'var(--radius-xl)',
    borderBottomRightRadius: 'var(--radius-xl)',
    boxShadow: 'var(--elevation-2)',
    padding: '0 0 12px',
    borderTop: '1px solid var(--outline-variant)',
  },
  result: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    height: '48px',
    padding: '0 20px',
    border: 0,
    background: 'transparent',
    color: 'var(--on-surface)',
    fontFamily: 'var(--font-plain)',
    fontSize: '14px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  resultActive: { backgroundColor: 'color-mix(in srgb, var(--on-surface) 8%, transparent)' },
  resultIcon: { color: 'var(--on-surface-variant)' },
  resultLabel: { flexGrow: 1 },
  resultKind: { fontSize: '12px', color: 'var(--on-surface-variant)' },
  empty: { padding: '16px 20px 4px', fontSize: '14px', color: 'var(--on-surface-variant)' },
  actions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' },
});

interface Command {
  id: string;
  label: string;
  kind: string;
  icon: string;
  keywords?: string;
  run: () => void;
}

const DATA_TABS: { id: DataSheetTab; label: string }[] = [
  { id: 'climate', label: 'Climate' },
  { id: 'dust', label: 'Dust' },
  { id: 'heat', label: 'Heat' },
  { id: 'ghg', label: 'GHG' },
  { id: 'assumptions', label: 'Assumptions' },
];

/** Everything the search box can reach: workspaces, layers, measures, data tables and actions. */
function useCommands(): Command[] {
  const theme = useAppStore((st) => st.ui.theme);
  return useMemo(() => {
    const st = useAppStore.getState;
    const go = (tab: RibbonTab) => st().setRibbonTab(tab);
    return [
      ...WORKSPACES.map((w) => ({
        id: `ws-${w.id}`,
        label: w.label,
        kind: 'Workspace',
        icon: w.icon,
        run: () => go(w.id),
      })),
      ...IMPACT_LAYERS.map((l) => ({
        id: `layer-${l.id}`,
        label: `${l.label} layer`,
        kind: `Layer · ${l.key}`,
        icon: l.icon,
        keywords: 'map heat',
        run: () => st().setImpactLayer(l.id),
      })),
      ...SITE_LAYERS.map((l) => ({
        id: `site-${l.id}`,
        label: `${l.label}: show or hide`,
        kind: 'Site layer',
        icon: l.icon,
        run: () => st().toggleLayer(l.id),
      })),
      ...ALL_MEASURES.map((m) => ({
        id: `mit-${m.id}`,
        label: m.label,
        kind: 'Measure',
        icon: m.icon,
        keywords: 'mitigation',
        run: () => {
          st().setMitigation(m.id, !st().mitigations[m.id]);
          st().setSectionOpen('mitigation', true);
        },
      })),
      ...DATA_TABS.map((t) => ({
        id: `data-${t.id}`,
        label: `${t.label} table`,
        kind: 'Data sheet',
        icon: 'table',
        run: () => st().openDataSheetTab(t.id),
      })),
      {
        id: 'act-export',
        label: 'Export report',
        kind: 'Ctrl+E',
        icon: 'description',
        keywords: 'pdf download',
        run: () => st().setReportOpen(true),
      },
      {
        id: 'act-assumptions',
        label: 'Edit assumptions',
        kind: 'Action',
        icon: 'tune',
        run: () => st().setAssumptionsOpen(true),
      },
      {
        id: 'act-fit',
        label: 'Fit to site',
        kind: 'F',
        icon: 'fit_screen',
        run: () => viewerCommands.fitToSite(),
      },
      {
        id: 'act-scenario',
        label: 'Map shows baseline / mitigated',
        kind: 'M',
        icon: 'compare',
        run: () => st().toggleShowScenario(),
      },
      {
        id: 'act-theme',
        label: theme === 'dark' ? 'Light theme' : 'Dark theme',
        kind: 'Action',
        icon: theme === 'dark' ? 'light_mode' : 'dark_mode',
        run: () => st().toggleTheme(),
      },
      {
        id: 'act-help',
        label: 'Keyboard shortcuts',
        kind: '?',
        icon: 'keyboard',
        keywords: 'help',
        run: () => st().setHelpOpen(true),
      },
    ];
  }, [theme]);
}

function SearchBox() {
  const s = useStyles();
  const query = useAppStore((st) => st.ui.searchQuery);
  const setQuery = useAppStore((st) => st.setSearchQuery);
  const commands = useCommands();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const results = q
    ? commands.filter((c) => `${c.label} ${c.kind} ${c.keywords ?? ''}`.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const open = focused && q.length > 0;

  // "/" focuses search from anywhere (Google convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = (c: Command | undefined) => {
    if (!c) return;
    c.run();
    setQuery('');
    input.current?.blur();
  };

  return (
    <div className={s.searchWrap}>
      <div className={mergeClasses(s.search, open && s.searchOpen)}>
        <Icon name="search" size={24} />
        <input
          ref={input}
          className={s.input}
          placeholder="Search layers, measures and actions"
          aria-label="Search layers, measures and actions"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          data-testid="ctl-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              setActive((a) => Math.min(results.length - 1, a + 1));
              e.preventDefault();
            } else if (e.key === 'ArrowUp') {
              setActive((a) => Math.max(0, a - 1));
              e.preventDefault();
            } else if (e.key === 'Enter') {
              run(results[active]);
            } else if (e.key === 'Escape') {
              setQuery('');
              e.currentTarget.blur();
            }
          }}
        />
        {!query && <span className={s.kbd}>/</span>}
        <IconButton
          icon="help"
          label="Keyboard shortcuts and help (?)"
          testId="ctl-help"
          onClick={() => useAppStore.getState().setHelpOpen(true)}
        />
      </div>
      {open && (
        <div className={s.results} id="search-results" role="listbox" data-testid="search-results">
          {results.length === 0 ? (
            <div className={s.empty}>No matches for “{query.trim()}”</div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className={mergeClasses(s.result, i === active && s.resultActive)}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(c)}
              >
                <Icon name={c.icon} className={s.resultIcon} />
                <span className={s.resultLabel}>{c.label}</span>
                <span className={s.resultKind}>{c.kind}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function TopAppBar() {
  const s = useStyles();
  const projectName = useAppStore((st) => st.projectName);
  const setProjectName = useAppStore((st) => st.setProjectName);
  const theme = useAppStore((st) => st.ui.theme);
  const toggleTheme = useAppStore((st) => st.toggleTheme);
  const [draft, setDraft] = useState(projectName);

  useEffect(() => setDraft(projectName), [projectName]);

  const commit = () => setProjectName(draft);

  return (
    <header className={s.root} data-testid="panel-titlebar">
      <div className={s.brand}>
        <img className={s.logo} src={logoUrl} alt="" aria-hidden />

        <span className={s.wordmark} aria-label="Envelope">
          <span className={s.env}>Env</span>elope
        </span>
        <div className={s.nameBox}>
          <input
            className={s.name}
            aria-label="Project name"
            data-testid="ctl-project-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraft(projectName);
                e.currentTarget.blur();
              }
            }}
          />
          <span className={s.saved} data-testid="txt-save-state">
            <Icon name={draft === projectName ? 'cloud_done' : 'edit'} size={18} />
            {draft === projectName ? 'Saved in this browser' : 'Unsaved name'}
          </span>
        </div>
      </div>
      <SearchBox />
      <div className={s.actions}>
        <SheetToggles />
        <IconButton
          icon={theme === 'dark' ? 'light_mode' : 'dark_mode'}
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          testId="ctl-theme"
          onClick={toggleTheme}
        />
      </div>
    </header>
  );
}

/** Dropdown buttons for the Layers and Inspector sheets when they are not docked (D-028). */
function SheetToggles() {
  const { inspectorDocked, layersDocked } = useLayoutMode();
  const layersOpen = useAppStore((st) => st.ui.leftPanelOpen);
  const inspectorOpen = useAppStore((st) => st.ui.inspectorOpen);
  const toggleLayers = useAppStore((st) => st.toggleLeftPanel);
  const toggleInspector = useAppStore((st) => st.toggleInspector);
  const button = (
    label: string,
    icon: string,
    open: boolean,
    onClick: () => void,
    testId: string,
    tip: string,
  ) => (
    <Tooltip content={tip} relationship="description" withArrow>
      <button
        type="button"
        className={mergeClasses(
          'env-btn env-btn--sm env-btn--icon-lead env-state',
          open ? 'env-btn--tonal' : 'env-btn--outlined',
        )}
        aria-expanded={open}
        data-testid={testId}
        onClick={onClick}
      >
        <Icon name={icon} size={18} />
        {label}
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
      </button>
    </Tooltip>
  );
  return (
    <>
      {!layersDocked &&
        button(
          'Layers',
          'layers',
          layersOpen,
          toggleLayers,
          'ctl-layers-toggle',
          'Layers and mitigation (L)',
        )}
      {!inspectorDocked &&
        button(
          'Indicators',
          'monitoring',
          inspectorOpen,
          toggleInspector,
          'ctl-inspector-toggle',
          'Key indicators (I)',
        )}
    </>
  );
}
