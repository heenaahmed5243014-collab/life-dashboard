// Savings goals on the Money tab. The emergency fund works out its own target:
// a few months of essentials (bills and debts plus travel), so it moves when your bills do.
import { useState } from 'react';
import { useStore } from '../store';
import type { SavingsGoal } from '../types';
import { monthlyCost } from '../bills';
import { balanceAt, monthKey } from './MoneyCard';
import { addDays, daysBetween, shortDate, today } from '../dates';

const money = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

export default function SavingsGoals() {
  const store = useStore();
  const now = today();
  const month = monthKey(new Date());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', target: '', months: 3, account_id: '' as string });

  const bills = (store.bills ?? []).filter((b) => b.active && (b.kind === 'bill' || b.kind === 'debt'));
  const inc = store.income;
  const travel = inc ? (inc.daily_travel ?? 0) * inc.work_days.length * 52 / 12 : 0;
  const essentials = bills.reduce((s, b) => s + monthlyCost(b), 0) + travel;
  const savers = store.accounts.filter((a) => a.active && !a.is_debt);

  const saved = (g: SavingsGoal) => {
    const accts = g.account_id ? savers.filter((a) => a.id === g.account_id) : savers.filter((a) => !/current/i.test(a.name));
    return accts.reduce((s, a) => s + (balanceAt(a, month, store.balances) ?? 0), 0);
  };
  const growth = (g: SavingsGoal) => (g.account_id ? savers.filter((a) => a.id === g.account_id) : savers).reduce((s, a) => s + (a.daily_growth ?? 0), 0);
  const targetOf = (g: SavingsGoal) => (g.target ?? (essentials > 0 ? essentials * g.months : null));

  let used = 0;
  const startEdit = (g: SavingsGoal | null) => {
    setDraft(g ? { name: g.name, target: g.target === null ? '' : String(g.target), months: g.months, account_id: g.account_id ?? '' } : { name: '', target: '', months: 3, account_id: '' });
    if (g) setEditing(g.id); else setAdding(true);
  };
  const close = () => { setEditing(null); setAdding(false); };
  const submit = (g: SavingsGoal | null) => {
    const t = draft.target.trim() === '' ? null : Number(draft.target.replace(/[£,\s]/g, ''));
    if (!draft.name.trim() || (t !== null && !(t > 0))) return;
    const fields = { name: draft.name.trim(), target: t, months: draft.months, account_id: draft.account_id || null };
    if (g) store.updateGoal(g.id, fields); else store.addGoal(fields);
    close();
  };

  const form = (g: SavingsGoal | null) => (
    <div className="card stack bill-form">
      <label className="money-row"><span className="money-name">Name</span>
        <input className="step-input bill-name" aria-label="Goal name" placeholder="e.g. Holiday, New laptop" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="money-row"><span className="money-name">Target</span>
        <span className="money-input"><span aria-hidden="true">£</span><input inputMode="decimal" aria-label="Target amount" placeholder={g?.target === null ? 'auto' : '0'} value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} /></span></label>
      {draft.target.trim() === '' && (
        <label className="money-row"><span className="money-name">Months of essentials</span>
          <select className="select small-select" aria-label="Months of essentials" value={draft.months} onChange={(e) => setDraft({ ...draft, months: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select></label>
      )}
      <label className="money-row"><span className="money-name">Counts money in</span>
        <select className="select small-select" aria-label="Account" value={draft.account_id} onChange={(e) => setDraft({ ...draft, account_id: e.target.value })}>
          <option value="">All savings</option>
          {savers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
      {draft.target.trim() === '' && <p className="note">Leave the target empty for an emergency fund: it’s worked out from your bills and travel.</p>}
      <div className="row">
        <button type="button" className="btn primary small" onClick={() => submit(g)}>Save</button>
        <button type="button" className="btn small" onClick={close}>Cancel</button>
        {g && <button type="button" className="link-btn quiet push-right" onClick={() => { if (confirm(`Delete ${g.name}?`)) { store.deleteGoal(g.id); close(); } }}>Delete</button>}
      </div>
    </div>
  );

  return (
    <section className="section">
      <div className="between"><h2 className="h2">Savings goals</h2></div>
      {store.goals.map((g) => {
        // Goals share the same savings: each one only counts what the goals above it haven't used.
        const target = targetOf(g);
        const pool = Math.max(0, saved(g) - used);
        const have = target ? Math.min(pool, target) : pool;
        const spare = target && g.target === null ? pool - have : 0;
        used += have;
        if (editing === g.id) return <div key={g.id}>{form(g)}</div>;
        const pct = target ? Math.min(100, Math.round((have / target) * 100)) : 0;
        const perDay = growth(g);
        const left = target ? target - have : 0;
        const reach = target && left > 0 && perDay > 0 ? addDays(now, Math.ceil(left / perDay)) : null;
        return (
          <button key={g.id} type="button" className="card goal-card" onClick={() => startEdit(g)}>
            <div className="between"><span className="row-title">{g.name}</span><span className="bill-amount">{money(have)}{target ? ` of ${money(target)}` : ''}</span></div>
            {target ? <div className="bar"><i style={{ width: `${pct}%` }} /></div> : null}
            <span className="note">
              {target === null
                ? 'Add your bills above and this works out your target.'
                : left <= 0
                  ? g.target === null
                    ? `Covered: ${g.months} months of essentials (${money(essentials)} a month).${spare > 0 ? ` ${money(spare)} spare for other goals.` : ''}`
                    : 'Goal reached 🎉'
                  : `${money(left)} to go${g.target === null ? ` · ${g.months} months × ${money(essentials)} essentials` : ''}${reach ? ` · interest alone gets you there ${daysBetween(now, reach) > 60 ? `in about ${Math.round(daysBetween(now, reach) / 30.4)} months` : `by ${shortDate(reach)}`}` : ''}`}
            </span>
          </button>
        );
      })}
      {adding ? form(null) : <button type="button" className="btn small dashed" onClick={() => startEdit(null)}>+ Add a savings goal</button>}
    </section>
  );
}
