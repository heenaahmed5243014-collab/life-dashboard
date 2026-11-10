// Morning debrief settings (kept on this device).
import { useSyncExternalStore } from 'react';

export interface DebriefSettings {
  on: boolean;
  untilHour: number; // shows on Today until this hour
  money: boolean;
  health: boolean;
  headsUp: boolean;
}
const KEY = 'ld:debrief';
const DONE_KEY = 'ld:debrief-done';
const DEFAULTS: DebriefSettings = { on: true, untilHour: 12, money: true, health: true, headsUp: true };
let cache: DebriefSettings | null = null;
const listeners = new Set<() => void>();

export function readDebrief(): DebriefSettings {
  if (cache) return cache;
  try { cache = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DebriefSettings>) }; } catch { cache = DEFAULTS; }
  return cache;
}
export function setDebrief(c: Partial<DebriefSettings>) {
  cache = { ...readDebrief(), ...c };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* fine */ }
  listeners.forEach((l) => l());
}
export function useDebrief() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, readDebrief, readDebrief);
}
export const debriefDoneToday = (day: string) => { try { return localStorage.getItem(DONE_KEY) === day; } catch { return false; } };
export const markDebriefDone = (day: string) => { try { localStorage.setItem(DONE_KEY, day); } catch { /* fine */ } };
export const openDebrief = () => dispatchEvent(new Event('ld:open-debrief'));
