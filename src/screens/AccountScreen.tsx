import { useEffect, useState } from 'react';
import { supabase } from '../backend';
import { useStore } from '../store';
import { today } from '../dates';
import Header from '../components/Header';
import { setWorkMode, toggleWorkMode, useWorkMode, readWorkMode } from '../workmode';

export default function AccountScreen() {
  const store = useStore();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // A copy of what's loaded on this device, as a file. The real copy lives in Supabase.
  const exportFile = () => {
    const { domains, tasks, routines, ticks } = store;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), domains, tasks, routines, ticks }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `life-dashboard-${today()}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <Header title="Account" />
      <main className="page page-form">
        <section className="card prose">
          <p>{supabase ? <>Signed in as <strong>{email ?? '…'}</strong>.</> : 'Demo mode. Nothing is saved.'}</p>
          <p className="muted small">Your list is saved online, so it’s the same on your phone and the desk PC.</p>
        </section>
        <WorkModeSettings />
        <button type="button" className="secondary" onClick={exportFile}>Download a copy (file)</button>
        {supabase && (
          <button type="button" className="link-btn quiet" onClick={() => supabase!.auth.signOut()}>Sign out</button>
        )}
      </main>
    </>
  );
}

function WorkModeSettings() {
  const store = useStore();
  const w = useWorkMode();
  // While Work mode is on, the store only lists visible areas, so use the full list of names.
  const names = Array.from(new Set(['Work', ...store.domains.filter((d) => !d.is_inbox).map((d) => d.name), 'Job search', 'Made in Heaven Visuals', 'Personal & home', 'Side ideas', 'Inbox']));
  const toggleArea = (n: string) => {
    const cur = readWorkMode().showAreas;
    setWorkMode({ showAreas: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n] });
  };
  return (
    <section className="card stack" aria-label="Work mode">
      <div className="between">
        <span className="eyebrow">Work mode</span>
        <button type="button" role="switch" aria-checked={w.active} className={`switch${w.active ? ' on' : ''}`} onClick={toggleWorkMode}>
          <span className="visually-hidden">Work mode</span><i />
        </button>
      </div>
      <p className="note">Hides personal things on this device, for when people can see your screen. Money, weight, steps, Mirror work and returns are always hidden. Work mode hides things from view; it doesn’t lock them.</p>
      <span className="eyebrow">Areas that stay visible</span>
      <div className="chips">
        {names.map((n) => (
          <button key={n} type="button" aria-pressed={w.showAreas.includes(n)} className={w.showAreas.includes(n) ? 'chip on' : 'chip'} onClick={() => toggleArea(n)}>{n}</button>
        ))}
      </div>
      <label className="check-line">
        <input type="checkbox" checked={w.auto} onChange={(e) => setWorkMode({ auto: e.target.checked, offOn: null })} />
        <span>Turn on by itself on weekdays from
          <input type="time" className="time-input" aria-label="Work starts" value={w.start} onChange={(e) => setWorkMode({ start: e.target.value || '07:30' })} />
          to
          <input type="time" className="time-input" aria-label="Work ends" value={w.end} onChange={(e) => setWorkMode({ end: e.target.value || '17:00' })} />
        </span>
      </label>
    </section>
  );
}
