// Steps: the daily goal and chunk size come from your steps routine (e.g. "20k steps" in 2 x 10k).
import type { Routine, StepDay } from './types';
import { addDays, weekday, type Day } from './dates';

const kNumber = (s: string | null | undefined) => {
  const m = s?.match(/(\d+(?:\.\d+)?)\s*k/i);
  return m ? Number(m[1]) * 1000 : null;
};

/** Steps per chunk: from the chunk label ("10k"), or the title split into chunks, else 10,000. */
export function stepSize(r: Routine): number {
  return Math.round(kNumber(r.chunk_label) ?? (kNumber(r.title) ? kNumber(r.title)! / Math.max(1, r.chunks) : 10000));
}

export function stepsRoutine(routines: Routine[]): Routine | null {
  return routines.find((r) => r.active && /steps/i.test(r.title)) ?? null;
}

export function stepGoal(routines: Routine[]): number {
  const r = stepsRoutine(routines);
  return r ? stepSize(r) * Math.max(1, r.chunks) : 10000;
}

export interface StepSummary {
  today: number | null;
  goal: number;
  weekAvg: number | null; // last 7 days with a number, not counting today
  lastWeekAvg: number | null;
  hitThisWeek: number; // days at or over goal since Monday
  streak: number; // days in a row at or over goal (today counts once reached)
  week: { day: Day; count: number | null }[];
}

export function stepSummary(steps: StepDay[], goal: number, now: Day): StepSummary {
  const by = new Map(steps.map((s) => [s.day, s.count]));
  const avg = (from: number, to: number) => {
    const xs: number[] = [];
    for (let i = from; i <= to; i++) {
      const v = by.get(addDays(now, -i));
      if (v !== undefined) xs.push(v);
    }
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  };
  let streak = 0;
  for (let i = 0; i < 120; i++) {
    const d = addDays(now, -i);
    const v = by.get(d);
    if (v !== undefined && v >= goal) streak++;
    else if (i > 0) break;
  }
  const monday = addDays(now, -weekday(now));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return { day, count: by.get(day) ?? null };
  });
  return {
    today: by.get(now) ?? null,
    goal,
    weekAvg: avg(1, 7),
    lastWeekAvg: avg(8, 14),
    hitThisWeek: week.filter((w) => w.day <= now && (w.count ?? 0) >= goal).length,
    streak,
    week,
  };
}
