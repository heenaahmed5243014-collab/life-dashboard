// Steps inside a task: break a big job into small ticks. "Suggest steps" asks Claude for a breakdown,
// which you can pick from before anything is added.
import { useState } from 'react';
import { useStore } from '../store';
import type { Task } from '../types';
import { supabase } from '../backend';
import { go } from '../router';
import { useToast } from '../toast';
import { cheer } from '../cheers';
import { Check } from '../icons';
import { minutesLabel } from './ItemRow';

interface Suggestion { title: string; minutes: number }

async function suggest(task: Task, existing: string[]): Promise<Suggestion[]> {
  if (!navigator.onLine) throw new Error('Suggestions need an internet connection.');
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  let res: Response;
  try {
    res = await fetch('/api/breakdown', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ title: task.title, notes: task.notes, existing }),
    });
  } catch {
    throw new Error('Couldn’t reach Claude just now. Try again in a moment.');
  }
  const body = (await res.json().catch(() => ({}))) as { steps?: Suggestion[]; error?: string; detail?: string };
  if (!res.ok) {
    if (body.error === 'not_configured' || res.status === 404) throw new Error('Claude isn’t connected, so it can’t suggest steps.');
    if (body.error === 'no_credit') throw new Error('Your Anthropic credit has run out.');
    throw new Error(`Claude couldn’t suggest steps${body.detail ? ` (${body.detail.slice(0, 100)})` : ''}.`);
  }
  return (body.steps ?? []).filter((s) => s.title?.trim()).slice(0, 7);
}

export default function SubTasks({ task }: { task: Task }) {
  const store = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<(Suggestion & { on: boolean })[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const steps = store.tasks.filter((t) => t.project_id === task.id && t.status !== 'not_doing').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = steps.filter((s) => s.status === 'done').length;

  const add = (title: string, minutes: number | null = null) =>
    store.addTask({ title, domain_id: task.domain_id, subcategory_id: task.subcategory_id, project_id: task.id, minutes, energy: minutes && minutes <= 15 ? 'low' : null });
  const toggle = (s: Task) => {
    const finishing = s.status === 'open';
    store.updateTask(s.id, finishing ? { status: 'done', closed_at: new Date().toISOString(), starred: false } : { status: 'open', closed_at: null });
    if (finishing) toast({ message: done + 1 === steps.length ? `All steps done! Tick off “${task.title}” too? 🎉` : cheer() });
  };
  const ask = async () => {
    setBusy(true); setProblem(null);
    try {
      const list = await suggest(task, steps.map((s) => s.title));
      setIdeas(list.map((x) => ({ ...x, on: true })));
      if (!list.length) setProblem('No suggestions this time. Try adding a note about the task first.');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Couldn’t get suggestions.');
    } finally {
      setBusy(false);
    }
  };
  const addPicked = () => {
    const picked = (ideas ?? []).filter((x) => x.on);
    picked.forEach((x, i) => setTimeout(() => add(x.title.trim(), x.minutes || null), i * 5)); // keep their order
    if (picked.length) toast({ message: `${picked.length} step${picked.length === 1 ? '' : 's'} added` });
    setIdeas(null);
  };

  return (
    <div className="stack subtasks">
      {steps.length > 0 && (
        <div className="progress"><div className="bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div><span className="count">{done}/{steps.length}</span></div>
      )}
      {steps.length > 0 && (
        <ul className="check-list in-card">
          {steps.map((s) => (
            <li key={s.id} className={`check-row${s.status === 'done' ? ' done' : ''}`}>
              <button type="button" className="tick" aria-pressed={s.status === 'done'} aria-label={`${s.status === 'done' ? 'Untick' : 'Tick'} ${s.title}`} onClick={() => toggle(s)}>
                <span className="box"><Check size={16} /></span>
              </button>
              <button type="button" className="row-body" onClick={() => go(`/item/${s.id}`)}>
                <span className="row-title">{s.title}</span>
                {s.minutes ? <span className="row-meta">{minutesLabel(s.minutes)}</span> : null}
              </button>
              <button type="button" className="slot-x" aria-label={`Remove step ${s.title}`} onClick={() => {
                store.updateTask(s.id, { status: 'not_doing', closed_at: new Date().toISOString() });
                toast({ message: 'Step removed', undo: () => store.updateTask(s.id, { status: s.status, closed_at: s.closed_at }) });
              }}>×</button>
            </li>
          ))}
        </ul>
      )}
      <form className="add-sub todo-add" onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (t) { add(t); setDraft(''); } }}>
        <label className="visually-hidden" htmlFor={`sub-${task.id}`}>Add a step</label>
        <input id={`sub-${task.id}`} className="step-input" value={draft} placeholder="Add a small step" autoComplete="off" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn">Add</button>
      </form>

      {ideas ? (
        <div className="card stack suggest-card">
          <span className="eyebrow">Suggested steps · untick any you don’t want</span>
          {ideas.map((x, i) => (
            <label key={i} className="suggest-row">
              <input type="checkbox" checked={x.on} onChange={() => setIdeas(ideas.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} />
              <span className="suggest-text">{x.title}</span>
              {x.minutes ? <span className="note">{minutesLabel(x.minutes)}</span> : null}
            </label>
          ))}
          <div className="row">
            <button type="button" className="btn primary small" onClick={addPicked} disabled={!ideas.some((x) => x.on)}>Add {ideas.filter((x) => x.on).length} steps</button>
            <button type="button" className="btn small" onClick={() => void ask()} disabled={busy}>Try again</button>
            <button type="button" className="link-btn quiet push-right" onClick={() => setIdeas(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn small suggest-btn" onClick={() => void ask()} disabled={busy}>
          {busy ? 'Thinking of steps…' : steps.length ? '✨ Suggest more steps' : '✨ Suggest a breakdown'}
        </button>
      )}
      {problem && <p className="note warn-text">{problem}</p>}
    </div>
  );
}
