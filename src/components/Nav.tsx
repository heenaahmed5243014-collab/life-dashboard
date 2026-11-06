import type { ReactNode } from 'react';
import { go } from '../router';
import { useWorkMode } from '../workmode';

type Tab = 'today' | 'areas' | 'tasks' | 'routines' | 'income';

const icon = (children: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONS: Record<Tab, ReactNode> = {
  today: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  areas: icon(<><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>),
  tasks: icon(<><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17" /></>),
  income: icon(<><path d="M16 7.5a3.5 3.5 0 0 0-6.5 1.8V16c0 1-.6 2-1.5 2.5h9" /><path d="M7 12.5h7" /></>),
  routines: icon(<><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>),
};
const TABS: { key: Tab; label: string; path: string }[] = [
  { key: 'today', label: 'Today', path: '/' },
  { key: 'areas', label: 'Areas', path: '/areas' },
  { key: 'tasks', label: 'Tasks', path: '/tasks' },
  { key: 'routines', label: 'Routines', path: '/routines' },
  { key: 'income', label: 'Money', path: '/income' },
];

export default function Nav({ current }: { current: Tab }) {
  const work = useWorkMode();
  const tabs = work.active ? TABS.filter((t) => t.key !== 'income') : TABS;
  return (
    <nav className="nav" aria-label="Main">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={'#' + t.path}
          className={current === t.key ? 'tab on' : 'tab'}
          aria-current={current === t.key ? 'page' : undefined}
          onClick={(e) => { e.preventDefault(); go(t.path, true); }}
        >
          {ICONS[t.key]}
          {t.label}
        </a>
      ))}
    </nav>
  );
}
