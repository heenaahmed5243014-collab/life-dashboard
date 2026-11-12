// Net worth: a small card on Today. Balances are typed in once a month; each
// account's last balance carries forward, so you only update what changed.
import { useState } from 'react';
import { daysBetween, today } from '../dates';
import { useStore } from '../store';
import type { Account, Balance } from '../types';
import BalancePrompt from './BalancePrompt';
import { EyeIcon, useNetWorthHidden } from '../hide';

const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '£';

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

/** The last day of a month key ("2026-11-01" -> "2026-11-30"). */
const monthEnd = (key: string) => {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0);
  return monthKey(d).slice(0, 8) + String(d.getDate()).padStart(2, '0');
};

/**
 * An account's balance in a month: that month's figure, or the latest one before it,
 * plus any daily interest since the day that figure was typed in (up to today, or the month's end).
 */
/**
 * Daily interest for an account. With an interest rate (AER %) it follows the last real balance,
 * so each balance check resets it and it can't snowball. Otherwise the fixed £/day you set.
 */
export function dailyInterest(a: Account, base: number): number {
  if (a.is_debt) return 0;
  if (a.aer && a.aer > 0) return (base * a.aer) / 100 / 365;
  return a.daily_growth ?? 0;
}

export function balanceAt(a: Account, month: string, balances: Balance[]): number | null {
  const b = balances.filter((x) => x.account_id === a.id && x.month <= month).sort((p, q) => q.month.localeCompare(p.month))[0];
  if (!b) return null;
  const rate = dailyInterest(a, b.amount);
  if (!rate) return b.amount;
  const from = b.recorded_on ?? b.month;
  const until = month === monthKey(new Date()) ? today() : monthEnd(month);
  return b.amount + rate * Math.max(0, daysBetween(from, until));
}

/** Interest added on top of typed-in balances this month (shown so the estimate is clear). */
function interestNow(accounts: Account[], balances: Balance[]): number {
  const m = monthKey(new Date());
  return accounts.reduce((sum, a) => {
    const b = balances.filter((x) => x.account_id === a.id && x.month <= m).sort((p, q) => q.month.localeCompare(p.month))[0];
    return b && !a.is_debt && (a.daily_growth || a.aer) ? sum + (balanceAt(a, m, balances)! - b.amount) : sum;
  }, 0);
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
  const [rates, setRates] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newDebt, setNewDebt] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [hidden, toggleHidden] = useNetWorthHidden();
  const accounts = store.accounts.filter((a) => a.active).sort((a, b) => a.sort - b.sort);
  const thisMonth = monthsBack(0);

  const total = totalAt(accounts, thisMonth, store.balances);
  const last = totalAt(accounts, monthsBack(1), store.balances);
  const change = total !== null && last !== null ? total - last : null;
  const interest = interestNow(accounts, store.balances);
  const updatedThisMonth = accounts.length > 0 && accounts.every((a) => store.balances.some((b) => b.account_id === a.id && b.month === thisMonth));
  const lastMonthUpdated = store.balances.map((b) => b.month).sort().pop();

  const startEdit = () => {
    const d: Record<string, string> = {};
    const r: Record<string, string> = {};
    for (const a of accounts) {
      const v = balanceAt(a, thisMonth, store.balances);
      d[a.id] = v === null ? '' : String(Math.round(v * 100) / 100);
      r[a.id] = a.aer ? String(a.aer) : '';
    }
    setDraft(d);
    setRates(r);
    setEditing(true);
  };

  const save = () => {
    for (const a of accounts) {
      const raw = (draft[a.id] ?? '').replace(/[£,\s]/g, '');
      if (raw === '') continue;
      const amount = Math.abs(Number(raw));
      if (!Number.isFinite(amount)) continue;
      store.setBalance({ account_id: a.id, month: thisMonth, amount, recorded_on: today() });
    }
    for (const a of accounts) {
      if (a.is_debt) continue;
      const raw = (rates[a.id] ?? '').replace(/[%,\s]/g, '');
      const aer = raw === '' ? null : Number(raw);
      if (aer === null ? a.aer : Number.isFinite(aer) && aer >= 0 && aer < 30 && aer !== (a.aer ?? null)) store.updateAccount(a.id, { aer: aer === null ? null : Math.round(aer * 100) / 100 });
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

  const pct = change !== null && last ? (change / Math.abs(last)) * 100 : null;
  const updatedText = updatedThisMonth ? `Updated for ${monthName(thisMonth)}` : lastMonthUpdated ? `Last updated ${monthName(lastMonthUpdated)}` : 'Not set up yet';
  const monthlyInterest = accounts.reduce((sum, a) => {
    const v = balanceAt(a, thisMonth, store.balances);
    return v === null ? sum : sum + dailyInterest(a, v) * 30.4;
  }, 0);

  return (
    <section className="card nw-card" aria-label="Net worth">
      <div className="nw-inner">
        <div className="nw-top">
          <span className="nw-titles">
            <span className="nw-label">Net worth</span>
            <b>{accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${updatedText.replace(/^\w/, (c) => c.toLowerCase())}` : 'Not set up yet'}</b>
          </span>
          <button type="button" className="nw-eye" onClick={toggleHidden} aria-pressed={hidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'}><EyeIcon off={hidden} /></button>
        </div>
        {accounts.length === 0 && !editing ? (
          <p className="note">Add your accounts once (current, savings, ISA, pension, credit card…). After that, a Balance check pops up on Today around payday: screenshot or type each balance.</p>
        ) : (
          <>
            <span className="nw-big">{hidden ? '£••••' : total === null ? '—' : money(total)}</span>
            <div className="nw-bottom">
              <span className="nw-chips">
                {accounts.slice(0, 3).map((a) => <span key={a.id} className="nw-chip" title={a.name}>{initials(a.name)}</span>)}
                <button type="button" className="nw-chip add" aria-label="Add or change accounts" onClick={startEdit}>+</button>
              </span>
              {!hidden && pct !== null && Math.round(change!) !== 0 && (
                <span className={`nw-change${change! < 0 ? ' down' : ''}`} title={`${money(Math.abs(change!))} since ${monthName(monthsBack(1))}`}>{change! > 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span>
              )}
            </div>
          </>
        )}
      </div>

      {!editing && (
        <div className="duo-btns">
          <button type="button" className={`duo-btn${accounts.length && !updatedThisMonth ? ' hot' : ''}`} onClick={startEdit}>
            <span className="duo-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h14l-3-3M20 16H6l3 3" /></svg></span>
            {accounts.length ? (updatedThisMonth ? 'Update' : 'Check in') : 'Add accounts'}
          </button>
          <button type="button" className="duo-btn" onClick={() => setShowAccounts(!showAccounts)} aria-expanded={showAccounts} disabled={!accounts.length}>
            <span className="duo-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg></span>
            Accounts
          </button>
        </div>
      )}

      {!editing && showAccounts && (
        <ul className="nw-list">
          {accounts.map((a) => {
            const v = balanceAt(a, thisMonth, store.balances);
            const perMonth = v === null ? 0 : dailyInterest(a, v) * 30.4;
            return (
              <li key={a.id}>
                <span className="nw-chip">{initials(a.name)}</span>
                <span className="nw-acc">
                  <b>{a.name}</b>
                  <span className="note">{a.is_debt ? 'Owe' : a.aer ? `${a.aer}% AER` : 'Own'}{perMonth >= 0.5 && !hidden ? ` · +£${Math.round(perMonth)}/mo` : ''}</span>
                </span>
                <b className="nw-amt">{hidden ? '••••' : v === null ? '—' : (a.is_debt ? '−' : '') + money(v)}</b>
              </li>
            );
          })}
        </ul>
      )}
      {!hidden && interest >= 0.01 && <p className="note">Includes ~£{interest.toFixed(2)} interest since your last update{monthlyInterest >= 0.5 ? ` · about £${Math.round(monthlyInterest)} a month` : ''}.</p>}

      {!editing && accounts.length > 0 && <BalancePrompt />}

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
              {!a.is_debt && store.db12 && (
                <label className="rate-row">
                  <span className="note">
                    Interest rate, AER (optional)
                    {!rates[a.id] && a.daily_growth ? ` · now a fixed £${a.daily_growth.toFixed(2)} a day` : ''}
                  </span>
                  <span className="money-input small">
                    <input inputMode="decimal" aria-label={`${a.name} interest rate`} placeholder="0.00" value={rates[a.id] ?? ''} onChange={(e) => setRates({ ...rates, [a.id]: e.target.value })} />
                    <span aria-hidden="true">%</span>
                  </span>
                </label>
              )}
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

      {editing && (
        <div className="row">
          <button type="button" className="btn primary small" onClick={save}>Save balances</button>
          <button type="button" className="btn small" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      )}
    </section>
  );
}
