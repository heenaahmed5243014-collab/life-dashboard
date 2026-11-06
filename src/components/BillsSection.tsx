// Bills & subscriptions on the Money tab: add, edit, pause or delete; see when each is next due.
import { useState } from 'react';
import { useStore } from '../store';
import type { Bill, BillFrequency, BillKind } from '../types';
import { nextDue, monthlyCost } from '../bills';
import { shortDate, today, WEEKDAY_SHORT } from '../dates';
import { Segmented } from './Fields';
import { useToast } from '../toast';

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KINDS: { value: BillKind; label: string }[] = [
  { value: 'bill', label: 'Bill' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'debt', label: 'Debt' },
  { value: 'saving', label: 'Saving' },
];
const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

export function scheduleText(b: Bill): string {
  if (b.frequency === 'weekly') return `Every ${WEEKDAY_SHORT[b.due_day]}`;
  if (b.frequency === 'yearly') return `Every year, ${b.due_day} ${MONTHS[(b.due_month ?? 1) - 1]}`;
  return `Monthly on the ${ordinal(b.due_day)}`;
}

interface Draft {
  name: string;
  amount: string;
  frequency: BillFrequency;
  due_day: number;
  due_month: number;
  kind: BillKind;
}
const blank: Draft = { name: '', amount: '', frequency: 'monthly', due_day: 1, due_month: 1, kind: 'bill' };

function BillForm({ initial, onSave, onCancel, onDelete }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void; onDelete?: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const set = (x: Partial<Draft>) => setD({ ...d, ...x });
  return (
    <div className="card stack bill-form">
      <label className="money-row">
        <span className="money-name">Name</span>
        <input className="step-input bill-name" aria-label="Bill name" placeholder="e.g. Phone, Netflix, Rent" value={d.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="money-row">
        <span className="money-name">Amount</span>
        <span className="money-input"><span aria-hidden="true">£</span><input inputMode="decimal" aria-label="Amount" placeholder="0.00" value={d.amount} onChange={(e) => set({ amount: e.target.value })} /></span>
      </label>
      <Segmented<BillFrequency>
        label="How often"
        value={d.frequency}
        onChange={(frequency) => set({ frequency, due_day: frequency === 'weekly' ? 0 : Math.max(1, d.due_day) })}
        options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]}
      />
      {d.frequency === 'weekly' ? (
        <div className="chips" role="radiogroup" aria-label="Day of the week">
          {WEEKDAY_SHORT.map((w, i) => (
            <button key={w} type="button" role="radio" aria-checked={d.due_day === i} className={d.due_day === i ? 'chip on' : 'chip'} onClick={() => set({ due_day: i })}>{w}</button>
          ))}
        </div>
      ) : (
        <div className="money-row">
          <span className="money-name">{d.frequency === 'yearly' ? 'Date each year' : 'Day of the month'}</span>
          <select className="select small-select" aria-label="Day of the month" value={d.due_day} onChange={(e) => set({ due_day: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{ordinal(n)}</option>)}
          </select>
          {d.frequency === 'yearly' && (
            <select className="select small-select" aria-label="Month" value={d.due_month} onChange={(e) => set({ due_month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="chips" role="radiogroup" aria-label="Type">
        {KINDS.map((k) => (
          <button key={k.value} type="button" role="radio" aria-checked={d.kind === k.value} className={d.kind === k.value ? 'chip on' : 'chip'} onClick={() => set({ kind: k.value })}>{k.label}</button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn primary small" onClick={() => onSave(d)}>Save</button>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="link-btn quiet push-right" onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}

export default function BillsSection() {
  const store = useStore();
  const toast = useToast();
  const bills = store.bills ?? [];
  const now = today();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const monthly = bills.reduce((s, b) => s + monthlyCost(b), 0);
  const sorted = [...bills].sort((a, b) => (nextDue(a, now) ?? '9999').localeCompare(nextDue(b, now) ?? '9999'));

  const toBill = (d: Draft) => {
    const amount = Number(d.amount.replace(/[£,\s]/g, ''));
    if (!d.name.trim() || !Number.isFinite(amount) || amount < 0) {
      toast({ message: 'Add a name and an amount' });
      return null;
    }
    return { name: d.name.trim(), amount: Math.round(amount * 100) / 100, frequency: d.frequency, due_day: d.due_day, due_month: d.frequency === 'yearly' ? d.due_month : null, kind: d.kind };
  };

  return (
    <section className="section">
      <div className="between"><h2 className="h2">Bills & subscriptions</h2><span className="count">{money(monthly)} a month</span></div>
      {bills.length === 0 && !adding && <p className="note">Add your regular payments once: rent, phone, gym, streaming, Klarna… The app then shows what's coming out before payday.</p>}
      {sorted.map((b) => {
        const due = nextDue(b, now);
        return editing === b.id ? (
          <BillForm
            key={b.id}
            initial={{ name: b.name, amount: String(b.amount), frequency: b.frequency, due_day: b.due_day, due_month: b.due_month ?? 1, kind: b.kind }}
            onCancel={() => setEditing(null)}
            onDelete={() => { if (confirm(`Delete ${b.name}?`)) { store.deleteBill(b.id); setEditing(null); } }}
            onSave={(d) => { const x = toBill(d); if (x) { store.updateBill(b.id, x); setEditing(null); } }}
          />
        ) : (
          <button key={b.id} type="button" className={`bill-row${b.active ? '' : ' paused'}`} onClick={() => setEditing(b.id)}>
            <span className="bill-main">
              <span className="row-title">{b.name}</span>
              <span className="row-meta">{scheduleText(b)}{b.active && due ? ` · next ${shortDate(due)}` : ''}{!b.active ? ' · paused' : ''}</span>
            </span>
            <span className="bill-side">
              <span className="bill-amount">{money(b.amount)}</span>
              <span className={`tag ${b.kind === 'subscription' ? 't-violet' : b.kind === 'debt' ? 't-amber' : b.kind === 'saving' ? 't-sage' : ''}`}>{KINDS.find((k) => k.value === b.kind)!.label}</span>
            </span>
          </button>
        );
      })}
      {adding ? (
        <BillForm
          initial={blank}
          onCancel={() => setAdding(false)}
          onSave={(d) => { const x = toBill(d); if (x) { store.addBill(x); setAdding(false); toast({ message: `${x.name} added` }); } }}
        />
      ) : (
        <button type="button" className="btn small dashed" onClick={() => setAdding(true)}>+ Add a bill or subscription</button>
      )}
    </section>
  );
}
