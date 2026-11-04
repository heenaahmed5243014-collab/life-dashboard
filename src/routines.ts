// Streaks and the week grid for routines.
// Only days a routine is due count. A missed day just starts a new run (no guilt).
import type { Routine, Tick } from './types';
import { addDays, toDay, weekday, WEEKDAY_SHORT, type Day } from './dates';

export const TICK_HISTORY_DAYS = 180;

export type DayState = 'done' | 'today' | 'due' | 'missed' | 'off';

export interface RoutineStats {
  current: number;
  best: number;
  doneToday: boolean;
  dueToday: boolean;
  week: { day: Day; state: DayState }[]; // Monday to Sunday of this week
  nextDue: string | null; // "Sun"
}

export function routineStats(r: Routine, ticks: Tick[], now: Day): RoutineStats {
  const ticked = new Set(ticks.filter((t) => t.routine_id === r.id).map((t) => t.day));
  const isDue = (d: Day) => r.days.includes(weekday(d));
  const created = toDay(new Date(r.created_at));
  const start = [created, addDays(now, -TICK_HISTORY_DAYS)].sort().pop()!;

  // Current run: walk back from today. Today only counts once it's ticked; it never breaks the run.
  let current = 0;
  for (let d = now; d >= start; d = addDays(d, -1)) {
    if (!isDue(d)) continue;
    if (ticked.has(d)) current++;
    else if (d !== now) break;
  }

  // Best run in the history we have.
  let best = 0;
  let run = 0;
  for (let d = start; d <= now; d = addDays(d, 1)) {
    if (!isDue(d)) continue;
    if (ticked.has(d)) best = Math.max(best, ++run);
    else if (d !== now) run = 0;
  }

  const monday = addDays(now, -weekday(now));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    let state: DayState;
    if (ticked.has(day)) state = 'done';
    else if (!isDue(day)) state = 'off';
    else if (day === now) state = 'today';
    else if (day < now) state = day < created ? 'off' : 'missed';
    else state = 'due';
    return { day, state };
  });

  let nextDue: string | null = null;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(now, i);
    if (isDue(d)) {
      nextDue = i === 1 ? 'tomorrow' : WEEKDAY_SHORT[weekday(d)];
      break;
    }
  }

  return { current, best, doneToday: ticked.has(now), dueToday: isDue(now), week, nextDue };
}
