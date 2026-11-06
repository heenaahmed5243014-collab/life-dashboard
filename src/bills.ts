// Bills and subscriptions: when each one leaves your account, and "spending money until payday".
import type { Bill, IncomeSettings, Payslip } from './types';
import { addDays, daysBetween, parseDay, toDay, weekday, type Day } from './dates';

const lastDayOf = (y: number, m: number) => new Date(y, m + 1, 0).getDate(); // m is 0-based

/** Every date a bill is due between from and to (inclusive). */
export function billDates(b: Bill, from: Day, to: Day): Day[] {
  const out: Day[] = [];
  if (!b.active) return out;
  if (b.frequency === 'weekly') {
    for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) === b.due_day) out.push(d);
    return out;
  }
  const start = parseDay(from);
  const end = parseDay(to);
  for (let y = start.getFullYear(), m = start.getMonth(); y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth()); m === 11 ? (y++, (m = 0)) : m++) {
    if (b.frequency === 'yearly' && b.due_month !== m + 1) continue;
    const day = Math.min(Math.max(1, b.due_day), lastDayOf(y, m)); // e.g. the 31st becomes the 30th in a 30-day month
    const d = toDay(new Date(y, m, day));
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

export function nextDue(b: Bill, now: Day): Day | null {
  return billDates(b, now, addDays(now, 400))[0] ?? null;
}

/** Bills due between two days, soonest first. */
export function billsDue(bills: Bill[], from: Day, to: Day): { bill: Bill; day: Day }[] {
  return bills.flatMap((bill) => billDates(bill, from, to).map((day) => ({ bill, day }))).sort((a, b) => a.day.localeCompare(b.day));
}

/** How much a bill costs per month on average (weekly x 52/12, yearly / 12). */
export function monthlyCost(b: Bill): number {
  if (!b.active) return 0;
  return b.frequency === 'weekly' ? (b.amount * 52) / 12 : b.frequency === 'yearly' ? b.amount / 12 : b.amount;
}

/** Payday = the day of the month of your latest payslip (1st if none). Returns the last and next paydays. */
export function payPeriod(payslips: Payslip[], now: Day): { last: Day; next: Day; payDay: number } {
  const payDay = payslips[0] ? Number(payslips[0].paid_on.slice(8, 10)) : 1;
  const n = parseDay(now);
  const thisMonth = toDay(new Date(n.getFullYear(), n.getMonth(), Math.min(payDay, lastDayOf(n.getFullYear(), n.getMonth()))));
  if (thisMonth <= now) {
    const nm = new Date(n.getFullYear(), n.getMonth() + 1, 1);
    return { last: thisMonth, next: toDay(new Date(nm.getFullYear(), nm.getMonth(), Math.min(payDay, lastDayOf(nm.getFullYear(), nm.getMonth())))), payDay };
  }
  const pm = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  return { last: toDay(new Date(pm.getFullYear(), pm.getMonth(), Math.min(payDay, lastDayOf(pm.getFullYear(), pm.getMonth())))), next: thisMonth, payDay };
}

export interface SpendingMoney {
  pay: number; // take-home for this pay period
  payIsEstimate: boolean;
  billsTotal: number; // bills due from today until the day before payday
  travelTotal: number; // travel on work days from today until payday
  left: number; // pay - bills - travel for the whole period (before your own spending)
  perWeek: number; // left spread over the weeks until payday
  daysToPayday: number;
}

/**
 * "Spending money until payday": this period's take-home, minus bills due in the period
 * and travel on work days, spread over the weeks left. A plan, not a live balance.
 */
export function spendingMoney(bills: Bill[], income: IncomeSettings | null, payslips: Payslip[], now: Day): SpendingMoney | null {
  if (!income) return null;
  const { last, next } = payPeriod(payslips, now);
  const periodEnd = addDays(next, -1);
  const latest = payslips[0];
  let pay: number;
  let payIsEstimate = false;
  if (latest && latest.paid_on >= last) {
    pay = latest.net;
  } else {
    // No payslip yet for this period: estimate from the daily rate and the last take-home %
    const ratio = latest && latest.gross > 0 ? latest.net / latest.gross : 0.76;
    let days = 0;
    for (let d = last; d <= periodEnd; d = addDays(d, 1)) if (income.work_days.includes(weekday(d))) days++;
    pay = income.daily_rate * days * ratio;
    payIsEstimate = true;
  }
  const billsTotal = billsDue(bills, last, periodEnd).reduce((s, x) => s + x.bill.amount, 0);
  let travelDays = 0;
  for (let d = last; d <= periodEnd; d = addDays(d, 1)) if (income.work_days.includes(weekday(d))) travelDays++;
  const travelTotal = (income.daily_travel ?? 0) * travelDays;
  const left = pay - billsTotal - travelTotal;
  const periodDays = Math.max(1, daysBetween(last, next));
  return { pay, payIsEstimate, billsTotal, travelTotal, left, perWeek: (left / periodDays) * 7, daysToPayday: daysBetween(now, next) };
}
