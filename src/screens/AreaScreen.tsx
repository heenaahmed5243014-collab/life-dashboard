// One area, organised by its sub-categories (e.g. Personal & home: Returns, Quick admin…).
// Projects, loose tasks, routines, ideas, notes and goals that aren't in a sub-category follow.
import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { allReturns, areaConfig, groupOf, isFinalStage } from '../areas';
import { daysLabel } from '../dates';
import { go } from '../router';
import { byDue } from '../today';
import type { Subcategory, Task } from '../types';
import Header from '../components/Header';
import ItemRow, { whenText } from '../components/ItemRow';
import { openQuickAdd } from '../components/QuickAdd';
import { Chevron, Plus } from '../icons';

export default function AreaScreen({ id }: { id: string }) {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
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
  const subs = store.subcategoriesOf(d.id);
  const open = store.tasks.filter((t) => t.status === 'open' && t.domain_id === d.id).sort(byDue);
  const group = (t: Task) => groupOf(t, subs);
  const topLevel = open.filter((t) => !t.project_id); // tasks inside a project show on the project
  const inSub = (x: Subcategory) => topLevel.filter((t) => group(t)?.id === x.id);
  const unfiled = topLevel.filter((t) => !group(t));
  const projects = unfiled.filter((t) => t.kind === 'project' && !isFinalStage(t.stage));
  const finished = open.filter((t) => t.kind === 'project' && isFinalStage(t.stage));
  const loose = unfiled.filter((t) => t.kind === 'task');
  const ideas = unfiled.filter((t) => t.kind === 'idea');
  const notes = unfiled.filter((t) => t.kind === 'note');
  const goals = unfiled.filter((t) => t.kind === 'goal');
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

  const subMenu = (x: Subcategory) => {
    const choice = window.prompt(`Rename “${x.name}”, or clear the name to delete it.\n(Items in it stay in ${d.short_name}.)`, x.name);
    if (choice === null) return;
    const name = choice.trim();
    if (!name) {
      if (window.confirm(`Delete the sub-category “${x.name}”? Its items stay in ${d.short_name}.`)) store.removeSubcategory(x.id);
    } else if (name !== x.name) {
      store.updateSubcategory(x.id, { name });
    }
  };

  const saveSub = () => {
    const name = draft.trim();
    if (name && !subs.some((x) => x.name.toLowerCase() === name.toLowerCase())) store.addSubcategory(d.id, name);
    setDraft('');
    setAdding(false);
  };

  return (
    <>
      <Header title="" />
      <main className="page page-form area-page">
        <header className="page-head">
          <h1 className="h1 area-h1"><span className="dot big" style={{ background: d.color }} />{d.name}</h1>
          {subs.length > 0 && (
            <div className="pills">
              {subs.map((x) => <span key={x.id} className="pill">{x.name} · {inSub(x).length}</span>)}
            </div>
          )}
        </header>

        {projects.length > 0 && (
          <Block title={cfg.projectsLabel} count={projects.length}>
            <div className="stack">{projects.map(projectCard)}</div>
            {cfg.stages && <p className="muted small stage-key">Stages: {cfg.stages.join(' → ')}</p>}
          </Block>
        )}

        {subs.map((x) => {
          const list = inSub(x);
          const isReturns = x.name.trim().toLowerCase() === 'returns';
          const ret = isReturns ? allReturns(store.tasks.filter((t) => t.domain_id === d.id), subs) : [];
          return (
            <section key={x.id} className="section sub-section">
              <div className="between">
                <h2 className="h2">{x.name}</h2>
                <span className="sub-actions">
                  <span className="count">{list.filter((t) => t.kind !== 'goal').length} left</span>
                  <button type="button" className="icon-btn small" aria-label={`Rename or delete ${x.name}`} onClick={() => subMenu(x)}>⋯</button>
                </span>
              </div>
              {x.note && <p className="note">{x.note}</p>}
              {isReturns ? (
                <button type="button" className="returns-link" onClick={() => go('/returns')}>
                  <span>
                    <span className="returns-link-title">Open Returns</span>
                    <span className="returns-link-sub">{ret.length} to drop off · {ret.filter((t) => t.qr_path).length} QR codes ready</span>
                  </span>
                  <Chevron />
                </button>
              ) : list.length > 0 ? (
                <>
                  {list.filter((t) => t.kind === 'project').length > 0 && <div className="stack">{list.filter((t) => t.kind === 'project').map(projectCard)}</div>}
                  {list.filter((t) => t.kind !== 'project').length > 0 && (
                    <div className={`list${list.every((t) => t.kind === 'goal' || t.kind === 'idea') ? ' soft' : ''}`}>
                      {list.filter((t) => t.kind !== 'project').map((t) => <ItemRow key={t.id} task={t} />)}
                    </div>
                  )}
                </>
              ) : (
                <p className="muted small empty-line">Nothing here yet.</p>
              )}
              {!isReturns && (
                <button type="button" className="link-btn small-add" onClick={() => openQuickAdd({ domainId: d.id, subcategoryId: x.id })}>
                  + Add to {x.name}
                </button>
              )}
            </section>
          );
        })}

        {adding ? (
          <div className="add-sub">
            <label className="visually-hidden" htmlFor="new-sub">New sub-category name</label>
            <input id="new-sub" className="step-input" autoFocus value={draft} placeholder="e.g. Paperwork" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveSub()} />
            <button type="button" className="btn primary" onClick={saveSub}>Add</button>
          </div>
        ) : (
          <button type="button" className="btn small dashed" onClick={() => setAdding(true)}>+ Add sub-category</button>
        )}

        {loose.length > 0 && (
          <Block title={subs.length ? 'Other tasks' : 'Tasks'} count={loose.length}>
            <div className="list">{loose.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          </Block>
        )}

        {routines.length > 0 && (
          <Block title="Routines" count={routines.length}>
            <div className="list">
              {routines.map((r) => (
                <button key={r.id} type="button" className="plain-row" onClick={() => go(`/routine/${r.id}`)}>
                  <span className="row-title">{r.title}</span>
                  <span className="row-meta">{daysLabel(r.days)}{r.chunks > 1 ? ` · ${r.chunks} chunks` : ''}</span>
                  <Chevron />
                </button>
              ))}
            </div>
          </Block>
        )}

        {ideas.length > 0 && (
          <Block title="Ideas">
            <div className="list soft">{ideas.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          </Block>
        )}
        {notes.length > 0 && (
          <Block title="Notes">
            <div className="list soft">{notes.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          </Block>
        )}
        {goals.length > 0 && (
          <Block title="Life goals">
            <div className="list soft">{goals.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          </Block>
        )}
        {finished.length > 0 && (
          <Block title="Finished">
            <div className="stack">{finished.map(projectCard)}</div>
          </Block>
        )}
      </main>
      <button type="button" className="fab fab-low" aria-label={`Add to ${d.short_name}`} onClick={() => openQuickAdd({ domainId: d.id })}><Plus /></button>
    </>
  );
}

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="section">
      <div className="between">
        <h2 className="h2">{title}</h2>
        {count !== undefined && <span className="count">{count}</span>}
      </div>
      {children}
    </section>
  );
}
