// Scope section 3, "Areas": one tile per area. Tap one to see what sits under it.
import { useStore } from '../store';
import { areaConfig, groupOf, isReturn } from '../areas';
import { go } from '../router';
import { whenText } from '../components/ItemRow';
import Nav from '../components/Nav';
import { openQuickAdd } from '../components/QuickAdd';
import { Chevron, Plus } from '../icons';
import { byDue } from '../today';

export default function AreasScreen() {
  const store = useStore();
  const open = store.tasks.filter((t) => t.status === 'open');

  return (
    <>
      <main className="page">
        <header className="page-head">
          <h1 className="h1">Areas</h1>
          <p className="muted lead">Each area has its own groups, like Returns or Client work. Tap an area to open it.</p>
        </header>

        <div className="area-grid">
          {store.domains.map((d) => {
            const mine = open.filter((t) => t.domain_id === d.id);
            const subs = store.subcategoriesOf(d.id);
            const projects = mine.filter((t) => t.kind === 'project').length;
            const returns = mine.filter((t) => t.kind === 'task' && !t.project_id && isReturn(t)).length;
            const tasks = mine.filter((t) => t.kind === 'task').length - returns;
            const ideas = mine.filter((t) => t.kind === 'idea').length;
            const routines = store.routines.filter((r) => r.domain_id === d.id).length;
            const next = mine.filter((t) => t.kind === 'task' && t.due).sort(byDue)[0];
            const parts = [
              projects && `${projects} ${projects === 1 ? areaConfig(d).one : areaConfig(d).many}`,
              returns && `${returns} return${returns === 1 ? '' : 's'}`,
              tasks && `${tasks} task${tasks === 1 ? '' : 's'}`,
              routines && `${routines} routine${routines === 1 ? '' : 's'}`,
              ideas && `${ideas} idea${ideas === 1 ? '' : 's'}`,
            ].filter(Boolean);
            return (
              <button key={d.id} type="button" className="area-tile" onClick={() => go(`/area/${d.id}`)} style={{ borderTopColor: d.color }}>
                <span className="area-tile-head">
                  <span className="area-name"><span className="dot big" style={{ background: d.color }} />{d.name}</span>
                  <Chevron />
                </span>
                <span className="area-counts">{parts.length ? parts.join(' · ') : 'Nothing here yet'}</span>
                {subs.length > 0 && (
                  <span className="area-subs">
                    {subs.map((x) => <span key={x.id} className="pill">{x.name} · {mine.filter((t) => !t.project_id && groupOf(t, subs)?.id === x.id).length}</span>)}
                  </span>
                )}
                {next && <span className="area-next">Next: {next.title} · {whenText(next)}</span>}
              </button>
            );
          })}
        </div>
      </main>
      <button type="button" className="fab" aria-label="Add something" onClick={() => openQuickAdd()}><Plus /></button>
      <Nav current="areas" />
    </>
  );
}
