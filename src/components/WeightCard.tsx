// My journey: weight (lb), body fat %, muscle mass (lb) and private progress photos.
// The goal comes from a Life goal like "120lb". Starts hidden each time the app opens.
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { daysBetween, shortDate, today } from '../dates';
import { milestones, prizeToChoose } from '../weightRewards';
import ChoosePrize from './ChoosePrize';
import { setShowWeight } from '../weightPref';
import { go } from '../router';
import ProgressPhotos from './ProgressPhotos';
import type { Weight } from '../types';

const fix = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export default function WeightCard() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [fat, setFat] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [muscle, setMuscle] = useState('');
  const now = today();
  const toChoose = prizeToChoose(store.weights, store.rewards, store.tasks, now);
  // Pop the prize choice up by itself the first time you see a newly hit target (once per app visit)
  useEffect(() => {
    if (!toChoose) return;
    const key = `ld:prize-popped-${toChoose.kg}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    const t = setTimeout(() => setChoosing(true), 500);
    return () => clearTimeout(t);
  }, [toChoose?.kg]); // eslint-disable-line react-hooks/exhaustive-deps
  const log = store.weights;
  const latest = log[log.length - 1];
  const prev = log[log.length - 2];
  const first = log[0];
  const goalTask = store.tasks.find((t) => t.kind === 'goal' && t.status === 'open' && /\d{2,3}(\.\d)?\s*lb/i.test(t.title));
  const goal = goalTask ? Number(goalTask.title.match(/(\d{2,3}(?:\.\d)?)\s*lb/i)![1]) : null;
  const series = log.slice(-8);
  const lo = Math.min(...series.map((w) => w.lb), goal ?? Infinity) - 2;
  const hi = Math.max(...series.map((w) => w.lb), lo + 1);

  const num = (s: string, lo: number, hi: number) => {
    const v = Number(s.replace(',', '.').replace('%', '').trim());
    return s.trim() && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : null;
  };
  const save = () => {
    const lb = num(draft, 50, 600);
    if (lb !== null) {
      const w: Weight = { day: now, lb };
      if (store.db17) { w.body_fat = num(fat, 2, 70); w.muscle = num(muscle, 20, 400); }
      store.setWeight(w);
    }
    setOpen(false);
  };
  // Latest body fat / muscle readings and the change since the reading before
  const reading = (k: 'body_fat' | 'muscle') => {
    const xs = log.filter((w) => w[k] !== null && w[k] !== undefined);
    const a = xs[xs.length - 1], b = xs[xs.length - 2];
    return a ? { v: a[k] as number, d: b ? (a[k] as number) - (b[k] as number) : null } : null;
  };
  const bf = reading('body_fat');
  const mm = reading('muscle');

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
    <section className="card mini-card body-card" aria-label="My journey">
      <div className="between">
        <span className="eyebrow">My journey</span>
        <span className="weight-head-right">
          <span className="note">{lastLabel}</span>
          <button type="button" className="link-btn weight-hide" onClick={() => setShowWeight(false)}>Hide</button>
        </span>
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
      {(bf || mm) && (
        <div className="body-stats">
          {bf && <div><span className="eyebrow">Body fat</span><b>{fix(bf.v)}%</b>{bf.d !== null && Math.abs(bf.d) >= 0.05 && <span className={`tag ${bf.d < 0 ? 't-sage' : ''}`}>{bf.d < 0 ? '▼' : '▲'} {fix(Math.abs(bf.d))}%</span>}</div>}
          {mm && <div><span className="eyebrow">Muscle mass</span><b>{fix(mm.v)} lb</b>{mm.d !== null && Math.abs(mm.d) >= 0.05 && <span className={`tag ${mm.d > 0 ? 't-sage' : ''}`}>{mm.d > 0 ? '▲' : '▼'} {fix(Math.abs(mm.d))} lb</span>}</div>}
        </div>
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
      {toChoose && (
        <button type="button" className="prize-banner" onClick={() => setChoosing(true)}>
          <span className="prize-banner-emoji" aria-hidden="true">🎉</span>
          <span><b>You hit −{toChoose.kg} kg!</b><span className="note"> Choose your prize</span></span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {choosing && toChoose && <ChoosePrize m={toChoose} onClose={() => setChoosing(false)} />}
      {(() => {
        const ms = milestones(store.weights, store.rewards, store.tasks, now);
        const unclaimed = ms.find((m) => m.reached && m.reward && !m.reward.claimed_on);
        const nextR = ms.find((m) => !m.reached && m.reward);
        if (!ms.length) return null;
        return (
          <button type="button" className={`wr-line${unclaimed ? ' won' : ''}`} onClick={() => go('/rewards')}>
            {unclaimed
              ? <>🎉 You unlocked <b>{unclaimed.reward!.emoji} {unclaimed.reward!.title}</b>. Tap to mark it enjoyed</>
              : nextR
                ? <>🎁 Next reward at {nextR.lb.toFixed(1)} lb: <b>{nextR.reward!.emoji} {nextR.reward!.title}</b>{latest ? ` · ${Math.max(0, latest.lb - nextR.lb).toFixed(1)} lb to go` : ''}</>
                : <>🎁 Add rewards for each kilogram you lose</>}
            <span aria-hidden="true"> ›</span>
          </button>
        );
      })()}
      {open && (
        <div className="body-form">
          <label className="money-row">
            <span className="money-name">Weight</span>
            <span className="money-input">
              <input inputMode="decimal" autoFocus aria-label="Today’s weight in pounds" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
              <span aria-hidden="true">lb</span>
            </span>
          </label>
          {store.db17 && (
            <>
              <label className="money-row">
                <span className="money-name">Body fat <span className="note">optional</span></span>
                <span className="money-input"><input inputMode="decimal" aria-label="Body fat percentage" value={fat} onChange={(e) => setFat(e.target.value)} /><span aria-hidden="true">%</span></span>
              </label>
              <label className="money-row">
                <span className="money-name">Muscle mass <span className="note">optional</span></span>
                <span className="money-input"><input inputMode="decimal" aria-label="Muscle mass in pounds" value={muscle} onChange={(e) => setMuscle(e.target.value)} /><span aria-hidden="true">lb</span></span>
              </label>
            </>
          )}
        </div>
      )}
      <div className="row">
        {open ? (
          <>
            <button type="button" className="btn primary small" onClick={save}>Save</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn small" onClick={() => { setDraft(latest ? fix(latest.lb) : ''); setFat(bf ? fix(bf.v) : ''); setMuscle(mm ? fix(mm.v) : ''); setOpen(true); }}>Log a weigh-in</button>
        )}
      </div>
      <ProgressPhotos />
    </section>
  );
}

/** What Today shows while weight is switched off: one slim line to bring it back. */
export function WeightHidden() {
  const store = useStore();
  const waiting = prizeToChoose(store.weights, store.rewards, store.tasks, today()) !== null;
  return (
    <section className="card weight-hidden" aria-label="My journey (hidden)">
      <span className="weight-hidden-text"><span aria-hidden="true">🌸</span> My journey · hidden{waiting ? ' · 🎁 a prize to choose' : ''}</span>
      <button type="button" className="link-btn" onClick={() => setShowWeight(true)}>Show</button>
    </section>
  );
}
