// Steps: a small card on Today. Numbers arrive from Apple Health (iPhone Shortcut) or are typed in.
import { useState } from 'react';
import { useStore } from '../store';
import { stepGoal, stepSummary } from '../steps';
import { today, WEEKDAY_SHORT, weekday } from '../dates';
import { go } from '../router';

const k = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString('en-GB')}k` : String(n));
const full = (n: number) => n.toLocaleString('en-GB');

export default function StepsCard({ bare = false }: { bare?: boolean }) {
  const store = useStore();
  const now = today();
  const goal = stepGoal(store.routines);
  const s = stepSummary(store.steps, goal, now);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const fromHealth = store.steps.some((x) => x.source === 'apple health');
  const pct = s.today === null ? 0 : Math.min(100, Math.round((s.today / goal) * 100));

  const save = () => {
    const v = Math.round(Number(draft.replace(/[,\s]/g, '')));
    if (Number.isFinite(v) && v >= 0 && v <= 200000) store.setSteps(now, v);
    setOpen(false);
  };
  const trend = s.weekAvg !== null && s.lastWeekAvg !== null ? s.weekAvg - s.lastWeekAvg : null;

  const Wrap = bare ? 'div' : 'section';
  return (
    <Wrap className={bare ? 'steps-panel' : 'card mini-card'} aria-label={bare ? undefined : 'Steps'}>
      <div className="between">
        <span className="eyebrow">Steps</span>
        {s.streak > 1 ? <span className="tag t-sage">🔥 {s.streak} days at {k(goal)}</span> : <span className="note">Goal {k(goal)}</span>}
      </div>
      <div className="mini-main">
        <div className="mini-figures">
          <span className="mini-big">{s.today === null ? '—' : full(s.today)}</span>
          <span className="note">{s.today === null ? 'No steps yet today' : s.today >= goal ? 'Goal done 🎉' : `${full(goal - s.today)} to go`}</span>
        </div>
        <div className="week-bars" role="img" aria-label={`This week: ${s.hitThisWeek} days at goal`}>
          {s.week.map((w) => (
            <span key={w.day} className={`wb${w.day === now ? ' now' : ''}${(w.count ?? 0) >= goal ? ' hit' : ''}`}>
              <i style={{ height: `${w.count ? Math.max(8, Math.min(100, (w.count / goal) * 100)) : 0}%` }} />
              <b>{WEEKDAY_SHORT[weekday(w.day)][0]}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      <p className="note">
        {s.weekAvg !== null ? `${full(s.weekAvg)} a day on average this past week` : 'Your weekly average shows after a few days.'}
        {trend !== null && Math.abs(trend) >= 100 ? ` (${trend > 0 ? '▲' : '▼'} ${full(Math.abs(trend))} on the week before)` : ''}.
        {' '}One low day doesn’t undo anything.
      </p>
      {open && (
        <label className="money-row">
          <span className="money-name">Steps today</span>
          <span className="money-input">
            <input inputMode="numeric" autoFocus aria-label="Steps today" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </span>
        </label>
      )}
      <div className="row">
        {open ? (
          <>
            <button type="button" className="btn primary small" onClick={save}>Save steps</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="btn small" onClick={() => { setDraft(s.today !== null ? String(s.today) : ''); setOpen(true); }}>Type steps</button>
            <button type="button" className="link-btn" onClick={() => go('/steps')}>{fromHealth ? 'Apple Health connected' : 'Connect Apple Health'}</button>
          </>
        )}
      </div>
    </Wrap>
  );
}
