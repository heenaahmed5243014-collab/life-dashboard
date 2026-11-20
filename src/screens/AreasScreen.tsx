// Areas: one calm line per area. Tap one to open it.
import { useStore } from '../store';
import { areaPic, isReturn } from '../areas';
import { go } from '../router';
import { whenText } from '../components/ItemRow';
import Nav from '../components/Nav';
import { openQuickAdd } from '../components/QuickAdd';
import { Chevron, Plus } from '../icons';
import { byDue } from '../today';
import { today } from '../dates';
import { lazy, Suspense } from 'react';
import { PinGate } from '../pin';
import { useWorkMode } from '../workmode';

const ReturnsScreen = lazy(() => import('./ReturnsScreen'));

export default function AreasScreen({ tab }: { tab?: 'returns' }) {
  const store = useStore();
  const work = useWorkMode();
  const returnsCount = store.tasks.filter((t) => t.status === 'open' && isReturn(t)).length;
  const now = today();
  const open = store.tasks.filter((t) => t.status === 'open' && (t.kind === 'task' || t.kind === 'project'));

  return (
    <>
      <main className="page">
        <header className="page-head">
          <h1 className="h1">Areas</h1>
          <p className="muted lead">{tab === 'returns' ? 'Everything going back, in one place.' : 'Tap an area to see what’s in it.'}</p>
        </header>

        {!work.active && (
          <div className="segmented area-tabs" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={!tab} className={!tab ? 'seg on' : 'seg'} onClick={() => go('/areas', true)}>Areas</button>
            <button type="button" role="tab" aria-selected={tab === 'returns'} className={tab === 'returns' ? 'seg on' : 'seg'} onClick={() => go('/areas/returns', true)}>📦 Returns{returnsCount ? ` · ${returnsCount}` : ''}</button>
          </div>
        )}

        {tab === 'returns' ? (
          <PinGate compact label="Returns"><Suspense fallback={null}><ReturnsScreen /></Suspense></PinGate>
        ) : (
        <div className="area-list">
          {store.domains.map((d) => {
            const mine = open.filter((t) => t.domain_id === d.id && !t.project_id);
            const next = mine.filter((t) => t.kind === 'task').sort(byDue)[0];
            const late = mine.filter((t) => t.due && t.due < now).length;
            const returns = mine.filter(isReturn).length;
            return (
              <button key={d.id} type="button" className="area-line" onClick={() => go(`/area/${d.id}`)}>
                <AreaTile name={d.name} color={d.color} />
                <span className="area-line-main">
                  <span className="area-line-name">{d.name}</span>
                  <span className="row-meta">
                    {mine.length === 0 ? 'All clear' : next ? `Next: ${next.title}${next.due ? ` · ${whenText(next)}` : ''}` : `${mine.length} to do`}
                  </span>
                </span>
                <span className="area-line-side">
                  {late > 0 && <span className="tag t-amber">{late} late</span>}
                  {late === 0 && returns > 0 && <span className="tag">{returns} return{returns === 1 ? '' : 's'}</span>}
                  <span className="count">{mine.length || ''}</span>
                  <Chevron />
                </span>
              </button>
            );
          })}
        </div>
        )}
      </main>
      {tab !== 'returns' && <button type="button" className="fab" aria-label="Add something" onClick={() => openQuickAdd()}><Plus /></button>}
      <Nav current="areas" />
    </>
  );
}

export function AreaTile({ name, color, big = false }: { name: string; color: string; big?: boolean }) {
  const pic = areaPic(name);
  return (
    <span className={big ? 'area-tile-pic big' : 'area-tile-pic'} aria-hidden="true">
      {pic.img ? <img src={pic.img} alt="" /> : pic.emoji}
      <i style={{ background: color }} />
    </span>
  );
}
