// Steps: a dial that fills through the day. The coloured parts show how many steps came in the
// morning, afternoon and at night (from the Apple Health Shortcut, or when you type them in).
import { useState } from 'react';
import { useStore } from '../store';
import { stepGoal, stepSummary } from '../steps';
import { today } from '../dates';
import { go } from '../router';
import type { DayPart } from '../types';

const k = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString('en-GB')}k` : String(n));
const full = (n: number) => n.toLocaleString('en-GB');

const PARTS: { part: DayPart; label: string; emoji: string; colour: string }[] = [
  { part: 'morning', label: 'Morning', emoji: '🌅', colour: '#F5A524' },
  { part: 'afternoon', label: 'Afternoon', emoji: '☀️', colour: '#4B3FD6' },
  { part: 'night', label: 'Night', emoji: '🌙', colour: '#8E6CFF' },
];

/** How many steps came in each part of the day, from the running totals saved at each check-in. */
export function partSteps(checkins: { part: DayPart; count: number }[], total: number | null) {
  const at = (p: DayPart) => checkins.find((c) => c.part === p)?.count ?? null;
  let before = 0;
  const out = PARTS.map((p) => {
    const v = at(p.part);
    if (v === null) return { ...p, steps: null as number | null };
    const steps = Math.max(0, v - before);
    before = Math.max(before, v);
    return { ...p, steps };
  });
  // Steps typed in later than the last check-in count towards the latest part with a reading
  if (total !== null && total > before) {
    const last = [...out].reverse().find((p) => p.steps !== null) ?? out[0];
    last.steps = (last.steps ?? 0) + (total - before);
  }
  return out;
}

function Dial({ total, goal, parts }: { total: number; goal: number; parts: ReturnType<typeof partSteps> }) {
  const R = 78, C = 2 * Math.PI * R;
  let start = 0;
  const segs = parts.filter((p) => p.steps).map((p) => {
    const len = Math.min(p.steps! / goal, 1 - start);
    const seg = { colour: p.colour, start, len };
    start += len;
    return seg;
  }).filter((s) => s.len > 0);
  const pct = Math.round((total / goal) * 100);
  return (
    <div className="dial" role="img" aria-label={`${full(total)} steps today, ${pct}% of your ${full(goal)} goal`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r={R} className="dial-track" />
        {segs.map((s, i) => (
          <circle key={i} cx="100" cy="100" r={R} fill="none" stroke={s.colour} strokeWidth="18"
            strokeDasharray={`${Math.max(0, s.len * C - 2)} ${C}`} strokeDashoffset={-s.start * C}
            transform="rotate(-90 100 100)" className="dial-seg" />
        ))}
        {total >= goal && <circle cx="100" cy="100" r={R - 16} className="dial-done" />}
      </svg>
      <div className="dial-mid">
        <span className="dial-num">{full(total)}</span>
        <span className="dial-sub">of {k(goal)} steps</span>
        <span className={`dial-pct${total >= goal ? ' done' : ''}`}>{total >= goal ? 'Goal done 🎉' : `${pct}%`}</span>
      </div>
    </div>
  );
}

export default function StepsCard({ bare = false }: { bare?: boolean }) {
  const store = useStore();
  const now = today();
  const goal = stepGoal(store.routines);
  const s = stepSummary(store.steps, goal, now);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const fromHealth = store.steps.some((x) => x.source === 'apple health');
  const parts = partSteps(store.stepCheckins.filter((c) => c.day === now), s.today);
  const hour = new Date().getHours();
  const partNow: DayPart = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'night';

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
        <span className="eyebrow">Steps today</span>
        {s.streak > 1 ? <span className="tag t-sage">🔥 {s.streak} days at {k(goal)}</span> : <span className="note">Goal {k(goal)}</span>}
      </div>
      <Dial total={Math.max(s.today ?? 0, ...store.stepCheckins.filter((c) => c.day === now).map((c) => c.count))} goal={goal} parts={parts} />
      <div className="dial-parts">
        {parts.map((p) => (
          <div key={p.part} className={`dial-part${p.part === partNow ? ' now' : ''}`}>
            <span className="dial-part-name"><span className="dial-key" style={{ background: p.colour }} aria-hidden="true" />{p.label}</span>
            <b>{p.steps === null ? '—' : `+${full(p.steps)}`}</b>
          </div>
        ))}
      </div>
      <p className="note">
        {s.weekAvg !== null ? `${full(s.weekAvg)} a day on average this past week` : 'Your weekly average shows after a few days.'}
        {trend !== null && Math.abs(trend) >= 100 ? ` (${trend > 0 ? '▲' : '▼'} ${full(Math.abs(trend))} on the week before)` : ''}.
        {' '}One low day doesn’t undo anything.
      </p>
      {open && (
        <label className="money-row">
          <span className="money-name">Steps so far today</span>
          <span className="money-input">
            <input inputMode="numeric" autoFocus aria-label="Steps so far today" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </span>
        </label>
      )}
      <div className="row">
        {open ? (
          <>
            <button type="button" className="btn primary small" onClick={save}>Save {PARTS.find((p) => p.part === partNow)!.label.toLowerCase()} steps</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="btn small" onClick={() => { setDraft(s.today !== null ? String(s.today) : ''); setOpen(true); }}>Log {PARTS.find((p) => p.part === partNow)!.label.toLowerCase()} steps</button>
            <button type="button" className="link-btn" onClick={() => go('/steps')}>{fromHealth ? 'Apple Health connected' : 'Connect Apple Health'}</button>
          </>
        )}
      </div>
    </Wrap>
  );
}
