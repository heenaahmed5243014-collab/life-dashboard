// Social media jobs on the Today deck. Each job can go to you or to an AI agent
// (caption writer, ideas, hashtags, weekly planner, reply drafter). Run the agent, review its draft,
// copy it, then move the job along: To do → Drafted → Ready to post → Posted.
import { useState } from 'react';
import { useStore } from '../store';
import { daysBetween, shortDate, today } from '../dates';
import { useToast } from '../toast';
import { callAgent } from '../agent';
import type { SmmStatus, SmmTask } from '../types';

export const AGENTS: { key: string; emoji: string; label: string; hint: string }[] = [
  { key: 'captions', emoji: '✍️', label: 'Captions', hint: '3 caption options with a call to action' },
  { key: 'ideas', emoji: '💡', label: 'Ideas', hint: '6 post and reel ideas' },
  { key: 'hashtags', emoji: '#️⃣', label: 'Hashtags', hint: '20 hashtags: broad, niche, local' },
  { key: 'planner', emoji: '📅', label: 'Planner', hint: 'a Monday to Sunday plan' },
  { key: 'replies', emoji: '💬', label: 'Replies', hint: 'replies to the comments or DMs in the brief' },
];
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn'];
const STAGES: { key: SmmStatus; label: string }[] = [
  { key: 'todo', label: 'To do' }, { key: 'review', label: 'Drafted' }, { key: 'ready', label: 'Ready to post' }, { key: 'posted', label: 'Posted' },
];

function Job({ t }: { t: SmmTask }) {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const agent = AGENTS.find((a) => a.key === t.agent);
  const n = t.due ? daysBetween(today(), t.due) : null;
  const run = async () => {
    if (!agent) return;
    setBusy(true); setProblem('');
    try {
      const r = await callAgent<{ output: string }>({ mode: 'smm', agent: agent.key, client: t.client, title: t.title, platform: t.platform, brief: t.brief });
      store.updateSmm(t.id, { output: r.output, status: 'review' });
      setOpen(true);
      toast({ message: `${agent.emoji} ${agent.label} agent finished “${t.title}”` });
    } catch (e) { setProblem((e as Error).message); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(t.output); toast({ message: 'Copied. Paste it into the app you post from.' }); } catch { toast({ message: 'Couldn’t copy. Press and hold the text instead.' }); } };
  return (
    <li className={`smm-job st-${t.status}`}>
      <button type="button" className="smm-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="smm-agent-badge" aria-hidden="true">{agent ? agent.emoji : '🙋‍♀️'}</span>
        <span className="smm-main">
          <b>{t.title}</b>
          <span className="note">{[t.client, t.platform].filter(Boolean).join(' · ')}{agent ? ` · ${agent.label} agent` : ' · You'}</span>
        </span>
        {n !== null && t.status !== 'posted' && <span className={`tag ${n <= 0 ? 'tag-today' : n <= 2 ? 't-amber' : ''}`}>{n < 0 ? 'Late' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : shortDate(t.due!)}</span>}
      </button>
      {open && (
        <div className="smm-body">
          <span className="eyebrow">Who does it</span>
          <div className="chip-scroll smm-agents" role="radiogroup" aria-label="Assign to">
            <button type="button" role="radio" aria-checked={!t.agent} className={!t.agent ? 'chip on' : 'chip'} onClick={() => store.updateSmm(t.id, { agent: null })}>🙋‍♀️ Me</button>
            {AGENTS.map((a) => <button key={a.key} type="button" role="radio" aria-checked={t.agent === a.key} title={a.hint} className={t.agent === a.key ? 'chip on' : 'chip'} onClick={() => store.updateSmm(t.id, { agent: a.key })}>{a.emoji} {a.label}</button>)}
          </div>
          {agent && <p className="note">{agent.label} agent: {agent.hint}. It uses the brief below.</p>}
          <textarea className="smm-brief" rows={2} placeholder="Brief: offer, tone, key details, or paste the comments to reply to" defaultValue={t.brief} onBlur={(e) => e.target.value !== t.brief && store.updateSmm(t.id, { brief: e.target.value.slice(0, 4000) })} />
          {agent && <button type="button" className="btn primary small" onClick={run} disabled={busy}>{busy ? `${agent.emoji} Working…` : t.output ? `Run ${agent.label} again` : `Run ${agent.label} agent`}</button>}
          {problem && <p className="note warn-text">{problem}</p>}
          {t.output && (
            <div className="smm-output">
              <pre>{t.output}</pre>
              <div className="row"><button type="button" className="btn small" onClick={copy}>Copy</button></div>
            </div>
          )}
          <span className="eyebrow">Stage</span>
          <div className="segmented smm-stages" role="radiogroup" aria-label="Stage">
            {STAGES.map((s) => <button key={s.key} type="button" role="radio" aria-checked={t.status === s.key} className={t.status === s.key ? 'seg on' : 'seg'} onClick={() => store.updateSmm(t.id, { status: s.key })}>{s.label}</button>)}
          </div>
          <button type="button" className="link-btn quiet" onClick={() => { if (confirm(`Delete “${t.title}”?`)) store.deleteSmm(t.id); }}>Delete job</button>
        </div>
      )}
    </li>
  );
}

export default function SmmCard() {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [agent, setAgent] = useState<string | null>('captions');
  const [due, setDue] = useState('');
  const [filter, setFilter] = useState<SmmStatus | 'active'>('active');
  if (store.smmReady === false) return <section className="card"><span className="eyebrow">📣 Social media</span><p className="note">This needs database update 18. Ask Claude for the link.</p></section>;
  const jobs = store.smm;
  const clients = Array.from(new Set([...jobs.map((j) => j.client).filter(Boolean), ...store.leads.map((l) => l.name)]));
  const shown = jobs.filter((j) => (filter === 'active' ? j.status !== 'posted' : j.status === filter))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const count = (s: SmmStatus) => jobs.filter((j) => j.status === s).length;
  const add = () => {
    if (!title.trim()) return;
    store.addSmm({ title: title.trim().slice(0, 200), client: client.trim().slice(0, 80), platform, brief: '', agent, due: due || null });
    setTitle(''); setDue(''); setAdding(false);
  };
  return (
    <section className="card smm-card" aria-label="Social media">
      <div className="between"><span className="eyebrow">📣 Social media</span><span className="count">{jobs.filter((j) => j.status !== 'posted').length} on</span></div>
      <div className="chip-scroll smm-filter">
        <button type="button" className={filter === 'active' ? 'chip on' : 'chip'} onClick={() => setFilter('active')}>All active</button>
        {STAGES.map((s) => <button key={s.key} type="button" className={filter === s.key ? 'chip on' : 'chip'} onClick={() => setFilter(s.key)}>{s.label} · {count(s.key)}</button>)}
      </div>
      {shown.length ? <ul className="smm-list">{shown.map((t) => <Job key={t.id} t={t} />)}</ul> : <p className="note">{jobs.length ? 'Nothing here.' : 'Add a job for a client, pick an agent, and let it draft for you.'}</p>}
      {adding ? (
        <form className="smm-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="step-input" autoFocus placeholder="Job, e.g. 3 posts for the new facial offer" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="step-input" list="smm-clients" placeholder="Client" value={client} onChange={(e) => setClient(e.target.value)} />
          <datalist id="smm-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="chip-scroll">{PLATFORMS.map((p) => <button key={p} type="button" className={platform === p ? 'chip on' : 'chip'} onClick={() => setPlatform(p)}>{p}</button>)}</div>
          <div className="chip-scroll">
            <button type="button" className={!agent ? 'chip on' : 'chip'} onClick={() => setAgent(null)}>🙋‍♀️ Me</button>
            {AGENTS.map((a) => <button key={a.key} type="button" className={agent === a.key ? 'chip on' : 'chip'} onClick={() => setAgent(a.key)}>{a.emoji} {a.label}</button>)}
          </div>
          <label className="smm-due"><span className="note">Due</span><input type="date" className="date-input" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          <div className="row"><button type="submit" className="btn primary small" disabled={!title.trim()}>Add job</button><button type="button" className="btn small" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      ) : (
        <button type="button" className="btn small more" onClick={() => setAdding(true)}>+ Add a social media job</button>
      )}
    </section>
  );
}
