// Hourly planner for one day.
// - Timed tasks sit in their hour.
// - Tasks without a time wait in the "To place" tray: drag one onto an hour,
//   or tap it and then tap "Place here" (easier on a phone).
// - On a phone: press and hold any task for a moment, then drag it to a time (drops on :00 or :30).
//   A quick swipe still scrolls the page.
// - Planned tasks can also be moved by tapping Move, or sent back to the tray.
// - Tapping an empty hour adds something new at that time.
import { taskEmoji } from '../emoji';
import { PART, partOfHour, type PartKey } from '../dayparts';
import React, { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Task } from '../types';
import { hhmm, reminderAt, type Day } from '../dates';
import { useStore } from '../store';
import { go } from '../router';
import { useToast } from '../toast';
import { openQuickAdd } from './QuickAdd';
import { minutesLabel } from './ItemRow';
import { Bell, Check, Close, Plus } from '../icons';
import { useMoneyMask } from '../pin';
import { cheer } from '../cheers';

const FIRST = 6;
const LAST = 23;

const pad = (n: number) => String(n).padStart(2, '0');
const label = (h: number) => `${pad(h)}:00`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

interface Drag {
  id: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  active: boolean;
  slot: string | null; // "14:30"
  title: string;
}

const HOLD_MS = 280;

export default function Planner({ day, isToday, items, tray = [] }: { day: Day; isToday: boolean; items: Task[]; tray?: Task[] }) {
  const store = useStore();
  const mask = useMoneyMask();
  const toast = useToast();
  const [clock, setClock] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // Morning / Afternoon / Evening: tap a heading to fold it. On today, finished parts start folded.
  const [folded, setFolded] = useState<Partial<Record<PartKey, boolean>>>({});
  const justDragged = useRef(false);

  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, [isToday]);

  // Esc cancels a selection
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [selected]);

  const all = [...items, ...tray];
  const byId = (id: string) => all.find((t) => t.id === id);

  const place = (id: string | null, h: number | string) => {
    const t = id ? byId(id) : null;
    if (!t) return;
    const time = typeof h === 'number' ? label(h) : h;
    store.updateTask(t.id, { due: day, due_time: time, remind_at: t.remind_at ? reminderAt(day, time) : null });
    setSelected(null);
    toast({ message: `Planned for ${time}`, undo: () => store.updateTask(t.id, { due: t.due, due_time: t.due_time, remind_at: t.remind_at }) });
  };

  const unplace = (t: Task) => {
    store.updateTask(t.id, { due_time: null, remind_at: null });
    toast({ message: 'Back in the tray', undo: () => store.updateTask(t.id, { due_time: t.due_time, remind_at: t.remind_at }) });
  };

  const done = (t: Task) => {
    store.updateTask(t.id, { status: 'done', closed_at: new Date().toISOString(), starred: false });
    if (!t.repeat) toast({ message: cheer(), undo: () => store.updateTask(t.id, { status: 'open', closed_at: null }) });
  };

  // ---- Dragging ----
  // The time under a point: the hour row, and :30 if it's in the lower half of that row.
  const slotAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-hour]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const h = Number(el.getAttribute('data-hour'));
    return `${pad(h)}:${y - r.top > r.height / 2 ? '30' : '00'}`;
  };
  const moveTo = (x: number, y: number) => {
    const cur = dragRef.current;
    if (!cur) return;
    if (y < 90) window.scrollBy(0, -16);
    else if (y > innerHeight - 150) window.scrollBy(0, 16);
    const next = { ...cur, active: true, x, y, slot: slotAt(x, y) };
    dragRef.current = next;
    setDrag(next);
  };
  const finish = () => {
    const cur = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (cur?.active) {
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 350);
      const moved = Math.hypot(cur.x - cur.startX, cur.y - cur.startY) > 12;
      if (cur.slot && moved) place(cur.id, cur.slot);
    }
  };

  // Mouse or pen: drag once it moves a little.
  const startMouseDrag = (e: RPointerEvent, t: Task) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    dragRef.current = { id: t.id, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, active: false, slot: null, title: t.title };
    setSelected(null);
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      if (!cur.active && Math.hypot(ev.clientX - cur.startX, ev.clientY - cur.startY) < 8) return;
      ev.preventDefault();
      moveTo(ev.clientX, ev.clientY);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      finish();
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  // Finger: press and hold to pick up, so normal swipes keep scrolling.
  const startTouchDrag = (e: React.TouchEvent, t: Task) => {
    if (e.touches.length !== 1) return;
    const p0 = e.touches[0];
    dragRef.current = { id: t.id, x: p0.clientX, y: p0.clientY, startX: p0.clientX, startY: p0.clientY, active: false, slot: null, title: t.title };
    const timer = window.setTimeout(() => {
      const cur = dragRef.current;
      if (!cur) return;
      setSelected(null);
      try { navigator.vibrate?.(12); } catch { /* not supported */ }
      moveTo(cur.x, cur.y);
    }, HOLD_MS);
    const move = (ev: TouchEvent) => {
      const cur = dragRef.current;
      const p = ev.touches[0];
      if (!cur || !p) return;
      if (!cur.active) {
        // Moved before the hold finished: it's a scroll, let it be.
        if (Math.hypot(p.clientX - cur.startX, p.clientY - cur.startY) > 10) cleanup(true);
        else dragRef.current = { ...cur, x: p.clientX, y: p.clientY };
        return;
      }
      ev.preventDefault(); // stop the page scrolling while dragging
      moveTo(p.clientX, p.clientY);
    };
    const end = (ev: TouchEvent) => {
      if (dragRef.current?.active) ev.preventDefault(); // no tap after a drop
      cleanup(false);
    };
    const cleanup = (cancel: boolean) => {
      window.clearTimeout(timer);
      removeEventListener('touchmove', move);
      removeEventListener('touchend', end);
      removeEventListener('touchcancel', end);
      if (cancel) {
        dragRef.current = null;
        setDrag(null);
      } else finish();
    };
    addEventListener('touchmove', move, { passive: false });
    addEventListener('touchend', end, { passive: false });
    addEventListener('touchcancel', end, { passive: false });
  };
  const dragProps = (t: Task) => ({
    onPointerDown: (e: RPointerEvent) => startMouseDrag(e, t),
    onTouchStart: (e: React.TouchEvent) => startTouchDrag(e, t),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // ---- Layout ----
  const byHour = new Map<number, Task[]>();
  for (const t of items) {
    const h = Number(hhmm(t.due_time)!.slice(0, 2));
    byHour.set(h, [...(byHour.get(h) ?? []), t]);
  }
  const hours = [...byHour.keys()];
  const first = Math.min(FIRST, ...hours);
  const last = Math.max(LAST, ...hours);
  const nowHour = clock.getHours();
  const nowMin = clock.getMinutes();
  // Tap-to-place shows a 'Place here' box in every hour. While dragging, rows stay
  // still (so the hour under your finger doesn't move) and the hovered hour lights up.
  const armed = Boolean(selected) && !drag?.active;
  const dragging = Boolean(drag?.active);
  const selectedTask = selected ? byId(selected) : null;

  const range = (t: Task) => {
    const start = hhmm(t.due_time)!;
    return t.minutes ? `${start}–${fromMin(toMin(start) + t.minutes)} · ${minutesLabel(t.minutes)}` : start;
  };

  return (
    <div className="planner-wrap">
      {tray.length > 0 && (
        <div className="tray" aria-label="Tasks to place">
          <div className="between">
            <span className="eyebrow">To place · {tray.length}</span>
            <span className="note">Hold and drag to a time, or tap then tap an hour</span>
          </div>
          <div className="tray-chips">
            {tray.map((t) => {
              const on = selected === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={on ? 'tray-chip on' : 'tray-chip'}
                  aria-pressed={on}
                  {...dragProps(t)}
                  onClick={() => !justDragged.current && setSelected(on ? null : t.id)}
                >
                  <span className="tray-title"><span className="t-emoji" aria-hidden="true">{taskEmoji(t, store.domain(t.domain_id).name)}</span>{mask(t.title)}</span>
                  <span className="row-meta">
                    <span className="dot" style={{ background: store.domain(t.domain_id).color }} />
                    {t.minutes ? minutesLabel(t.minutes) : 'No estimate'}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedTask && (
            <p className="placing" role="status">
              Now tap an hour for “{mask(selectedTask.title)}”
              <button type="button" className="link-btn" onClick={() => setSelected(null)}>Cancel</button>
            </p>
          )}
        </div>
      )}

      <div className={`planner${armed ? ' armed' : ''}${dragging ? ' dragging' : ''}`} role="list" aria-label="Hourly plan">
        {Array.from({ length: last - first + 1 }, (_, i) => first + i).map((h) => {
          const part = partOfHour(h);
          const P = PART[part];
          const partHours = Array.from({ length: last - first + 1 }, (_, i) => first + i).filter((x) => partOfHour(x) === part);
          const isFirstOfPart = partHours[0] === h;
          const partCount = partHours.reduce((s, x) => s + (byHour.get(x)?.length ?? 0), 0);
          const partPast = isToday && P.to <= nowHour;
          const partNowHere = isToday && nowHour >= P.from && nowHour < P.to;
          const isFolded = !dragging && !armed && (folded[part] ?? (partPast && partCount === 0));
          const header = isFirstOfPart ? (
            <button key={`part-${part}`} type="button" className={`part-head${partNowHere ? ' now' : ''}${partPast ? ' past' : ''}`} aria-expanded={!isFolded} onClick={() => setFolded({ ...folded, [part]: !isFolded })}>
              <span className="part-emoji" aria-hidden="true">{P.emoji}</span>
              <span className="part-name">{P.label}</span>
              <span className="part-meta">{partNowHere ? 'Now · ' : ''}{partCount ? `${partCount} planned` : 'Free'}</span>
              <span className="part-chev" aria-hidden="true">›</span>
            </button>
          ) : null;
          if (isFolded) return header;
          const list = byHour.get(h) ?? [];
          const past = isToday && h < nowHour;
          const hovered = drag?.active && drag.slot?.slice(0, 2) === pad(h);
          const half = hovered && drag.slot?.endsWith('30');
          return (
            <React.Fragment key={h}>{header}
            <div role="listitem" data-hour={h} className={`hour${past ? ' past' : ''}${list.length ? ' has-items' : ''}${hovered ? ' hovered' : ''}${half ? ' half' : ''}`}>
              <span className="hour-label">{label(h)}</span>
              {hovered && <span className="drop-line" aria-hidden="true"><span>{drag.slot}</span></span>}
              <div className="hour-slot">
                {isToday && h === nowHour && (
                  <div className="now-line" style={{ top: `${(nowMin / 60) * 100}%` }} aria-label={`Now, ${pad(nowHour)}:${pad(nowMin)}`} role="img" />
                )}
                {list.map((t) => {
                  const d = store.domain(t.domain_id);
                  const moving = selected === t.id;
                  return (
                    <div key={t.id} className={`slot-item${moving ? ' moving' : ''}`} style={{ borderLeftColor: d.color }}>
                      <button type="button" className="tick" onClick={() => done(t)} aria-label={`Mark ${t.title} done`}>
                        <span className="box"><Check size={16} /></span>
                      </button>
                      <button
                        type="button"
                        className="slot-body"
                        {...dragProps(t)}
                        onClick={() => !justDragged.current && go(`/item/${t.id}`)}
                      >
                        <span className="slot-title"><span className="t-emoji" aria-hidden="true">{taskEmoji(t, d.name)}</span>{mask(t.title)}</span>
                        <span className="row-meta">
                          {range(t)} · {d.short_name}
                          {t.remind_at && <Bell />}
                        </span>
                      </button>
                      <button type="button" className="slot-move" aria-pressed={moving} onClick={() => setSelected(moving ? null : t.id)}>
                        {moving ? 'Moving' : 'Move'}
                      </button>
                      <button type="button" className="slot-x" aria-label={`Take ${t.title} out of the plan`} onClick={() => unplace(t)}>
                        <Close />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className={`slot-add${armed ? ' place' : ''}`}
                  aria-label={selectedTask ? `Place ${selectedTask.title} at ${label(h)}` : `Add something at ${label(h)}`}
                  onClick={() => (selected ? place(selected, h) : openQuickAdd({ date: day, time: label(h) }))}
                >
                  {armed ? 'Place here' : list.length === 0 && <Plus />}
                </button>
              </div>
            </div>
            </React.Fragment>
          );
        })}
      </div>

      {drag?.active && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {mask(drag.title)}
          {drag.slot !== null && <span> → {drag.slot}</span>}
        </div>
      )}
    </div>
  );
}
