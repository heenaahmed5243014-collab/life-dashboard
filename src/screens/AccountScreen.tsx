import { useEffect, useState } from 'react';
import { supabase } from '../backend';
import { useStore } from '../store';
import { today } from '../dates';
import Header from '../components/Header';

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
        <button type="button" className="secondary" onClick={exportFile}>Download a copy (file)</button>
        {supabase && (
          <button type="button" className="link-btn quiet" onClick={() => supabase!.auth.signOut()}>Sign out</button>
        )}
      </main>
    </>
  );
}
