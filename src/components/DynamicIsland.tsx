// Live pill in the style of Apple's Dynamic Island: a black pill at the top showing what's on now
// (with time left) or what's next (with a countdown). Tap it to expand; tap again to shrink.
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { buildDay } from '../today';
import { hhmm, today } from '../dates';
import { taskEmoji } from '../emoji';
import { useIsland } from '../island';
import { go } from '../router';
import { useToast } from '../toast';
import { cheer } from '../cheers';
import { useMoneyMask } from '../pin';
import { useSleep } from '../sleepmode';
import type { Task } from '../types';

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`);
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

interface Slot { t: Task; start: number; end: number }

export default function DynamicIsland() {
  const store = useStore();
  const sleeping = useSleep();
  const mask = useMoneyMask();
  const toast = useToast();
  const settings = useIsland();
  const [tick, setTick] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 20_000);
    return () => clearInterval(i);
  }, []);
  // Close when tapping elsewhere
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!(e.target as Element).closest?.('.island')) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', close);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc); };
  }, [open]);

  if (!settings.on || sleeping) return null;
  const d = new Date(tick);
  const nowMin = d.getHours() * 60 + d.getMinutes();
  const slots: Slot[] = buildDay(store.tasks, store.routines, store.ticks, today()).timed
    .map((t) => { const s = toMin(hhmm(t.due_time)!); return { t, start: s, end: s + (t.minutes || 30) }; })
    .sort((a, b) => a.start - b.start);
  const current = slots.find((s) => s.start <= nowMin && nowMin < s.end);
  const upcoming = slots.filter((s) => s.start > nowMin);
  const next = upcoming[0];
  const show = current ?? next;
  if (!show) return null;

  const isNow = show === current;
  const left = isNow ? show.end - nowMin : show.start - nowMin;
  const progress = isNow ? (nowMin - show.start) / (show.end - show.start) : Math.max(0, 1 - left / 120); // fills up over the last 2 hours
  const area = store.domain(show.t.domain_id);
  const emoji = taskEmoji(show.t, area.name);
  const after = isNow ? upcoming[0] : upcoming[1];
  const R = 9, C = 2 * Math.PI * R;
  const done = () => {
    store.updateTask(show.t.id, { status: 'done', closed_at: new Date().toISOString(), starred: false });
    if (!show.t.repeat) toast({ message: cheer() });
    setOpen(false);
  };

  return (
    <div className="island-wrap">
      <div
        className={`island${open ? ' open' : ''}${isNow ? ' live' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${isNow ? 'Now' : 'Next'}: ${settings.privateNames ? 'appointment' : mask(show.t.title)}, ${isNow ? `${fmt(left)} left` : `in ${fmt(left)}`}`}
        onClick={(e) => { if ((e.target as Element).closest('button')) return; setOpen(!open); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
      >
        {!open ? (
          <div className="island-compact">
            <span className="island-emoji" aria-hidden="true">{settings.privateNames ? '🕒' : emoji}</span>
            <span className="island-title">{settings.privateNames ? (isNow ? 'Appointment now' : 'Next appointment') : mask(show.t.title)}</span>
            <span className="island-time">{isNow ? `${fmt(left)} left` : `in ${fmt(left)}`}</span>
            <svg className="island-ring" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r={R} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="3" />
              <circle cx="11" cy="11" r={R} fill="none" stroke={isNow ? '#FF6FA6' : '#7FD1AE'} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))} transform="rotate(-90 11 11)" />
            </svg>
          </div>
        ) : (
          <div className="island-expanded">
            <div className="island-row">
              <span className="island-big-emoji" aria-hidden="true">{emoji}</span>
              <div className="island-main">
                <span className="island-kicker">{isNow ? 'Now' : 'Next up'} · {area.short_name}</span>
                <span className="island-name">{mask(show.t.title)}</span>
                <span className="island-range">{clock(show.start)}–{clock(show.end)}</span>
              </div>
              <div className="island-count">
                <b>{fmt(left)}</b>
                <small>{isNow ? 'left' : 'to go'}</small>
              </div>
            </div>
            <div className="island-bar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} className={isNow ? 'live' : ''} /></div>
            {show.t.step && <p className="island-step">First step: {show.t.step}</p>}
            <div className="island-actions">
              <button type="button" className="island-btn primary" onClick={done}>Done ✓</button>
              <button type="button" className="island-btn" onClick={() => { setOpen(false); go(`/item/${show.t.id}`); }}>Open</button>
            </div>
            {after && <p className="island-after">Then {taskEmoji(after.t, store.domain(after.t.domain_id).name)} {mask(after.t.title)} at {clock(after.start)}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
