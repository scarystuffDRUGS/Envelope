import { useSyncExternalStore } from 'react';

/**
 * Responsive layout (D-028). Widths are CSS pixels, so browser zoom moves through them: on a
 * 1920 px screen, 110% zoom is ~1,745 px and 125% is ~1,536 px.
 *   ≥ 1,760 px  Layers and Inspector docked beside the map
 *   < 1,760 px  Inspector becomes the "Indicators" dropdown over the map's right edge
 *   < 1,440 px  Layers also becomes a dropdown, from the left
 */
export const INSPECTOR_DOCK_MIN = 1760;
export const LAYERS_DOCK_MIN = 1440;
/** Below this height the data sheet starts collapsed, so the map keeps its height. */
export const DATA_SHEET_OPEN_MIN_HEIGHT = 900;

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export function useLayoutMode(): { inspectorDocked: boolean; layersDocked: boolean } {
  return {
    inspectorDocked: useMedia(`(min-width: ${INSPECTOR_DOCK_MIN}px)`),
    layersDocked: useMedia(`(min-width: ${LAYERS_DOCK_MIN}px)`),
  };
}
