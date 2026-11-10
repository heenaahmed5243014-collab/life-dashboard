// Live pill (Dynamic Island style) settings, kept on this device.
import { useSyncExternalStore } from 'react';
const KEY = 'ld:island';
let cache: { on: boolean } | null = null;
const listeners = new Set<() => void>();
export function readIsland() {
  if (cache) return cache;
  try { cache = { on: true, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as { on?: boolean }) }; } catch { cache = { on: true }; }
  return cache;
}
export function setIsland(c: { on: boolean }) {
  cache = { ...readIsland(), ...c };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* fine */ }
  listeners.forEach((l) => l());
}
export const useIsland = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, readIsland, readIsland);
