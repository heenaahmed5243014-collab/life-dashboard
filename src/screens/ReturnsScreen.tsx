// Returns (a sub-category of Personal & home): return-by dates, where each goes back,
// and a QR code screenshot to show at the counter.
import { useState } from 'react';
import { useStore } from '../store';
import { allReturns } from '../areas';
import { daysBetween, shortDate, today } from '../dates';
import { go } from '../router';
import type { Task } from '../types';
import Header from '../components/Header';
import { openQuickAdd } from '../components/QuickAdd';
import { QrThumb, QrUpload, QrViewer } from '../components/Qr';
import { useToast } from '../toast';
import { cheer } from '../cheers';
import { Check, Plus } from '../icons';

export default function ReturnsScreen() {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const [showing, setShowing] = useState<string | null>(null);
  const open = allReturns(store.tasks, store.subcategories).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const recent = store.tasks.filter((t) => t.status === 'done' && allReturnsDone(t));
  const total = open.length + recent.length;
  const soon = open.filter((t) => t.due && daysBetween(now, t.due) <= 7);
  const home = store.domains.find((d) => d.name === 'Personal & home');
  const returnsSub = store.subcategories.find((x) => x.domain_id === home?.id && x.name.trim().toLowerCase() === 'returns');
  const current = showing ? store.tasks.find((t) => t.id === showing) : null;

  function allReturnsDone(t: Task) {
    return allReturns([{ ...t, status: 'open' }], store.subcategories).length > 0;
  }

  const dropOff = (t: Task) => {
    store.updateTask(t.id, { status: 'done', closed_at: new Date().toISOString(), starred: false });
    toast({ message: cheer(), undo: () => store.updateTask(t.id, { status: 'open', closed_at: null }) });
  };

  const dueTag = (t: Task) => {
    if (!t.due) return { text: 'No return-by date', cls: 'tag t-amber' };
    const n = daysBetween(now, t.due);
    if (n < 0) return { text: `Was due ${shortDate(t.due)}`, cls: 'tag t-amber' };
    if (n === 0) return { text: 'Return by today', cls: 'tag t-amber' };
    return { text: `Return by ${shortDate(t.due)}`, cls: n <= 7 ? 'tag t-amber' : 'tag' };
  };

  return (
    <>
      <Header title="" />
      <main className="page page-form returns-page">
        <header className="page-head">
          {home && <button type="button" className="link-btn crumb" onClick={() => go(`/area/${home.id}`)}>‹ {home.name}</button>}
          <h1 className="h1 area-h1"><span className="dot big" style={{ background: home?.color ?? '#3E7A64' }} />Returns</h1>
          <p className="sub">Do first. Screenshot every QR code, then one post office trip.</p>
          <div className="progress">
            <div className="bar"><i style={{ width: `${total ? (recent.length / total) * 100 : 0}%` }} /></div>
            <span className="count">{recent.length} / {total} dropped off</span>
          </div>
          <div className="pills">
            <span className="pill p-sage">{open.filter((t) => t.qr_path).length} QR codes ready</span>
            {soon.length > 0 && <span className="pill t-amber">{soon.length} due this week</span>}
          </div>
        </header>

        {open.length === 0 && (
          <section className="empty"><p className="empty-title">No returns waiting.</p><p className="muted">Nice. Tap + to add one.</p></section>
        )}

        {open.map((t) => {
          const due = dueTag(t);
          const urgent = t.due ? daysBetween(now, t.due) <= 3 : false;
          return (
            <article key={t.id} className={`return-card${urgent ? ' urgent' : ''}`}>
              <div className="return-head">
                <button type="button" className="tick" onClick={() => dropOff(t)} aria-label={`Mark ${t.title} dropped off`}>
                  <span className="box"><Check size={16} /></span>
                </button>
                <button type="button" className="row-body" onClick={() => go(`/item/${t.id}`)}>
                  <span className="row-title">{t.title}</span>
                  <span className="meta">
                    <span className={due.cls}>{due.text}</span>
                    {t.drop_off && <span className="tag t-violet">{t.drop_off}</span>}
                  </span>
                </button>
              </div>
              {t.qr_path ? (
                <div className="qr-row">
                  <QrThumb task={t} />
                  <span className="note">QR code saved</span>
                  <button type="button" className="btn primary small" onClick={() => setShowing(t.id)}>Show QR</button>
                </div>
              ) : (
                <QrUpload task={t} />
              )}
            </article>
          );
        })}
      </main>

      <button
        type="button"
        className="fab fab-low"
        aria-label="Add a return"
        onClick={() => openQuickAdd({ domainId: home?.id ?? null, subcategoryId: returnsSub?.id ?? null })}
      >
        <Plus />
      </button>

      {current && (
        <QrViewer
          task={current}
          onClose={() => setShowing(null)}
          onDone={() => { dropOff(current); setShowing(null); }}
        />
      )}
    </>
  );
}
