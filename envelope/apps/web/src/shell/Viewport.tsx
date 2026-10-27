import { makeStyles } from '@fluentui/react-components';
import { SiteViewer } from '../viewer/SiteViewer';
import { ViewportOverlays } from '../viewer/ViewportOverlays';

const useStyles = makeStyles({
  root: {
    position: 'relative',
    flexGrow: 1,
    minHeight: '240px',
    overflow: 'hidden',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--map-bg)',
  },
});

export function Viewport() {
  const s = useStyles();
  return (
    <main className={s.root} data-testid="panel-viewport" aria-label="3D viewport">
      <SiteViewer />
      <ViewportOverlays />
    </main>
  );
}
