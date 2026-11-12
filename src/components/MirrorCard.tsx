// Quiet moment (was "Mirror work"): 2 minutes with an affirmation, on days that routine is on.

/** Matches the routine by its new name or its old one. */
export const QUIET_RE = /quiet moment|mirror/i;
// A new one each day, from the built-in list plus any you add yourself.
import { useState } from 'react';
import { daysBetween } from '../dates';
import { useStore } from '../store';
import { useToast } from '../toast';

const AFFIRM = [
  'I am allowed to take up space.',
  'I don’t have to do everything today. I just have to do the next thing.',
  'My brain works differently, and that is a strength.',
  'I am proud of how far I’ve come.',
  'I can be myself and still be loved.',
  'Rest is productive too.',
  'I keep promises to myself.',
  'I am becoming the person I want to be, one day at a time.',
  'I am safe to open up to good people.',
  'I am capable, creative and worth investing in.',
];

export default function MirrorCard({ day }: { day: string }) {
  const store = useStore();
  const toast = useToast();
  const [extra, setExtra] = useState(0);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const mine = store.affirmations;
  const all = [...AFFIRM.map((text) => ({ id: null as string | null, text })), ...mine.map((a) => ({ id: a.id as string | null, text: a.text }))];
  const base = Math.abs(daysBetween('2026-01-01', day));
  const cur = all[(base + extra) % all.length];
  const canAdd = store.affirmReady !== false;

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    store.addAffirmation(text.slice(0, 300));
    // Show the new one straight away.
    const newIndex = AFFIRM.length + mine.length;
    const n = all.length + 1;
    setExtra((((newIndex - base) % n) + n) % n);
    setDraft('');
    setAdding(false);
    toast({ message: 'Added. It’s in your daily rotation now.' });
  };
  const remove = (id: string) => {
    const a = mine.find((x) => x.id === id);
    store.deleteAffirmation(id);
    setExtra(0);
    toast({ message: 'Removed from your affirmations', undo: a ? () => store.addAffirmation(a.text) : undefined });
  };

  return (
    <div className="card violet-card">
      <div className="between">
        <span className="eyebrow">Quiet moment · 2 minutes</span>
        {cur.id && <span className="tag t-violet-solid">Yours</span>}
      </div>
      <blockquote className="affirm">{cur.text}</blockquote>
      <p className="note">Look yourself in the eye and say it out loud three times.</p>
      {adding ? (
        <form className="affirm-add" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="visually-hidden" htmlFor="affirm-in">Your affirmation</label>
          <textarea id="affirm-in" className="affirm-input" rows={2} maxLength={300} autoFocus value={draft} placeholder="e.g. I am calm, capable and enough." onChange={(e) => setDraft(e.target.value)} />
          <div className="row">
            <button type="submit" className="btn primary small">Add it</button>
            <button type="button" className="btn small ghost" onClick={() => { setAdding(false); setDraft(''); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="row">
          <button type="button" className="btn small ghost" onClick={() => setExtra((n) => n + 1)}>Another one</button>
          {canAdd && <button type="button" className="btn small ghost" onClick={() => setAdding(true)}>+ Add an affirmation</button>}
          {cur.id && <button type="button" className="link-btn quiet push-right" onClick={() => remove(cur.id!)}>Remove</button>}
        </div>
      )}
      {mine.length > 0 && !adding && <p className="note">{mine.length} of your own in the rotation, with {AFFIRM.length} built in.</p>}
    </div>
  );
}
