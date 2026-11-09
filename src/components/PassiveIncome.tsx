// Passive income: interest your savings earn (e.g. Chase saver and Cash ISA).
// Kept separate from pay and NOT added to spending money, because it stays in your savings.
// It's estimated from each account's last real balance; every balance check resets the estimate,
// so it can't keep compounding on top of itself.
import { useStore } from '../store';
import { dailyInterest } from './MoneyCard';
import { daysBetween, shortDate, today } from '../dates';

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PassiveIncome() {
  const store = useStore();
  const now = today();
  const monthStart = `${now.slice(0, 7)}-01`;
  const rows = store.accounts
    .filter((a) => a.active && !a.is_debt && ((a.aer ?? 0) > 0 || (a.daily_growth ?? 0) > 0))
    .map((a) => {
      const last = store.balances.filter((b) => b.account_id === a.id).sort((x, y) => (y.recorded_on ?? y.month).localeCompare(x.recorded_on ?? x.month))[0];
      const base = last?.amount ?? 0;
      const perDay = dailyInterest(a, base);
      const from = last ? (last.recorded_on ?? last.month) : now;
      const sinceCheck = perDay * Math.max(0, daysBetween(from, now));
      const thisMonth = perDay * Math.max(0, daysBetween(monthStart > from ? monthStart : from, now) + (monthStart > from ? 1 : 0));
      return { a, base, perDay, from, sinceCheck, thisMonth, hasBalance: Boolean(last) };
    });
  if (!rows.length) {
    return (
      <section className="card stack">
        <span className="eyebrow">Passive income</span>
        <p className="note">Add an interest rate (AER %) to a savings account on the Net worth card (Update balances), and the interest it earns shows here.</p>
      </section>
    );
  }
  const perDay = rows.reduce((s, r) => s + r.perDay, 0);
  const month = rows.reduce((s, r) => s + r.thisMonth, 0);
  return (
    <section className="card stack" aria-label="Passive income">
      <div className="between"><span className="eyebrow">Passive income · interest</span><span className="count">{money(perDay)} a day</span></div>
      <div className="stmt-flow">
        <span><span className="note">This month so far</span><b>≈ {money(month)}</b></span>
        <span><span className="note">A year at this rate</span><b>≈ {money(perDay * 365)}</b></span>
      </div>
      <ul className="due-list">
        {rows.map((r) => (
          <li key={r.a.id}>
            <span className="due-name">{r.a.name}<span className="note"> · {r.a.aer ? `${r.a.aer}% on ${money(r.base)}` : 'fixed amount'}</span></span>
            <span className="due-amount">{money(r.perDay)}/day</span>
          </li>
        ))}
      </ul>
      <p className="note">
        Stays in your savings, so it isn’t added to spending money. It’s worked out from each account’s last real balance
        {rows.some((r) => r.hasBalance) ? ` (checked ${shortDate(rows.map((r) => r.from).sort()[0])})` : ''}; your monthly balance check resets it, so it can’t snowball.
        {rows.some((r) => !r.a.aer) ? ' Tip: give each account its interest rate (AER %) so the amount follows your balance.' : ''}
      </p>
    </section>
  );
}
