import { useEffect, useState } from 'react';
import { supabase } from '../backend';
import { useStore } from '../store';
import { today } from '../dates';
import Header from '../components/Header';
import { setWorkMode, toggleWorkMode, useWorkMode, readWorkMode } from '../workmode';
import { setDebrief, useDebrief } from '../debrief';
import { useIsland, setIsland } from '../island';
import { disablePush, enablePush, pushSupport, readPushState, sendTestPush, setPushTime } from '../push';

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
        <DebriefSettings />
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

function DebriefSettings() {
  const d = useDebrief();
  const island = useIsland();
  const Toggle = ({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) => (
    <label className="check-line"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
  );
  return (
    <section className="card stack" aria-label="Morning debrief">
      <div className="between">
        <span className="eyebrow">Morning debrief</span>
        <button type="button" role="switch" aria-checked={d.on} className={`switch${d.on ? ' on' : ''}`} onClick={() => setDebrief({ on: !d.on })}><span className="visually-hidden">Morning debrief</span><i /></button>
      </div>
      <p className="note">Your day split into Morning, Afternoon and Evening, shown at the top of Today each morning until you tap Start my day. The ☀️ button on Today opens it any time.</p>
      <label className="money-row">
        <span className="money-name">Show it until</span>
        <select className="select small-select" aria-label="Show the debrief until" value={d.untilHour} onChange={(e) => setDebrief({ untilHour: Number(e.target.value) })}>
          {[10, 11, 12, 13, 14, 16, 18].map((h) => <option key={h} value={h}>{h <= 12 ? `${h}${h === 12 ? 'pm' : 'am'}` : `${h - 12}pm`}</option>)}
        </select>
      </label>
      <DebriefNotification />
      <Toggle on={d.headsUp} label="Heads-up: follow-ups, returns, refunds, bills" onChange={(v) => setDebrief({ headsUp: v })} />
      <Toggle on={d.money} label="Money: spending money until payday" onChange={(v) => setDebrief({ money: v })} />
      <Toggle on={d.health} label="Health: steps and your next weight reward" onChange={(v) => setDebrief({ health: v })} />
      <span className="eyebrow">Live pill</span>
      <Toggle on={island.on} label="Show the live pill at the top (what’s now and next, with a countdown)" onChange={(v) => setIsland({ on: v })} />
    </section>
  );
}

function DebriefNotification() {
  const [state, setState] = useState<{ on: boolean; time: string } | null>(null);
  const [time, setTime] = useState('07:30');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const support = pushSupport();
  useEffect(() => {
    readPushState().then((s) => { if (s) { setState(s); setTime(s.time); } }).catch(() => {});
  }, []);
  const turnOn = async () => {
    setBusy(true); setMsg(null);
    try { await enablePush(time); setState({ on: true, time }); setMsg(`Done. Your debrief arrives at ${time} each morning.`); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Couldn’t turn notifications on.'); }
    finally { setBusy(false); }
  };
  const turnOff = async () => { setBusy(true); await disablePush().catch(() => {}); setState((s) => s && { ...s, on: false }); setBusy(false); setMsg('Notifications off on this device.'); };
  const changeTime = async (t: string) => { setTime(t); if (state?.on) { await setPushTime(t).catch(() => {}); setMsg(`Moved to ${t}.`); } };
  const test = async () => { setBusy(true); setMsg(await sendTestPush()); setBusy(false); };
  return (
    <div className="stack notif-box">
      <div className="between">
        <span className="money-name">🔔 Notification each morning</span>
        <button type="button" role="switch" aria-checked={Boolean(state?.on)} disabled={busy} className={`switch${state?.on ? ' on' : ''}`} onClick={() => (state?.on ? turnOff() : turnOn())}>
          <span className="visually-hidden">Morning debrief notification</span><i />
        </button>
      </div>
      <label className="money-row">
        <span className="money-name">Send it at</span>
        <input type="time" className="time-input" aria-label="Debrief notification time" value={time} onChange={(e) => e.target.value && void changeTime(e.target.value)} />
      </label>
      {support === 'needs-home-screen' && <p className="note warn-text">On iPhone, notifications only work from the Home Screen app: in Safari tap Share → Add to Home Screen, then open the app from that icon and switch this on.</p>}
      {support === 'blocked' && <p className="note warn-text">Notifications are blocked for this app. Turn them on in your phone’s Settings → Notifications.</p>}
      {state?.on && <button type="button" className="btn small" disabled={busy} onClick={() => void test()}>Send a test now</button>}
      {msg && <p className="note" role="status">{msg}</p>}
      <p className="note">Arrives within 15 minutes of the time you pick, once a day. Tapping it opens your debrief.</p>
    </div>
  );
}
