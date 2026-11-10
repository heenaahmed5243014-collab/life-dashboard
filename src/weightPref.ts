// Show or hide weight (Today card, debrief reward). Remembered on this phone.
import { useEffect, useState } from 'react';

const KEY = 'ld:show-weight';
const EVENT = 'ld:show-weight';
const read = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };

export function setShowWeight(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  dispatchEvent(new Event(EVENT));
}

export function useShowWeight(): boolean {
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    addEventListener(EVENT, sync);
    return () => removeEventListener(EVENT, sync);
  }, []);
  return on;
}
