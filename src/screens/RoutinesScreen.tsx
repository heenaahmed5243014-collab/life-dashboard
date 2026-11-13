// Matches the "Routines" design: one card per routine, streak, week grid, tick button.
import { useState } from 'react';
import { useStore } from '../store';
import MonthSummary from '../components/MonthSummary';
import MoveCard from '../components/MoveCard';
import { hasSessions, SessionPicker } from '../components/GymSessions';
import { routineStats } from '../routines';
import ChunkTicks from '../components/ChunkTicks';
import { daysLabel, longDate, today, WEEKDAY_LETTER } from '../dates';
import { go } from '../router';
import Nav from '../components/Nav';
import { openQuickAdd } from '../components/QuickAdd';
import { Check, Plus } from '../icons';

export default function RoutinesScreen() {
  const store = useStore();
  const now = today();
  const [tab, setTab] = useState<'week' | 'month'>('week');

  return (
    <>
      <main className="page routines-page">
        <header className="page-head">
          <h1 className="h1">Routines</h1>
          <p className="muted lead">Streaks only count the days a routine is due. A missed day just starts a new run.</p>
        </header>

        {store.healthReady !== false && <MoveCard />}

        <div className="segmented area-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={tab === 'week'} className={tab === 'week' ? 'seg on' : 'seg'} onClick={() => setTab('week')}>This week</button>
          <button type="button" role="tab" aria-selected={tab === 'month'} className={tab === 'month' ? 'seg on' : 'seg'} onClick={() => setTab('month')}>Monthly summary</button>
        </div>

        {tab === 'month' && <MonthSummary />}
        {tab === 'week' && (<>

        {store.routines.length === 0 && (
          <section className="empty">
            <p className="empty-title">No routines yet.</p>
            <p className="muted">Tap + and choose Routine, or type something like “gym Mon Wed Fri”.</p>
          </section>
        )}

        {store.routines.map((r) => {
          const s = routineStats(r, store.ticks, now);
          const doneDays = s.week.filter((d) => d.state === 'done').map((d) => longDate(d.day).split(' ')[0]);
          return (
            <article key={r.id} className="routine-card">
              <div className="routine-card-head">
                <button type="button" className="routine-card-title" onClick={() => go(`/routine/${r.id}`)}>
                  <h2>{r.title}</h2>
                  <span className="row-meta">
                    <span className="dot" style={{ background: store.domain(r.domain_id).color }} />
                    {daysLabel(r.days)}
                  </span>
                </button>
                <div className="streak">
                  <span className="streak-num">{s.current}</span>
                  <span className="streak-sub">in a row · best {Math.max(s.best, s.current)}</span>
                </div>
              </div>

              <div className="week" role="img" aria-label={`This week, done on: ${doneDays.join(', ') || 'no days yet'}`}>
                {s.week.map((d, i) => (
                  <span key={d.day} className={d.day === now ? 'week-day is-today' : 'week-day'} aria-hidden="true">
                    <span className="week-letter">{WEEKDAY_LETTER[i]}</span>
                    <span className={`week-dot ${d.state}`}>
                      {d.state === 'done' && <Check size={18} />}
                      {d.state === 'off' && <span className="off-pip" />}
                    </span>
                  </span>
                ))}
              </div>

              {s.dueToday && r.chunks > 1 ? (
                <ChunkTicks routine={r} day={now} />
              ) : s.dueToday ? (
                <button
                  type="button"
                  className={s.doneToday ? 'pill-btn on' : 'pill-btn'}
                  aria-pressed={s.doneToday}
                  onClick={() => store.toggleTick(r.id, now)}
                >
                  {s.doneToday && <Check size={20} />}
                  {s.doneToday ? 'Done today' : 'Mark done for today'}
                </button>
              ) : (
                <p className="not-today">Not due today{s.nextDue ? ` · next ${s.nextDue === 'tomorrow' ? 'tomorrow' : `on ${s.nextDue}`}` : ''}</p>
              )}
              {s.dueToday && hasSessions(r) && <SessionPicker routine={r} day={now} />}
            </article>
          );
        })}
        </>)}
      </main>

      <button type="button" className="fab" aria-label="Add a routine" onClick={() => openQuickAdd({ kind: 'routine' })}>
        <Plus />
      </button>
      <Nav current="routines" />
    </>
  );
}
