// Month in review (on Money): where the money went last month and realistic places to cut.
// Built from your logged spends, uploaded statements and subscriptions. Nothing leaves the phone.
import { useState } from 'react';
import { useStore } from '../store';
import { monthlyCost } from '../bills';
import type { Spend } from '../types';

const money = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const key = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;

/** A shop/place name from a spend note ("Costa Coffee 12/11" -> "costa coffee"). */
const placeOf = (note: string) => note.toLowerCase().replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');

export default function MonthReview() {
  const store = useStore();
  const d = new Date();
  // Default to last month; in the last week of a month you can look at this one too.
  const [offset, setOffset] = useState(1);
  const ref = new Date(d.getFullYear(), d.getMonth() - offset, 1);
  const mk = key(ref.getFullYear(), ref.getMonth());
  const inMonth = (s: Spend, k: string) => s.day.startsWith(k);
  const spends = store.spends.filter((s) => inMonth(s, mk));
  const prevKeys = [1, 2, 3].map((i) => { const p = new Date(ref.getFullYear(), ref.getMonth() - i, 1); return key(p.getFullYear(), p.getMonth()); });
  const subs = (store.bills ?? []).filter((b) => b.active && b.kind === 'subscription');
  const subsMonthly = subs.reduce((t, b) => t + monthlyCost(b), 0);

  const total = spends.reduce((t, s) => t + s.amount, 0);
  const cats = store.budgets.map((b) => {
    const spent = spends.filter((s) => s.category === b.key).reduce((t, s) => t + s.amount, 0);
    const before = prevKeys.map((k) => store.spends.filter((s) => inMonth(s, k) && s.category === b.key).reduce((t, s) => t + s.amount, 0)).filter((x) => x > 0);
    const avg = before.length ? before.reduce((a, x) => a + x, 0) / before.length : null;
    const count = spends.filter((s) => s.category === b.key).length;
    return { b, spent, avg, count, over: spent - b.amount };
  });

  // Places you went to again and again
  const byPlace = new Map<string, { n: number; t: number }>();
  for (const s of spends) {
    const p = placeOf(s.note);
    if (!p) continue;
    const x = byPlace.get(p) ?? { n: 0, t: 0 };
    byPlace.set(p, { n: x.n + 1, t: x.t + s.amount });
  }
  const regulars = [...byPlace.entries()].filter(([, v]) => v.n >= 3).sort((a, b) => b[1].t - a[1].t).slice(0, 3);
  const biggest = [...spends].sort((a, b) => b.amount - a.amount).slice(0, 3);

  // Suggestions, each with a realistic saving
  const tips: { text: string; save: number }[] = [];
  for (const c of cats) {
    if (c.over > 5) tips.push({ text: `${c.b.emoji} ${c.b.name} went ${money(c.over)} over its ${money(c.b.amount)} budget.`, save: c.over });
    else if (c.avg && c.spent > c.avg * 1.2 && c.spent - c.avg > 10) tips.push({ text: `${c.b.emoji} ${c.b.name} was ${money(c.spent - c.avg)} above your usual month.`, save: c.spent - c.avg });
  }
  const eat = cats.find((c) => c.b.key === 'eating_out');
  if (eat && eat.count >= 4) {
    const each = eat.spent / eat.count;
    tips.push({ text: `🍽️ You ate out ${eat.count} times (about ${money(each)} each). Two fewer would save around ${money(each * 2)}.`, save: each * 2 });
  }
  for (const [p, v] of regulars) {
    if (v.n >= 4) tips.push({ text: `☕ ${p.replace(/\b\w/g, (c) => c.toUpperCase())} ${v.n} times, ${money(v.t)} in total. Halving it saves ${money(v.t / 2)}.`, save: v.t / 2 });
  }
  if (subs.length) tips.push({ text: `📺 ${subs.length} subscription${subs.length === 1 ? '' : 's'} cost ${money(subsMonthly)} a month (${money(subsMonthly * 12)} a year). Cancel any you don’t use: tap “Want to cancel?” under it in Bills.`, save: 0 });
  const saving = tips.reduce((t, x) => t + x.save, 0);

  return (
    <section className="card month-review" aria-label="Month in review">
      <div className="between">
        <span className="eyebrow">🧾 Month in review</span>
        <span className="mr-nav">
          <button type="button" className="icon-btn small" aria-label="Earlier month" onClick={() => setOffset((o) => Math.min(12, o + 1))}>‹</button>
          <b>{MONTHS[ref.getMonth()]}</b>
          <button type="button" className="icon-btn small" aria-label="Later month" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))}>›</button>
        </span>
      </div>
      {spends.length === 0 ? (
        <p className="note">No spending logged for {MONTHS[ref.getMonth()]}. Upload that month’s statement on the wallet card and your review appears here.</p>
      ) : (
        <>
          <div className="mr-head">
            <div><span className="note">Spent</span><b>{money(total)}</b></div>
            {saving >= 5 && <div className="mr-save"><span className="note">You could save</span><b>~{money(saving)}</b></div>}
          </div>
          <ul className="mr-cats">
            {cats.filter((c) => c.spent > 0 || c.b.amount > 0).map((c) => (
              <li key={c.b.id}>
                <span>{c.b.emoji} {c.b.name}</span>
                <span className="mr-bar"><i className={c.over > 0 ? 'over' : ''} style={{ width: `${Math.min(100, c.b.amount ? (c.spent / c.b.amount) * 100 : 100)}%` }} /></span>
                <b className={c.over > 0 ? 'over' : ''}>{money(c.spent)}<small> / {money(c.b.amount)}</small></b>
              </li>
            ))}
          </ul>
          {tips.length > 0 && (
            <div className="mr-tips">
              <span className="eyebrow">Where you could cut</span>
              <ul>{tips.map((t, i) => <li key={i}>{t.text}</li>)}</ul>
            </div>
          )}
          {biggest.length > 0 && (
            <p className="note">Biggest spends: {biggest.map((s) => `${s.note || 'Unnamed'} ${money(s.amount)}`).join(' · ')}</p>
          )}
        </>
      )}
    </section>
  );
}
