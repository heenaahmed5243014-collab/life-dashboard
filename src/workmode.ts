// Work mode: hides personal things on screen (job search, money, health, side business…)
// so only the areas you choose show. Remembered on this device only, so the work PC and
// your phone can differ. It hides things from view; it doesn't lock them.
import { useSyncExternalStore } from 'react';

export interface WorkModeSettings {
  on: boolean;
  /** Area names that stay visible in Work mode. */
  showAreas: string[];
  /** Turn on by itself on work days during work hours. */
  auto: boolean;
  start: string; // "07:30"
  end: string; // "17:00"
  /** Turned off by hand on this day during work hours: stay off until tomorrow. */
  offOn: string | null;
}

const KEY = 'ld:workmode';
const DEFAULTS: WorkModeSettings = { on: false, showAreas: ['Work'], auto: false, start: '07:30', end: '17:00', offOn: null };

let cache: WorkModeSettings | null = null;
const listeners = new Set<() => void>();

export function readWorkMode(): WorkModeSettings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<WorkModeSettings>) } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function setWorkMode(changes: Partial<WorkModeSettings>) {
  cache = { ...readWorkMode(), ...changes };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage blocked: lasts until the app closes */ }
  listeners.forEach((l) => l());
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function inWorkHours(s: WorkModeSettings, d = new Date()): boolean {
  const wd = (d.getDay() + 6) % 7; // 0 = Monday
  return wd < 5 && hm(d) >= s.start && hm(d) < s.end;
}

/** Is Work mode on right now (switched on, or automatic during work hours)? */
export function workModeActive(s: WorkModeSettings, d = new Date()): boolean {
  if (s.on) return true;
  return s.auto && inWorkHours(s, d) && s.offOn !== localDay(d);
}

/** Switch it on or off by hand. Turning it off during work hours keeps it off for the rest of the day. */
export function toggleWorkMode() {
  const s = readWorkMode();
  const now = new Date();
  if (workModeActive(s, now)) setWorkMode({ on: false, offOn: s.auto && inWorkHours(s, now) ? localDay(now) : s.offOn });
  else setWorkMode({ on: true, offOn: null });
}

// Re-check every minute so automatic Work mode starts and ends on time.
let ticker: number | undefined;
const subscribe = (l: () => void) => {
  listeners.add(l);
  if (ticker === undefined) {
    let last = workModeActive(readWorkMode());
    ticker = window.setInterval(() => {
      const nowOn = workModeActive(readWorkMode());
      if (nowOn !== last) { last = nowOn; cache = { ...readWorkMode() }; listeners.forEach((x) => x()); }
    }, 30_000);
  }
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; listeners.forEach((x) => x()); } };
  addEventListener('storage', onStorage);
  return () => { listeners.delete(l); removeEventListener('storage', onStorage); };
};

export function useWorkMode(): WorkModeSettings & { active: boolean } {
  const s = useSyncExternalStore(subscribe, readWorkMode, readWorkMode);
  return { ...s, active: workModeActive(s) };
}
