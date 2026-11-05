// Hourly planner for one day.
// - Timed tasks sit in their hour.
// - Tasks without a time wait in the "To place" tray: drag one onto an hour,
//   or tap it and then tap "Place here" (easier on a phone).
// - Planned tasks can be moved (drag with a mouse, or tap Move) or sent back to the tray.
// - Tapping an empty hour adds something new at that time.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Task } from '../types';
import { hhmm, reminderAt, type Day } from '../dates';
import { useStore } from '../store';
import { go } from '../router';
import { useToast } from '../toast';
import { openQuickAdd } from './QuickAdd';
import { minutesLabel } from './ItemRow';
import { Bell, Check, Close, Plus } from '../icons';
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
  hour: number | null;
  title: string;
}

export default function Planner({ day, isToday, items, tray = [] }: { day: Day; isToday: boolean; items: Task[]; tray?: Task[] }) {
  const store = useStore();
  const toast = useToast();
  const [clock, setClock] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
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

  const place = (id: string | null, h: number) => {
    const t = id ? byId(id) : null;
    if (!t) return;
    const time = label(h);
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
    toast({ message: cheer(), undo: () => store.updateTask(t.id, { status: 'open', closed_at: null }) });
  };

  // ---- Dragging (pointer events work for mouse, pen and touch) ----
  const hourAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-hour]');
    return el ? Number(el.getAttribute('data-hour')) : null;
  };
  const startDrag = (e: RPointerEvent, t: Task) => {
    if (e.button !== 0) return;
    const d: Drag = { id: t.id, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, active: false, hour: null, title: t.title };
    setSelected(null);
    dragRef.current = d;
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const far = Math.hypot(ev.clientX - cur.startX, ev.clientY - cur.startY) > 8;
      if (!cur.active && !far) return;
      ev.preventDefault();
      // Scroll the page when dragging near the top or bottom edge
      if (ev.clientY < 90) window.scrollBy(0, -14);
      else if (ev.clientY > innerHeight - 140) window.scrollBy(0, 14);
      const next = { ...cur, active: true, x: ev.clientX, y: ev.clientY, hour: hourAt(ev.clientX, ev.clientY) };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const cur = dragRef.current;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      dragRef.current = null;
      setDrag(null);
      if (cur?.active) {
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 50);
        if (cur.hour !== null) place(cur.id, cur.hour);
      }
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

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
            <span className="note">Drag onto an hour, or tap then tap an hour</span>
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
                  onPointerDown={(e) => startDrag(e, t)}
                  onClick={() => !justDragged.current && setSelected(on ? null : t.id)}
                >
                  <span className="tray-title">{t.title}</span>
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
              Now tap an hour for “{selectedTask.title}”
              <button type="button" className="link-btn" onClick={() => setSelected(null)}>Cancel</button>
            </p>
          )}
        </div>
      )}

      <div className={`planner${armed ? ' armed' : ''}${dragging ? ' dragging' : ''}`} role="list" aria-label="Hourly plan">
        {Array.from({ length: last - first + 1 }, (_, i) => first + i).map((h) => {
          const list = byHour.get(h) ?? [];
          const past = isToday && h < nowHour;
          const hovered = drag?.active && drag.hour === h;
          return (
            <div key={h} role="listitem" data-hour={h} className={`hour${past ? ' past' : ''}${list.length ? ' has-items' : ''}${hovered ? ' hovered' : ''}`}>
              <span className="hour-label">{label(h)}</span>
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
                        onPointerDown={(e) => e.pointerType === 'mouse' && startDrag(e, t)}
                        onClick={() => !justDragged.current && go(`/item/${t.id}`)}
                      >
                        <span className="slot-title">{t.title}</span>
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
          );
        })}
      </div>

      {drag?.active && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.title}
          {drag.hour !== null && <span> → {label(drag.hour)}</span>}
        </div>
      )}
    </div>
  );
}
