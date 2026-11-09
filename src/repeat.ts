// Repeating events (e.g. "Swimming every Thursday 8pm"). One item that rolls forward:
// ticking it done moves it to the next date, and future dates show it in the calendar.
import type { Repeat, Task } from './types';
import { addDays, parseDay, toDay, type Day } from './dates';

export const REPEAT_LABEL: Record<Repeat, string> = { week: 'Every week', '2weeks': 'Every 2 weeks', '4weeks': 'Every 4 weeks', month: 'Every month' };
export const REPEATS: Repeat[] = ['week', '2weeks', '4weeks', 'month'];

export function stepOnce(day: Day, r: Repeat): Day {
  if (r === 'week') return addDays(day, 7);
  if (r === '2weeks') return addDays(day, 14);
  if (r === '4weeks') return addDays(day, 28);
  const d = parseDay(day);
  const target = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toDay(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}

/** The next date after finishing this one (skipping any that are already past). */
export function nextDue(due: Day, r: Repeat, now: Day): Day {
  let next = stepOnce(due, r);
  for (let i = 0; i < 400 && next < now; i++) next = stepOnce(next, r);
  return next;
}

/** Does a repeating task fall on this day (after its current date)? */
export function occursOn(t: Task, day: Day): boolean {
  if (!t.repeat || !t.due || day <= t.due) return false;
  let d = t.due;
  for (let i = 0; i < 400 && d < day; i++) d = stepOnce(d, t.repeat);
  return d === day;
}
