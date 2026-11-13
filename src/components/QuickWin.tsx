// "I've got 15 minutes": suggests one small thing that fits, one at a time.
import { taskEmoji } from '../emoji';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { Task } from '../types';
import { today } from '../dates';
import { go } from '../router';
import { useToast } from '../toast';
import { cheer } from '../cheers';
import { minutesLabel } from './ItemRow';

export function quickWins(tasks: Task[], now: string, lowEnergy: boolean): Task[] {
  return tasks
    .filter((t) => t.status === 'open' && t.kind === 'task')
    .filter((t) => (t.minutes !== null && t.minutes <= 15) || (t.minutes === null && Boolean(t.step)))
    .filter((t) => !lowEnergy || t.energy !== 'high')
    .sort((a, b) => {
      const urgent = (t: Task) => (t.due && t.due <= now ? 0 : t.starred ? 1 : t.due ? 2 : 3);
      return urgent(a) - urgent(b) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.minutes ?? 15) - (b.minutes ?? 15);
    });
}

export default function QuickWin() {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [low, setLow] = useState(false);
  const [skip, setSkip] = useState(0);
  const list = quickWins(store.tasks, today(), low);
  const t = list.length ? list[skip % list.length] : null;

  const done = (x: Task) => {
    store.updateTask(x.id, { status: 'done', closed_at: new Date().toISOString(), starred: false });
    if (!x.repeat) toast({ message: cheer(), undo: () => store.updateTask(x.id, { status: 'open', closed_at: null }) });
  };

  return (
    <>
      <button type="button" className="btn quick-win-btn" onClick={() => { setSkip(0); setOpen(true); }}>⏱ I’ve got 15 minutes</button>
      {open && createPortal(
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Something for 15 minutes">
            <div className="sheet-head">
              <h2 className="sheet-title">Got 15 minutes?</h2>
              <button type="button" className="link-btn" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="chips">
              <button type="button" className={low ? 'chip' : 'chip on'} aria-pressed={!low} onClick={() => { setLow(false); setSkip(0); }}>Any energy</button>
              <button type="button" className={low ? 'chip on' : 'chip'} aria-pressed={low} onClick={() => { setLow(true); setSkip(0); }}>Low energy</button>
            </div>
            {t ? (
              <div className="card stack">
                <span className="eyebrow">{store.domain(t.domain_id).short_name}{t.minutes ? ` · ${minutesLabel(t.minutes)}` : ''}</span>
                <div className="big">{taskEmoji(t, store.domain(t.domain_id).name)} {t.title}</div>
                {t.step && <p className="first-step"><span className="tag t-pink">First step</span> {t.step}</p>}
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => done(t)}>Done ✓</button>
                  {list.length > 1 && <button type="button" className="btn" onClick={() => setSkip((n) => n + 1)}>Another</button>}
                  <button type="button" className="link-btn push-right" onClick={() => { setOpen(false); go(`/item/${t.id}`); }}>Open</button>
                </div>
                <p className="note">{(skip % list.length) + 1} of {list.length} quick things</p>
              </div>
            ) : (
              <p className="note">Nothing small enough yet. On any item, set <b>How long</b> to 5 or 15 minutes (or add a first step) and it shows up here.</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
