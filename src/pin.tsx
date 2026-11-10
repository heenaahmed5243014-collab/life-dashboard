// Finance PIN: a 4-digit PIN in front of anything to do with money (Money tab, Returns,
// the net worth card on Today). Kept on this phone only, stored as a salted hash, never the PIN.
// Once unlocked it stays open while you use the app, and locks again 5 minutes after you leave it.
import { useEffect, useState, type ReactNode } from 'react';

const PIN_KEY = 'ld:pin';
const OK_KEY = 'ld:pin-ok';
const LEFT_KEY = 'ld:pin-left';
const FAIL_KEY = 'ld:pin-fails';
const EVENT = 'ld:pin';
const AWAY_MS = 5 * 60 * 1000;
export const PIN_LENGTH = 4;

interface Stored { salt: string; hash: string }

const get = (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } };
const set = (s: Storage, k: string, v: string | null) => { try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* private mode */ } };
const changed = () => dispatchEvent(new Event(EVENT));

function stored(): Stored | null {
  try { return JSON.parse(get(localStorage, PIN_KEY) ?? 'null'); } catch { return null; }
}

async function hashPin(salt: string, pin: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const pinEnabled = () => stored() !== null;
const isUnlocked = () => !pinEnabled() || get(sessionStorage, OK_KEY) === '1';

export async function setPin(pin: string) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  set(localStorage, PIN_KEY, JSON.stringify({ salt, hash: await hashPin(salt, pin) }));
  set(sessionStorage, OK_KEY, '1');
  set(localStorage, FAIL_KEY, null);
  changed();
}

/** Remove the PIN (used by Account after checking the PIN, and on sign-out as the "forgot PIN" route). */
export function clearPin() {
  set(localStorage, PIN_KEY, null);
  set(localStorage, FAIL_KEY, null);
  set(sessionStorage, OK_KEY, null);
  changed();
}

export function lockFinance() {
  set(sessionStorage, OK_KEY, null);
  changed();
}

/** Seconds to wait after 5 wrong tries (30s, doubling). 0 when you can try. */
export function waitSeconds(): number {
  try {
    const f = JSON.parse(get(localStorage, FAIL_KEY) ?? 'null') as { n: number; at: number } | null;
    if (!f || f.n < 5) return 0;
    const wait = 30_000 * 2 ** Math.min(6, f.n - 5);
    return Math.max(0, Math.ceil((f.at + wait - Date.now()) / 1000));
  } catch { return 0; }
}

export async function checkPin(pin: string): Promise<boolean> {
  const s = stored();
  if (!s) return true;
  if (waitSeconds() > 0) return false;
  const ok = (await hashPin(s.salt, pin)) === s.hash;
  if (ok) {
    set(localStorage, FAIL_KEY, null);
  } else {
    let n = 0;
    try { n = (JSON.parse(get(localStorage, FAIL_KEY) ?? 'null') as { n: number } | null)?.n ?? 0; } catch { /* ignore */ }
    set(localStorage, FAIL_KEY, JSON.stringify({ n: n + 1, at: Date.now() }));
  }
  return ok;
}

async function unlock(pin: string): Promise<boolean> {
  const ok = await checkPin(pin);
  if (ok) { set(sessionStorage, OK_KEY, '1'); changed(); }
  return ok;
}

// Lock again if the app was away for more than 5 minutes.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') set(sessionStorage, LEFT_KEY, String(Date.now()));
    else {
      const left = Number(get(sessionStorage, LEFT_KEY) ?? 0);
      if (left && Date.now() - left > AWAY_MS && get(sessionStorage, OK_KEY)) lockFinance();
    }
  });
}

export function usePin(): { enabled: boolean; unlocked: boolean } {
  const [state, setState] = useState(() => ({ enabled: pinEnabled(), unlocked: isUnlocked() }));
  useEffect(() => {
    const sync = () => setState({ enabled: pinEnabled(), unlocked: isUnlocked() });
    addEventListener(EVENT, sync);
    addEventListener('storage', sync);
    return () => { removeEventListener(EVENT, sync); removeEventListener('storage', sync); };
  }, []);
  return state;
}

export function LockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Dots + number pad. Calls onDone with the 4 digits. */
export function PinPad({ title, sub, error, onDone }: { title: string; sub?: string; error?: string; onDone: (pin: string) => void }) {
  const [digits, setDigits] = useState('');
  const [wait, setWait] = useState(waitSeconds);
  useEffect(() => {
    if (!wait) return;
    const t = setInterval(() => setWait(waitSeconds()), 1000);
    return () => clearInterval(t);
  }, [wait]);
  useEffect(() => { if (error) setDigits(''); }, [error]);
  const press = (d: string) => {
    if (wait) return;
    const next = (digits + d).slice(0, PIN_LENGTH);
    setDigits(next);
    if (next.length === PIN_LENGTH) setTimeout(() => { onDone(next); setDigits(''); setWait(waitSeconds()); }, 120);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setDigits((d) => d.slice(0, -1));
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  return (
    <div className="pin-pad">
      <p className="pin-title">{title}</p>
      {sub && <p className="note pin-sub">{sub}</p>}
      <div className={`pin-dots${error ? ' shake' : ''}`} aria-label={`${digits.length} of ${PIN_LENGTH} digits entered`} role="status">
        {Array.from({ length: PIN_LENGTH }, (_, i) => <span key={i} className={i < digits.length ? 'on' : ''} />)}
      </div>
      <p className="pin-error" role="alert">{wait ? `Too many tries. Wait ${wait}s.` : error ?? ''}</p>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" className="pin-key" onClick={() => press(d)} disabled={wait > 0}>{d}</button>)}
        <span />
        <button type="button" className="pin-key" onClick={() => press('0')} disabled={wait > 0}>0</button>
        <button type="button" className="pin-key ghost" aria-label="Delete" onClick={() => setDigits((d) => d.slice(0, -1))}>⌫</button>
      </div>
    </div>
  );
}

function Unlock({ compact }: { compact?: boolean }) {
  const [error, setError] = useState<string>();
  return (
    <div className={compact ? 'pin-unlock compact' : 'pin-unlock'}>
      {!compact && <img src="/img/wallet.png" alt="" className="pin-pic" />}
      <PinPad
        title="Enter your finance PIN"
        sub={compact ? undefined : 'Money stays private until you unlock it.'}
        error={error}
        onDone={async (pin) => { setError(undefined); if (!(await unlock(pin))) setError('That’s not it. Try again.'); }}
      />
      <p className="note pin-forgot">Forgot it? Sign out in Account, then sign back in. That removes the PIN.</p>
    </div>
  );
}

/** Shows children only when unlocked (or no PIN set). Full screen by default; `compact` for a card on Today. */
export function PinGate({ children, compact = false, label = 'Money', after }: { children: ReactNode; compact?: boolean; label?: string; after?: ReactNode }) {
  const { unlocked } = usePin();
  const [open, setOpen] = useState(false);
  if (unlocked) return <>{children}</>;
  if (compact) {
    return (
      <section className="card pin-card" aria-label={`${label} (locked)`}>
        {open ? <Unlock compact /> : (
          <button type="button" className="pin-locked" onClick={() => setOpen(true)}>
            <span className="emoji-tile"><img src="/img/wallet.png" alt="" /></span>
            <span className="pin-locked-text"><b>{label}</b><span className="note">Locked · tap to enter your PIN</span></span>
            <span className="pin-lock-ic"><LockIcon /></span>
          </button>
        )}
      </section>
    );
  }
  return <><main className="page pin-page"><Unlock /></main>{after}</>;
}

/** While money is locked, "£12.99" in task titles and tags shows as "£••". */
export const maskMoney = (text: string) => text.replace(/£\s?\d[\d,]*(\.\d+)?/g, '£••');
export function useMoneyMask(): (text: string) => string {
  const { enabled, unlocked } = usePin();
  return enabled && !unlocked ? maskMoney : (t: string) => t;
}
