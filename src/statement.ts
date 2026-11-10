// Reads a bank statement CSV on the phone. Nothing is uploaded: only the closing balance
// (and its date) is saved, to the account you pick. Works with the usual UK exports:
// one signed "Amount" column, or separate "Paid in" / "Paid out" (Credit / Debit) columns,
// with or without a "Balance" column.

export interface StatementSummary {
  from: string; // YYYY-MM-DD
  to: string;
  count: number;
  moneyIn: number;
  moneyOut: number;
  /** Closing balance from the file's Balance column, if it has one. */
  closing: number | null;
  /** Biggest spending, by category if the file has one, else by payee. */
  top: { name: string; amount: number }[];
  topBy: 'category' | 'payee';
}

/** Splits CSV text into rows, handling quotes and commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const delim = (clean.split(/\r?\n/).find((l) => l.trim()) ?? '').split(';').length > (clean.split(/\r?\n/).find((l) => l.trim()) ?? '').split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/** UK-style dates: 05/11/2026, 05-11-26, 2026-11-05, 5 Nov 2026. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (+m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return null;
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  m = t.match(/^(\d{1,2})\s*([A-Za-z]{3})[A-Za-z]*\s*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`;
  }
  return null;
}

/** "£1,234.56", "-12.30", "(12.30)", "12.30 DR" -> number (or null if empty). */
export function parseAmount(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bDR\b/i.test(t)) neg = true;
  t = t.replace(/\b(CR|DR)\b/gi, '').replace(/[£$€,\s]/g, '');
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
  if (t.startsWith('+')) t = t.slice(1);
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return neg ? -n : n;
}

const find = (head: string[], ...patterns: RegExp[]) => {
  for (const re of patterns) {
    const i = head.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

interface Item { date: string; amount: number; balance: number | null; name: string; cat: string; order: number }

/** Every money-out payment in a statement CSV (amount as a positive number), for the budget. */
export function readPayments(text: string): { date: string; desc: string; amount: number; bankCategory: string }[] {
  return parseItems(text).items.filter((x) => x.amount < 0).map((x) => ({ date: x.date, desc: x.name || x.cat || 'Payment', amount: Math.round(-x.amount * 100) / 100, bankCategory: x.cat }));
}

function parseItems(text: string): { items: Item[]; iCat: number } {
  const rows = parseCsv(text);
  // The header is the first row that names a date column and some kind of amount column.
  const hi = rows.findIndex((r) => {
    const h = r.map((x) => x.toLowerCase());
    return h.some((x) => /date/.test(x)) && h.some((x) => /amount|paid (in|out)|money (in|out)|debit|credit|value|balance/.test(x));
  });
  if (hi < 0) throw new Error('This doesn’t look like a statement. Export it from your banking app as a CSV file.');
  const head = rows[hi].map((x) => x.toLowerCase());
  const iDate = find(head, /^(transaction )?date$/, /date/);
  const iAmount = find(head, /^amount/, /^value/, /amount/);
  const iIn = find(head, /paid in/, /money in/, /^credit/, /credit amount/, /^in$/);
  const iOut = find(head, /paid out/, /money out/, /^debit/, /debit amount/, /^out$/);
  const iBal = find(head, /^balance/, /balance/);
  const iCat = find(head, /categor/);
  const iName = find(head, /^name$/, /counter ?party/, /payee/, /merchant/, /description/, /memo/, /reference/, /details/);
  if (iDate < 0 || (iAmount < 0 && iIn < 0 && iOut < 0)) throw new Error('Couldn’t find the date and amount columns in this file.');

  const items: Item[] = [];
  rows.slice(hi + 1).forEach((r, order) => {
    const date = parseDate(r[iDate] ?? '');
    if (!date) return;
    let amount: number | null = null;
    if (iIn >= 0 || iOut >= 0) {
      const pin = iIn >= 0 ? parseAmount(r[iIn] ?? '') : null;
      const pout = iOut >= 0 ? parseAmount(r[iOut] ?? '') : null;
      if (pin !== null || pout !== null) amount = Math.abs(pin ?? 0) - Math.abs(pout ?? 0);
    }
    if (amount === null && iAmount >= 0) amount = parseAmount(r[iAmount] ?? '');
    if (amount === null) return;
    items.push({ date, amount, balance: iBal >= 0 ? parseAmount(r[iBal] ?? '') : null, name: (r[iName] ?? '').trim(), cat: iCat >= 0 ? (r[iCat] ?? '').trim() : '', order });
  });
  if (!items.length) throw new Error('No payments found in this file.');
  return { items, iCat };
}

export function readStatement(text: string): StatementSummary {
  const { items, iCat } = parseItems(text);

  const dates = items.map((x) => x.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  // Newest-first files list the latest payment at the top.
  const newestFirst = items[0].date > items[items.length - 1].date;
  const lastDay = items.filter((x) => x.date === to && x.balance !== null);
  const closingRow = lastDay.length ? (newestFirst ? lastDay[0] : lastDay[lastDay.length - 1]) : null;

  const byCat = iCat >= 0 && items.some((x) => x.cat);
  const spend = new Map<string, number>();
  for (const x of items) {
    if (x.amount >= 0) continue;
    const key = (byCat ? x.cat : x.name).replace(/\s+/g, ' ').trim() || 'Other';
    spend.set(key, (spend.get(key) ?? 0) - x.amount);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    from,
    to,
    count: items.length,
    moneyIn: r2(items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0)),
    moneyOut: r2(items.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0)),
    closing: closingRow?.balance ?? null,
    top: [...spend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount: r2(amount) })),
    topBy: byCat ? 'category' : 'payee',
  };
}
