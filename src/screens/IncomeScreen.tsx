// Income: what you've earned this week and month (before tax, and an estimate of take-home),
// your daily rate and work days, and a log of payslips.
import { useState } from 'react';
import { useStore } from '../store';
import { addDays, daysLabel, shortDate, today, weekday, type Day } from '../dates';
import Nav from '../components/Nav';
import { DaysPicker } from '../components/Fields';
import { useToast } from '../toast';

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const roundMoney = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function workDaysBetween(from: Day, to: Day, days: number[]): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (days.includes(weekday(d))) n++;
  return n;
}

export default function IncomeScreen() {
  const store = useStore();
  const toast = useToast();
  const income = store.income ?? null;
  const payslips = store.payslips ?? [];
  const now = today();
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [slip, setSlip] = useState({ paid_on: now, gross: '', net: '' });

  if (store.income === undefined || (!income && !store.payslips)) {
    return (
      <>
        <main className="page">
          <header className="page-head"><h1 className="h1">Income</h1></header>
          <section className="card"><p className="note">Your database needs the income update first. Ask Claude for the latest Supabase update, run it, then reopen the app.</p></section>
        </main>
        <Nav current="income" />
      </>
    );
  }

  const r = income?.daily_rate ?? 0;
  const workDays = income?.work_days ?? [0, 1, 2, 3, 4];
  const latest = payslips[0];
  const takeHome = latest && latest.gross > 0 ? latest.net / latest.gross : null;
  const pct = takeHome ? Math.round(takeHome * 100) : null;

  const monday = addDays(now, -weekday(now));
  const sunday = addDays(monday, 6);
  const weekSoFar = workDaysBetween(monday, now, workDays);
  const weekAll = workDaysBetween(monday, sunday, workDays);
  const monthStart = now.slice(0, 8) + '01';
  const d = new Date(Number(now.slice(0, 4)), Number(now.slice(5, 7)), 0);
  const monthEndDay = now.slice(0, 8) + String(d.getDate()).padStart(2, '0');
  const monthSoFar = workDaysBetween(monthStart, now, workDays);
  const monthAll = workDaysBetween(monthStart, monthEndDay, workDays);
  const yearly = r * workDays.length * 52;
  const net = (n: number) => (takeHome ? ` · ≈ ${roundMoney(n * takeHome)} take-home` : '');

  const startEdit = () => {
    setRate(r ? String(r) : '');
    setDays(workDays);
    setEditing(true);
  };
  const saveRate = () => {
    const v = Number(rate.replace(/[£,\s]/g, ''));
    if (!Number.isFinite(v) || v < 0) return toast({ message: 'Type your daily pay as a number, e.g. 144.72' });
    store.setIncome({ daily_rate: Math.round(v * 100) / 100, work_days: days.length ? days : [0, 1, 2, 3, 4] });
    setEditing(false);
    toast({ message: 'Daily pay saved' });
  };
  const saveSlip = () => {
    const gross = Number(slip.gross.replace(/[£,\s]/g, ''));
    const n = Number(slip.net.replace(/[£,\s]/g, ''));
    if (!slip.paid_on || !Number.isFinite(gross) || !Number.isFinite(n) || gross <= 0 || n < 0) return toast({ message: 'Add the pay date, total pay and net pay' });
    store.addPayslip({ paid_on: slip.paid_on, gross: Math.round(gross * 100) / 100, net: Math.round(n * 100) / 100 });
    setSlip({ paid_on: now, gross: '', net: '' });
    setAdding(false);
    toast({ message: 'Payslip saved' });
  };

  return (
    <>
      <main className="page income-page">
        <header className="page-head">
          <h1 className="h1">Income</h1>
          <p className="sub">Before tax, with take-home estimated from your latest payslip.</p>
        </header>

        <section className="card hero">
          <div className="between"><span className="eyebrow">This week</span><span className="count">{weekSoFar} of {weekAll} days</span></div>
          <div className="big-money">{money(r * weekSoFar)}</div>
          <p className="note">of {money(r * weekAll)} this week{net(r * weekAll)}</p>
          <div className="progress"><div className="bar"><i style={{ width: `${weekAll ? (weekSoFar / weekAll) * 100 : 0}%` }} /></div></div>
        </section>

        <section className="card">
          <div className="between"><span className="eyebrow">{MONTHS[Number(now.slice(5, 7)) - 1]}</span><span className="count">{monthSoFar} of {monthAll} days</span></div>
          <div className="mid-money">{money(r * monthSoFar)} <span className="note">so far</span></div>
          <p className="note">{money(r * monthAll)} expected this month{net(r * monthAll)}</p>
          <div className="progress"><div className="bar"><i style={{ width: `${monthAll ? (monthSoFar / monthAll) * 100 : 0}%` }} /></div></div>
        </section>

        <section className="card">
          <div className="between"><span className="eyebrow">Your pay</span>{!editing && <button type="button" className="link-btn" onClick={startEdit}>Edit</button>}</div>
          {editing ? (
            <div className="stack">
              <label className="money-row">
                <span className="money-name">Daily pay (before tax)</span>
                <span className="money-input"><span aria-hidden="true">£</span><input inputMode="decimal" aria-label="Daily pay" value={rate} onChange={(e) => setRate(e.target.value)} /></span>
              </label>
              <span className="note">Days you work</span>
              <DaysPicker value={days} onChange={setDays} />
              <div className="row">
                <button type="button" className="btn primary small" onClick={saveRate}>Save</button>
                <button type="button" className="btn small" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mid-money">{money(r)} <span className="note">a day · {daysLabel(workDays)}</span></div>
              <div className="meta">
                {takeHome && <span className="tag t-sage">≈ {money(r * takeHome)} a day take-home ({pct}%)</span>}
                <span className="tag">≈ {roundMoney(yearly)} a year before tax</span>
              </div>
              <p className="note">Assumes every work day is paid. Holidays and sick days show on your payslips.</p>
            </>
          )}
        </section>

        <section className="section">
          <div className="between"><h2 className="h2">Payslips</h2><span className="count">{payslips.length}</span></div>
          {payslips.map((p) => (
            <div key={p.id} className="payslip-row">
              <span className="payslip-date">{shortDate(p.paid_on)}</span>
              <span className="payslip-figures">
                <span>{money(p.gross)} <span className="note">total</span></span>
                <span className="payslip-net">{money(p.net)} <span className="note">take-home{p.gross ? ` · ${Math.round((p.net / p.gross) * 100)}%` : ''}</span></span>
              </span>
              <button type="button" className="slot-x" aria-label={`Delete payslip for ${shortDate(p.paid_on)}`} onClick={() => { if (confirm('Delete this payslip?')) store.deletePayslip(p.id); }}>×</button>
            </div>
          ))}
          {adding ? (
            <div className="card stack">
              <label className="money-row"><span className="money-name">Paid on</span><input type="date" className="step-input date-plain" value={slip.paid_on} onChange={(e) => setSlip({ ...slip, paid_on: e.target.value })} /></label>
              <label className="money-row"><span className="money-name">Total pay (gross)</span><span className="money-input"><span aria-hidden="true">£</span><input inputMode="decimal" aria-label="Total pay" value={slip.gross} onChange={(e) => setSlip({ ...slip, gross: e.target.value })} /></span></label>
              <label className="money-row"><span className="money-name">Net pay (take-home)</span><span className="money-input"><span aria-hidden="true">£</span><input inputMode="decimal" aria-label="Net pay" value={slip.net} onChange={(e) => setSlip({ ...slip, net: e.target.value })} /></span></label>
              <div className="row">
                <button type="button" className="btn primary small" onClick={saveSlip}>Save payslip</button>
                <button type="button" className="btn small" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn small dashed" onClick={() => setAdding(true)}>+ Add a payslip</button>
          )}
          <p className="note">Just the totals. Keep the payslip itself somewhere safe; it has your NI number on it.</p>
        </section>
      </main>
      <Nav current="income" />
    </>
  );
}
