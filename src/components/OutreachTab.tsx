// Outreach pipeline, as in the Brain Planner. Moving someone to "Contacted" sets a follow-up for 4 days later.
// Overdue follow-ups show in Slipping on Today.
import { useState } from 'react';
import { useStore } from '../store';
import type { Domain, Lead, LeadStage } from '../types';
import { addDays, shortDate, today } from '../dates';
import { useToast } from '../toast';

export const STAGES: [LeadStage, string][] = [['todo', 'To contact'], ['contacted', 'Contacted'], ['follow', 'Follow up'], ['replied', 'Replied'], ['won', 'Won 🎉'], ['no', 'Not now']];
const CHANNELS = ['Instagram DM', 'Email', 'LinkedIn', 'In person', 'Phone', 'WhatsApp'];
const FOLLOW_DAYS = 4;

/** What a stage change does to the follow-up date. */
export function stageChange(l: Lead, stage: LeadStage, now: string): Partial<Lead> {
  if (stage === 'contacted' || stage === 'follow') return { stage, follow_up: l.follow_up && l.follow_up > now && stage === 'follow' ? l.follow_up : addDays(now, FOLLOW_DAYS) };
  if (stage === 'todo') return { stage, follow_up: null };
  return { stage, follow_up: null };
}

/** Follow-ups due today or overdue, for Slipping. */
export function dueFollowUps(leads: Lead[], now: string): Lead[] {
  return leads.filter((l) => l.follow_up && l.follow_up <= now && !['won', 'no', 'todo'].includes(l.stage));
}

export default function OutreachTab({ area, ready }: { area: Domain; ready: boolean }) {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const [name, setName] = useState('');
  const [biz, setBiz] = useState('');
  const [channel, setChannel] = useState(CHANNELS[0]);
  const leads = store.leads.filter((l) => l.domain_id === area.id);

  if (!ready) return <p className="note warn-text">Outreach needs database update 10. Ask Claude for the link.</p>;

  const add = () => {
    const n = name.trim();
    if (!n) return;
    store.addLead({ domain_id: area.id, name: n, biz: biz.trim(), channel, stage: 'todo', follow_up: null, notes: '' });
    setName(''); setBiz('');
  };
  const move = (l: Lead, dir: 1 | -1) => {
    const i = STAGES.findIndex(([k]) => k === l.stage);
    const target = STAGES[Math.max(0, Math.min(3 + (dir > 0 ? 1 : 0), i + dir))]?.[0];
    if (!target || target === l.stage) return;
    const ch = stageChange(l, target, now);
    store.updateLead(l.id, ch);
    if (ch.follow_up) toast({ message: `Follow-up set for ${shortDate(ch.follow_up)}` });
    else if (target === 'won') toast({ message: 'Won! 🎉' });
  };

  return (
    <div className="stack">
      <p className="sub">Moving someone to Contacted sets a follow-up for {FOLLOW_DAYS} days later. Overdue follow-ups show in Slipping on Today.</p>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="visually-hidden" htmlFor="lead-name">Who?</label>
        <input id="lead-name" className="step-input" value={name} placeholder="Who? e.g. Glow Aesthetics" autoComplete="off" onChange={(e) => setName(e.target.value)} />
        <div className="add-sub todo-add">
          <label className="visually-hidden" htmlFor="lead-biz">What for?</label>
          <input id="lead-biz" className="step-input" value={biz} placeholder="What for? e.g. social media" autoComplete="off" onChange={(e) => setBiz(e.target.value)} />
          <select className="select small-select" aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button type="submit" className="btn primary small">Add</button>
      </form>

      {STAGES.map(([k, label]) => {
        const list = leads.filter((l) => l.stage === k);
        if (!list.length && (k === 'won' || k === 'no')) return null;
        return (
          <section key={k} className="stage-group">
            <h3 className="h3 stage-title">{label} <span className="pill">{list.length}</span></h3>
            {list.length === 0 && <p className="muted small">Nobody here.</p>}
            {list.map((l) => {
              const late = Boolean(l.follow_up && l.follow_up <= now && !['won', 'no', 'todo'].includes(l.stage));
              const i = STAGES.findIndex(([s]) => s === l.stage);
              const closed = l.stage === 'won' || l.stage === 'no';
              return (
                <article key={l.id} className={`card lead${late ? ' late' : ''}`}>
                  <div className="between">
                    <span className="row-title">{l.name}</span>
                    <button type="button" className="slot-x" aria-label={`Delete ${l.name}`} onClick={() => {
                      store.deleteLead(l.id);
                      toast({ message: `${l.name} removed`, undo: () => store.addLead({ domain_id: l.domain_id, name: l.name, biz: l.biz, channel: l.channel, stage: l.stage, follow_up: l.follow_up, notes: l.notes }) });
                    }}>×</button>
                  </div>
                  <span className="meta">
                    {l.biz && <span className="tag">{l.biz}</span>}
                    <span className="tag t-violet">{l.channel}</span>
                    {l.follow_up && !closed && <span className={`tag${late ? ' t-amber' : ''}`}>Follow up {l.follow_up === now ? 'today' : shortDate(l.follow_up)}</span>}
                  </span>
                  <div className="row lead-actions">
                    {k !== 'todo' && <button type="button" className="btn small ghost" aria-label={`Move ${l.name} back`} onClick={() => move(l, -1)}>←</button>}
                    {!closed && <button type="button" className="btn small" onClick={() => move(l, 1)}>{STAGES[i + 1][1]} →</button>}
                    {!closed && <button type="button" className="btn small ghost" onClick={() => store.updateLead(l.id, { stage: 'no', follow_up: null })}>Not now</button>}
                    {!closed && k !== 'todo' && (
                      <label className="tag due-pick">
                        Change date
                        <input type="date" aria-label={`Follow-up date for ${l.name}`} value={l.follow_up ?? ''} onChange={(e) => store.updateLead(l.id, { follow_up: e.target.value || null })} />
                      </label>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
