// Evening reset (2 minutes): go through what's left today one at a time
// (done, tomorrow, another day, or drop it), then pick tomorrow's Top 3.
import { taskEmoji } from '../emoji';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Task } from '../types';
import { addDays, dueLabel, hhmm, longDate, reminderAt, today } from '../dates';
import { back, go } from '../router';
import { byDue } from '../today';
import Header from '../components/Header';
import { useToast } from '../toast';
import { cheer } from '../cheers';

export const RESET_KEY = 'ld:reset-done';
export const resetDoneToday = () => {
  try { return localStorage.getItem(RESET_KEY) === today(); } catch { return false; }
};

const isTodo = (t: Task) => t.status === 'open' && t.kind === 'task';

export default function ResetScreen() {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const tomorrow = addDays(now, 1);
  // Fix the list when the screen opens, so items don't jump around as you answer.
  const [queue] = useState(() => store.tasks.filter((t) => isTodo(t) && ((t.due && t.due <= now) || t.starred)).sort(byDue).map((t) => t.id));
  const [i, setI] = useState(0);
  const [step, setStep] = useState<'review' | 'top3' | 'done'>(() => (queue.length ? 'review' : 'top3'));
  const [picked, setPicked] = useState<string[] | null>(null);
  const [tally, setTally] = useState({ done: 0, moved: 0, dropped: 0 });

  const current = step === 'review' ? store.tasks.find((t) => t.id === queue[i]) : undefined;
  const nextCard = () => {
    if (i + 1 < queue.length) setI(i + 1);
    else setStep('top3');
  };

  const moveTo = (t: Task, day: string) => {
    const time = hhmm(t.due_time);
    store.updateTask(t.id, { due: day, remind_at: t.remind_at && time ? reminderAt(day, time) : null, starred: false });
    setTally((x) => ({ ...x, moved: x.moved + 1 }));
    nextCard();
  };
  const done = (t: Task) => {
    store.updateTask(t.id, { status: 'done', closed_at: new Date().toISOString(), starred: false });
    setTally((x) => ({ ...x, done: x.done + 1 }));
    if (!t.repeat) toast({ message: cheer() });
    nextCard();
  };
  const drop = (t: Task) => {
    store.updateTask(t.id, { status: 'not_doing', closed_at: new Date().toISOString(), starred: false });
    setTally((x) => ({ ...x, dropped: x.dropped + 1 }));
    toast({ message: 'Dropped. One less thing.', undo: () => store.updateTask(t.id, { status: 'open', closed_at: null }) });
    nextCard();
  };

  // Tomorrow's Top 3: what's due tomorrow (or earlier), then starred, then other things with a date soon.
  const candidates = useMemo(() => {
    const open = store.tasks.filter(isTodo);
    const dueSoon = open.filter((t) => t.due && t.due <= tomorrow).sort(byDue);
    const starred = open.filter((t) => t.starred && !dueSoon.includes(t));
    const later = open.filter((t) => !dueSoon.includes(t) && !starred.includes(t)).sort(byDue).slice(0, 6);
    return [...dueSoon, ...starred, ...later];
  }, [store.tasks, tomorrow]);
  const chosen = picked ?? candidates.filter((t) => t.starred).slice(0, 3).map((t) => t.id);
  const togglePick = (id: string) => {
    const cur = chosen;
    if (cur.includes(id)) setPicked(cur.filter((x) => x !== id));
    else if (cur.length < 3) setPicked([...cur, id]);
    else toast({ message: 'Three is plenty. Untick one first.' });
  };
  const finish = () => {
    const ids = new Set(chosen);
    for (const t of store.tasks.filter(isTodo)) {
      if (ids.has(t.id) && !t.starred) store.updateTask(t.id, { starred: true });
      if (!ids.has(t.id) && t.starred) store.updateTask(t.id, { starred: false });
    }
    try { localStorage.setItem(RESET_KEY, now); } catch { /* fine */ }
    setStep('done');
  };

  return (
    <>
      <Header title="Evening reset" />
      <main className="page page-form reset-page">
        {step === 'review' && current && (
          <>
            <div className="progress">
              <div className="bar"><i style={{ width: `${(i / queue.length) * 100}%` }} /></div>
              <span className="count">{i + 1} of {queue.length}</span>
            </div>
            <p className="sub">What’s left from today. Decide each one; no guilt either way.</p>
            <article className="card hero reset-card">
              <span className="eyebrow">{store.domain(current.domain_id).short_name}{current.due ? ` · ${dueLabel(current.due, now)}` : ' · Top 3'}</span>
              <div className="big">{taskEmoji(current, store.domain(current.domain_id).name)} {current.title}</div>
              {current.step && <p className="first-step"><span className="tag t-pink">First step</span> {current.step}</p>}
              <div className="reset-actions">
                <button type="button" className="btn primary" onClick={() => done(current)}>Done ✓</button>
                <button type="button" className="btn" onClick={() => moveTo(current, tomorrow)}>Tomorrow</button>
                <label className="btn chip-input reset-pick">
                  Pick a day
                  <input type="date" min={tomorrow} aria-label={`Pick a day for ${current.title}`} onChange={(e) => { const d = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) moveTo(current, d); }} />
                </label>
                <button type="button" className="btn ghost" onClick={() => drop(current)}>Drop it</button>
              </div>
              <button type="button" className="link-btn quiet" onClick={nextCard}>Leave it as it is</button>
            </article>
          </>
        )}

        {step === 'top3' && (
          <>
            <p className="sub">{queue.length ? `Today’s cleared: ${tally.done} done, ${tally.moved} moved, ${tally.dropped} dropped.` : 'Nothing left over from today. Nice.'}</p>
            <h2 className="h2">Pick tomorrow’s Top 3</h2>
            <p className="note">The three things that would make tomorrow a good day. Everything else can wait.</p>
            <div className="list">
              {candidates.length === 0 && <p className="muted small">Nothing on your lists yet.</p>}
              {candidates.map((t) => {
                const on = chosen.includes(t.id);
                return (
                  <button key={t.id} type="button" className={`pick-row${on ? ' on' : ''}`} aria-pressed={on} onClick={() => togglePick(t.id)}>
                    <span className="pick-star" aria-hidden="true">{on ? '★' : '☆'}</span>
                    <span className="pick-main">
                      <span className="row-title">{t.title}</span>
                      <span className="row-meta">{store.domain(t.domain_id).short_name}{t.due ? ` · ${dueLabel(t.due, now)}` : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn primary" onClick={finish}>Done for today ({chosen.length}/3)</button>
          </>
        )}

        {step === 'done' && (
          <section className="card stack reset-done">
            <span className="eyebrow">All set for {longDate(tomorrow).split(' ')[0]}</span>
            {chosen.length ? (
              <ol className="reset-top">{chosen.map((id) => <li key={id}>{store.tasks.find((t) => t.id === id)?.title}</li>)}</ol>
            ) : <p className="note">No Top 3 picked. You can star things in the morning.</p>}
            <div className="calm">Close the laptop and go enjoy your evening. 💗</div>
            <button type="button" className="btn" onClick={() => go('/', true)}>Back to Today</button>
          </section>
        )}
        {step !== 'done' && <button type="button" className="link-btn quiet" onClick={back}>Finish later</button>}
      </main>
    </>
  );
}
