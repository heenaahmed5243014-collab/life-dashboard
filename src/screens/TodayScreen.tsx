// Today, in the Brain Planner's format: greeting + pills, Top 3 card, Slipping,
// Routine checklist, the lists, the hourly plan, "Do this next", and a calm send-off.
import { useState } from 'react';
import { useStore } from '../store';
import { buildDay, buildToday } from '../today';
import { addDays, daysBetween, dueLabel, longDate, parseDay, toDay, today, weekday, WEEKDAY_SHORT, type Day } from '../dates';
import { go } from '../router';
import type { Task } from '../types';
import ItemRow, { EffortTags, whenText } from '../components/ItemRow';
import Nav from '../components/Nav';
import Planner from '../components/Planner';
import { openQuickAdd } from '../components/QuickAdd';
import { useToast } from '../toast';
import { cheer } from '../cheers';
import { Check, Person, Plus } from '../icons';
import { routineStats } from '../routines';

const NAME = 'Heena';
const CAP = 7; // lines shown in the lists before "Show more"
const DAY_KEY = 'ld:todayDay';
const TIME_LABEL = { commute: 'Commute', day: 'Daytime', evening: 'Evening' } as const;

function readDay(now: Day): Day {
  try {
    const d = sessionStorage.getItem(DAY_KEY);
    return d && d >= now && d <= addDays(now, 6) ? d : now;
  } catch {
    return now;
  }
}

/** Things that have sat too long: carried over 3+ days, or untouched for 2+ weeks. */
function slipping(tasks: Task[], now: Day): { task: Task; why: string }[] {
  const out: { task: Task; why: string }[] = [];
  for (const t of tasks) {
    if (t.status !== 'open' || t.kind === 'idea' || t.kind === 'note' || t.kind === 'goal') continue;
    if (t.due && daysBetween(t.due, now) >= 3) {
      out.push({ task: t, why: `Carried over since ${WEEKDAY_SHORT[weekday(t.due)]} ${parseDay(t.due).getDate()}` });
      continue;
    }
    const age = daysBetween(toDay(new Date(t.touched_at)), now);
    if (!t.due && age >= 14) out.push({ task: t, why: `On your list ${age} days` });
  }
  return out;
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
  const hour = new Date().getHours();

  const title = isToday
    ? `${hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'}, ${NAME}`
    : day === addDays(now, 1) ? 'Tomorrow' : longDate(day).split(' ')[0];
  const pills = plan.routines.slice(0, 3).map((r) => r.routine.title);

  return (
    <>
      <main className="page planner-page">
        <header className="page-head">
          <div className="page-head-row">
            <h1 className="h1">{title}</h1>
            <button type="button" className="icon-btn" aria-label="Account" onClick={() => go('/account')}><Person /></button>
          </div>
          <p className="sub">{longDate(day)}</p>
          <div className="pills">
            {pills.length ? pills.map((p, i) => <span key={p + i} className={`pill ${['p-sage', 'p-violet', 'p-pink'][i % 3]}`}>{p}</span>) : <span className="pill">Easy day</span>}
            {plan.routines.length > 3 && <span className="pill">+{plan.routines.length - 3} more</span>}
          </div>
        </header>

        <DayStrip days={week} selected={day} now={now} onPick={setDay} />

        {isToday ? <TodayBody /> : (
          <>
            {plan.anytime.length > 0 && (
              <section className="section">
                <div className="between"><h2 className="h2">Any time this day</h2><span className="count">{plan.anytime.length}</span></div>
                <div className="list">{plan.anytime.map((t) => <ItemRow key={t.id} task={t} />)}</div>
              </section>
            )}
            <PlanSection day={day} isToday={false} items={plan.timed} />
            {plan.routines.length > 0 && (
              <section className="section">
                <div className="between"><h2 className="h2">Routine</h2><span className="count">{plan.routines.length}</span></div>
                <ul className="check-list">
                  {plan.routines.map(({ routine }) => (
                    <li key={routine.id} className="check-row static">
                      <span className="row-title">{routine.title}</span>
                      <span className="meta"><span className="tag t-violet">{TIME_LABEL[routine.time_of_day]}</span></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <button type="button" className="fab" aria-label="Add something" onClick={() => openQuickAdd(isToday ? {} : { date: day })}><Plus /></button>
      <Nav current="today" />
    </>
  );
}

function PlanSection({ day, isToday, items }: { day: Day; isToday: boolean; items: Task[] }) {
  return (
    <section className="section">
      <div className="between">
        <h2 className="h2">{isToday ? 'Today’s plan' : 'Plan'}</h2>
        <span className="note">Tap an hour to add</span>
      </div>
      <Planner day={day} isToday={isToday} items={items} />
    </section>
  );
}

function DayStrip({ days, selected, now, onPick }: { days: Day[]; selected: Day; now: Day; onPick: (d: Day) => void }) {
  const store = useStore();
  const counts = new Map<Day, number>();
  for (const t of store.tasks) {
    if (t.status !== 'open' || !t.due || t.kind === 'idea' || t.kind === 'note' || t.kind === 'goal') continue;
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

function TodayBody() {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const slip = slipping(store.tasks, now);
  const slipIds = new Set(slip.map((s) => s.task.id));
  const data = buildToday(store.tasks.filter((t) => !slipIds.has(t.id)), store.routines, store.ticks, store.inbox.id, now);
  const plan = buildDay(store.tasks, store.routines, store.ticks, now);
  const [expanded, setExpanded] = useState(false);
  const [skip, setSkip] = useState(0);

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

  const routinesDone = data.routines.filter((r) => r.done).length;
  const queue = [...data.top, ...data.also, ...plan.timed, ...data.soon, ...slip.map((s) => s.task)];
  const next = queue.length ? queue[skip % queue.length] : null;
  const evening = new Date().getHours() >= 18;

  const snooze = (t: Task) => {
    const before = { due: t.due };
    store.updateTask(t.id, { due: addDays(now, 3) });
    toast({ message: `Snoozed to ${dueLabel(addDays(now, 3), now)}. No guilt.`, undo: () => store.updateTask(t.id, before) });
  };
  const doneNext = (t: Task) => {
    store.updateTask(t.id, { status: 'done', closed_at: new Date().toISOString(), starred: false });
    toast({ message: cheer(), undo: () => store.updateTask(t.id, { status: 'open', closed_at: null }) });
  };

  return (
    <>
      <div className="card hero">
        <div className="between"><span className="eyebrow">Top 3 today</span><span className="count">{data.top.length}/3</span></div>
        {data.top.length
          ? <div className="list in-card">{data.top.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          : <p className="empty-note">Nothing due today. Tap + to add the next thing on your mind.</p>}
      </div>

      {slip.length > 0 && (
        <div className="card slip">
          <div className="between"><span className="eyebrow">Slipping · {slip.length}</span></div>
          <p className="note">These have sat too long. Do one, or snooze it for 3 days, guilt-free.</p>
          <ul className="check-list in-card">
            {slip.slice(0, 6).map(({ task, why }) => (
              <li key={task.id} className="check-row">
                <button type="button" className="row-body" onClick={() => go(`/item/${task.id}`)}>
                  <span className="row-title">{task.title}</span>
                  <span className="meta"><span className="tag t-amber">{why}</span></span>
                </button>
                <button type="button" className="btn small" onClick={() => snooze(task)}>Snooze</button>
              </li>
            ))}
          </ul>
          {slip.length > 6 && <p className="note">+{slip.length - 6} more</p>}
        </div>
      )}

      {data.routines.length > 0 && (
        <section className="section">
          <div className="between"><h2 className="h2">Routine</h2><span className="count">{routinesDone}/{data.routines.length}</span></div>
          <div className="progress"><div className="bar"><i style={{ width: `${(routinesDone / data.routines.length) * 100}%` }} /></div></div>
          <ul className="check-list">
            {data.routines.map(({ routine, done }) => {
              const s = routineStats(routine, store.ticks, now);
              return (
                <li key={routine.id} className={done ? 'check-row done' : 'check-row'}>
                  <button
                    type="button"
                    className="tick"
                    aria-pressed={done}
                    aria-label={`${done ? 'Untick' : 'Tick'} ${routine.title}`}
                    onClick={() => {
                      store.toggleTick(routine.id, now);
                      if (!done) toast({ message: cheer() });
                    }}
                  >
                    <span className="box"><Check size={16} /></span>
                  </button>
                  <button type="button" className="row-body" onClick={() => go(`/routine/${routine.id}`)}>
                    <span className="row-title">{routine.title}</span>
                    <span className="meta">
                      <span className="tag t-violet">{TIME_LABEL[routine.time_of_day]}</span>
                      {s.current > 1 && <span className="tag t-sage">🔥 {s.current} day streak</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {also.length > 0 && <ListSection title="Also due today" tasks={also} />}
      {soon.length > 0 && <ListSection title="Next 3 days" tasks={soon} />}
      {inbox.length > 0 && <ListSection title="Inbox · needs an area" tasks={inbox} />}
      {hidden > 0 && <button type="button" className="btn small more" onClick={() => setExpanded(true)}>Show {hidden} more</button>}

      <PlanSection day={now} isToday items={plan.timed} />

      <div className="card">
        <span className="eyebrow">Do this next</span>
        <div className="big">{next ? next.title : 'All clear. Go enjoy your evening 💗'}</div>
        {next?.step && <p className="first-step"><span className="tag t-pink">First step</span> {next.step}</p>}
        {next && <span className="meta"><span className="tag">{store.domain(next.domain_id).short_name} · {whenText(next)}</span><EffortTags task={next} /></span>}
        {next && (
          <div className="row">
            <button type="button" className="btn primary" onClick={() => doneNext(next)}>Done ✓</button>
            {queue.length > 1 && <button type="button" className="btn" onClick={() => setSkip((n) => n + 1)}>Not now</button>}
          </div>
        )}
      </div>

      <div className="calm">{evening ? 'Close the laptop and go enjoy your evening. 💗' : 'After this: enjoy life and stop stressing. 💗'}</div>
    </>
  );
}

function ListSection({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section className="section">
      <div className="between"><h2 className="h2">{title}</h2><span className="count">{tasks.length}</span></div>
      <div className="list">{tasks.map((t) => <ItemRow key={t.id} task={t} />)}</div>
    </section>
  );
}
