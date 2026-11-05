// Net worth: a small card on Today. Balances are typed in once a month; each
// account's last balance carries forward, so you only update what changed.
import { useState } from 'react';
import { useStore } from '../store';
import type { Account, Balance } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const monthsBack = (n: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return monthKey(d);
};
const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
const money = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(Math.round(n)).toLocaleString('en-GB');

/** An account's balance in a month: that month's figure, or the latest one before it. */
function balanceAt(a: Account, month: string, balances: Balance[]): number | null {
  const b = balances.filter((x) => x.account_id === a.id && x.month <= month).sort((p, q) => q.month.localeCompare(p.month))[0];
  return b ? b.amount : null;
}

function totalAt(accounts: Account[], month: string, balances: Balance[]): number | null {
  let any = false;
  let total = 0;
  for (const a of accounts) {
    const v = balanceAt(a, month, balances);
    if (v === null) continue;
    any = true;
    total += a.is_debt ? -v : v;
  }
  return any ? total : null;
}

export default function MoneyCard() {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newDebt, setNewDebt] = useState(false);
  const accounts = store.accounts.filter((a) => a.active).sort((a, b) => a.sort - b.sort);
  const thisMonth = monthsBack(0);

  const total = totalAt(accounts, thisMonth, store.balances);
  const last = totalAt(accounts, monthsBack(1), store.balances);
  const change = total !== null && last !== null ? total - last : null;
  const trend = Array.from({ length: 6 }, (_, i) => monthsBack(5 - i)).map((m) => ({ m, v: totalAt(accounts, m, store.balances) }));
  const max = Math.max(1, ...trend.map((t) => Math.max(t.v ?? 0, 0)));
  const updatedThisMonth = accounts.length > 0 && accounts.every((a) => store.balances.some((b) => b.account_id === a.id && b.month === thisMonth));
  const lastMonthUpdated = store.balances.map((b) => b.month).sort().pop();

  const startEdit = () => {
    const d: Record<string, string> = {};
    for (const a of accounts) {
      const v = balanceAt(a, thisMonth, store.balances);
      d[a.id] = v === null ? '' : String(v);
    }
    setDraft(d);
    setEditing(true);
  };

  const save = () => {
    for (const a of accounts) {
      const raw = (draft[a.id] ?? '').replace(/[£,\s]/g, '');
      if (raw === '') continue;
      const amount = Math.abs(Number(raw));
      if (!Number.isFinite(amount)) continue;
      store.setBalance({ account_id: a.id, month: thisMonth, amount });
    }
    setEditing(false);
  };

  const addAccount = () => {
    if (!newName.trim()) return;
    const a = store.addAccount(newName, newDebt);
    setDraft((d) => ({ ...d, [a.id]: '' }));
    setNewName('');
    setNewDebt(false);
  };

  return (
    <section className="card mini-card" aria-label="Net worth">
      <div className="between">
        <span className="eyebrow">Net worth</span>
        <span className="note">{updatedThisMonth ? `Updated for ${monthName(thisMonth)}` : lastMonthUpdated ? `Last updated ${monthName(lastMonthUpdated)}` : 'Not set up yet'}</span>
      </div>

      {accounts.length === 0 && !editing ? (
        <p className="note">Add your accounts once (current, savings, ISA, pension, credit card…). Then type the balances in each month. About 2 minutes.</p>
      ) : (
        <div className="mini-main">
          <div className="mini-figures">
            <span className="mini-big">{total === null ? '—' : money(total)}</span>
            {change !== null && Math.round(change) !== 0 && (
              <span className={`tag ${change > 0 ? 't-sage' : 't-amber'}`}>{change > 0 ? '▲' : '▼'} {money(Math.abs(change))} since {monthName(monthsBack(1))}</span>
            )}
            {change !== null && Math.round(change) === 0 && <span className="tag">Same as {monthName(monthsBack(1))}</span>}
          </div>
          <div className="mini-trend" role="img" aria-label={`Net worth over the last six months${total !== null ? `, now ${money(total)}` : ''}`}>
            {trend.map((t, i) => (
              <span key={t.m} className={i === trend.length - 1 ? 'now' : ''} style={{ height: `${t.v === null ? 4 : Math.max(6, Math.round((Math.max(t.v, 0) / max) * 40))}px` }} />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="mini-edit">
          {accounts.map((a) => (
            <div key={a.id} className="money-row">
              <span className="dot" style={{ background: a.is_debt ? 'var(--amber)' : 'var(--sage)' }} />
              <span className="money-name">{a.name}<span className="note"> · {a.is_debt ? 'owe' : 'own'}</span></span>
              <label className="money-input">
                <span aria-hidden="true">{a.is_debt ? '−£' : '£'}</span>
                <input inputMode="decimal" aria-label={`${a.name} balance`} value={draft[a.id] ?? ''} placeholder="0" onChange={(e) => setDraft({ ...draft, [a.id]: e.target.value })} />
              </label>
              <button type="button" className="slot-x" aria-label={`Remove ${a.name}`} onClick={() => store.updateAccount(a.id, { active: false })}>×</button>
            </div>
          ))}
          <div className="money-add">
            <input className="step-input" aria-label="New account name" placeholder="Add an account, e.g. Savings" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAccount()} />
            <div className="segmented" role="radiogroup" aria-label="Own or owe">
              <button type="button" role="radio" aria-checked={!newDebt} className={!newDebt ? 'seg on' : 'seg'} onClick={() => setNewDebt(false)}>Own</button>
              <button type="button" role="radio" aria-checked={newDebt} className={newDebt ? 'seg on' : 'seg'} onClick={() => setNewDebt(true)}>Owe</button>
            </div>
            <button type="button" className="btn small" onClick={addAccount} disabled={!newName.trim()}>Add</button>
          </div>
        </div>
      )}

      <div className="row">
        {editing ? (
          <>
            <button type="button" className="btn primary small" onClick={save}>Save balances</button>
            <button type="button" className="btn small" onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className={`btn small${accounts.length && !updatedThisMonth ? ' primary' : ''}`} onClick={startEdit}>
            {accounts.length ? (updatedThisMonth ? 'Update balances' : `Do the ${monthName(thisMonth)} check-in`) : 'Add accounts'}
          </button>
        )}
      </div>
    </section>
  );
}
