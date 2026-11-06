// The Add screen ("Quick capture" in the design). Opens from the + button on
// every screen, or with N / Ctrl+K (Cmd+K on Mac) on a computer.
//
// Type or speak, then either:
//  - set the Area yourself and Save (free, instant, no AI), or
//  - leave Area empty and Save: Claude tidies the wording and files it.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from '../store';
import type { TaskKind } from '../types';
import { addDays, daysLabel, hhmm, reminderAt, shortDate, today, weekday, type Day } from '../dates';
import { aiKnownOff, askClaude, checkClaude, ERROR_TEXT, lastCaptureProblem, recentlyAdded, toRecords, type CaptureError } from '../capture';
import { speechSupported, useSpeech } from '../speech';
import { go } from '../router';
import { useToast } from '../toast';
import { whenText } from './ItemRow';
import { DaysPicker } from './Fields';
import { areaConfig } from '../areas';
import { Bell, Close, Mic, Sparkle } from '../icons';

type Kind = TaskKind | 'routine';
interface OpenOptions { domainId?: string | null; kind?: Kind; date?: Day; time?: string; subcategoryId?: string | null }

export function openQuickAdd(opts: OpenOptions = {}) {
  dispatchEvent(new CustomEvent('ld:quickadd', { detail: opts }));
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function QuickAddHost() {
  const [open, setOpen] = useState<OpenOptions | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => setOpen((e as CustomEvent<OpenOptions>).detail ?? {});
    const onKey = (e: globalThis.KeyboardEvent) => {
      const combo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const plainN = e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target);
      if (combo || plainN) {
        e.preventDefault();
        setOpen((o) => o ?? {});
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
  return <AddSheet options={open} onClose={() => setOpen(null)} />;
}

function nextSaturday(now: Day): Day {
  const d = weekday(now);
  return addDays(now, d === 5 ? 7 : (5 - d + 7) % 7);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filed-row">
      <span className="filed-label">{label}</span>
      <div className="filed-value">{children}</div>
    </div>
  );
}

function AddSheet({ options, onClose }: { options: OpenOptions; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLTextAreaElement>(null);
  const areaRow = useRef<HTMLDivElement>(null);
  const spokenBase = useRef('');
  const [text, setText] = useState('');
  const [domainId, setDomainIdState] = useState<string | null>(options.domainId ?? null);
  const [subId, setSubId] = useState<string | null>(options.subcategoryId ?? null);
  const setDomainId = (id: string | null) => {
    setDomainIdState(id);
    if (id !== domainId) setSubId(null);
  };
  const [kind, setKind] = useState<Kind>(options.kind ?? 'task');
  const [kindPicked, setKindPicked] = useState(Boolean(options.kind));
  const [due, setDue] = useState<Day | null>(options.date ?? null);
  const [time, setTime] = useState(options.time ?? '');
  const [remind, setRemind] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState<string[]>([]);

  const now = today();
  const realDomains = store.domains.filter((d) => !d.is_inbox);
  const [aiOff, setAiOff] = useState(aiKnownOff());
  useEffect(() => {
    if (!aiOff) void checkClaude().then((ok) => !ok && setAiOff(true));
  }, [aiOff]);
  const recents = recentlyAdded(store.tasks, store.routines);

  const speech = useSpeech(
    (spoken) => setText((spokenBase.current ? spokenBase.current + ' ' : '') + spoken),
    (msg) => toast({ message: msg }),
  );

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

  // Claude fills in whatever you leave blank. Only needed when no area is picked.
  const willUseClaude = !domainId && !aiOff;
  const canSave = text.trim().length > 0 && !busy && (kind !== 'routine' || days.length > 0 || willUseClaude);

  const reset = (savedIds: string[]) => {
    setText('');
    setDue(options.date ?? null);
    setTime(options.time ?? '');
    setRemind(false);
    setDays([]);
    setKind(options.kind ?? 'task');
    setKindPicked(Boolean(options.kind));
    setDomainIdState(options.domainId ?? null);
    setSubId(options.subcategoryId ?? null);
    setJustSaved(savedIds);
    areaRow.current?.scrollTo({ left: 0 });
    input.current?.focus();
  };

  /** Save exactly what was typed and picked. Free. `note` replaces the usual message. */
  const saveManual = (note?: string) => {
    const title = text.trim();
    const domain = domainId ?? store.inbox.id;
    if (kind === 'routine') {
      const home = realDomains.find((d) => d.short_name === 'Home') ?? realDomains[0];
      const realDomain = store.domain(domain).is_inbox ? home?.id ?? domain : domain;
      const r = store.addRoutine({ title, domain_id: realDomain, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] });
      toast({ message: note ?? `Routine added · ${daysLabel(r.days)}` });
      return reset([r.id]);
    }
    const t = hhmm(time || null);
    const date = kind === 'idea' || kind === 'goal' ? null : due ?? (remind || t ? now : null);
    const stages = areaConfig(store.domain(domain)).stages;
    const task = store.addTask({
      title,
      kind,
      subcategory_id: subId,
      stage: kind === 'project' && stages ? stages[0] : null,
      domain_id: domain,
      due: date,
      due_time: date ? t : null,
      remind_at: remind && date ? reminderAt(date, t) : null,
    });
    toast({ message: note ?? `Saved to ${store.domain(domain).short_name}` });
    reset([task.id]);
  };

  /** Let Claude tidy it up and file it. A date or time you picked yourself wins. */
  const saveWithClaude = async () => {
    setBusy(true);
    const raw = text.trim();
    try {
      const result = await askClaude(raw, store.domains);
      // Anything you picked yourself wins over Claude's guess.
      if (kindPicked) result.kind = kind;
      if (kind === 'routine' && days.length) result.days = days;
      if (due) result.date = due;
      if (time) result.time = time;
      if (remind) result.reminder = true;
      const recs = toRecords(result, store.domains, store.inbox);
      const ids: string[] = [];
      let first = '';
      recs.forEach((rec, i) => {
        if ('routine' in rec) {
          const r = store.addRoutine(rec.routine);
          ids.push(r.id);
          if (i === 0) first = `Routine added · ${daysLabel(r.days)}`;
        } else {
          // A follow-up sits inside the project it came from.
          const parent = i > 0 && 'task' in recs[0] && recs[0].task.kind === 'project' ? ids[0] : null;
          const task = store.addTask({ ...(parent ? { ...rec.task, project_id: parent } : rec.task), subcategory_id: i === 0 && subId ? subId : rec.task.subcategory_id ?? null });
          ids.push(task.id);
          if (i === 0) first = `Saved to ${store.domain(task.domain_id).short_name}`;
        }
      });
      toast({ message: recs.length > 1 ? `${first} · plus a follow-up` : first });
      reset(ids);
    } catch (e) {
      // Never lose what was typed: save it with whatever you picked yourself.
      const code = (typeof e === 'string' ? e : 'failed') as CaptureError;
      const why = ERROR_TEXT[code] + (typeof e !== 'string' && e instanceof Error ? ` (${e.message.slice(0, 120)})` : code === 'failed' && lastCaptureProblem ? ` (${lastCaptureProblem.slice(0, 120)})` : '');
      if (e === 'not_configured') setAiOff(true);
      saveManual(kind === 'routine' ? why.replace('so it went to the Inbox', 'so it was saved as you set it') : why);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!canSave) return;
    if (speech.listening) speech.toggle();
    if (willUseClaude) void saveWithClaude();
    else saveManual();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  };

  const isReturnsGroup = Boolean(subId && store.subcategories.find((x) => x.id === subId)?.name.trim().toLowerCase() === 'returns');
  const quickDates: { label: string; day: Day }[] = isReturnsGroup
    ? [
        { label: 'In 14 days', day: addDays(now, 14) },
        { label: 'In 28 days', day: addDays(now, 28) },
        { label: 'In 30 days', day: addDays(now, 30) },
      ]
    : [
    { label: 'Today', day: now },
    { label: 'Tomorrow', day: addDays(now, 1) },
    { label: 'Sat', day: nextSaturday(now) },
  ];
  const pickedOther = due && !quickDates.some((q) => q.day === due);
  const saveLabel = busy
    ? 'Sorting…'
    : willUseClaude
      ? <><Sparkle /> Save · Claude sorts it</>
      : domainId
        ? `Save to ${store.domain(domainId).short_name}`
        : kind === 'routine' ? 'Save routine' : 'Save to Inbox';

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet add-sheet" role="dialog" aria-modal="true" aria-labelledby="qa-title">
        <header className="add-head">
          <button type="button" className="round-btn" onClick={onClose} aria-label="Close"><Close /></button>
          <h1 id="qa-title" className="add-title">Add</h1>
          <span />
        </header>

        <div className="add-body">
          <div className="card capture-card">
            <label htmlFor="qa-text" className="field-label">Type or say it however it comes out</label>
            <textarea
              id="qa-text"
              ref={input}
              className="capture-input"
              rows={3}
              value={text}
              enterKeyHint="done"
              onChange={(e) => { setText(e.target.value); setJustSaved([]); }}
              onKeyDown={onKeyDown}
            />
          </div>

          {speechSupported && (
            <div className="mic-row">
              <button
                type="button"
                className={speech.listening ? 'mic on' : 'mic'}
                aria-pressed={speech.listening}
                aria-label={speech.listening ? 'Stop listening' : 'Speak instead'}
                onClick={() => { spokenBase.current = text.trim(); speech.toggle(); }}
              >
                <Mic />
              </button>
              <span className="mic-text">
                <span className="mic-title">{speech.listening ? 'Listening…' : 'Tap to speak'}</span>
                <span className="muted small">{speech.listening ? 'Tap again when you’re done' : 'Good for the commute'}</span>
              </span>
            </div>
          )}

          <section className="section">
            <div className="section-head">
              <h2 className="label">How it’ll be filed</h2>
              <span className="muted small">{willUseClaude ? 'Claude fills in the blanks' : 'Tap to change'}</span>
            </div>
            <div className="card filed-card">
              <Row label="Area">
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
              </Row>
              {domainId && store.subcategoriesOf(domainId).length > 0 && (
                <Row label="Group">
                  <div className="qa-row" role="radiogroup" aria-label="Sub-category">
                    {store.subcategoriesOf(domainId).map((x) => (
                      <button key={x.id} type="button" role="radio" aria-checked={subId === x.id} className={subId === x.id ? 'chip on' : 'chip'} onClick={() => setSubId(subId === x.id ? null : x.id)}>
                        {x.name}
                      </button>
                    ))}
                  </div>
                </Row>
              )}
              <Row label="Type">
                <div className="qa-row" role="radiogroup" aria-label="Type">
                  {(['task', 'project', 'routine', 'note', 'idea', 'goal'] as Kind[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'chip on' : 'chip'} onClick={() => { setKind(k); setKindPicked(true); }}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </div>
              </Row>
              {kind === 'routine' ? (
                <Row label="Days">
                  <DaysPicker value={days} onChange={setDays} />
                </Row>
              ) : kind !== 'idea' && kind !== 'goal' && (
                <Row label={isReturnsGroup ? 'Return by' : 'Date'}>
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
                </Row>
              )}
            </div>
            <p className="muted small">
              {willUseClaude
                ? 'Leave Area empty and Claude picks the area, type and date when you save.'
                : aiOff && !domainId ? 'Pick an area, or it goes to the Inbox.' : 'Tap the area again to clear it.'}
              <span className="desktop-only"> Enter saves, Esc closes.</span>
            </p>
          </section>

          {recents.length > 0 && (
            <section className="section">
              <h2 className="label">Recently added</h2>
              <ul className="list recent-list">
                {recents.map((r) => {
                  const d = store.domain(r.item.domain_id);
                  const meta =
                    r.type === 'routine'
                      ? `Routine · ${daysLabel(r.item.days)}`
                      : (r.item.kind === 'note' || r.item.kind === 'idea' || r.item.kind === 'goal') && !r.item.due
                        ? r.item.kind[0].toUpperCase() + r.item.kind.slice(1)
                        : `${r.item.kind[0].toUpperCase() + r.item.kind.slice(1)} · ${whenText(r.item)}`;
                  return (
                    <li key={r.item.id}>
                      <button
                        type="button"
                        className={justSaved.includes(r.item.id) ? 'recent just-saved' : 'recent'}
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

        <div className="add-foot">
          <button type="button" className="primary" disabled={!canSave} onClick={save}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}
