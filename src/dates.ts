// Dates are stored as plain local days, "2026-11-04", so time zones never shift them.

export type Day = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDay(d: Date): Day {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): Day {
  return toDay(new Date());
}

export function parseDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: Day, n: number): Day {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

export function daysBetween(from: Day, to: Day): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000);
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(day: Day): number {
  return (parseDay(day).getDay() + 6) % 7;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Wednesday 4 November" */
export function longDate(day: Day): string {
  const d = parseDay(day);
  return `${WEEKDAY_LONG[weekday(day)]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** "Thu 6 Nov" */
export function shortDate(day: Day): string {
  const d = parseDay(day);
  return `${WEEKDAY_SHORT[weekday(day)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Friendly, guilt-free label for a due date relative to today. */
export function dueLabel(due: Day, now: Day = today()): string {
  const diff = daysBetween(now, due);
  if (diff < 0) return diff === -1 ? 'Carried from yesterday' : `Carried from ${WEEKDAY_SHORT[weekday(due)]}`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return WEEKDAY_SHORT[weekday(due)];
  return shortDate(due);
}

/** Summarise routine days: "Every day", "Weekdays", "Mon, Wed, Fri" */
export function daysLabel(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return 'Every day';
  if (s.join() === '0,1,2,3,4') return 'Weekdays';
  if (s.join() === '5,6') return 'Weekends';
  if (s.length === 0) return 'No days set';
  return s.map((i) => WEEKDAY_SHORT[i]).join(', ');
}
