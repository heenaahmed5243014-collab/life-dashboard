// Weight: a small card on Today, in pounds. The goal comes from a Life goal like "120lb".
import { useState } from 'react';
import { useStore } from '../store';
import { daysBetween, shortDate, today } from '../dates';

const fix = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export default function WeightCard() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const now = today();
  const log = store.weights;
  const latest = log[log.length - 1];
  const prev = log[log.length - 2];
  const first = log[0];
  const goalTask = store.tasks.find((t) => t.kind === 'goal' && t.status === 'open' && /\d{2,3}(\.\d)?\s*lb/i.test(t.title));
  const goal = goalTask ? Number(goalTask.title.match(/(\d{2,3}(?:\.\d)?)\s*lb/i)![1]) : null;
  const series = log.slice(-8);
  const lo = Math.min(...series.map((w) => w.lb), goal ?? Infinity) - 2;
  const hi = Math.max(...series.map((w) => w.lb), lo + 1);

  const save = () => {
    const v = Number(draft.replace(',', '.'));
    if (Number.isFinite(v) && v >= 50 && v <= 600) store.setWeight({ day: now, lb: Math.round(v * 10) / 10 });
    setOpen(false);
  };

  const avgOf = (from: number, to: number) => {
    const xs = log.filter((w) => { const n = daysBetween(w.day, now); return n >= from && n <= to; }).map((w) => w.lb);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const thisWeek = avgOf(0, 6);
  const lastWeek = avgOf(7, 13);
  const change = latest && prev ? latest.lb - prev.lb : null;
  const pct = latest && first && goal !== null && first.lb > goal ? Math.max(0, Math.min(100, Math.round(((first.lb - latest.lb) / (first.lb - goal)) * 100))) : 0;
  const lastLabel = latest ? (latest.day === now ? 'Logged today' : `Last logged ${daysBetween(latest.day, now) === 1 ? 'yesterday' : shortDate(latest.day)}`) : 'Not logged yet';

  return (
    <section className="card mini-card" aria-label="Weight">
      <div className="between">
        <span className="eyebrow">Weight</span>
        <span className="note">{lastLabel}</span>
      </div>
      {latest ? (
        <div className="mini-main">
          <div className="mini-figures">
            <span className="mini-big">{fix(latest.lb)} lb</span>
            {change !== null && (
              <span className={`tag ${change <= 0 ? 't-sage' : ''}`}>{change <= 0 ? '▼' : '▲'} {fix(Math.abs(change))} lb since {shortDate(prev.day)}</span>
            )}
          </div>
          <div className="mini-trend thin" role="img" aria-label={`Recent weigh-ins, now ${fix(latest.lb)} pounds`}>
            {series.map((w, i) => (
              <span key={w.day} className={i === series.length - 1 ? 'now' : ''} style={{ height: `${Math.max(6, Math.round(((w.lb - lo) / (hi - lo)) * 40))}px` }} />
            ))}
          </div>
        </div>
      ) : (
        <p className="note">Log a weigh-in to start your trend.</p>
      )}
      {thisWeek !== null && (
        <p className="note">
          7-day average {fix(thisWeek)} lb
          {lastWeek !== null && ` · ${thisWeek <= lastWeek ? '▼' : '▲'} ${fix(Math.abs(thisWeek - lastWeek))} on the week before`}.
          {' '}Daily ups and downs are mostly water. The average is what counts.
        </p>
      )}
      {goal !== null && latest && (
        <div className="goal-line">
          <div className="between"><span className="note">Goal: {goal} lb</span><span className="goal-left">{latest.lb > goal ? `${fix(latest.lb - goal)} lb to go` : 'Goal reached 🎉'}</span></div>
          <div className="bar"><i style={{ width: `${latest.lb > goal ? pct : 100}%` }} /></div>
        </div>
      )}
      {open && (
        <label className="money-row">
          <span className="money-name">Today’s weight</span>
          <span className="money-input">
            <input inputMode="decimal" autoFocus aria-label="Today’s weight in pounds" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <span aria-hidden="true">lb</span>
          </span>
        </label>
      )}
      <div className="row">
        {open ? (
          <>
            <button type="button" className="btn primary small" onClick={save}>Save weight</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn small" onClick={() => { setDraft(latest ? fix(latest.lb) : ''); setOpen(true); }}>Log weight</button>
        )}
      </div>
    </section>
  );
}
