// Phone or desktop layout. "Auto" uses desktop on wide screens (1024px+). Remembered on this device.
import { useEffect, useState } from 'react';

export type LayoutPref = 'auto' | 'phone' | 'desktop';
const KEY = 'ld:layout';
const EVENT = 'ld:layout';

export const readLayoutPref = (): LayoutPref => {
  try { const v = localStorage.getItem(KEY); return v === 'phone' || v === 'desktop' ? v : 'auto'; } catch { return 'auto'; }
};
const resolve = (p: LayoutPref) => (p === 'auto' ? (innerWidth >= 1024 ? 'desktop' : 'phone') : p);

function apply() {
  document.documentElement.dataset.layout = resolve(readLayoutPref());
}

export function setLayoutPref(p: LayoutPref) {
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  apply();
  dispatchEvent(new Event(EVENT));
}

export function installLayout() {
  apply();
  addEventListener('resize', apply);
}

export function useLayoutPref(): [LayoutPref, 'phone' | 'desktop'] {
  const [s, setS] = useState(() => [readLayoutPref(), resolve(readLayoutPref())] as [LayoutPref, 'phone' | 'desktop']);
  useEffect(() => {
    const sync = () => setS([readLayoutPref(), resolve(readLayoutPref())]);
    addEventListener(EVENT, sync);
    addEventListener('resize', sync);
    return () => { removeEventListener(EVENT, sync); removeEventListener('resize', sync); };
  }, []);
  return s;
}
