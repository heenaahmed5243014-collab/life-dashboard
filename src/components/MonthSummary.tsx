// Routines: a monthly habit summary — how many due days were done, streaks, and (for gym)
// which sessions you did. Move between months with the arrows.
import { useState } from 'react';
import { useStore } from '../store';
import type { Routine, Tick } from '../types';
import { addDays, parseDay, today, toDay, weekday } from '../dates';
import { routineStats } from '../routines';
import { go } from '../router';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface RoutineMonth {
  r: Routine;
  due: number; // due days so far this month
  done: number;
  bestRun: number;
  days: { day: string; state: 'done' | 'partial' | 'missed' | 'off' | 'future' }[];
  sessions: [string, number][];
}

function summarise(r: Routine, ticks: Tick[], first: string, last: string, now: string): RoutineMonth {
  const full = r.chunks ?? 1;
  const mine = new Map(ticks.filter((t) => t.routine_id === r.id).map((t) => [t.day, t]));
  const created = toDay(new Date(r.created_at));
  const days: RoutineMonth['days'] = [];
  let due = 0, done = 0, run = 0, bestRun = 0;
  const sessions = new Map<string, number>();
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const isDue = r.days.includes(weekday(d)) && d >= created;
    const t = mine.get(d);
    const ok = Boolean(t && (t.count ?? 1) >= full);
    if (t?.session) sessions.set(t.session, (sessions.get(t.session) ?? 0) + 1);
    if (d > now) { days.push({ day: d, state: 'future' }); continue; }
    if (!isDue) { days.push({ day: d, state: ok ? 'done' : 'off' }); continue; }
    if (d < now || ok) due++;
    if (ok) { done++; bestRun = Math.max(bestRun, ++run); days.push({ day: d, state: 'done' }); }
    else if (t) { if (d < now) run = 0; days.push({ day: d, state: 'partial' }); }
    else { if (d < now) run = 0; days.push({ day: d, state: d === now ? 'future' : 'missed' }); }
  }
  return { r, due, done, bestRun, days, sessions: [...sessions.entries()].sort((a, b) => b[1] - a[1]) };
}

export default function MonthSummary() {
  const store = useStore();
  const now = today();
  const n = parseDay(now);
  const [view, setView] = useState({ y: n.getFullYear(), m: n.getMonth() });
  const first = toDay(new Date(view.y, view.m, 1));
  const lastOfMonth = toDay(new Date(view.y, view.m + 1, 0));
  const isThisMonth = view.y === n.getFullYear() && view.m === n.getMonth();
  const inFuture = first > now;
  const shift = (k: number) => setView((v) => { const d = new Date(v.y, v.m + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const rows = store.routines.map((r) => summarise(r, store.ticks, first, lastOfMonth, now));
  const due = rows.reduce((s, x) => s + x.due, 0);
  const done = rows.reduce((s, x) => s + x.done, 0);
  const pct = due ? Math.round((done / due) * 100) : 0;
  const best = rows.filter((x) => x.due > 0).sort((a, b) => b.done / b.due - a.done / a.due)[0];

  return (
    <div className="stack month-sum">
      <div className="month-head">
        <button type="button" className="icon-btn small month-arrow" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <span className="day-nav-month">{MONTHS[view.m]} {view.y}</span>
        <button type="button" className="icon-btn small month-arrow" aria-label="Next month" onClick={() => shift(1)} disabled={isThisMonth}>›</button>
        {!isThisMonth && <span className="month-head-actions"><button type="button" className="link-btn" onClick={() => setView({ y: n.getFullYear(), m: n.getMonth() })}>This month</button></span>}
      </div>

      {inFuture ? <p className="note">This month hasn’t started yet.</p> : (
        <>
          <section className="card hero">
            <div className="between"><span className="eyebrow">{isThisMonth ? 'This month so far' : 'Month total'}</span><span className="count">{done} of {due} days</span></div>
            <div className="big-money">{pct}%<span className="note"> of habit days done</span></div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            {best && best.done > 0 && <p className="note">Strongest: <b>{best.r.title}</b> ({best.done}/{best.due}). Missed days don’t undo anything — just pick it back up.</p>}
          </section>

          {rows.map((x) => {
            const s = routineStats(x.r, store.ticks, now);
            const lead = (weekday(first) + 7) % 7; // blank cells before the 1st (Monday first)
            return (
              <article key={x.r.id} className="card stack ms-card">
                <div className="between">
                  <button type="button" className="ms-title" onClick={() => go(`/routine/${x.r.id}`)}>{x.r.title}</button>
                  <span className="count">{x.done}/{x.due}</span>
                </div>
                <div className="ms-grid" role="img" aria-label={`${x.r.title}: done ${x.done} of ${x.due} due days`}>
                  {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} className="ms-cell blank" />)}
                  {x.days.map((d) => <span key={d.day} className={`ms-cell ${d.state}${d.day === now ? ' today' : ''}`} title={d.day} />)}
                </div>
                <span className="meta">
                  <span className="tag t-sage">Best run {x.bestRun}</span>
                  {isThisMonth && s.current > 0 && <span className="tag">🔥 {s.current} in a row now</span>}
                  {x.sessions.map(([name, c]) => <span key={name} className="tag t-violet">{name} ×{c}</span>)}
                </span>
              </article>
            );
          })}
          <p className="note ms-key"><span className="ms-cell done" /> done <span className="ms-cell missed" /> missed <span className="ms-cell off" /> not due</p>
        </>
      )}
    </div>
  );
}
