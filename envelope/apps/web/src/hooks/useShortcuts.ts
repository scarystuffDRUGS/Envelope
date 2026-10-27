import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { viewerCommands } from '../viewer/controller';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  // Sliders handle their own arrow keys; text inputs need them for the caret.
  return target.tagName === 'INPUT';
}

/** Global keyboard shortcuts (HANDOVER §3.2). Listed in the Help dialog. */
export function useShortcuts() {
  const stepHour = useAppStore((st) => st.stepHour);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        useAppStore.getState().setReportOpen(true);
        e.preventDefault();
        return;
      }
      // Escape closes the Layers / Indicators dropdowns even when a tooltip already used the key
      // (Fluent marks it handled); with a dialog open, Escape belongs to the dialog.
      if (e.key === 'Escape') {
        const st = useAppStore.getState();
        const ui = st.ui;
        if (
          ui.reportOpen ||
          ui.importOpen ||
          ui.receptorsOpen ||
          ui.helpOpen ||
          ui.assumptionsOpen ||
          ui.datePickerOpen
        )
          return;
        if (ui.inspectorOpen) st.toggleInspector();
        if (ui.leftPanelOpen) st.toggleLeftPanel();
        return;
      }
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === '?') {
        useAppStore.getState().setHelpOpen(true);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        stepHour(-1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        stepHour(1);
        e.preventDefault();
      } else if (['d', 'h', 'u', 'g'].includes(e.key.toLowerCase())) {
        const id = ({ d: 'dust', h: 'ts', u: 'utci', g: 'ghg' } as const)[
          e.key.toLowerCase() as 'd' | 'h' | 'u' | 'g'
        ];
        const st = useAppStore.getState();
        st.setImpactLayer(st.impactLayer === id ? null : id);
        e.preventDefault();
      } else if (e.key === 'm' || e.key === 'M') {
        useAppStore.getState().toggleShowScenario();
        e.preventDefault();
      } else if (e.key === 'i' || e.key === 'I') {
        useAppStore.getState().toggleInspector();
        e.preventDefault();
      } else if (e.key === 'l' || e.key === 'L') {
        useAppStore.getState().toggleLeftPanel();
        e.preventDefault();
      } else if (e.key === 'f' || e.key === 'F') {
        viewerCommands.fitToSite();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepHour]);
}

/** Advances the hour once per second while playback is on. */
export function usePlayback() {
  const playing = useAppStore((st) => st.ui.playing);
  const stepHour = useAppStore((st) => st.stepHour);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => stepHour(1), 1000);
    return () => window.clearInterval(id);
  }, [playing, stepHour]);
}
