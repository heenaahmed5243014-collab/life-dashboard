// Today, in the Brain Planner's format: greeting + pills, Top 3 card, Slipping,
// Routine checklist, the lists, the hourly plan, "Do this next", and a calm send-off.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { buildDay, buildToday } from '../today';
import { addDays, daysBetween, dueLabel, shortDate, longDate, parseDay, toDay, today, weekday, WEEKDAY_SHORT, type Day } from '../dates';
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
import ChunkTicks from '../components/ChunkTicks';
import MoneyCard from '../components/MoneyCard';
import WeightCard from '../components/WeightCard';
import StepsCard from '../components/StepsCard';
import QuickWin from '../components/QuickWin';
import WeekProgress from '../components/WeekProgress';
import MirrorCard from '../components/MirrorCard';
import { dueFollowUps } from '../components/OutreachTab';
import { WorkModeButton } from '../components/WorkModeBar';
import { useWorkMode } from '../workmode';
import { resetDoneToday } from './ResetScreen';

/** Brain Planner style day pills: Gym morning, Mirror work, Fun night tonight. */
function dayPill(title: string): { text: string; cls: string } {
  if (/gym/i.test(title)) return { text: 'Gym morning', cls: 'p-sage' };
  if (/mirror/i.test(title)) return { text: 'Mirror work', cls: 'p-violet' };
  if (/fun night/i.test(title)) return { text: 'Fun night tonight 🎉', cls: 'p-pink' };
  return { text: title, cls: '' };
}
const PILL_ORDER = [/gym/i, /mirror/i, /fun night/i];

const FOCUS_KEY = 'ld:focus';
const readFocus = () => { try { return localStorage.getItem(FOCUS_KEY) === '1'; } catch { return false; } };

const NAME = 'Heena';
const CAP = 7; // lines shown in the lists before "Show more"
const DAY_KEY = 'ld:todayDay';
/** How far ahead the date strip and month view go. */
const RANGE = 31;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TIME_LABEL = { commute: 'Commute', day: 'Daytime', evening: 'Evening' } as const;

function readDay(now: Day): Day {
  try {
    const d = sessionStorage.getItem(DAY_KEY);
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Math.abs(daysBetween(now, d)) <= 400 ? d : now;
  } catch {
    return now;
  }
}

/** Things that have sat too long: carried over 3+ days, or untouched for 2+ weeks. */
function slipping(tasks: Task[], now: Day): { task: Task; why: string }[] {
  const out: { task: Task; why: string }[] = [];
  for (const t of tasks) {
    if (t.status === 'done' && t.refund_status === 'waiting') {
      const since = t.dropped_off_on ?? (t.closed_at ? toDay(new Date(t.closed_at)) : null);
      const n = since ? daysBetween(since, now) : 0;
      if (n >= 14) out.push({ task: t, why: `Refund${t.refund_amount ? ` of £${t.refund_amount.toFixed(2)}` : ''} not received after ${n} days` });
      continue;
    }
    if (t.paused) continue;
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
  // The strip shows the next month; a day picked further away gets its own month-long strip.
  const stripStart = day >= now && day <= addDays(now, RANGE - 1) ? now : addDays(day, -weekday(day));
  const week = Array.from({ length: RANGE }, (_, i) => addDays(stripStart, i));
  const plan = buildDay(store.tasks, store.routines, store.ticks, day);
  const hour = new Date().getHours();

  const title = isToday
    ? `${hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'}, ${NAME}`
    : day === addDays(now, 1) ? 'Tomorrow' : longDate(day).split(' ')[0];
  const special = plan.routines.filter((r) => PILL_ORDER.some((re) => re.test(r.routine.title)))
    .sort((a, b) => PILL_ORDER.findIndex((re) => re.test(a.routine.title)) - PILL_ORDER.findIndex((re) => re.test(b.routine.title)));
  const pills = special.map((r) => dayPill(r.routine.title));

  return (
    <>
      <main className="page planner-page">
        <header className="page-head">
          <div className="page-head-row">
            <h1 className="h1">{title}</h1>
            <span className="head-btns">
              <WorkModeButton />
              <button type="button" className="icon-btn" aria-label="Account" onClick={() => go('/account')}><Person /></button>
            </span>
          </div>
          <p className="sub">{longDate(day)}</p>
          <div className="pills">
            {pills.length ? pills.map((p, i) => <span key={p.text + i} className={`pill ${p.cls}`}>{p.text}</span>) : <span className="pill">Easy day</span>}
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
            <PlanSection day={day} isToday={false} items={plan.timed} tray={plan.anytime} />
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

function PlanSection({ day, isToday, items, tray }: { day: Day; isToday: boolean; items: Task[]; tray: Task[] }) {
  return (
    <section className="section">
      <div className="between">
        <h2 className="h2">{isToday ? 'Today’s plan' : 'Plan'}</h2>
        <span className="note">Tap an hour to add</span>
      </div>
      <Planner day={day} isToday={isToday} items={items} tray={tray} />
    </section>
  );
}

function DayStrip({ days, selected, now, onPick }: { days: Day[]; selected: Day; now: Day; onPick: (d: Day) => void }) {
  const store = useStore();
  const [month, setMonth] = useState(false);
  const sel = parseDay(selected);
  const [view, setView] = useState(() => ({ y: sel.getFullYear(), m: sel.getMonth() }));
  const strip = useRef<HTMLDivElement>(null);
  const counts = new Map<Day, number>();
  for (const t of store.tasks) {
    if (t.status !== 'open' || !t.due || t.kind === 'idea' || t.kind === 'note' || t.kind === 'goal') continue;
    const d = t.due < now ? now : t.due;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  // Keep the chosen day in view when it changes (e.g. picked from the month view).
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el && strip.current) strip.current.scrollTo({ left: Math.max(0, el.offsetLeft - strip.current.clientWidth / 2 + el.clientWidth / 2), behavior: 'smooth' });
  }, [selected, month]);

  const openMonth = () => {
    setView({ y: sel.getFullYear(), m: sel.getMonth() });
    setMonth(true);
  };
  const shift = (n: number) => setView((v) => {
    const d = new Date(v.y, v.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = `${view.y}-${pad(view.m + 1)}-01` as Day;
  const gridStart = addDays(first, -weekday(first));
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const weeks = Math.ceil((weekday(first) + daysInMonth) / 7);
  const grid = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const nowD = parseDay(now);
  const viewingThisMonth = view.y === nowD.getFullYear() && view.m === nowD.getMonth();

  const dayCell = (d: Day) => {
    const n = counts.get(d) ?? 0;
    const on = d === selected;
    const inMonth = parseDay(d).getMonth() === view.m;
    return (
      <button
        key={d}
        type="button"
        aria-pressed={on}
        aria-label={`${longDate(d)}${n ? `, ${n} due` : ''}`}
        className={`month-day${on ? ' on' : ''}${d === now ? ' is-today' : ''}${inMonth ? '' : ' other'}${d < now ? ' past' : ''}`}
        onClick={() => { onPick(d); setMonth(false); }}
      >
        <span className="month-num">{parseDay(d).getDate()}</span>
        <span className={n ? 'day-pill-dot' : 'day-pill-dot is-none'} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="day-nav">
      {month ? (
        <>
          <div className="month-head">
            <button type="button" className="icon-btn small month-arrow" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
            <span className="day-nav-month" aria-live="polite">{MONTHS[view.m]} {view.y}</span>
            <button type="button" className="icon-btn small month-arrow" aria-label="Next month" onClick={() => shift(1)}>›</button>
            <span className="month-head-actions">
              {!viewingThisMonth && <button type="button" className="link-btn" onClick={() => setView({ y: nowD.getFullYear(), m: nowD.getMonth() })}>This month</button>}
              <button type="button" className="link-btn" onClick={() => setMonth(false)}>Close</button>
            </span>
          </div>
          <div className="month-grid" role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} className="month-wd" aria-hidden="true">{w}</span>)}
            {grid.map(dayCell)}
          </div>
        </>
      ) : (
        <>
          <div className="between day-nav-head">
            <span className="day-nav-month">{MONTHS[sel.getMonth()]} {sel.getFullYear()}</span>
            <span className="month-head-actions">
              {selected !== now && <button type="button" className="link-btn" onClick={() => onPick(now)}>Today</button>}
              <button type="button" className="link-btn" aria-expanded={month} onClick={openMonth}>Month</button>
            </span>
          </div>
          <div className="day-strip" ref={strip} role="radiogroup" aria-label="Choose a day">
            {days.map((d) => {
              const n = counts.get(d) ?? 0;
              const on = d === selected;
              const date = parseDay(d).getDate();
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${longDate(d)}${n ? `, ${n} due` : ''}`}
                  className={`day-pill${on ? ' on' : ''}${d === now ? ' is-today' : ''}${date === 1 ? ' month-start' : ''}`}
                  onClick={() => onPick(d)}
                >
                  <span className="day-pill-name">{d === now ? 'Today' : date === 1 ? MONTHS[parseDay(d).getMonth()].slice(0, 3) : WEEKDAY_SHORT[weekday(d)]}</span>
                  <span className="day-pill-num">{date}</span>
                  <span className={n ? 'day-pill-dot' : 'day-pill-dot is-none'} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function TodayBody() {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const slip = slipping(store.tasks, now);
  const slipIds = new Set(slip.map((s) => s.task.id));
  const follows = dueFollowUps(store.leads, now);
  const data = buildToday(store.tasks.filter((t) => !slipIds.has(t.id)), store.routines, store.ticks, store.inbox.id, now);
  const plan = buildDay(store.tasks, store.routines, store.ticks, now);
  const [expanded, setExpanded] = useState(false);
  const [skip, setSkip] = useState(0);
  const [focus, setFocusState] = useState(readFocus);
  const work = useWorkMode();
  const setFocus = (on: boolean) => {
    setFocusState(on);
    try { localStorage.setItem(FOCUS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  };

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

  // "Pick for me": star the next most sensible things until there are 3.
  const topIds = new Set(data.top.map((t) => t.id));
  const AREA_ORDER = ['returns', 'quick admin'];
  const pickable = store.tasks
    .filter((t) => t.status === 'open' && t.kind === 'task' && !topIds.has(t.id) && t.domain_id !== store.inbox.id)
    .sort((a, b) => {
      const g = (t: Task) => {
        const sub = store.subcategories.find((x) => x.id === t.subcategory_id)?.name.trim().toLowerCase() ?? '';
        const i = AREA_ORDER.indexOf(sub);
        return i < 0 ? AREA_ORDER.length : i;
      };
      return (a.due ?? '9999').localeCompare(b.due ?? '9999') || g(a) - g(b) || (a.minutes ?? 30) - (b.minutes ?? 30);
    });
  const pickForMe = () => {
    const chosen = pickable.slice(0, 3 - data.top.length);
    chosen.forEach((t) => store.updateTask(t.id, { starred: true }));
    toast({ message: `Picked ${chosen.length}: ${chosen.map((t) => t.title).join(', ')}`, undo: () => chosen.forEach((t) => store.updateTask(t.id, { starred: false })) });
  };
  const [todo, setTodo] = useState('');
  const home = store.domains.find((d) => d.name === 'Personal & home') ?? store.domains.find((d) => !d.is_inbox) ?? store.inbox;
  const addTodo = () => {
    const title = todo.trim();
    if (!title) return;
    store.addTask({ title, domain_id: home.id, due: now });
    setTodo('');
  };
  const mirror = data.routines.some(({ routine }) => /mirror/i.test(routine.title));
  const funNight = data.routines.some(({ routine }) => /fun night/i.test(routine.title));

  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  const comingUp = plan.timed.filter((t) => (t.due_time ?? '') >= nowTime).slice(0, 2);

  const top = (
    <div className="card hero">
      <div className="between"><span className="eyebrow">Top 3 today</span><span className="count">{data.top.length}/3</span></div>
      {data.top.length
        ? <div className="list in-card">{data.top.map((t) => <ItemRow key={t.id} task={t} />)}</div>
        : <p className="empty-note">Nothing picked yet. Star things on your lists, or let me pick.</p>}
      {data.top.length < 3 && pickable.length > 0 && (
        <div className="row"><button type="button" className="btn small" onClick={pickForMe}>Pick for me</button></div>
      )}
      <QuickWin />
    </div>
  );
  const modeSwitch = (
    <div className="segmented focus-switch" role="radiogroup" aria-label="How much to show">
      <button type="button" role="radio" aria-checked={!focus} className={focus ? 'seg' : 'seg on'} onClick={() => setFocus(false)}>Everything</button>
      <button type="button" role="radio" aria-checked={focus} className={focus ? 'seg on' : 'seg'} onClick={() => setFocus(true)}>Focus</button>
    </div>
  );

  // Evening reset prompt: from 6pm until it's done for the day.
  const left = store.tasks.filter((t) => t.status === 'open' && t.kind === 'task' && ((t.due && t.due <= now) || t.starred)).length;
  const resetCard = evening && !resetDoneToday() ? (
    <div className="card reset-prompt">
      <div className="between"><span className="eyebrow">Evening reset · 2 minutes</span>{left > 0 && <span className="count">{left} left</span>}</div>
      <p className="note">{left ? 'Decide what happens to what’s left, then pick tomorrow’s Top 3.' : 'Nothing left over. Just pick tomorrow’s Top 3.'}</p>
      <div className="row"><button type="button" className="btn primary small" onClick={() => go('/reset')}>Start</button></div>
    </div>
  ) : null;

  if (focus) {
    return (
      <>
        {modeSwitch}
        {resetCard}
        {top}
        {comingUp.length > 0 && <ListSection title="Coming up" tasks={comingUp} />}
        <p className="note center-note">Focus mode: everything else is hidden, not gone. Switch to Everything when you’re ready.</p>
      </>
    );
  }

  return (
    <>
      {modeSwitch}
      {resetCard}
      {top}

      {slip.length + follows.length > 0 && (
        <div className="card slip">
          <div className="between"><span className="eyebrow">Slipping · {slip.length + follows.length}</span></div>
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
          {follows.length > 0 && (
            <ul className="check-list in-card">
              {follows.map((l) => (
                <li key={l.id} className="check-row">
                  <button type="button" className="row-body" onClick={() => go(`/area/${l.domain_id}/outreach`)}>
                    <span className="row-title">Follow up: {l.name}</span>
                    <span className="meta"><span className="tag t-amber">{l.follow_up! < now ? `Follow-up was due ${shortDate(l.follow_up!)}` : 'Follow-up due today'}</span></span>
                  </button>
                  <button type="button" className="btn small" onClick={() => {
                    store.updateLead(l.id, { follow_up: addDays(now, 3) });
                    toast({ message: 'Snoozed for 3 days. No guilt.', undo: () => store.updateLead(l.id, { follow_up: l.follow_up }) });
                  }}>Snooze</button>
                </li>
              ))}
            </ul>
          )}
          {slip.length > 6 && <p className="note">+{slip.length - 6} more</p>}
        </div>
      )}

      {data.routines.length > 0 && (
        <section className="section">
          <div className="between"><h2 className="h2">Routine</h2><span className="count">{routinesDone}/{data.routines.length}</span></div>
          <div className="progress"><div className="bar"><i style={{ width: `${(routinesDone / data.routines.length) * 100}%` }} /></div></div>
          <ul className="check-list">
            {data.routines.map(({ routine, done, count }) => {
              const s = routineStats(routine, store.ticks, now);
              const chunked = routine.chunks > 1;
              return (
                <li key={routine.id} className={`check-row${done ? ' done' : ''}${chunked ? ' chunked' : ''}`}>
                  {!chunked && (
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
                  )}
                  <button type="button" className="row-body" onClick={() => go(`/routine/${routine.id}`)}>
                    <span className="between">
                      <span className="row-title">{routine.title}</span>
                      {chunked && <span className="count">{count} of {routine.chunks}</span>}
                    </span>
                    <span className="meta">
                      <span className="tag t-violet">{TIME_LABEL[routine.time_of_day]}</span>
                      {s.current > 1 && <span className="tag t-sage">🔥 {s.current} day streak</span>}
                      {chunked && !done && s.current > 0 && <span className="tag">Finish all {routine.chunks} to keep it</span>}
                    </span>
                  </button>
                  {chunked && <ChunkTicks routine={routine} day={now} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {mirror && !work.active && <MirrorCard day={now} />}

      <section className="section">
        <div className="between"><h2 className="h2">Today’s to-dos</h2><span className="count">{also.length}</span></div>
        <p className="note">Little one-off jobs. Anything unfinished moves to tomorrow by itself.</p>
        {also.length > 0 ? <div className="list">{also.map((t) => <ItemRow key={t.id} task={t} />)}</div> : <p className="muted small empty-line">Nothing here yet.</p>}
        <form className="add-sub todo-add" onSubmit={(e) => { e.preventDefault(); addTodo(); }}>
          <label className="visually-hidden" htmlFor="todo-in">Add a to-do for today</label>
          <input id="todo-in" className="step-input" value={todo} placeholder="e.g. Pick up parcel" autoComplete="off" onChange={(e) => setTodo(e.target.value)} />
          <button type="submit" className="btn primary">Add</button>
        </form>
      </section>

      <PlanSection day={now} isToday items={plan.timed} tray={[...data.top, ...data.also].filter((t) => !t.due_time && t.kind !== 'project')} />

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

      {(soon.length > 0 || inbox.length > 0) && (
        <>
          {soon.length > 0 && <ListSection title="Next 3 days" tasks={soon} />}
          {inbox.length > 0 && <ListSection title="Inbox · needs an area" tasks={inbox} />}
        </>
      )}
      {hidden > 0 && <button type="button" className="btn small more" onClick={() => setExpanded(true)}>Show {hidden} more</button>}

      <WeekProgress />
      {!work.active && (
        <>
          <MoneyCard />
          {store.healthReady !== false && <StepsCard />}
          <WeightCard />
        </>
      )}

      <div className="calm">{funNight ? 'It’s fun night. Close the laptop and go enjoy it. 💗' : evening ? 'Close the laptop and go enjoy your evening. 💗' : 'After this: enjoy life and stop stressing. 💗'}</div>
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
