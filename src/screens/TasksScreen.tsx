// Every task, project and idea, filterable by domain. Matches the "Tasks" design.
import { useState } from 'react';
import { useStore } from '../store';
import { byDue } from '../today';
import { addDays, daysBetween, dueLabel, hhmm, shortDate, today } from '../dates';
import type { Task } from '../types';
import ItemRow from '../components/ItemRow';
import Nav from '../components/Nav';
import { openQuickAdd } from '../components/QuickAdd';
import { Plus } from '../icons';

const FILTER_KEY = 'ld:tasksFilter';

const isTodo = (t: Task) => t.kind === 'task' || t.kind === 'project';

function readFilter(): string {
  try {
    return sessionStorage.getItem(FILTER_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

function tagFor(t: Task, now: string): string {
  if (t.kind === 'idea') return 'Idea';
  if (t.kind === 'note' && !t.due) return 'Note';
  if (!t.due) return t.kind === 'project' ? 'Project' : 'No date';
  const time = hhmm(t.due_time);
  const day = t.due <= now ? 'Today' : daysBetween(now, t.due) < 7 ? dueLabel(t.due, now) : shortDate(t.due);
  return time ? `${day} ${time}` : day;
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
    { title: 'This week', note: 'Coming up in the next 7 days.', items: open.filter((t) => isTodo(t) && t.due && t.due <= weekEnd) },
    { title: 'Later', note: 'Dated, but not yet. No need to look at these today.', items: open.filter((t) => isTodo(t) && t.due && t.due > weekEnd) },
    { title: 'No date yet', note: 'Do one when you have a gap.', items: open.filter((t) => isTodo(t) && !t.due) },
    { title: 'Ideas', note: 'Not to-dos. Parked until you decide to start one.', items: open.filter((t) => t.kind === 'idea'), soft: true },
    { title: 'Notes', note: 'Things to remember.', items: open.filter((t) => t.kind === 'note'), soft: true },
  ].filter((g) => g.items.length > 0);

  const done = store.tasks
    .filter((t) => t.status !== 'open' && inFilter(t))
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));

  const taskCount = open.filter(isTodo).length;
  const doneCount = done.filter((t) => t.status === 'done' && isTodo(t)).length;
  const total = taskCount + doneCount;
  const chips = [{ id: 'all', short_name: 'All', color: '' }, ...store.domains];

  return (
    <>
      <main className="page page-tasks">
        <header className="page-head pad">
          <h1 className="h1">The big list</h1>
          <p className="sub">Everything in one place. Tap the box to tick it off, or tap the words to change it.</p>
        </header>

        <div className="progress pad">
          <div className="bar"><i style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} /></div>
          <span className="count">{doneCount} / {total}</span>
        </div>

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
          <section key={g.title} className={`section pad${g.soft ? ' soft' : ''}`}>
            <div className="between"><h2 className="h2">{g.title}</h2>{!g.soft && <span className="count">{g.items.length} left</span>}</div>
            <p className="note">{g.note}</p>
            <div className="list">
              {g.items.map((t) => <ItemRow key={t.id} task={t} tag={tagFor(t, now)} />)}
            </div>
          </section>
        ))}

        {done.length > 0 && (
          <section className="section pad">
            <button type="button" className="later-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              <span>Finished in the last 2 weeks 🎉</span>
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
        onClick={() => openQuickAdd({ domainId: filter === 'all' ? null : filter })}
      >
        <Plus />
      </button>
      <Nav current="tasks" />
    </>
  );
}
