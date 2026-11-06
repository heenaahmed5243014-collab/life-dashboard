// "Balance check": around payday each month, asks for each account's balance.
// Upload a screenshot of it (Claude reads just the number) or type it. Accounts that grow by
// themselves (Cash ISA with daily interest) aren't asked for.
import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { Account } from '../types';
import { payPeriod } from '../bills';
import { readStatementWithClaude } from '../statementAi';
import { shortDate, today, addDays } from '../dates';
import { useToast } from '../toast';

const SNOOZE_KEY = 'ld:balance-snooze';
const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** When an account last got a real number (typed, uploaded), as a day. */
export function lastUpdated(a: Account, balances: { account_id: string; month: string; recorded_on?: string | null; amount: number }[]) {
  const mine = balances.filter((b) => b.account_id === a.id);
  if (!mine.length) return null;
  const b = mine.sort((x, y) => (y.recorded_on ?? y.month).localeCompare(x.recorded_on ?? x.month))[0];
  return { day: b.recorded_on ?? b.month, amount: b.amount };
}

export function balancesDue(accounts: Account[], balances: Parameters<typeof lastUpdated>[1], since: string): Account[] {
  return accounts.filter((a) => a.active && !(a.daily_growth && !a.is_debt) && ((lastUpdated(a, balances)?.day ?? '0000') < since));
}

export default function BalancePrompt() {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const [snoozed, setSnoozed] = useState(() => { try { return (localStorage.getItem(SNOOZE_KEY) ?? '') > now; } catch { return false; } });
  const since = payPeriod(store.payslips, now).last;
  const due = balancesDue(store.accounts, store.balances, since);
  if (snoozed || due.length === 0) return null;

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, addDays(now, 3)); } catch { /* fine */ }
    setSnoozed(true);
  };

  return (
    <section className="card balance-prompt" aria-label="Balance check">
      <div className="between"><span className="eyebrow">Balance check · 1 minute</span><span className="count">{due.length} to do</span></div>
      <p className="note">It’s been payday, so your net worth needs fresh numbers. Screenshot each balance in your banking app, or type it.</p>
      <ul className="bp-list">
        {due.map((a) => <BalanceRow key={a.id} a={a} onSaved={(left) => left === 0 && toast({ message: 'Net worth is up to date 🎉' })} remaining={due.length} />)}
      </ul>
      <button type="button" className="link-btn quiet" onClick={snooze}>Not now</button>
    </section>
  );
}

function BalanceRow({ a, onSaved, remaining }: { a: Account; onSaved: (left: number) => void; remaining: number }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'idle' | 'reading' | 'confirm' | 'type'>('idle');
  const [value, setValue] = useState('');
  const [day, setDay] = useState(today());
  const [problem, setProblem] = useState<string | null>(null);
  const prev = lastUpdated(a, store.balances);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setMode('reading');
    try {
      const r = await readStatementWithClaude([file], [a.name]);
      if (r.closing === null) throw new Error('Couldn’t see a balance in that picture. Try one where the balance is showing, or type it.');
      setValue(String(r.closing));
      setDay(r.to && r.to <= today() ? r.to : today());
      setMode('confirm');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Couldn’t read that picture.');
      setMode('idle');
    } finally {
      if (input.current) input.current.value = '';
    }
  };
  const save = () => {
    const amount = Math.abs(Number(value.replace(/[£,\s]/g, '')));
    if (!value.trim() || !Number.isFinite(amount)) { toast({ message: 'Type the balance first' }); return; }
    store.setBalance({ account_id: a.id, month: `${day.slice(0, 7)}-01`, amount: Math.round(amount * 100) / 100, recorded_on: day });
    toast({ message: `${a.name}: ${money(amount)} saved` });
    onSaved(remaining - 1);
  };

  return (
    <li className="bp-row">
      <div className="between">
        <span className="row-title">{a.name}{a.is_debt ? <span className="note"> · owe</span> : null}</span>
        <span className="note">{prev ? `Last: ${money(prev.amount)} on ${shortDate(prev.day)}` : 'No balance yet'}</span>
      </div>
      <input ref={input} id={`bp-${a.id}`} type="file" accept="image/*" className="visually-hidden" onChange={(e) => void read(e.target.files?.[0])} />
      {mode === 'idle' && (
        <div className="row">
          <label htmlFor={`bp-${a.id}`} className="btn small primary bp-shot">📷 Screenshot</label>
          <button type="button" className="btn small" onClick={() => { setValue(''); setDay(today()); setMode('type'); }}>Type it</button>
        </div>
      )}
      {mode === 'reading' && <p className="note" role="status">Reading the balance…</p>}
      {(mode === 'confirm' || mode === 'type') && (
        <div className="row bp-confirm">
          <span className="money-input">
            <span aria-hidden="true">{a.is_debt ? '−£' : '£'}</span>
            <input inputMode="decimal" autoFocus={mode === 'type'} aria-label={`${a.name} balance`} value={value} placeholder="0.00" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </span>
          <button type="button" className="btn small primary" onClick={save}>{mode === 'confirm' ? 'Looks right' : 'Save'}</button>
          <button type="button" className="link-btn quiet" onClick={() => setMode('idle')}>Cancel</button>
        </div>
      )}
      {mode === 'confirm' && <p className="note">Read from your screenshot. Fix the number if it’s off. The picture isn’t kept.</p>}
      {problem && <p className="note warn-text">{problem}</p>}
    </li>
  );
}
