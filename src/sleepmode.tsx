// Sleep mode: a calm night screen on Today. Switches itself off at 6am. Remembered on this phone.
// The glass Sleep / Work switch lives here too: tap a side to turn that mode on, tap it again to turn it off.
import { useEffect, useState } from 'react';
import { toggleWorkMode, useWorkMode } from './workmode';

const KEY = 'ld:sleep-until';
const EVENT = 'ld:sleep';

/** Sleep mode lasts until 6am the next morning (or this morning, if turned on after midnight). */
function nextSixAm(d = new Date()): number {
  const t = new Date(d);
  t.setHours(6, 0, 0, 0);
  if (t.getTime() <= d.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime();
}
const read = () => { try { return Number(localStorage.getItem(KEY) ?? 0) > Date.now(); } catch { return false; } };

export function setSleep(on: boolean) {
  try { if (on) localStorage.setItem(KEY, String(nextSixAm())); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  dispatchEvent(new Event(EVENT));
}

export function useSleep(): boolean {
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    addEventListener(EVENT, sync);
    const t = setInterval(sync, 60_000); // ends by itself at 6am
    return () => { removeEventListener(EVENT, sync); clearInterval(t); };
  }, []);
  return on;
}

const Moon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
);
const Person = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5z" /></svg>
);

/** The frosted glass switch from the reference video. */
export function ModeSwitch() {
  const work = useWorkMode();
  const sleep = useSleep();
  const state = work.active ? 'work' : sleep ? 'sleep' : 'off';
  const pickWork = () => {
    if (!work.active) setSleep(false);
    toggleWorkMode();
  };
  const pickSleep = () => {
    if (!sleep && work.active) toggleWorkMode();
    setSleep(!sleep);
  };
  return (
    <div className={`mode-switch ${state}`} role="group" aria-label="Mode">
      <button type="button" className="mode-side work-side" aria-pressed={state === 'work'} onClick={pickWork}>
        <span className="mode-label">Work</span>
      </button>
      <button type="button" className="mode-side sleep-side" aria-pressed={state === 'sleep'} onClick={pickSleep}>
        <span className="mode-label">Sleep</span>
      </button>
      <span className="mode-knob" aria-hidden="true">{state === 'sleep' ? <Moon /> : state === 'work' ? <Person /> : <span className="mode-knob-dot" />}</span>
    </div>
  );
}
