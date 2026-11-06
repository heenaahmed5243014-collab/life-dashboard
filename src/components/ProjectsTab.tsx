// Projects, as in the Brain Planner: every project has one next step. That's the only bit you need to look at.
// A project's steps are ordinary tasks inside it, so they can also go in your Top 3 or the hourly plan.
import { useState } from 'react';
import { useStore } from '../store';
import type { Domain, Task } from '../types';
import { go } from '../router';
import { useToast } from '../toast';
import { cheer } from '../cheers';
import { Check } from '../icons';

type Status = 'active' | 'paused' | 'done';
const statusOf = (p: Task): Status => (p.status !== 'open' ? 'done' : p.paused ? 'paused' : 'active');
const byCreated = (a: Task, b: Task) => a.created_at.localeCompare(b.created_at);

export default function ProjectsTab({ area, canPause }: { area: Domain; canPause: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [why, setWhy] = useState('');
  const [showDone, setShowDone] = useState(false);
  const projects = store.tasks.filter((t) => t.kind === 'project' && t.domain_id === area.id).sort(byCreated);
  const live = projects.filter((p) => statusOf(p) !== 'done').sort((a, b) => Number(Boolean(a.paused)) - Number(Boolean(b.paused)));
  const done = projects.filter((p) => statusOf(p) === 'done');

  const add = () => {
    const t = name.trim();
    if (!t) return;
    store.addTask({ title: t, domain_id: area.id, kind: 'project', notes: why.trim() });
    setName(''); setWhy('');
    toast({ message: `${t} added. Give it a first step.` });
  };

  return (
    <div className="stack proj-tab">
      <p className="sub">Every project has one next step. That’s the only bit you need to look at.</p>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="visually-hidden" htmlFor="proj-name">New project</label>
        <input id="proj-name" className="step-input" value={name} placeholder="New project, e.g. Head spa launch" autoComplete="off" onChange={(e) => setName(e.target.value)} />
        {name.trim() && (
          <>
            <label className="visually-hidden" htmlFor="proj-why">Why it matters (optional)</label>
            <input id="proj-why" className="step-input" value={why} placeholder="Why it matters (optional)" autoComplete="off" onChange={(e) => setWhy(e.target.value)} />
          </>
        )}
        <button type="submit" className="btn primary small">Add project</button>
      </form>
      {live.length === 0 && <p className="muted small">No projects yet. Add one above.</p>}
      {live.map((p) => <ProjectCard key={p.id} p={p} canPause={canPause} onCheer={() => toast({ message: cheer() })} />)}
      {done.length > 0 && (
        <div className="fold">
          <button type="button" className="fold-head" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <span className="fold-name">Finished projects</span>
            <span className="row-meta">{done.length}</span>
            <span className="fold-chev" aria-hidden="true">›</span>
          </button>
          {showDone && <div className="fold-body">{done.map((p) => <ProjectCard key={p.id} p={p} canPause={canPause} onCheer={() => {}} />)}</div>}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, canPause, onCheer }: { p: Task; canPause: boolean; onCheer: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('');
  const steps = store.tasks.filter((t) => t.project_id === p.id && t.status !== 'not_doing').sort(byCreated);
  const doneN = steps.filter((s) => s.status === 'done').length;
  const next = steps.find((s) => s.status === 'open');
  const status = statusOf(p);

  const setStatus = (s: Status) => {
    if (s === 'done') store.updateTask(p.id, { status: 'done', closed_at: new Date().toISOString(), paused: false });
    else store.updateTask(p.id, { status: 'open', closed_at: null, ...(canPause ? { paused: s === 'paused' } : {}) });
    if (s === 'done') toast({ message: `${p.title} finished 🎉` });
  };
  const toggle = (s: Task) => {
    const finishing = s.status === 'open';
    store.updateTask(s.id, finishing ? { status: 'done', closed_at: new Date().toISOString(), starred: false } : { status: 'open', closed_at: null });
    store.updateTask(p.id, {}); // counts as progress on the project
    if (finishing) onCheer();
  };
  const addStep = () => {
    const t = step.trim();
    if (!t) return;
    store.addTask({ title: t, domain_id: p.domain_id, project_id: p.id, subcategory_id: p.subcategory_id });
    setStep('');
  };

  return (
    <article className={`card stack proj-card${status === 'paused' ? ' paused' : ''}`}>
      <div className="between">
        <button type="button" className="proj-name" onClick={() => go(`/item/${p.id}`)}>{p.title}</button>
        <select className="select small-select" aria-label={`Status of ${p.title}`} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          <option value="active">Active</option>
          {(canPause || status === 'paused') && <option value="paused">Paused</option>}
          <option value="done">Done</option>
        </select>
      </div>
      {p.notes && <p className="note">{p.notes}</p>}
      <div className="progress">
        <div className="bar"><i style={{ width: `${steps.length ? (doneN / steps.length) * 100 : 0}%` }} /></div>
        <span className="count">{doneN}/{steps.length}</span>
      </div>
      {next ? (
        <p className="proj-next"><span className="tag t-pink">Next</span> <b>{next.title}</b></p>
      ) : steps.length ? (
        status !== 'done' && <p className="note">All steps done. Mark it Done? 🎉</p>
      ) : (
        <p className="note">No steps yet. What’s the very first thing to do?</p>
      )}
      <button type="button" className="link-btn proj-steps-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide steps' : `Steps${steps.length ? ` (${steps.length})` : ''}`}</button>
      {open && (
        <div className="stack">
          <ul className="check-list in-card">
            {steps.map((s) => (
              <li key={s.id} className={`check-row${s.status === 'done' ? ' done' : ''}`}>
                <button type="button" className="tick" aria-pressed={s.status === 'done'} aria-label={`${s.status === 'done' ? 'Untick' : 'Tick'} ${s.title}`} onClick={() => toggle(s)}>
                  <span className="box"><Check size={16} /></span>
                </button>
                <button type="button" className="row-body" onClick={() => go(`/item/${s.id}`)}><span className="row-title">{s.title}</span></button>
                <button type="button" className="slot-x" aria-label={`Delete step ${s.title}`} onClick={() => {
                  store.updateTask(s.id, { status: 'not_doing', closed_at: new Date().toISOString() });
                  toast({ message: 'Step removed', undo: () => store.updateTask(s.id, { status: s.status, closed_at: s.closed_at }) });
                }}>×</button>
              </li>
            ))}
          </ul>
          <form className="add-sub todo-add" onSubmit={(e) => { e.preventDefault(); addStep(); }}>
            <label className="visually-hidden" htmlFor={`step-${p.id}`}>Add a step to {p.title}</label>
            <input id={`step-${p.id}`} className="step-input" value={step} placeholder="Add a step" autoComplete="off" onChange={(e) => setStep(e.target.value)} />
            <button type="submit" className="btn">Add</button>
          </form>
        </div>
      )}
    </article>
  );
}
