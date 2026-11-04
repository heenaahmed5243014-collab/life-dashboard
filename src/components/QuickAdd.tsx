// The quick-add sheet. Opens from the + button on every screen,
// or with N / Ctrl+K (Cmd+K on Mac) on a computer.
//
// Two ways to save:
//  - Tap an area: saves straight away. Free, instant, no AI.
//  - Don't tap an area: "Sort with Claude" cleans up the wording and picks
//    the type, area, date, time and reminder for you.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../store';
import { addDays, daysLabel, hhmm, reminderAt, shortDate, today, weekday, type Day } from '../dates';
import { aiKnownOff, askClaude, ERROR_TEXT, recentlyAdded, toRecord, type CaptureError } from '../capture';
import { go } from '../router';
import { useToast } from '../toast';
import { whenText } from './ItemRow';
import { Bell, Close, Sparkle } from '../icons';

export function openQuickAdd(domainId?: string | null) {
  dispatchEvent(new CustomEvent('ld:quickadd', { detail: { domainId: domainId ?? null } }));
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function QuickAddHost() {
  const [open, setOpen] = useState<{ domainId: string | null } | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => setOpen({ domainId: (e as CustomEvent).detail?.domainId ?? null });
    const onKey = (e: globalThis.KeyboardEvent) => {
      const combo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const plainN = e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target);
      if (combo || plainN) {
        e.preventDefault();
        setOpen((o) => o ?? { domainId: null });
      }
    };
    addEventListener('ld:quickadd', onOpen);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('ld:quickadd', onOpen);
      removeEventListener('keydown', onKey);
    };
  }, []);

  if (!open) return null;
  return <QuickAddSheet presetDomain={open.domainId} onClose={() => setOpen(null)} />;
}

function nextSaturday(now: Day): Day {
  const d = weekday(now);
  return addDays(now, d === 5 ? 7 : (5 - d + 7) % 7);
}

function QuickAddSheet({ presetDomain, onClose }: { presetDomain: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLTextAreaElement>(null);
  const areaRow = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [domainId, setDomainId] = useState<string | null>(presetDomain);
  const [due, setDue] = useState<Day | null>(null);
  const [time, setTime] = useState('');
  const [remind, setRemind] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const now = today();
  const realDomains = store.domains.filter((d) => !d.is_inbox);
  const aiOff = aiKnownOff();
  const canSave = text.trim().length > 0 && !busy;
  const recents = recentlyAdded(store.tasks, store.routines);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const reset = (savedId: string) => {
    setText('');
    setDue(null);
    setTime('');
    setRemind(false);
    setDomainId(presetDomain);
    setJustSaved(savedId);
    areaRow.current?.scrollTo({ left: 0 });
    input.current?.focus();
  };

  /** Free path: save exactly what was typed and tapped. */
  const saveManual = (toDomain: string) => {
    const t = hhmm(time || null);
    const date = due ?? (remind || t ? now : null);
    const task = store.addTask({
      title: text.trim(),
      domain_id: toDomain,
      due: date,
      due_time: date ? t : null,
      remind_at: remind && date ? reminderAt(date, t) : null,
    });
    toast({ message: `Saved to ${store.domain(toDomain).short_name}` });
    reset(task.id);
  };

  /** Claude path: let Claude tidy it up and file it. Anything you picked yourself wins. */
  const saveWithClaude = async () => {
    setBusy(true);
    const raw = text.trim();
    try {
      const result = await askClaude(raw, store.domains);
      const rec = toRecord(result, store.domains, store.inbox);
      if ('routine' in rec) {
        const r = store.addRoutine(rec.routine);
        toast({ message: `Routine added · ${daysLabel(r.days)}` });
        reset(r.id);
      } else {
        const t = hhmm(time || null);
        const date = due ?? rec.task.due ?? null;
        const task = store.addTask({
          ...rec.task,
          due: date,
          due_time: t ?? rec.task.due_time ?? null,
          remind_at: remind && date ? reminderAt(date, t ?? rec.task.due_time ?? null) : rec.task.remind_at ?? null,
        });
        toast({ message: `Saved to ${store.domain(task.domain_id).short_name}` });
        reset(task.id);
      }
    } catch (e) {
      // Never lose what was typed: save it as-is to the Inbox.
      const task = store.addTask({ title: raw, domain_id: store.inbox.id });
      toast({ message: ERROR_TEXT[(typeof e === 'string' ? e : 'failed') as CaptureError] });
      reset(task.id);
    } finally {
      setBusy(false);
    }
  };

  const primary = () => {
    if (!canSave) return;
    if (domainId) saveManual(domainId);
    else if (aiOff) saveManual(store.inbox.id);
    else void saveWithClaude();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      primary();
    }
  };

  const quickDates: { label: string; day: Day }[] = [
    { label: 'Today', day: now },
    { label: 'Tomorrow', day: addDays(now, 1) },
    { label: 'Sat', day: nextSaturday(now) },
  ];
  const pickedOther = due && !quickDates.some((q) => q.day === due);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="qa-title">
        <div className="sheet-head">
          <h2 id="qa-title" className="sheet-title">Quick add</h2>
          <button type="button" className="round-btn" onClick={onClose} aria-label="Close"><Close /></button>
        </div>

        <label htmlFor="qa-text" className="visually-hidden">What do you want to add?</label>
        <textarea
          id="qa-text"
          ref={input}
          className="card qa-input"
          rows={2}
          value={text}
          enterKeyHint="done"
          placeholder="e.g. Email Bulletproof back tomorrow at 10am"
          onChange={(e) => { setText(e.target.value); setJustSaved(null); }}
          onKeyDown={onKeyDown}
        />

        <div className="qa-row" role="radiogroup" aria-label="Area" ref={areaRow}>
          {realDomains.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={domainId === d.id}
              className={domainId === d.id ? 'chip on' : 'chip'}
              onClick={() => setDomainId(domainId === d.id ? null : d.id)}
            >
              <span className="dot" style={{ background: d.color }} />
              {d.short_name}
            </button>
          ))}
        </div>

        <div className="qa-row" aria-label="Date, time and reminder">
          {quickDates.map((q) => (
            <button key={q.label} type="button" className={due === q.day ? 'chip on' : 'chip'} aria-pressed={due === q.day} onClick={() => setDue(due === q.day ? null : q.day)}>
              {q.label}
            </button>
          ))}
          <label className={pickedOther ? 'chip on chip-input' : 'chip chip-input'}>
            {pickedOther ? shortDate(due!) : 'Date…'}
            <input type="date" aria-label="Pick a date" value={due ?? ''} onChange={(e) => setDue(e.target.value || null)} />
          </label>
          <label className={time ? 'chip on chip-input' : 'chip chip-input'}>
            {time || 'Time…'}
            <input type="time" aria-label="Pick a time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <button type="button" className={remind ? 'chip on' : 'chip'} aria-pressed={remind} onClick={() => setRemind(!remind)}>
            <Bell /> Remind
          </button>
        </div>

        <div className="qa-actions">
          {domainId || aiOff ? (
            <button type="button" className="primary" disabled={!canSave} onClick={primary}>
              {domainId ? `Save to ${store.domain(domainId).short_name}` : 'Save to Inbox'}
            </button>
          ) : (
            <>
              <button type="button" className="primary" disabled={!canSave} onClick={primary}>
                {busy ? 'Sorting…' : <><Sparkle /> Sort with Claude</>}
              </button>
              <button type="button" className="link-btn qa-inbox" disabled={!canSave} onClick={() => saveManual(store.inbox.id)}>
                Just save to Inbox
              </button>
            </>
          )}
        </div>
        <p className="muted small qa-hint">
          {domainId ? 'Tap the area again to let Claude choose instead.' : aiOff ? 'Tap an area to file it, or leave it in the Inbox.' : 'Tap an area to save it yourself, or let Claude sort it.'}
          <span className="desktop-only"> Press Enter to save, Esc to close.</span>
        </p>
        <button type="button" className="link-btn quiet" onClick={() => { onClose(); go('/add'); }}>
          More options (projects, ideas, routines)
        </button>

        {recents.length > 0 && (
          <section className="section">
            <h3 className="label">Recently added</h3>
            <ul className="list recent-list">
              {recents.map((r) => {
                const d = store.domain(r.item.domain_id);
                const meta =
                  r.type === 'routine'
                    ? `Routine · ${daysLabel(r.item.days)}`
                    : r.item.kind === 'note' && !r.item.due
                      ? 'Note'
                      : `${r.item.kind[0].toUpperCase() + r.item.kind.slice(1)} · ${whenText(r.item)}`;
                return (
                  <li key={r.item.id}>
                    <button
                      type="button"
                      className={r.item.id === justSaved ? 'recent just-saved' : 'recent'}
                      onClick={() => { onClose(); go(r.type === 'routine' ? `/routine/${r.item.id}` : `/item/${r.item.id}`); }}
                    >
                      <span className="row-title">{r.item.title}</span>
                      <span className="row-meta">
                        <span className="dot" style={{ background: d.color }} />
                        {d.short_name} · {meta}
                        {r.type === 'task' && r.item.remind_at && <Bell />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
