import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { buildDay, buildToday } from '../today';
import { addDays, longDate, parseDay, today, weekday, WEEKDAY_SHORT, type Day } from '../dates';
import { go } from '../router';
import type { Task } from '../types';
import ItemRow from '../components/ItemRow';
import Nav from '../components/Nav';
import Planner from '../components/Planner';
import { openQuickAdd } from '../components/QuickAdd';
import { Check, Person, Plus } from '../icons';
import { routineStats } from '../routines';

const CAP = 7; // lines shown below the Top 3 before "Show more" (about 10 in total)
const DAY_KEY = 'ld:todayDay';

function readDay(now: Day): Day {
  try {
    const d = sessionStorage.getItem(DAY_KEY);
    return d && d >= now && d <= addDays(now, 6) ? d : now;
  } catch {
    return now;
  }
}

export default function TodayScreen() {
  const store = useStore();
  const now = today();
  const [day, setDayState] = useState(() => readDay(now));
  const setDay = (d: Day) => {
    setDayState(d);
    try { sessionStorage.setItem(DAY_KEY, d); } catch { /* ignore */ }
  };
  const isToday = day === now;
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i));
  const plan = buildDay(store.tasks, store.routines, store.ticks, day);

  return (
    <>
      <main className="page">
        <header className="page-head">
          <div className="page-head-row">
            <p className="muted">{longDate(day)}</p>
            <button type="button" className="icon-btn" aria-label="Account" onClick={() => go('/account')}><Person /></button>
          </div>
          <h1 className="h1">{isToday ? 'Today' : day === addDays(now, 1) ? 'Tomorrow' : longDate(day).split(' ')[0]}</h1>
          <p className="muted lead">{isToday ? 'Three things that matter. Everything else can wait.' : 'Planning ahead. Tap an hour to add something.'}</p>
        </header>

        <DayStrip days={week} selected={day} now={now} onPick={setDay} />

        {isToday ? <TodayLists /> : (
          plan.anytime.length > 0 && (
            <Section title="Any time this day">
              <div className="list">{plan.anytime.map((t) => <ItemRow key={t.id} task={t} />)}</div>
            </Section>
          )
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="label">{isToday ? 'Today’s plan' : 'Plan'}</h2>
            <span className="muted small">Tap an hour to add</span>
          </div>
          <Planner day={day} isToday={isToday} items={plan.timed} />
        </section>

        {plan.routines.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2 className="label">{isToday ? 'Routines today' : 'Routines this day'}</h2>
              <a className="see-all" href="#/routines" onClick={(e) => { e.preventDefault(); go('/routines', true); }}>See all</a>
            </div>
            <div className="routine-grid">
              {plan.routines.map(({ routine, done }) => {
                const s = routineStats(routine, store.ticks, now);
                return isToday ? (
                  <button
                    key={routine.id}
                    type="button"
                    className={done ? 'routine-tile done' : 'routine-tile'}
                    aria-pressed={done}
                    aria-label={`${done ? 'Untick' : 'Tick'} ${routine.title}`}
                    onClick={() => store.toggleTick(routine.id, now)}
                  >
                    <span className="routine-text">
                      <span className="routine-name">{routine.title}</span>
                      <span className="routine-sub">{s.current} in a row</span>
                    </span>
                    <span className="routine-tick">{done && <Check size={18} />}</span>
                  </button>
                ) : (
                  <div key={routine.id} className="routine-tile later">
                    <span className="routine-text">
                      <span className="routine-name">{routine.title}</span>
                      <span className="routine-sub">{s.current} in a row</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <button type="button" className="fab" aria-label="Add something" onClick={() => openQuickAdd(isToday ? {} : { date: day })}><Plus /></button>
      <Nav current="today" />
    </>
  );
}

function DayStrip({ days, selected, now, onPick }: { days: Day[]; selected: Day; now: Day; onPick: (d: Day) => void }) {
  const store = useStore();
  const counts = new Map<Day, number>();
  for (const t of store.tasks) {
    if (t.status !== 'open' || !t.due || t.kind === 'idea' || t.kind === 'note') continue;
    const d = t.due < now ? now : t.due;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return (
    <div className="day-strip" role="radiogroup" aria-label="Choose a day">
      {days.map((d) => {
        const n = counts.get(d) ?? 0;
        const on = d === selected;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${longDate(d)}${n ? `, ${n} due` : ''}`}
            className={`day-pill${on ? ' on' : ''}${d === now ? ' is-today' : ''}`}
            onClick={() => onPick(d)}
          >
            <span className="day-pill-name">{d === now ? 'Today' : WEEKDAY_SHORT[weekday(d)]}</span>
            <span className="day-pill-num">{parseDay(d).getDate()}</span>
            <span className={n ? 'day-pill-dot' : 'day-pill-dot is-none'} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** Today's lists: Top 3, the rest due today, the next 3 days and the Inbox. */
function TodayLists() {
  const store = useStore();
  const now = today();
  const data = buildToday(store.tasks, store.routines, store.ticks, store.inbox.id, now);
  const [expanded, setExpanded] = useState(false);

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

  return (
    <>
      {data.top.length > 0 && (
        <Section title="Top 3">
          <div className="stack">
            {data.top.map((t) => <div className="card" key={t.id}><ItemRow task={t} big /></div>)}
          </div>
        </Section>
      )}
      {also.length > 0 && <ListSection title="Also due today" tasks={also} />}
      {soon.length > 0 && <ListSection title="Next 3 days" tasks={soon} />}
      {inbox.length > 0 && <ListSection title="Inbox · needs a domain" tasks={inbox} />}
      {hidden > 0 && (
        <button type="button" className="more-btn" onClick={() => setExpanded(true)}>Show {hidden} more</button>
      )}
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
