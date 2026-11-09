// Works out what the Today screen shows. Pure logic, no screen code.
import type { Routine, Task, Tick } from './types';
import { addDays, weekday, type Day } from './dates';
import { occursOn } from './repeat';

export interface TodayRoutine {
  routine: Routine;
  done: boolean;
  count: number; // chunks done today
}

export interface TodayView {
  top: Task[]; // up to 3, earliest due first (carried-over items count as today)
  also: Task[]; // the rest that's due today or carried over
  soon: Task[]; // due in the next 3 days
  inbox: Task[]; // open items not yet given a domain
  routines: TodayRoutine[];
}

export const byDue = (a: Task, b: Task) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
  (a.due_time ?? '99').localeCompare(b.due_time ?? '99') ||
  a.created_at.localeCompare(b.created_at);

export function buildToday(tasks: Task[], routines: Routine[], ticks: Tick[], inboxId: string, now: Day): TodayView {
  const open = tasks.filter((t) => t.status === 'open');
  const soonEnd = addDays(now, 3);

  const dated = open.filter((t) => t.due && t.kind !== 'idea' && t.kind !== 'note' && t.kind !== 'goal' && t.domain_id !== inboxId).sort(byDue);
  // Timed items for today live in the hourly planner; carried-over ones stay in the lists.
  const dueNow = dated.filter((t) => t.due! < now || (t.due === now && !t.due_time));
  const soon = dated.filter((t) => t.due! > now && t.due! <= soonEnd);
  const inbox = open.filter((t) => t.domain_id === inboxId && t.kind !== 'note' && t.kind !== 'goal').sort(byDue);

  const dow = weekday(now);
  const counts = new Map(ticks.filter((t) => t.day === now).map((t) => [t.routine_id, t.count ?? 1] as const));
  const order = { commute: 0, day: 1, evening: 2 };
  const todays = routines
    .filter((r) => r.active && r.days.includes(dow))
    .sort((a, b) => order[a.time_of_day] - order[b.time_of_day] || a.created_at.localeCompare(b.created_at))
    .map((routine) => {
      const count = counts.get(routine.id) ?? 0;
      return { routine, count, done: count >= (routine.chunks ?? 1) };
    });

  // Starred tasks go to the top of Top 3; the rest is filled by what's due.
  const starred = open.filter((t) => t.starred && t.kind !== 'idea' && t.kind !== 'note' && t.kind !== 'goal').sort(byDue);
  const starIds = new Set(starred.map((t) => t.id));
  const rest = dueNow.filter((t) => !starIds.has(t.id));
  const top = [...starred, ...rest].slice(0, 3);
  const topIds = new Set(top.map((t) => t.id));
  return {
    top,
    also: rest.filter((t) => !topIds.has(t.id)),
    soon: soon.filter((t) => !topIds.has(t.id)),
    inbox: inbox.filter((t) => !topIds.has(t.id)),
    routines: todays,
  };
}

export interface DayPlan {
  anytime: Task[]; // due that day with no time
  timed: Task[]; // due that day with a time, in time order
  routines: TodayRoutine[];
}

/** What a single day looks like in the planner (any day, today included). */
export function buildDay(tasks: Task[], routines: Routine[], ticks: Tick[], day: Day): DayPlan {
  const live = tasks.filter((t) => t.status === 'open' && t.kind !== 'idea' && t.kind !== 'note' && t.kind !== 'goal');
  // Repeating events also show on their later dates (the item itself sits on its next date).
  const open = [...live.filter((t) => t.due === day), ...live.filter((t) => occursOn(t, day)).map((t) => ({ ...t, due: day }))];
  const dow = weekday(day);
  const counts = new Map(ticks.filter((t) => t.day === day).map((t) => [t.routine_id, t.count ?? 1] as const));
  return {
    anytime: open.filter((t) => !t.due_time).sort(byDue),
    timed: open.filter((t) => t.due_time).sort(byDue),
    routines: routines
      .filter((r) => r.active && r.days.includes(dow))
      .map((routine) => {
        const count = counts.get(routine.id) ?? 0;
        return { routine, count, done: count >= (routine.chunks ?? 1) };
      }),
  };
}
