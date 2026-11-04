import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { buildToday } from '../today';
import { longDate, today } from '../dates';
import { go } from '../router';
import type { Task } from '../types';
import ItemRow from '../components/ItemRow';
import Nav from '../components/Nav';
import { openQuickAdd } from '../components/QuickAdd';
import { Check, Plus } from '../icons';

const CAP = 7; // lines shown below the Top 3 before "Show more" (about 10 in total)

export default function TodayScreen() {
  const store = useStore();
  const now = today();
  const data = buildToday(store.tasks, store.routines, store.ticks, store.inbox.id, now);
  const [expanded, setExpanded] = useState(false);

  // Share the line budget across the sections below Top 3, in order.
  let budget = expanded ? Infinity : CAP;
  const take = (list: Task[]) => {
    const shown = list.slice(0, Math.max(0, budget));
    budget -= shown.length;
    return shown;
  };
  const also = take(data.also);
  const soon = take(data.soon);
  const inbox = take(data.inbox);
  const hidden = data.also.length + data.soon.length + data.inbox.length - also.length - soon.length - inbox.length;
  const nothing = data.top.length + data.soon.length + data.inbox.length === 0;

  return (
    <>
      <main className="page">
        <header className="page-head">
          <div className="page-head-row">
            <p className="muted">{longDate(now)}</p>
            <a className="link-btn" href="#/account" onClick={(e) => { e.preventDefault(); go('/account'); }}>Account</a>
          </div>
          <h1 className="h1">Today</h1>
        </header>

        {nothing && (
          <section className="empty">
            <p className="empty-title">Nothing due in the next few days.</p>
            <p className="muted">Tap + to add the next thing on your mind.</p>
          </section>
        )}

        {data.top.length > 0 && (
          <Section title="Top 3">
            <div className="stack">
              {data.top.map((t) => <div className="card" key={t.id}><ItemRow task={t} big /></div>)}
            </div>
          </Section>
        )}

        {also.length > 0 && <ListSection title="Also today" tasks={also} />}
        {soon.length > 0 && <ListSection title="Next 3 days" tasks={soon} />}
        {inbox.length > 0 && <ListSection title="Inbox · needs a domain" tasks={inbox} />}

        {hidden > 0 && (
          <button type="button" className="more-btn" onClick={() => setExpanded(true)}>Show {hidden} more</button>
        )}

        {data.routines.length > 0 && (
          <Section title="Routines today">
            <div className="routine-grid">
              {data.routines.map(({ routine, done }) => (
                <div key={routine.id} className={done ? 'routine-tile done' : 'routine-tile'}>
                  <button type="button" className="routine-name" onClick={() => go(`/routine/${routine.id}`)}>
                    <span>{routine.title}</span>
                    <span className="routine-sub">
                      <span className="dot" style={{ background: store.domain(routine.domain_id).color }} />
                      {routine.time_of_day === 'commute' ? 'Commute' : routine.time_of_day === 'evening' ? 'Evening' : 'Day'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="routine-tick"
                    aria-pressed={done}
                    aria-label={done ? `Untick ${routine.title}` : `Tick ${routine.title}`}
                    onClick={() => store.toggleTick(routine.id, now)}
                  >
                    {done && <Check size={18} />}
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}
      </main>

      <button type="button" className="fab" aria-label="Add something" onClick={() => openQuickAdd()}><Plus /></button>
      <Nav current="today" />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  );
}

function ListSection({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <Section title={title}>
      <div className="list">{tasks.map((t) => <ItemRow key={t.id} task={t} />)}</div>
    </Section>
  );
}
