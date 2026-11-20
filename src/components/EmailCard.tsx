// Email tracker on the Today deck: inbox zero without opening your inbox.
// Two lists: Reply needed and Waiting on them. Paste an email and Claude sorts it for you.
import { useState } from 'react';
import { useStore } from '../store';
import { addDays, daysBetween, shortDate, today } from '../dates';
import { useToast } from '../toast';
import { callAgent } from '../agent';
import type { EmailItem } from '../types';
import { isDemo } from '../backend';
import { connectOutlook, disconnectOutlook, syncMail, useMailStatus } from '../outlook';

const ago = (iso: string | null | undefined) => {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Connect Outlook, or show when it last checked, with Sync now. */
function MailBar() {
  const store = useStore();
  const toast = useToast();
  const mail = useMailStatus();
  const [busy, setBusy] = useState(false);
  if (isDemo) return null;
  if (!mail.connected) {
    return (
      <div className="em-mail">
        <span className="em-mail-text"><b>📬 Connect Outlook</b><small>New emails that need you appear here by themselves, and threads you reply to tick themselves off.</small></span>
        <button type="button" className="btn small primary" disabled={busy} onClick={async () => { setBusy(true); try { await connectOutlook(); } catch (e) { toast({ message: (e as Error).message }); setBusy(false); } }}>{busy ? 'Opening…' : 'Connect'}</button>
        {mail.problem && <p className="note em-mail-problem">{mail.problem}</p>}
      </div>
    );
  }
  return (
    <div className="em-mail on">
      <span className="em-mail-text">
        <b>📬 Outlook{mail.email ? ` · ${mail.email}` : ''}</b>
        <small>{mail.reconnect ? 'Microsoft needs you to sign in again.' : mail.busy ? 'Checking for new mail…' : `Checked ${ago(mail.last_sync)}`}</small>
      </span>
      {mail.reconnect
        ? <button type="button" className="btn small primary" onClick={() => connectOutlook().catch((e) => toast({ message: (e as Error).message }))}>Sign in</button>
        : <button type="button" className="btn small" disabled={mail.busy} onClick={async () => {
            const r = await syncMail(store.reload, true);
            if (r) toast({ message: r.added || r.updated || r.closed ? [r.added && `${r.added} new`, r.updated && `${r.updated} replied`, r.closed && `${r.closed} ticked off`].filter(Boolean).join(' · ') : 'Nothing new that needs you' });
          }}>{mail.busy ? '…' : 'Sync'}</button>}
      <details className="em-mail-more">
        <summary aria-label="Outlook options">⋯</summary>
        <button type="button" className="link-btn" onClick={() => { if (confirm('Disconnect Outlook? Emails already on the card stay.')) disconnectOutlook().catch((e) => toast({ message: (e as Error).message })); }}>Disconnect Outlook</button>
      </details>
      {mail.problem && <p className="note em-mail-problem">{mail.problem}</p>}
    </div>
  );
}

const age = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));

function Row({ e }: { e: EmailItem }) {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const d = age(e.created_at);
  const due = e.due ? daysBetween(now, e.due) : null;
  const late = due !== null && due < 0;
  return (
    <li className={`em-row${late ? ' late' : ''}`}>
      <div className="em-main">
        <span className="em-top"><b>{e.sender || 'Someone'}</b><span className={`tag ${late ? 'tag-today' : d >= 3 ? 't-amber' : ''}`}>{late ? `Due ${shortDate(e.due!)}` : d === 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'}`}</span></span>
        <span className="em-subject">{e.subject}</span>
        {e.next_step && <span className="note">→ {e.next_step}</span>}
      </div>
      <div className="em-actions">
        {e.kind === 'reply' ? (
          <button type="button" className="btn small primary" onClick={() => { store.updateEmail(e.id, { kind: 'waiting', due: addDays(now, 3), next_step: 'Follow up if no reply' }); toast({ message: 'Replied ✓ Waiting on them. I’ll flag it in 3 days.' }); }}>Replied</button>
        ) : (
          <button type="button" className="btn small" onClick={() => { store.updateEmail(e.id, { kind: 'reply', next_step: 'Send a quick follow-up', due: now }); }}>Chase</button>
        )}
        <button type="button" className="btn small" onClick={() => store.updateEmail(e.id, { due: addDays(now, 2) })} title="Snooze 2 days">⏰</button>
        <button type="button" className="btn small" aria-label={`Done: ${e.subject}`} onClick={() => { store.updateEmail(e.id, { status: 'done' }); toast({ message: 'Done. One less thing 🎉' }); }}>✓</button>
      </div>
    </li>
  );
}

export default function EmailCard() {
  const store = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'reply' | 'waiting'>('reply');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  if (store.smmReady === false) return <section className="card"><span className="eyebrow">✉️ Email</span><p className="note">This needs database update 18. Ask Claude for the link.</p></section>;
  const now = today();
  const open = store.emails.filter((e) => e.status === 'open');
  const list = open.filter((e) => e.kind === tab).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.created_at.localeCompare(b.created_at));
  const replyN = open.filter((e) => e.kind === 'reply').length;
  const waitN = open.filter((e) => e.kind === 'waiting').length;
  const chaseN = open.filter((e) => e.kind === 'waiting' && e.due && e.due <= now).length;
  const oldest = open.filter((e) => e.kind === 'reply').reduce((m, e) => Math.max(m, age(e.created_at)), 0);
  const sort = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await callAgent<{ sender: string; subject: string; kind: 'reply' | 'waiting'; due: string | null; summary: string; next_step: string }>({ mode: 'email', text });
      store.addEmail({ sender: r.sender.slice(0, 120), subject: (r.subject || 'Email').slice(0, 200), kind: r.kind, due: r.due && /^\d{4}-\d\d-\d\d$/.test(r.due) ? r.due : null, summary: r.summary.slice(0, 600), next_step: r.next_step.slice(0, 200) });
      setText(''); setTab(r.kind);
      toast({ message: `Sorted into ${r.kind === 'reply' ? 'Reply needed' : 'Waiting on them'}` });
    } catch (e) { toast({ message: (e as Error).message }); } finally { setBusy(false); }
  };
  const addManual = (kind: 'reply' | 'waiting') => {
    if (!subject.trim()) return;
    store.addEmail({ sender: sender.trim(), subject: subject.trim(), kind, due: kind === 'waiting' ? addDays(now, 3) : null, summary: '', next_step: kind === 'reply' ? 'Reply' : 'Follow up if no reply' });
    setSender(''); setSubject(''); setManual(false); setTab(kind);
  };
  return (
    <section className="card em-card" aria-label="Email">
      <div className="between"><span className="eyebrow">✉️ Email</span>{replyN === 0 && waitN === 0 ? <span className="tag tag-today">Inbox zero</span> : <span className="count">{replyN + waitN} open</span>}</div>
      <MailBar />
      <div className="em-stats">
        <button type="button" className={tab === 'reply' ? 'on' : ''} onClick={() => setTab('reply')}><b>{replyN}</b><span>Reply needed{oldest >= 3 ? ` · oldest ${oldest}d` : ''}</span></button>
        <button type="button" className={tab === 'waiting' ? 'on' : ''} onClick={() => setTab('waiting')}><b>{waitN}</b><span>Waiting on them{chaseN ? ` · ${chaseN} to chase` : ''}</span></button>
      </div>
      {list.length ? <ul className="em-list">{list.map((e) => <Row key={e.id} e={e} />)}</ul> : <p className="note">{tab === 'reply' ? 'Nothing to reply to. 🎉' : 'Not waiting on anyone.'}</p>}
      <div className="em-paste">
        <textarea rows={2} placeholder="Paste an email (or describe it) and Claude sorts it" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <button type="button" className="btn primary small" onClick={sort} disabled={busy || !text.trim()}>{busy ? 'Sorting…' : '✨ Sort it'}</button>
          <button type="button" className="link-btn" onClick={() => setManual(!manual)}>{manual ? 'Close' : 'Add by hand'}</button>
        </div>
      </div>
      {manual && (
        <div className="em-manual">
          <input className="step-input" placeholder="From" value={sender} onChange={(e) => setSender(e.target.value)} />
          <input className="step-input" placeholder="About" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="row"><button type="button" className="btn small primary" disabled={!subject.trim()} onClick={() => addManual('reply')}>I need to reply</button><button type="button" className="btn small" disabled={!subject.trim()} onClick={() => addManual('waiting')}>Waiting on them</button></div>
        </div>
      )}
    </section>
  );
}
