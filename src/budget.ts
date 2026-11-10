// Budget maths: each budget runs for a pay month (payday to the day before the next payday).
// Transport fills itself in from your daily travel on work days, unless you log transport spends yourself.
import type { Budget, IncomeSettings, Payslip, Spend } from './types';
import { addDays, daysBetween, parseDay, weekday, type Day } from './dates';
import { payPeriod } from './bills';

export interface CategoryStatus {
  budget: Budget;
  spent: number;
  left: number; // negative = over
  pct: number; // spent / budget
  auto: boolean; // transport estimated from your travel
}

export interface BudgetView {
  from: Day;
  to: Day; // last day of this pay month
  dayIndex: number; // 1-based day of the period
  days: number;
  budgeted: number;
  spent: number;
  left: number;
  pace: number; // + = under where you'd expect to be by today, - = over
  categories: CategoryStatus[];
  series: { day: Day; spent: number }[]; // cumulative, up to today
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function autoTravel(income: IncomeSettings | null, from: Day, to: Day): number {
  if (!income?.daily_travel) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (income.work_days.includes(weekday(d))) n++;
  return n * income.daily_travel;
}

export function budgetView(budgets: Budget[], spends: Spend[], income: IncomeSettings | null, payslips: Payslip[], now: Day): BudgetView {
  const p = payPeriod(payslips, now);
  const from = p.last;
  const to = addDays(p.next, -1);
  const days = daysBetween(from, to) + 1;
  const dayIndex = Math.min(days, daysBetween(from, now) + 1);
  const inRange = spends.filter((s) => s.day >= from && s.day <= now);
  const categories = budgets.map((b) => {
    const mine = inRange.filter((s) => s.category === b.key);
    const auto = b.key === 'transport' && mine.length === 0 && Boolean(income?.daily_travel);
    const spent = r2(auto ? autoTravel(income, from, now) : mine.reduce((s, x) => s + x.amount, 0));
    return { budget: b, spent, left: r2(b.amount - spent), pct: b.amount ? spent / b.amount : spent > 0 ? 2 : 0, auto };
  });
  const budgeted = r2(budgets.reduce((s, b) => s + b.amount, 0));
  const spent = r2(categories.reduce((s, c) => s + c.spent, 0));
  const autoTransport = categories.some((c) => c.auto);
  const keys = new Set(budgets.map((b) => b.key));
  const series: BudgetView['series'] = [];
  let run = 0;
  for (let d = from; d <= now && d <= to; d = addDays(d, 1)) {
    run += inRange.filter((s) => s.day === d && keys.has(s.category) && !(autoTransport && s.category === 'transport')).reduce((s, x) => s + x.amount, 0);
    if (autoTransport && income?.work_days.includes(weekday(d))) run += income.daily_travel ?? 0;
    series.push({ day: d, spent: r2(run) });
  }
  return { from, to, dayIndex, days, budgeted, spent, left: r2(budgeted - spent), pace: r2((budgeted * dayIndex) / days - spent), categories, series };
}

export const statusColour = (pct: number, dayFrac: number) => (pct > 1 ? 'over' : pct > Math.max(0.85, dayFrac + 0.15) ? 'warn' : 'ok');

/** Spending per calendar month (logged spends in budget categories), oldest first. */
export function monthlyTotals(spends: Spend[], budgets: Budget[], now: Day, months = 12, onlyKey?: string) {
  const keys = new Set(onlyKey ? [onlyKey] : budgets.map((b) => b.key));
  const n = parseDay(now);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(n.getFullYear(), n.getMonth() - (months - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = spends.filter((s) => s.day.startsWith(key) && keys.has(s.category)).reduce((s, x) => s + x.amount, 0);
    return { key, label: 'JFMAMJJASOND'[d.getMonth()], total: r2(total) };
  });
}

/** Guess a category from a payee or note (used for statements and quick logging). */
export function guessCategory(text: string, keys: string[]): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/tesco|sainsbury|asda|aldi|lidl|co-?op|morrisons|waitrose|m&s food|iceland|ocado|grocer|supermarket|food shop/, 'groceries'],
    [/pret|starbucks|costa|nero|greggs|mcdonald|kfc|nando|deliveroo|uber ?eats|just ?eat|restaurant|cafe|café|coffee|lunch|dinner|brunch|pizza|burger|takeaway|drinks|bar\b|pub\b/, 'eating_out'],
    [/tfl|oyster|uber(?! ?eats)|bolt|trainline|train|rail|bus\b|taxi|petrol|fuel|parking|shell|bp\b|esso|travel/, 'transport'],
  ];
  for (const [re, k] of rules) if (re.test(t) && keys.includes(k)) return k;
  return 'other';
}
