// A small strip at the top when offline, or while offline changes are syncing.
import { useEffect, useState } from 'react';
import type { SyncStatus } from '../offline';

export default function SyncBanner() {
  const [s, setS] = useState<SyncStatus>({ online: navigator.onLine, pending: 0, usingSaved: false });
  useEffect(() => {
    const on = (e: Event) => setS((e as CustomEvent<SyncStatus>).detail);
    const net = () => setS((x) => ({ ...x, online: navigator.onLine }));
    addEventListener('ld:sync', on);
    addEventListener('online', net);
    addEventListener('offline', net);
    return () => {
      removeEventListener('ld:sync', on);
      removeEventListener('online', net);
      removeEventListener('offline', net);
    };
  }, []);

  if (s.online && s.pending === 0 && !s.usingSaved) return null;
  const waiting = s.pending ? ` · ${s.pending} change${s.pending === 1 ? '' : 's'} to sync` : '';
  const text = !s.online
    ? `Offline · saved on this phone${waiting}`
    : s.pending
      ? `Syncing${waiting}…`
      : 'Showing your saved copy · reconnecting…';
  return (
    <div className={`sync-banner${s.online ? ' syncing' : ''}`} role="status" aria-live="polite">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {s.online ? <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /> : <path d="M2 8.8a15 15 0 0 1 20 0M5.5 12.3a10 10 0 0 1 13 0M9 15.8a5 5 0 0 1 6 0M12 19.5h.01M3 3l18 18" />}
      </svg>
      {text}
    </div>
  );
}
