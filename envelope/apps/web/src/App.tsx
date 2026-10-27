import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { useAnalysis } from './compute/useAnalysis';
import { useAppStore } from './store/appStore';
import { useLayoutMode } from './hooks/useLayoutMode';
import { usePlayback, useShortcuts } from './hooks/useShortcuts';
import { useRestoreImport } from './import/useRestoreImport';
import { AssumptionsDialog } from './shell/AssumptionsDialog';
import { DataSheet } from './shell/DataSheet';
import { HelpDialog } from './shell/HelpDialog';
import { ImportDialog } from './shell/ImportDialog';
import { Inspector } from './shell/Inspector';
import { LeftPanel } from './shell/LeftPanel';
import { NavRail } from './shell/NavRail';
import { ReceptorsDialog } from './shell/ReceptorsDialog';
import { ReportDialog } from './shell/ReportDialog';
import { ResizeHandle } from './shell/ResizeHandle';
import { StatusBar } from './shell/StatusBar';
import { TopAppBar } from './shell/TopAppBar';
import { Viewport } from './shell/Viewport';
import { WorkspaceBar } from './shell/WorkspaceBar';

const useStyles = makeStyles({
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--surface)',
    minWidth: '1180px',
  },
  main: { flexGrow: 1, minHeight: 0, display: 'flex' },
  work: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0 8px 0 0',
  },
  // Panels | map and data sheet | Inspector, below the full-width workspace bar. Resize handles
  // between them provide the spacing.
  row: { position: 'relative', flexGrow: 1, minHeight: 0, display: 'flex' },
  // Undocked Layers / Inspector: dropdown sheets over the map edge (D-028).
  sheet: {
    position: 'absolute',
    top: '0',
    bottom: '8px',
    zIndex: 30,
    padding: '8px',
    backgroundColor: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--elevation-3)',
    boxSizing: 'border-box',
  },
  sheetLeft: { left: '0', width: '328px' },
  sheetRight: { right: '8px', width: '384px' },
  fill: { width: '100%', height: '100%' },
  centre: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' },
});

/**
 * Layout (docs/DECISIONS.md D-024, D-028, D-032): top app bar → navigation rail | workspace bar
 * across the full width, then Layers | 3D map and data sheet | Inspector → status line. Docked
 * panels resize by dragging their edge. On narrower windows (or browser zoom) the Inspector, then
 * Layers, leave the row and open as dropdowns from the top bar, so the map widens.
 */
export function App() {
  const s = useStyles();
  const { inspectorDocked, layersDocked } = useLayoutMode();
  const layersOpen = useAppStore((st) => st.ui.leftPanelOpen);
  const inspectorOpen = useAppStore((st) => st.ui.inspectorOpen);
  const widths = useAppStore((st) => st.ui.panelWidths);
  useShortcuts();
  useAnalysis();
  useRestoreImport();
  usePlayback();

  return (
    <div className={s.root}>
      <TopAppBar />
      <div className={s.main}>
        <NavRail />
        <div className={s.work}>
          <WorkspaceBar />
          <div className={s.row}>
            {layersDocked && (
              <>
                <LeftPanel width={widths.layers} />
                <ResizeHandle panel="layers" side="left" label="Layers panel width" />
              </>
            )}
            <div className={s.centre}>
              <Viewport />
              <DataSheet />
            </div>
            {inspectorDocked && (
              <>
                <ResizeHandle panel="inspector" side="right" label="Inspector width" />
                <Inspector width={widths.inspector} />
              </>
            )}
            {!layersDocked && layersOpen && (
              <div className={mergeClasses(s.sheet, s.sheetLeft)} data-testid="sheet-layers">
                <LeftPanel className={s.fill} />
              </div>
            )}
            {!inspectorDocked && inspectorOpen && (
              <div className={mergeClasses(s.sheet, s.sheetRight)} data-testid="sheet-inspector">
                <Inspector className={s.fill} />
              </div>
            )}
          </div>
        </div>
      </div>
      <StatusBar />
      <HelpDialog />
      <AssumptionsDialog />
      <ReportDialog />
      <ImportDialog />
      <ReceptorsDialog />
    </div>
  );
}
