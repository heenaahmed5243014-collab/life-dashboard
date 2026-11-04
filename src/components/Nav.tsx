import type { ReactNode } from 'react';
import { go } from '../router';

const SunIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
const ListIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17" /></svg>
);

export default function Nav({ current }: { current: 'today' | 'tasks' }) {
  const tab = (key: 'today' | 'tasks', label: string, path: string, icon: ReactNode) => (
    <a
      href={'#' + path}
      className={current === key ? 'tab on' : 'tab'}
      aria-current={current === key ? 'page' : undefined}
      onClick={(e) => { e.preventDefault(); go(path, true); }}
    >
      {icon}
      {label}
    </a>
  );
  return (
    <nav className="nav" aria-label="Main">
      {tab('today', 'Today', '/', <SunIcon />)}
      {tab('tasks', 'Tasks', '/tasks', <ListIcon />)}
    </nav>
  );
}
