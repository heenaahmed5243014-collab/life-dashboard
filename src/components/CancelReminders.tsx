// Today: subscriptions you said you want to cancel, from a week before they renew.
import { useStore } from '../store';
import { daysBetween, shortDate, today } from '../dates';
import { monthlyCost } from '../bills';
import { useMoneyMask } from '../pin';
import { useToast } from '../toast';

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CancelReminders() {
  const store = useStore();
  const toast = useToast();
  const mask = useMoneyMask();
  const now = today();
  const due = (store.bills ?? []).filter((b) => b.active && b.cancel_by && daysBetween(now, b.cancel_by) <= 7)
    .sort((a, b) => a.cancel_by!.localeCompare(b.cancel_by!));
  if (!due.length) return null;
  return (
    <section className="card cancel-card" aria-label="Subscriptions to cancel">
      <div className="between"><span className="eyebrow">✂️ Cancel before they renew</span><span className="count">{due.length}</span></div>
      <ul className="check-list in-card">
        {due.map((b) => {
          const n = daysBetween(now, b.cancel_by!);
          return (
            <li key={b.id} className="check-row static cancel-row">
              <span className="row-title">{b.name} <span className="note">· {mask(money(b.amount))}</span></span>
              <span className="meta">
                <span className={`tag ${n <= 2 ? 'tag-today' : 't-amber'}`}>{n < 0 ? `May have renewed ${shortDate(b.cancel_by!)}` : n === 0 ? 'Renews today' : `Renews in ${n} day${n === 1 ? '' : 's'} · ${shortDate(b.cancel_by!)}`}</span>
              </span>
              <span className="row cancel-btns">
                <button type="button" className="btn primary small" onClick={() => { store.updateBill(b.id, { active: false, cancel_by: null }); toast({ message: mask(`${b.name} cancelled. ${money(monthlyCost(b))} a month back 🎉`) }); }}>Done, cancelled</button>
                <button type="button" className="btn small" onClick={() => store.updateBill(b.id, { cancel_by: null })}>Keep it</button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
