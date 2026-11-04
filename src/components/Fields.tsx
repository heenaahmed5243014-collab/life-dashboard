// Small form pieces shared by the Add, Item and Routine screens.
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { addDays, shortDate, today, weekday, WEEKDAY_LETTER, WEEKDAY_SHORT, type Day } from '../dates';

export function DomainPicker({ value, onChange, allowInbox = true }: { value: string; onChange: (id: string) => void; allowInbox?: boolean }) {
  const { domains } = useStore();
  const list = domains.filter((d) => allowInbox || !d.is_inbox);
  return (
    <div className="chips" role="radiogroup" aria-label="Domain">
      {list.map((d) => (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={value === d.id}
          className={value === d.id ? 'chip on' : 'chip'}
          onClick={() => onChange(d.id)}
        >
          <span className="dot" style={{ background: d.color }} />
          {d.short_name}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'seg on' : 'seg'} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function nextSaturday(now: Day): Day {
  const d = weekday(now);
  return addDays(now, d === 5 ? 7 : (5 - d + 7) % 7);
}

export function DatePicker({ value, onChange }: { value: Day | null; onChange: (d: Day | null) => void }) {
  const now = today();
  const quick: { label: string; day: Day | null }[] = [
    { label: 'Today', day: now },
    { label: 'Tomorrow', day: addDays(now, 1) },
    { label: 'Saturday', day: nextSaturday(now) },
    { label: 'Next week', day: addDays(now, 7) },
    { label: 'No date', day: null },
  ];
  const matched = quick.some((q) => q.day === value);
  return (
    <div className="date-picker">
      <div className="chips">
        {quick.map((q) => (
          <button key={q.label} type="button" className={value === q.day ? 'chip on' : 'chip'} aria-pressed={value === q.day} onClick={() => onChange(q.day)}>
            {q.label}
          </button>
        ))}
      </div>
      <label className="date-input">
        <span className="muted">{value && !matched ? shortDate(value) : 'Pick a date'}</span>
        <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      </label>
    </div>
  );
}

export function DaysPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  const toggle = (i: number) => onChange(value.includes(i) ? value.filter((d) => d !== i) : [...value, i].sort());
  return (
    <div className="days" role="group" aria-label="Days of the week">
      {WEEKDAY_LETTER.map((l, i) => (
        <button key={i} type="button" className={value.includes(i) ? 'day on' : 'day'} aria-pressed={value.includes(i)} aria-label={WEEKDAY_SHORT[i]} onClick={() => toggle(i)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="label">{label}</h2>
      {children}
    </section>
  );
}
