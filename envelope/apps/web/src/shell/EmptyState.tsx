import { makeStyles } from '@fluentui/react-components';
import { Icon } from './ui';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '24px',
    fontSize: '14px',
    lineHeight: '20px',
    color: 'var(--on-surface-variant)',
  },
  icon: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-full)',
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'var(--surface-container-high)',
    flexShrink: 0,
  },
  title: { color: 'var(--on-surface)', fontWeight: 500, marginBottom: '2px' },
});

export function EmptyState({
  title,
  text,
  testId,
  icon = 'hourglass_empty',
}: {
  title: string;
  text: string;
  testId?: string;
  icon?: string;
}) {
  const s = useStyles();
  return (
    <div className={s.root} data-testid={testId}>
      <span className={s.icon}>
        <Icon name={icon} size={24} />
      </span>
      <div>
        <div className={s.title}>{title}</div>
        <div>{text}</div>
      </div>
    </div>
  );
}
