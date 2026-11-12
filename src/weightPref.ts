// My journey privacy: hidden every time the app opens (unless you switch that off in Account).
// "Show" reveals it until you close the app. Remembered on this phone.
import { useEffect, useState } from 'react';

const START_KEY = 'ld:body-start-hidden';
const SESSION_KEY = 'ld:body-shown';
const EVENT = 'ld:show-weight';

const startHidden = () => { try { return localStorage.getItem(START_KEY) !== '0'; } catch { return true; } };
const read = () => {
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    if (s !== null) return s === '1';
  } catch { /* ignore */ }
  return !startHidden();
};

/** Show or hide for now (until the app is closed). */
export function setShowWeight(on: boolean) {
  try { sessionStorage.setItem(SESSION_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  dispatchEvent(new Event(EVENT));
}

/** Account setting: start hidden each time the app opens. */
export function setStartHidden(on: boolean) {
  try { localStorage.setItem(START_KEY, on ? '1' : '0'); sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  dispatchEvent(new Event(EVENT));
}

function useSynced<T>(get: () => T): T {
  const [v, setV] = useState(get);
  useEffect(() => {
    const sync = () => setV(get());
    addEventListener(EVENT, sync);
    return () => removeEventListener(EVENT, sync);
  }, [get]);
  return v;
}

export const useShowWeight = (): boolean => useSynced(read);
export const useStartHidden = (): boolean => useSynced(startHidden);
