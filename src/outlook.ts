// Outlook mailbox on the Email card: connect once, then new mail is checked whenever you open the app
// (at most every 10 minutes while it's open). Claude adds what needs you and ticks off threads you've replied to.
import { useEffect, useState } from 'react';
import { supabase } from './backend';

const EVENT = 'ld:outlook';
const STATE_KEY = 'ld:outlook-state';
const LAST_KEY = 'ld:outlook-last';
const EVERY_MS = 10 * 60 * 1000;
export interface MailStatus { connected: boolean; email?: string; last_sync?: string | null; reconnect?: boolean; busy?: boolean; problem?: string }
let status: MailStatus = { connected: false };
const set = (s: MailStatus) => { status = s; dispatchEvent(new Event(EVENT)); };
const redirect = () => `${location.origin}/`;

async function call(body: Record<string, unknown>) {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const res = await fetch('/api/outlook', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (out.error === 'outlook_not_configured') throw new Error('Outlook isn’t set up on the server yet (MS_CLIENT_ID and MS_CLIENT_SECRET in Vercel).');
    if (res.status === 404) throw new Error('Connecting Outlook works on the live app.');
    throw new Error(`Couldn’t reach Outlook${out.detail ? ` (${String(out.detail).slice(0, 100)})` : ''}.`);
  }
  return out;
}

/** Read whether a mailbox is connected (from your account). */
export async function loadMailStatus() {
  if (!supabase) return;
  const { data, error } = await supabase.from('mail_connections').select('email, last_sync').maybeSingle();
  if (error) return; // update 19 not run
  set(data ? { connected: true, email: data.email, last_sync: data.last_sync } : { connected: false });
}

export async function connectOutlook() {
  const state = crypto.randomUUID();
  try { sessionStorage.setItem(STATE_KEY, state); } catch { /* ignore */ }
  const { url } = (await call({ action: 'start', redirect: redirect(), state })) as { url: string };
  location.assign(url);
}

/** Coming back from the Microsoft sign-in page: finish connecting. Returns true if it handled the address. */
export async function finishOutlookIfReturning(onDone: () => void): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  const code = q.get('code'), state = q.get('state'), err = q.get('error');
  let expected: string | null = null;
  try { expected = sessionStorage.getItem(STATE_KEY); } catch { /* ignore */ }
  if ((!code && !err) || !state || state !== expected) return false;
  try { sessionStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname + '#/');
  if (err) { set({ ...status, problem: 'Outlook wasn’t connected. You can try again from the Email card.' }); return true; }
  set({ ...status, busy: true });
  try {
    const r = await call({ action: 'finish', code, redirect: redirect() });
    try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* ignore */ }
    set({ ...(r as unknown as MailStatus), busy: false });
    onDone();
  } catch (e) { set({ connected: false, problem: (e as Error).message }); }
  return true;
}

/** Check for new mail. `force` ignores the 10-minute gap (the Sync button). */
export async function syncMail(onChanged: () => void, force = false) {
  if (!status.connected || status.busy || status.reconnect || !navigator.onLine) return;
  let last = 0;
  try { last = Number(localStorage.getItem(LAST_KEY) ?? 0); } catch { /* ignore */ }
  if (!force && Date.now() - last < EVERY_MS) return;
  try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* ignore */ }
  set({ ...status, busy: true, problem: undefined });
  try {
    const r = (await call({ action: 'sync' })) as unknown as MailStatus & { added?: number; updated?: number; closed?: number };
    set({ ...status, ...r, busy: false });
    if (r.added || r.updated || r.closed) onChanged();
    return r;
  } catch (e) { set({ ...status, busy: false, problem: (e as Error).message }); }
}

export async function disconnectOutlook() {
  await call({ action: 'disconnect' });
  set({ connected: false });
}

export function useMailStatus(): MailStatus {
  const [s, setS] = useState(status);
  useEffect(() => { const f = () => setS(status); addEventListener(EVENT, f); return () => removeEventListener(EVENT, f); }, []);
  return s;
}
