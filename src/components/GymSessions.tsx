// Gym session types (Legs, Arms, Cardio...): pick one when you tick the gym,
// and optionally plan which session goes on which day.
import { useState } from 'react';
import type { Routine } from '../types';
import { useStore } from '../store';
import { weekday, WEEKDAY_SHORT, type Day } from '../dates';
import { useToast } from '../toast';
import { cheer } from '../cheers';

export const DEFAULT_SESSIONS = ['Legs', 'Arms', 'Back', 'Core', 'Cardio', 'Full body'];
export const hasSessions = (r: Routine) => Boolean(r.session_types?.length);
export const plannedSession = (r: Routine, day: Day) => r.session_plan?.[weekday(day)] || null;

/** Chips under the gym row on Today: what did you train? */
export function SessionPicker({ routine, day }: { routine: Routine; day: Day }) {
  const store = useStore();
  const toast = useToast();
  const done = store.sessionOf(routine.id, day);
  const planned = plannedSession(routine, day);
  const ticked = store.tickCount(routine.id, day) >= (routine.chunks ?? 1);
  return (
    <div className="session-pick">
      <span className="note">{ticked ? 'Trained:' : planned ? `Planned: ${planned}. What did you train?` : 'What did you train?'}</span>
      <div className="chips session-chips">
        {(routine.session_types ?? []).map((s) => {
          const on = done === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              className={`chip${on ? ' on' : ''}${!done && s === planned ? ' planned' : ''}`}
              onClick={() => {
                if (on) { store.setTickCount(routine.id, day, 0); return; }
                store.setSession(routine.id, day, s);
                if (!ticked) toast({ message: `${s} day done. ${cheer()}` });
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
      {ticked && <DurationPicker routine={routine} day={day} />}
    </div>
  );
}

export const isGym = (r: Routine) => hasSessions(r) || /gym|workout|training|pilates|swim|run\b|yoga/i.test(r.title);

/** How long the session lasted. Quick chips, or type your own. */
export function DurationPicker({ routine, day }: { routine: Routine; day: Day }) {
  const store = useStore();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  if (store.db17 === false) return null;
  const mins = store.minutesOf(routine.id, day);
  const set = (m: number | null) => store.setTickMinutes(routine.id, day, m);
  const saveTyped = () => {
    const v = Math.round(Number(draft));
    if (Number.isFinite(v) && v >= 1 && v <= 600) set(v);
    setTyping(false);
  };
  return (
    <div className="dur-pick">
      <span className="note">{mins ? `Lasted ${mins >= 60 ? `${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ''}` : `${mins} min`}` : 'How long?'}</span>
      <div className="chips">
        {[30, 45, 60, 75, 90].map((m) => (
          <button key={m} type="button" aria-pressed={mins === m} className={mins === m ? 'chip on' : 'chip'} onClick={() => set(mins === m ? null : m)}>{m} min</button>
        ))}
        {typing ? (
          <form className="dur-type" onSubmit={(e) => { e.preventDefault(); saveTyped(); }}>
            <input inputMode="numeric" autoFocus aria-label="Minutes" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={saveTyped} placeholder="min" />
          </form>
        ) : (
          <button type="button" className={mins && ![30, 45, 60, 75, 90].includes(mins) ? 'chip on' : 'chip'} onClick={() => { setDraft(mins ? String(mins) : ''); setTyping(true); }}>Other</button>
        )}
      </div>
    </div>
  );
}

/** On the routine's page: which session types, and a plan for each gym day. */
export function SessionSettings({ routine }: { routine: Routine }) {
  const store = useStore();
  const [custom, setCustom] = useState('');
  const types = routine.session_types ?? [];
  const plan = routine.session_plan ?? [null, null, null, null, null, null, null];
  const save = (changes: Partial<Routine>) => store.updateRoutine(routine.id, changes);
  const toggle = (s: string) => save({ session_types: types.includes(s) ? types.filter((x) => x !== s) : [...types, s] });
  const addCustom = () => {
    const s = custom.trim().slice(0, 40);
    if (s && !types.includes(s)) save({ session_types: [...types, s] });
    setCustom('');
  };
  const setDay = (i: number, s: string) => {
    const next = [...plan];
    while (next.length < 7) next.push(null);
    next[i] = s || null;
    save({ session_plan: next });
  };
  const options = Array.from(new Set([...DEFAULT_SESSIONS, ...types]));
  return (
    <div className="stack">
      <div className="chips">
        {options.map((s) => (
          <button key={s} type="button" aria-pressed={types.includes(s)} className={types.includes(s) ? 'chip on' : 'chip'} onClick={() => toggle(s)}>{s}</button>
        ))}
      </div>
      <form className="add-sub todo-add" onSubmit={(e) => { e.preventDefault(); addCustom(); }}>
        <label className="visually-hidden" htmlFor="sess-custom">Add a session type</label>
        <input id="sess-custom" className="step-input" value={custom} placeholder="Add your own, e.g. Glutes, Swim" onChange={(e) => setCustom(e.target.value)} />
        <button type="submit" className="btn">Add</button>
      </form>
      {types.length > 0 && routine.days.length > 0 && (
        <div className="stack">
          <span className="note">Plan for each day (optional)</span>
          {routine.days.slice().sort().map((i) => (
            <label key={i} className="money-row">
              <span className="money-name">{WEEKDAY_SHORT[i]}</span>
              <select className="select small-select" aria-label={`Session on ${WEEKDAY_SHORT[i]}`} value={plan[i] ?? ''} onChange={(e) => setDay(i, e.target.value)}>
                <option value="">Decide on the day</option>
                {types.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
