// Live pill (Dynamic Island style) settings, kept on this device.
import { useSyncExternalStore } from 'react';
const KEY = 'ld:island';
type IslandSettings = { on: boolean; privateNames: boolean };
let cache: IslandSettings | null = null;
const listeners = new Set<() => void>();
export function readIsland() {
  if (cache) return cache;
  try { cache = { on: true, privateNames: true, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<IslandSettings>) }; } catch { cache = { on: true, privateNames: true }; }
  return cache;
}
export function setIsland(c: Partial<IslandSettings>) {
  cache = { ...readIsland(), ...c };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* fine */ }
  listeners.forEach((l) => l());
}
export const useIsland = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, readIsland, readIsland);
