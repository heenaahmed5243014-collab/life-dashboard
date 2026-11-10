// "Hide my money": one switch shared by the budget wallet and the net worth card.
// Remembered on this phone only.
import { useEffect, useState } from 'react';

const KEY = 'ld:money-hidden';
const EVENT = 'ld:money-hidden';

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export function useMoneyHidden(): [boolean, () => void] {
  const [hidden, setHidden] = useState(read);
  useEffect(() => {
    const sync = () => setHidden(read());
    addEventListener(EVENT, sync);
    return () => removeEventListener(EVENT, sync);
  }, []);
  const toggle = () => {
    try { localStorage.setItem(KEY, read() ? '0' : '1'); } catch { /* private mode: just this screen */ setHidden((h) => !h); return; }
    dispatchEvent(new Event(EVENT));
  };
  return [hidden, toggle];
}

export function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
