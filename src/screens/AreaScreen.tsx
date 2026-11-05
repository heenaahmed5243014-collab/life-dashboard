// One area: its projects (with stage where the area tracks one), loose tasks, routines, ideas and notes.
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { areaConfig, isFinalStage } from '../areas';
import { daysLabel } from '../dates';
import { go } from '../router';
import { byDue } from '../today';
import type { Task } from '../types';
import Header from '../components/Header';
import ItemRow, { whenText } from '../components/ItemRow';
import { openQuickAdd } from '../components/QuickAdd';
import { Chevron, Plus } from '../icons';

export default function AreaScreen({ id }: { id: string }) {
  const store = useStore();
  const d = store.domains.find((x) => x.id === id);
  if (!d) {
    return (
      <>
        <Header title="" />
        <main className="page page-form"><p className="muted">This area isn’t here any more.</p></main>
      </>
    );
  }
  const cfg = areaConfig(d);
  const open = store.tasks.filter((t) => t.status === 'open' && t.domain_id === d.id);
  const projects = open.filter((t) => t.kind === 'project').sort(byDue);
  const active = projects.filter((p) => !isFinalStage(p.stage));
  const finished = projects.filter((p) => isFinalStage(p.stage));
  const loose = open.filter((t) => t.kind === 'task' && !t.project_id).sort(byDue);
  const ideas = open.filter((t) => t.kind === 'idea');
  const notes = open.filter((t) => t.kind === 'note');
  const goals = open.filter((t) => t.kind === 'goal');
  const routines = store.routines.filter((r) => r.domain_id === d.id);
  const tasksIn = (p: Task) => store.tasks.filter((t) => t.project_id === p.id && t.status === 'open').sort(byDue);

  const projectCard = (p: Task) => {
    const inside = tasksIn(p);
    const next = inside[0];
    return (
      <button key={p.id} type="button" className="project-card" onClick={() => go(`/item/${p.id}`)}>
        <span className="project-head">
          <span className="project-title">{p.title}</span>
          {cfg.stages && p.stage && <span className={`stage-pill${isFinalStage(p.stage) ? ' final' : ''}`}>{p.stage}</span>}
        </span>
        <span className="row-meta">
          {inside.length ? `${inside.length} open task${inside.length === 1 ? '' : 's'}` : 'No open tasks'}
          {next && ` · next: ${next.title} (${whenText(next)})`}
        </span>
      </button>
    );
  };

  return (
    <>
      <Header title="" />
      <main className="page page-form area-page">
        <header className="page-head">
          <h1 className="h1 area-h1"><span className="dot big" style={{ background: d.color }} />{d.name}</h1>
        </header>

        <Block title={cfg.projectsLabel} empty={cfg.stages ? `No ${cfg.projectsLabel.toLowerCase()} yet.` : 'No projects. A project is something with an end point.'}>
          {active.length > 0 && <div className="stack">{active.map(projectCard)}</div>}
          {cfg.stages && active.length > 0 && <p className="muted small stage-key">Stages: {cfg.stages.join(' → ')}</p>}
        </Block>

        <Block title="Tasks" empty="No loose tasks.">
          {loose.length > 0 && <div className="list">{loose.map((t) => <ItemRow key={t.id} task={t} />)}</div>}
        </Block>

        <Block title="Routines" empty="No routines.">
          {routines.length > 0 && (
            <div className="list">
              {routines.map((r) => (
                <button key={r.id} type="button" className="plain-row" onClick={() => go(`/routine/${r.id}`)}>
                  <span className="row-title">{r.title}</span>
                  <span className="row-meta">{daysLabel(r.days)}</span>
                  <Chevron />
                </button>
              ))}
            </div>
          )}
        </Block>

        <Block title="Ideas" empty="No parked ideas.">
          {ideas.length > 0 && <div className="list">{ideas.map((t) => <ItemRow key={t.id} task={t} />)}</div>}
        </Block>

        {notes.length > 0 && (
          <Block title="Notes" empty="">
            <div className="list">{notes.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          </Block>
        )}

        {goals.length > 0 && (
          <Block title="Life goals" empty="">
            <div className="list">{goals.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          </Block>
        )}

        {finished.length > 0 && (
          <Block title="Finished" empty="">
            <div className="stack">{finished.map(projectCard)}</div>
          </Block>
        )}
      </main>
      <button type="button" className="fab fab-low" aria-label={`Add to ${d.short_name}`} onClick={() => openQuickAdd({ domainId: d.id })}><Plus /></button>
    </>
  );
}

function Block({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <section className="section">
      <h2 className="label">{title}</h2>
      {hasContent ? children : <p className="muted small empty-line">{empty}</p>}
    </section>
  );
}
