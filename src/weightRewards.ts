// Weight milestones: one for every kilogram lost from where you started, down to your goal.
// A milestone counts as reached when your recent weight (7-day average when you've weighed in
// more than once that week, so one light day doesn't count) is at or below it.
import type { Task, Weight, WeightReward } from './types';
import { daysBetween, type Day } from './dates';

export const LB_PER_KG = 2.20462;

/**
 * Prize pool: prizes waiting to be picked when you hit a target. They're stored with a placeholder
 * kilogram of 90 or more (milestones never go that high) until you choose one for a milestone.
 */
export const POOL_KG = 90;
export const isPoolPrize = (r: WeightReward) => r.kg >= POOL_KG;
export const poolPrizes = (rewards: WeightReward[]) => rewards.filter(isPoolPrize);
const placed = (rewards: WeightReward[]) => rewards.filter((r) => !isPoolPrize(r));
/** A free placeholder kilogram for a new pool prize (90.0, 90.1, ...). */
export function nextPoolKg(rewards: WeightReward[]): number {
  const used = new Set(poolPrizes(rewards).map((r) => Math.round(r.kg * 10)));
  for (let k = POOL_KG * 10; k <= 1000; k++) if (!used.has(k)) return k / 10;
  return 100;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export function goalLb(tasks: Task[]): number | null {
  const g = tasks.find((t) => t.kind === 'goal' && t.status === 'open' && /\d{2,3}(\.\d)?\s*lb/i.test(t.title));
  return g ? Number(g.title.match(/(\d{2,3}(?:\.\d)?)\s*lb/i)![1]) : null;
}

/** Recent weight: the average of the last 7 days if there are 2+ weigh-ins, else the latest. */
export function recentLb(weights: Weight[], now: Day): number | null {
  if (!weights.length) return null;
  const week = weights.filter((w) => daysBetween(w.day, now) <= 6 && daysBetween(w.day, now) >= 0);
  if (week.length >= 2) return r1(week.reduce((s, w) => s + w.lb, 0) / week.length);
  return weights[weights.length - 1].lb;
}

/** Where you started: from your rewards if you've set any (so milestones stay put), else your first weigh-in. */
export function startLb(weights: Weight[], rewards: WeightReward[]): number | null {
  const r = placed(rewards).sort((a, b) => a.kg - b.kg)[0];
  if (r) return r1(r.target_lb + r.kg * LB_PER_KG);
  return weights.length ? weights[0].lb : null;
}

export interface Milestone { kg: number; lb: number; reached: boolean; reward?: WeightReward }

export function milestones(weights: Weight[], all: WeightReward[], tasks: Task[], now: Day): Milestone[] {
  const rewards = placed(all);
  const start = startLb(weights, rewards);
  if (start === null) return [];
  const current = recentLb(weights, now) ?? start;
  const goal = goalLb(tasks);
  const maxKg = Math.max(goal !== null ? Math.floor((start - goal) / LB_PER_KG + 0.5) : 10, ...rewards.map((x) => x.kg), 1);
  return Array.from({ length: Math.min(maxKg, 60) }, (_, i) => {
    const kg = i + 1;
    const lb = r1(start - kg * LB_PER_KG);
    const reward = rewards.find((x) => x.kg === kg);
    return { kg, lb: reward?.target_lb ?? lb, reached: current <= (reward?.target_lb ?? lb), reward };
  });
}

/** A target you've hit that has no prize yet, while your prize pool has some to choose from. */
export function prizeToChoose(weights: Weight[], rewards: WeightReward[], tasks: Task[], now: Day): Milestone | null {
  if (!poolPrizes(rewards).length) return null;
  return milestones(weights, rewards, tasks, now).find((m) => m.reached && !m.reward) ?? null;
}
