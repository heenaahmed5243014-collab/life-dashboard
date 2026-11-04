// Hourly planner for one day: timed items sit in their hour.
// Tap an empty hour to add something at that time.
import { useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { hhmm, type Day } from '../dates';
import { useStore } from '../store';
import { go } from '../router';
import { useToast } from '../toast';
import { openQuickAdd } from './QuickAdd';
import { Bell, Check, Plus } from '../icons';

const FIRST = 6;
const LAST = 23;

const label = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function Planner({ day, isToday, items }: { day: Day; isToday: boolean; items: Task[] }) {
  const store = useStore();
  const toast = useToast();
  const nowLine = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, [isToday]);

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

  const done = (t: Task) => {
    store.updateTask(t.id, { status: 'done', closed_at: new Date().toISOString() });
    toast({ message: 'Done', undo: () => store.updateTask(t.id, { status: 'open', closed_at: null }) });
  };

  return (
    <div className="planner" role="list" aria-label="Hourly plan">
      {Array.from({ length: last - first + 1 }, (_, i) => first + i).map((h) => {
        const list = byHour.get(h) ?? [];
        const past = isToday && h < nowHour;
        return (
          <div key={h} role="listitem" className={`hour${past ? ' past' : ''}${list.length ? ' has-items' : ''}`}>
            <span className="hour-label">{label(h)}</span>
            <div className="hour-slot">
              {isToday && h === nowHour && (
                <div ref={nowLine} className="now-line" style={{ top: `${(nowMin / 60) * 100}%` }} aria-label={`Now, ${hhmm(`${String(nowHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`)}`} role="img" />
              )}
              {list.map((t) => {
                const d = store.domain(t.domain_id);
                return (
                  <div key={t.id} className="slot-item" style={{ borderLeftColor: d.color }}>
                    <button type="button" className="tick tick-sm" onClick={() => done(t)} aria-label={`Mark ${t.title} done`}><Check size={16} /></button>
                    <button type="button" className="slot-body" onClick={() => go(`/item/${t.id}`)}>
                      <span className="slot-title">{t.title}</span>
                      <span className="row-meta">
                        {hhmm(t.due_time)} · {d.short_name}
                        {t.remind_at && <Bell />}
                      </span>
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="slot-add"
                aria-label={`Add something at ${label(h)}`}
                onClick={() => openQuickAdd({ date: day, time: label(h) })}
              >
                {list.length === 0 && <Plus />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
