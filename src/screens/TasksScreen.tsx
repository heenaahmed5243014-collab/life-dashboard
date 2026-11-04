// Every task, project and idea, filterable by domain. Matches the "Tasks" design.
import { useState } from 'react';
import { useStore } from '../store';
import { byDue } from '../today';
import { addDays, daysBetween, dueLabel, shortDate, today } from '../dates';
import { go } from '../router';
import type { Task } from '../types';
import ItemRow from '../components/ItemRow';
import Nav from '../components/Nav';
import { Plus } from '../icons';

const FILTER_KEY = 'ld:tasksFilter';

function readFilter(): string {
  try {
    return sessionStorage.getItem(FILTER_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

function tagFor(t: Task, now: string): string {
  if (t.kind === 'idea') return 'Idea';
  if (!t.due) return t.kind === 'project' ? 'Project' : 'No date';
  if (t.due <= now) return 'Today';
  return daysBetween(now, t.due) < 7 ? dueLabel(t.due, now) : shortDate(t.due);
}

export default function TasksScreen() {
  const store = useStore();
  const now = today();
  const [filter, setFilterState] = useState(readFilter);
  const [showDone, setShowDone] = useState(false);

  const setFilter = (f: string) => {
    setFilterState(f);
    try { sessionStorage.setItem(FILTER_KEY, f); } catch { /* ignore */ }
  };

  const inFilter = (t: Task) => filter === 'all' || t.domain_id === filter;
  const open = store.tasks.filter((t) => t.status === 'open' && inFilter(t)).sort(byDue);
  const weekEnd = addDays(now, 6);
  const groups = [
    { title: 'This week', items: open.filter((t) => t.kind !== 'idea' && t.due && t.due <= weekEnd) },
    { title: 'Later', items: open.filter((t) => t.kind !== 'idea' && t.due && t.due > weekEnd) },
    { title: 'No date yet', items: open.filter((t) => t.kind !== 'idea' && !t.due) },
    { title: 'Ideas', items: open.filter((t) => t.kind === 'idea') },
  ].filter((g) => g.items.length > 0);

  const done = store.tasks
    .filter((t) => t.status !== 'open' && inFilter(t))
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));

  const taskCount = open.filter((t) => t.kind !== 'idea').length;
  const chips = [{ id: 'all', short_name: 'All', color: '' }, ...store.domains];

  return (
    <>
      <main className="page page-tasks">
        <header className="page-head pad">
          <h1 className="h1">Tasks</h1>
          <p className="muted">{taskCount} open {taskCount === 1 ? 'task' : 'tasks'}</p>
        </header>

        <div className="chip-scroll" role="radiogroup" aria-label="Filter by domain">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={filter === c.id}
              className={filter === c.id ? 'chip on' : 'chip'}
              onClick={() => setFilter(c.id)}
            >
              {c.color && <span className="dot" style={{ background: c.color }} />}
              {c.short_name}
            </button>
          ))}
        </div>

        {groups.length === 0 && (
          <section className="empty pad-x">
            <p className="empty-title">Nothing open here.</p>
            <p className="muted">Tap + to add something.</p>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.title} className="section pad">
            <h2 className="label">{g.title}</h2>
            <div className="list">
              {g.items.map((t) => <ItemRow key={t.id} task={t} tag={tagFor(t, now)} />)}
            </div>
          </section>
        ))}

        {done.length > 0 && (
          <section className="section pad">
            <button type="button" className="later-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              <span>Finished in the last 2 weeks</span>
              <span className="muted">{showDone ? 'Hide' : done.length}</span>
            </button>
            {showDone && (
              <div className="list">
                {done.map((t) => <ItemRow key={t.id} task={t} tag={t.status === 'done' ? 'Done' : 'Let go'} />)}
              </div>
            )}
          </section>
        )}
      </main>

      <button
        type="button"
        className="fab"
        aria-label="Add a task"
        onClick={() => go(filter === 'all' ? '/add' : `/add/${filter}`)}
      >
        <Plus />
      </button>
      <Nav current="tasks" />
    </>
  );
}
