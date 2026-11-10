// One area, kept calm: the next 3 things first, then each group folded to one line.
// Tap a group to open it. Ideas, notes and goals live in "Someday" at the bottom.
import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { allReturns, areaConfig, groupOf, isFinalStage } from '../areas';
import { daysLabel, today } from '../dates';
import { go } from '../router';
import { byDue } from '../today';
import type { Subcategory, Task } from '../types';
import Header from '../components/Header';
import ItemRow, { whenText } from '../components/ItemRow';
import { openQuickAdd } from '../components/QuickAdd';
import { Chevron, Plus } from '../icons';
import ProjectsTab from '../components/ProjectsTab';
import { AreaTile } from './AreasScreen';
import OutreachTab from '../components/OutreachTab';

/** Areas that get the Brain Planner's Projects and Outreach tabs. */
type Tab = 'overview' | 'projects' | 'outreach';
const AREA_TABS: Record<string, Tab[]> = {
  'Made in Heaven Visuals': ['overview', 'projects', 'outreach'],
  'Job search': ['overview', 'outreach'],
};

const SHOW = 5;
const openKey = (areaId: string) => `ld:area-open:${areaId}`;
const readOpen = (areaId: string): string[] => {
  try { return JSON.parse(sessionStorage.getItem(openKey(areaId)) ?? '[]') as string[]; } catch { return []; }
};

export default function AreaScreen({ id, tab: startTab }: { id: string; tab?: string }) {
  const store = useStore();
  const [tab, setTabState] = useState<Tab>(() => (startTab === 'projects' || startTab === 'outreach' ? startTab : 'overview'));
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(history.state, '', `${location.search}#/area/${id}${t === 'overview' ? '' : `/${t}`}`);
  };
  const [opened, setOpened] = useState<string[]>(() => readOpen(id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [all, setAll] = useState<string[]>([]);
  const d = store.domains.find((x) => x.id === id);
  if (!d) {
    return (
      <>
        <Header title="" />
        <main className="page page-form"><p className="muted">This area isn’t here any more.</p></main>
      </>
    );
  }

  const toggle = (key: string) => {
    const next = opened.includes(key) ? opened.filter((k) => k !== key) : [...opened, key];
    setOpened(next);
    try { sessionStorage.setItem(openKey(id), JSON.stringify(next)); } catch { /* ignore */ }
  };

  const cfg = areaConfig(d);
  const tabs = AREA_TABS[d.name] ?? null;
  const hasTabs = Boolean(tabs);
  const hasProjectsTab = Boolean(tabs?.includes('projects'));
  const followsDue = store.leads.filter((l) => l.domain_id === d.id && l.follow_up && l.follow_up <= today() && !['won', 'no', 'todo'].includes(l.stage)).length;
  const subs = store.subcategoriesOf(d.id);
  const open = store.tasks.filter((t) => t.status === 'open' && t.domain_id === d.id).sort(byDue);
  const group = (t: Task) => groupOf(t, subs);
  const topLevel = open.filter((t) => !t.project_id);
  const someday = (t: Task) => t.kind === 'idea' || t.kind === 'note' || t.kind === 'goal';
  const inSub = (x: Subcategory) => topLevel.filter((t) => group(t)?.id === x.id && !someday(t));
  const unfiled = topLevel.filter((t) => !group(t));
  const projects = unfiled.filter((t) => t.kind === 'project' && !isFinalStage(t.stage));
  const finished = open.filter((t) => t.kind === 'project' && isFinalStage(t.stage));
  const loose = unfiled.filter((t) => t.kind === 'task');
  const later = topLevel.filter(someday);
  const routines = store.routines.filter((r) => r.domain_id === d.id);
  const returnsSub = subs.find((x) => x.name.trim().toLowerCase() === 'returns');
  const nextUp = open.filter((t) => t.kind === 'task' && !(returnsSub && group(t)?.id === returnsSub.id)).slice(0, 3);
  const nextIds = new Set(nextUp.map((t) => t.id));
  const todo = topLevel.filter((t) => t.kind === 'task' || t.kind === 'project').length;

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
  const items = (key: string, list: Task[]) => {
    const rest = list.filter((t) => !nextIds.has(t.id));
    const shown = all.includes(key) ? rest : rest.slice(0, SHOW);
    return (
      <>
        {shown.some((t) => t.kind === 'project') && <div className="stack">{shown.filter((t) => t.kind === 'project').map(projectCard)}</div>}
        {shown.some((t) => t.kind !== 'project') && (
          <div className={`list${shown.every(someday) ? ' soft' : ''}`}>{shown.filter((t) => t.kind !== 'project').map((t) => <ItemRow key={t.id} task={t} />)}</div>
        )}
        {rest.length < list.length && <p className="note">{list.length - rest.length} more shown in Next up above.</p>}
        {rest.length > shown.length && <button type="button" className="link-btn" onClick={() => setAll([...all, key])}>Show all {rest.length}</button>}
      </>
    );
  };

  const subMenu = (x: Subcategory) => {
    const choice = window.prompt(`Rename “${x.name}”, or clear the name to delete it.\n(Items in it stay in ${d.short_name}.)`, x.name);
    if (choice === null) return;
    const name = choice.trim();
    if (!name) {
      if (window.confirm(`Delete the group “${x.name}”? Its items stay in ${d.short_name}.`)) store.removeSubcategory(x.id);
    } else if (name !== x.name) {
      store.updateSubcategory(x.id, { name });
    }
  };
  const saveSub = () => {
    const name = draft.trim();
    if (name && !subs.some((x) => x.name.toLowerCase() === name.toLowerCase())) store.addSubcategory(d.id, name);
    setDraft('');
  };

  return (
    <>
      <Header title="" />
      <main className="page page-form area-page">
        <header className="page-head">
          <h1 className="h1 area-h1"><AreaTile name={d.name} color={d.color} big />{d.name}</h1>
          <p className="sub">{todo === 0 ? 'All clear here.' : `${todo} thing${todo === 1 ? '' : 's'} to do. Just start with the first one.`}</p>
        </header>

        {hasTabs && (
          <div className="segmented area-tabs" role="tablist" aria-label={`${d.name} sections`}>
            {tabs!.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'seg on' : 'seg'} onClick={() => setTab(t)}>
                {t === 'overview' ? 'Overview' : t === 'projects' ? 'Projects' : 'Outreach'}
                {t === 'outreach' && followsDue > 0 && <span className="seg-dot" aria-label={`${followsDue} follow-ups due`}>{followsDue}</span>}
              </button>
            ))}
          </div>
        )}

        {hasProjectsTab && tab === 'projects' && <ProjectsTab area={d} canPause={store.affirmReady !== false} />}
        {hasTabs && tab === 'outreach' && <OutreachTab area={d} ready={store.affirmReady !== false} />}
        {(!hasTabs || tab === 'overview') && (<>

        {nextUp.length > 0 && (
          <section className="card hero">
            <span className="eyebrow">Next up</span>
            <div className="list in-card">{nextUp.map((t) => <ItemRow key={t.id} task={t} />)}</div>
          </section>
        )}

        <div className="folds">
          {subs.map((x) => {
            const isReturns = x === returnsSub;
            if (isReturns) {
              const ret = allReturns(store.tasks.filter((t) => t.domain_id === d.id), subs);
              return (
                <div key={x.id} className="fold">
                  <button type="button" className="fold-head" onClick={() => (editing ? subMenu(x) : go('/returns'))}>
                    <span className="fold-name">{x.name}</span>
                    <span className="row-meta">{ret.length ? `${ret.length} to drop off · ${ret.filter((t) => t.qr_path).length} QR ready` : 'None waiting'}</span>
                    {editing ? <span className="fold-edit">Rename</span> : <Chevron />}
                  </button>
                </div>
              );
            }
            const list = inSub(x);
            return (
              <Fold key={x.id} id={x.id} title={x.name} count={list.length} isOpen={opened.includes(x.id)} onToggle={toggle} onEdit={editing ? () => subMenu(x) : undefined}
                hint={list[0] && !nextIds.has(list[0].id) ? `Next: ${list[0].title}` : list.length ? '' : 'Empty'}>
                {x.note && <p className="note">{x.note}</p>}
                {list.length ? items(x.id, list) : <p className="muted small empty-line">Nothing here yet.</p>}
                <button type="button" className="link-btn small-add" onClick={() => openQuickAdd({ domainId: d.id, subcategoryId: x.id })}>+ Add to {x.name}</button>
              </Fold>
            );
          })}

          {projects.length > 0 && hasProjectsTab && (
            <div className="fold">
              <button type="button" className="fold-head" onClick={() => setTab('projects')}>
                <span className="fold-name">{cfg.projectsLabel}</span>
                <span className="row-meta">{projects.length} · open the Projects tab</span>
                <Chevron />
              </button>
            </div>
          )}
          {projects.length > 0 && !hasProjectsTab && (
            <Fold id="projects" title={cfg.projectsLabel} count={projects.length} isOpen={opened.includes('projects')} onToggle={toggle}>
              <div className="stack">{projects.map(projectCard)}</div>
              {cfg.stages && <p className="muted small stage-key">Stages: {cfg.stages.join(' → ')}</p>}
            </Fold>
          )}

          {loose.length > 0 && (
            <Fold id="other" title={subs.length ? 'Other tasks' : 'Tasks'} count={loose.length} isOpen={opened.includes('other')} onToggle={toggle}>
              {items('other', loose)}
            </Fold>
          )}

          {routines.length > 0 && (
            <Fold id="routines" title="Routines" count={routines.length} isOpen={opened.includes('routines')} onToggle={toggle}>
              <div className="list">
                {routines.map((r) => (
                  <button key={r.id} type="button" className="plain-row" onClick={() => go(`/routine/${r.id}`)}>
                    <span className="row-title">{r.title}</span>
                    <span className="row-meta">{daysLabel(r.days)}{r.chunks > 1 ? ` · ${r.chunks} chunks` : ''}</span>
                    <Chevron />
                  </button>
                ))}
              </div>
            </Fold>
          )}

          {(later.length > 0 || finished.length > 0) && (
            <Fold id="someday" title="Someday" count={later.length + finished.length} isOpen={opened.includes('someday')} onToggle={toggle} hint="Ideas, notes, goals. No pressure.">
              {later.length > 0 && items('someday', later)}
              {finished.length > 0 && (<><h3 className="h3">Finished</h3><div className="stack">{finished.map(projectCard)}</div></>)}
            </Fold>
          )}
        </div>

        {editing ? (
          <div className="card stack">
            <span className="eyebrow">Edit groups</span>
            <p className="note">Tap a group above to rename or delete it. Items in a deleted group stay in {d.short_name}.</p>
            <div className="add-sub">
              <label className="visually-hidden" htmlFor="new-sub">New group name</label>
              <input id="new-sub" className="step-input" value={draft} placeholder="New group, e.g. Paperwork" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveSub()} />
              <button type="button" className="btn primary" onClick={saveSub}>Add</button>
            </div>
            <button type="button" className="btn small" onClick={() => setEditing(false)}>Done editing</button>
          </div>
        ) : (
          <button type="button" className="link-btn quiet edit-groups" onClick={() => setEditing(true)}>Edit groups</button>
        )}
        </>)}
      </main>
      <button type="button" className="fab fab-low" aria-label={`Add to ${d.short_name}`} onClick={() => openQuickAdd({ domainId: d.id })}><Plus /></button>
    </>
  );
}

function Fold({ id, title, count, hint, isOpen, onToggle, onEdit, children }: {
  id: string; title: string; count: number; hint?: string; isOpen: boolean; onToggle: (id: string) => void; onEdit?: () => void; children: ReactNode;
}) {
  return (
    <div className={`fold${isOpen && !onEdit ? ' open' : ''}`}>
      <button type="button" className="fold-head" aria-expanded={isOpen} onClick={() => (onEdit ? onEdit() : onToggle(id))}>
        <span className="fold-name">{title}</span>
        <span className="row-meta">{count ? `${count}` : ''}{hint ? `${count ? ' · ' : ''}${hint}` : ''}</span>
        {onEdit ? <span className="fold-edit">Rename</span> : <span className="fold-chev" aria-hidden="true"><Chevron /></span>}
      </button>
      {isOpen && !onEdit && <div className="fold-body">{children}</div>}
    </div>
  );
}
