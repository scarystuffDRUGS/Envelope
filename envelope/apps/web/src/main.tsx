import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource-variable/roboto-flex';
import 'material-symbols/outlined.css';
import { FluentProvider } from '@fluentui/react-components';
import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useAppStore } from './store/appStore';
import { fluentThemes } from './theme/theme';
import './theme/global.css';

declare global {
  interface Window {
    __envelope?: typeof useAppStore;
  }
}

// Exposed in dev only, for the e2e click-everything test to observe store changes.
if (import.meta.env.DEV) window.__envelope = useAppStore;

function Root() {
  const mode = useAppStore((st) => st.ui.theme);
  // tokens.css switches every colour on <html data-theme>; Fluent's own tokens point at those.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);
  return (
    <FluentProvider
      theme={fluentThemes[mode]}
      style={{ height: '100%', background: 'var(--surface)', color: 'var(--on-surface)' }}
    >
      <App />
    </FluentProvider>
  );
}

// No <StrictMode>: its dev double-mount makes Fluent's focus manager (keyborg) log a
// console error on every load, which breaks the "no console errors" gate. See DECISIONS.md D-013.
createRoot(document.getElementById('root')!).render(<Root />);
