// Water: daily total in ml, a goal and glass size kept on this phone.
import type { Day, } from './dates';
import type { WaterDay } from './types';
import { addDays } from './dates';

const GOAL_KEY = 'ld:water-goal';
export const GLASS_ML = 250;
export const GOAL_CHOICES = [1500, 2000, 2500, 3000];

export function waterGoal(): number {
  try { const v = Number(localStorage.getItem(GOAL_KEY)); return GOAL_CHOICES.includes(v) ? v : 2000; } catch { return 2000; }
}
export function setWaterGoal(ml: number) {
  try { localStorage.setItem(GOAL_KEY, String(ml)); } catch { /* ignore */ }
}

export const waterOn = (water: WaterDay[], day: Day) => water.find((w) => w.day === day)?.ml ?? 0;

/** Days in a row at goal: today counts if it's done, otherwise the run up to yesterday. */
export function waterStreak(water: WaterDay[], goal: number, now: Day): number {
  let d = waterOn(water, now) >= goal ? now : addDays(now, -1);
  let n = 0;
  while (waterOn(water, d) >= goal && n < 400) { n++; d = addDays(d, -1); }
  return n;
}

export const litres = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : ml % 100 === 0 ? 1 : 2)} L` : `${ml} ml`);
