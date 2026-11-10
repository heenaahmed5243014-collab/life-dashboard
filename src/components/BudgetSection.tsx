// Budget, laid out like the screenshots: "£X left" with a pace chart, category rings,
// today's spending, upcoming bills, recent spending and monthly totals.
import { useState } from 'react';
import { useStore } from '../store';
import type { Budget, Spend } from '../types';
import { addDays, daysBetween, shortDate, today } from '../dates';
import { budgetView, guessCategory, monthlyTotals, statusColour, type CategoryStatus } from '../budget';
import { billsDue } from '../bills';
import { useToast } from '../toast';
import StatementImport from './StatementImport';
import { EyeIcon, useMoneyHidden } from '../hide';

export const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
);

const money = (n: number, dp = 2) => '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const whole = (n: number) => money(n, 0);

/** Pictures for the everyday budget categories (falls back to the category's emoji). */
const CAT_PIC: Record<string, string> = { eating_out: '/img/bowl.png', groceries: '/img/groceries.png', transport: '/img/transport.png' };

/** A picture or emoji for a bill, guessed from its name. */
function billPic(name: string): { img?: string; emoji: string } {
  const n = name.toLowerCase();
  if (/spotify|music|apple music|airpods/.test(n)) return { img: '/img/airpods.png', emoji: '🎧' };
  if (/gym|fitness|puregym/.test(n)) return { img: '/img/gym.png', emoji: '🏋️‍♀️' };
  if (/rent|mortgage|landlord/.test(n)) return { img: '/img/rent.png', emoji: '🏠' };
  if (/travel|oyster|tfl|train|transport/.test(n)) return { img: '/img/transport.png', emoji: '🚇' };
  if (/phone|mobile|\bee\b|o2|vodafone|three|giffgaff|iphone/.test(n)) return { img: '/img/iphone.png', emoji: '📱' };
  const table: [RegExp, string][] = [[/phone|mobile|ee\b|o2|vodafone|three|giffgaff/, '📱'], [/gym|fitness|pure|puregym/, '🏋️‍♀️'], [/rent|mortgage|landlord/, '🏠'],
    [/netflix|disney|prime|tv|now\b/, '🎬'], [/council/, '🏛️'], [/energy|gas|electric|octopus|british gas/, '⚡'], [/water/, '💧'], [/internet|broadband|wifi|bt\b|virgin/, '🛜'],
    [/insurance/, '🛡️'], [/icloud|google|storage|apple/, '☁️'], [/claude|chatgpt|ai\b/, '🤖'], [/loan|credit|klarna/, '💳'], [/travel|oyster|tfl|train/, '🚇']];
  return { emoji: table.find(([re]) => re.test(n))?.[1] ?? '🧾' };
}

export default function BudgetSection() {
  const store = useStore();
  const now = today();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [editing, setEditing] = useState<Spend | null>(null);
  const [hidden, toggleHidden] = useMoneyHidden();

  if (store.budgetReady === false) {
    return <section className="card"><p className="note">Budgets need database update 15. Ask Claude for the link.</p></section>;
  }
  const v = budgetView(store.budgets, store.spends, store.income, store.payslips, now);
  const dayFrac = v.dayIndex / v.days;
  const todays = store.spends.filter((s) => s.day === now);
  const recent = [...store.spends].filter((s) => s.day <= now).sort((a, b) => b.day.localeCompare(a.day) || b.id.localeCompare(a.id)).slice(0, 8);
  const upcoming = billsDue(store.bills ?? [], addDays(now, 1), addDays(now, 30)).slice(0, 6);
  const months = monthlyTotals(store.spends, store.budgets, now);
  const thisMonth = months[months.length - 1];
  const year = now.slice(0, 4);
  const yearMonths = months.filter((m) => m.key.startsWith(year) && m.total > 0);
  const yearTotal = store.spends.filter((s) => s.day.startsWith(year) && store.budgets.some((b) => b.key === s.category)).reduce((s, x) => s + x.amount, 0);
  const catOf = (key: string) => store.budgets.find((b) => b.key === key);

  return (
    <div className="budget stack">
      {/* Wallet: categories peek out of the top; the eye hides everything */}
      <section className={`wallet${hidden ? ' tucked' : ''}`} aria-label="Budget wallet">
        <div className="wallet-cards">
          {v.categories.slice(0, 3).map((c, i) => (
            <button key={c.budget.id} type="button" className={`wallet-card w${i}`} onClick={() => setDetail(c.budget.key)} tabIndex={hidden ? -1 : 0}>
              <span className="wallet-card-name">
                {CAT_PIC[c.budget.key] ? <img src={CAT_PIC[c.budget.key]} alt="" className="wallet-pic" /> : <span className="wallet-emoji" aria-hidden="true">{c.budget.emoji}</span>}
                {c.budget.name}
              </span>
              <span className={c.left < 0 ? 'wallet-card-amt over' : 'wallet-card-amt'}>{hidden ? '••••' : c.left < 0 ? `${whole(c.left)} over` : `${whole(c.left)} left`}</span>
            </button>
          ))}
        </div>
        <div className="wallet-pocket">
          <span className="wallet-big">{hidden ? '£ ••••' : <>{v.left < 0 ? '−' : ''}<small>£</small>{Math.floor(Math.abs(v.left)).toLocaleString('en-GB')}<small className="pence">.{String(Math.round((Math.abs(v.left) % 1) * 100)).padStart(2, '0')}</small></>}</span>
          <span className="wallet-sub">{v.left < 0 ? 'Over budget' : 'Left to spend'} · {shortDate(v.from)} – {shortDate(v.to)}</span>
          {!hidden && (
            <span className={`wallet-pace${v.pace < 0 ? ' over' : ''}`}>
              {v.pace < 0 && <img src="/img/purse.png" alt="" className="wallet-pic" />}
              {whole(v.pace)} {v.pace >= 0 ? 'under' : 'over'} pace · payday in {Math.max(0, daysBetween(now, addDays(v.to, 1)))} days
            </span>
          )}
          <button type="button" className="wallet-eye" onClick={toggleHidden} aria-pressed={hidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'}><EyeIcon off={hidden} /></button>
        </div>
      </section>
      <div className="duo-btns">
        <button type="button" className="duo-btn" onClick={() => setAdding(true)}><span className="duo-ic" aria-hidden="true">+</span>Add a spend</button>
        <button type="button" className="duo-btn" onClick={() => setImporting(true)}><span className="duo-ic" aria-hidden="true"><UploadIcon /></span>Statement</button>
      </div>
      {!hidden && (
        <section className="card">
          <div className="bud-label"><span>Pace</span><span>out of {whole(v.budgeted)} budgeted</span></div>
          <PaceChart v={v} />
        </section>
      )}

      {/* Today */}
      <section className="card">
        <div className="bud-label"><span>So far today</span><span>{money(todays.reduce((s, x) => s + x.amount, 0))}</span></div>
        {todays.length ? (
          <ul className="bud-list">{todays.map((s) => <SpendRow key={s.id} s={s} cat={catOf(s.category)} onTap={() => setEditing(s)} />)}</ul>
        ) : <p className="note">Nothing logged yet today. Tap “Add a spend” after you buy something.</p>}
      </section>

      {/* Rings */}
      <section className="card">
        <div className="bud-label"><span>Budgets</span><span>day {v.dayIndex} of {v.days}</span></div>
        <div className="rings">
          {v.categories.map((c) => <Ring key={c.budget.id} c={c} dayFrac={dayFrac} onTap={() => setDetail(c.budget.key)} />)}
        </div>
        <p className="note">Tap a ring to see it or change the budget.{v.categories.some((c) => c.auto) ? ' Transport is worked out from your travel until you log transport spends.' : ''}</p>
      </section>

      {/* Upcoming bills */}
      {upcoming.length > 0 && (
        <section className="card">
          <div className="bud-label"><span>Upcoming</span><span>bills</span></div>
          <ul className="up-rows">
            {upcoming.map(({ bill, day }) => {
              const n = daysBetween(now, day);
              const pic = billPic(bill.name);
              return (
                <li key={bill.id + day} className="up-row">
                  <span className="emoji-tile" aria-hidden="true">{pic.img ? <img src={pic.img} alt="" /> : pic.emoji}</span>
                  <span className="up-name"><b>{bill.name}</b><span className={`tag ${n <= 0 ? 'tag-today' : n <= 3 ? 't-amber' : ''}`}>{n <= 0 ? 'TODAY' : `${n} DAY${n === 1 ? '' : 'S'}`}</span></span>
                  <span className="up-amt"><b>{money(bill.amount)}</b><span className="note">{bill.frequency === 'weekly' ? 'per week' : bill.frequency === 'yearly' ? 'per year' : 'per month'}</span></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <section className="card">
          <div className="bud-label"><span>Recent spending</span><span>tap to change</span></div>
          <ul className="bud-list">{recent.map((s) => <SpendRow key={s.id} s={s} cat={catOf(s.category)} showDay onTap={() => setEditing(s)} />)}</ul>
        </section>
      )}

      {/* Monthly */}
      <section className="card bud-monthly">
        <div className="bud-label"><span>Monthly spending</span><span>everyday budgets</span></div>
        <div className="bud-month-head">
          <span className="note">Spent this month</span>
          <span className="bud-month-big">{money(thisMonth.total)}<i className={thisMonth.total > v.budgeted ? 'dot over' : 'dot'} /></span>
          <span className="note">{thisMonth.total > v.budgeted ? `${money(thisMonth.total - v.budgeted)} over` : `${money(v.budgeted - thisMonth.total)} under`}</span>
        </div>
        <MonthBars months={months} budget={v.budgeted} />
        <div className="bud-metrics">
          <div><span>Total spent this year</span><b>{money(yearTotal)}</b></div>
          <div><span>Average per month this year</span><b>{money(yearMonths.length ? yearTotal / yearMonths.length : 0)}</b></div>
        </div>
      </section>

      {adding && <SpendSheet onClose={() => setAdding(false)} />}
      {editing && <SpendSheet spend={editing} onClose={() => setEditing(null)} />}
      {detail && <CategorySheet keyName={detail} onClose={() => setDetail(null)} />}
      {importing && <StatementImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function PaceChart({ v }: { v: ReturnType<typeof budgetView> }) {
  const W = 320, H = 120, P = 8;
  const max = Math.max(v.budgeted, v.series[v.series.length - 1]?.spent ?? 0, 1) * 1.08;
  const x = (i: number) => P + (i / Math.max(1, v.days - 1)) * (W - P * 2);
  const y = (val: number) => H - P - (val / max) * (H - P * 2);
  const pts = v.series.map((s, i) => `${x(i).toFixed(1)},${y(s.spent).toFixed(1)}`).join(' ');
  const last = v.series[v.series.length - 1];
  const lx = x(v.series.length - 1), ly = y(last?.spent ?? 0);
  const under = v.pace >= 0;
  return (
    <div className="pace">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spent ${money(last?.spent ?? 0)} so far; ${under ? `${whole(v.pace)} under` : `${whole(v.pace)} over`} where you’d expect by today`}>
        <line x1={x(0)} y1={y(0)} x2={x(v.days - 1)} y2={y(v.budgeted)} className="pace-line" />
        <line x1={P} x2={W - P} y1={y(v.budgeted)} y2={y(v.budgeted)} className="pace-cap" />
        {v.series.length > 1 && <polyline points={pts} className={`pace-spent${under ? '' : ' over'}`} />}
        {last && <circle cx={lx} cy={ly} r="5" className={`pace-dot${under ? '' : ' over'}`} />}
      </svg>
      {last && (
        <span className={`pace-tag${under ? '' : ' over'}`} style={{ left: `${Math.min(78, (lx / W) * 100)}%`, top: `${Math.max(0, (ly / H) * 100 - 30)}%` }}>
          {whole(v.pace)} {under ? 'under' : 'over'}
        </span>
      )}
    </div>
  );
}

function Ring({ c, dayFrac, onTap }: { c: CategoryStatus; dayFrac: number; onTap: () => void }) {
  const R = 27, C = 2 * Math.PI * R;
  const st = statusColour(c.pct, dayFrac);
  return (
    <button type="button" className={`ring ${st}`} onClick={onTap} aria-label={`${c.budget.name}: ${c.left < 0 ? `${money(c.left)} over` : `${money(c.left)} left`} of ${money(c.budget.amount)}`}>
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
        <circle cx="34" cy="34" r={R} className="ring-bg" />
        <circle cx="34" cy="34" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, c.pct))} transform="rotate(-90 34 34)" />
        {CAT_PIC[c.budget.key] ? <image href={CAT_PIC[c.budget.key]} x="20" y="20" width="28" height="28" preserveAspectRatio="xMidYMid meet" /> : <text x="34" y="41" textAnchor="middle" fontSize="20">{c.budget.emoji}</text>}
      </svg>
      <b>{c.left < 0 ? money(c.left) : money(c.left, c.left >= 100 ? 0 : 2)}</b>
      <small>{c.left < 0 ? 'over' : 'left'}</small>
    </button>
  );
}

function SpendRow({ s, cat, showDay, onTap }: { s: Spend; cat?: Budget; showDay?: boolean; onTap: () => void }) {
  return (
    <li>
      <button type="button" className="spend-row" onClick={onTap}>
        <span className="spend-note">{s.note || cat?.name || 'Spend'}{showDay && <small> · {shortDate(s.day)}</small>}</span>
        <span className={`cat-pill${cat ? '' : ' other'}`}>{cat ? `${cat.emoji} ${cat.name}` : 'Other'}</span>
        <span className="spend-amt">{money(s.amount)}</span>
      </button>
    </li>
  );
}

function MonthBars({ months, budget, highlightLast = true }: { months: { key: string; label: string; total: number }[]; budget: number; highlightLast?: boolean }) {
  const W = 320, H = 110, P = 6;
  const max = Math.max(budget, ...months.map((m) => m.total), 1) * 1.1;
  const bw = (W - P * 2) / months.length;
  const y = (v: number) => H - 16 - (v / max) * (H - 26);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="month-bars" role="img" aria-label="Spending per month for the last 12 months">
      {budget > 0 && <line x1={P} x2={W - P} y1={y(budget)} y2={y(budget)} className="mb-budget" />}
      {months.map((m, i) => {
        const h = Math.max(m.total > 0 ? 2 : 0, H - 16 - y(m.total));
        const over = budget > 0 && m.total > budget;
        return (
          <g key={m.key}>
            <rect x={P + i * bw + bw * 0.18} y={H - 16 - h} width={bw * 0.64} height={h} rx="3" className={`mb-bar${over ? ' over' : ''}${highlightLast && i === months.length - 1 ? ' now' : ''}`} />
            <text x={P + i * bw + bw / 2} y={H - 3} textAnchor="middle" className="mb-label">{m.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SpendSheet({ spend, onClose }: { spend?: Spend; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const [amount, setAmount] = useState(spend ? String(spend.amount) : '');
  const [note, setNote] = useState(spend?.note ?? '');
  const [category, setCategory] = useState(spend?.category ?? store.budgets[0]?.key ?? 'other');
  const [day, setDay] = useState(spend?.day ?? now);
  const [picked, setPicked] = useState(Boolean(spend));
  const keys = store.budgets.map((b) => b.key);
  const save = () => {
    const n = Number(amount.replace(/[£,\s]/g, ''));
    if (!(n > 0)) { toast({ message: 'Type how much it was' }); return; }
    const fields = { amount: Math.round(n * 100) / 100, note: note.trim().slice(0, 120), category, day };
    if (spend) store.updateSpend(spend.id, fields);
    else store.addSpends([{ ...fields, source: 'manual' }]);
    const cat = store.budgets.find((b) => b.key === category);
    toast({ message: `${money(fields.amount)} ${spend ? 'updated' : `added to ${cat ? `${cat.emoji} ${cat.name}` : 'Other'}`}` });
    onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet spend-sheet" role="dialog" aria-modal="true" aria-label={spend ? 'Change spend' : 'Add a spend'}>
        <div className="sheet-head"><h2 className="sheet-title">{spend ? 'Change spend' : 'Add a spend'}</h2><button type="button" className="link-btn" onClick={onClose}>Close</button></div>
        <label className="amount-big"><span aria-hidden="true">£</span><input inputMode="decimal" autoFocus aria-label="Amount" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
        <input className="step-input" aria-label="What was it? (optional)" placeholder="What was it? e.g. Tesco, lunch" value={note} onChange={(e) => { setNote(e.target.value); if (!picked) { const g = guessCategory(e.target.value, keys); if (g !== 'other') setCategory(g); } }} />
        <div className="chips" role="radiogroup" aria-label="Category">
          {store.budgets.map((b) => <button key={b.key} type="button" role="radio" aria-checked={category === b.key} className={category === b.key ? 'chip on' : 'chip'} onClick={() => { setCategory(b.key); setPicked(true); }}>{b.emoji} {b.name}</button>)}
          <button type="button" role="radio" aria-checked={category === 'other'} className={category === 'other' ? 'chip on' : 'chip'} onClick={() => { setCategory('other'); setPicked(true); }}>Other</button>
        </div>
        <div className="chips" role="radiogroup" aria-label="When">
          {[['Today', now], ['Yesterday', addDays(now, -1)]].map(([l, d]) => <button key={d} type="button" role="radio" aria-checked={day === d} className={day === d ? 'chip on' : 'chip'} onClick={() => setDay(d)}>{l}</button>)}
          <label className={`chip chip-input${day !== now && day !== addDays(now, -1) ? ' on' : ''}`}>{day !== now && day !== addDays(now, -1) ? shortDate(day) : 'Date…'}<input type="date" aria-label="Pick a date" max={now} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={save}>{spend ? 'Save' : 'Add'}</button>
          {spend && <button type="button" className="link-btn quiet push-right" onClick={() => { store.deleteSpend(spend.id); toast({ message: 'Spend removed' }); onClose(); }}>Delete</button>}
        </div>
      </div>
    </div>
  );
}

function CategorySheet({ keyName, onClose }: { keyName: string; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const b = store.budgets.find((x) => x.key === keyName);
  const [amount, setAmount] = useState(b ? String(b.amount) : '');
  if (!b) return null;
  const v = budgetView(store.budgets, store.spends, store.income, store.payslips, now);
  const c = v.categories.find((x) => x.budget.key === keyName)!;
  const months = monthlyTotals(store.spends, store.budgets, now, 12, keyName);
  const list = store.spends.filter((s) => s.category === keyName && s.day >= v.from && s.day <= now).sort((a, b2) => b2.day.localeCompare(a.day));
  const saveAmount = () => {
    const n = Number(amount.replace(/[£,\s]/g, ''));
    if (!(n >= 0)) return;
    store.saveBudget({ ...b, amount: Math.round(n * 100) / 100 });
    toast({ message: `${b.emoji} ${b.name} budget: ${money(n, 0)} a month` });
  };
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet cat-sheet" role="dialog" aria-modal="true" aria-label={b.name}>
        <div className="sheet-head"><span className="eyebrow">Category</span><button type="button" className="link-btn" onClick={onClose}>Close</button></div>
        <h2 className="cat-title">{b.emoji} {b.name}</h2>
        <div className="cat-figs">
          <div><span>Spent</span><b>{money(c.spent)}</b></div>
          <div><span>Budget</span><b>{money(b.amount)}</b></div>
          <div><span>{c.left < 0 ? 'Over' : 'Left'}</span><b className={c.left < 0 ? 'over' : 'under'}>{money(c.left)}</b></div>
        </div>
        {c.auto && <p className="note">Worked out from your £{store.income?.daily_travel?.toFixed(2)} travel on work days. Log a transport spend and it switches to your real spends.</p>}
        <MonthBars months={months} budget={b.amount} />
        <label className="money-row">
          <span className="money-name">Budget per month</span>
          <span className="money-input"><span aria-hidden="true">£</span><input inputMode="decimal" aria-label={`${b.name} budget`} value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={saveAmount} onKeyDown={(e) => e.key === 'Enter' && saveAmount()} /></span>
        </label>
        {list.length > 0 && <ul className="bud-list">{list.slice(0, 12).map((s) => <li key={s.id} className="cat-spend"><span>{s.note || b.name} <small className="note">· {shortDate(s.day)}</small></span><span className="spend-amt">{money(s.amount)}</span></li>)}</ul>}
      </div>
    </div>
  );
}
