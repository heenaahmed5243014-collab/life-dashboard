// Sign-in with email and password. No emails are sent, so it works with
// Supabase's free email settings, and the phone's password manager can fill it in.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './backend';

/** The last signed-in session saved on this phone (used only while offline). */
function savedSession(): Session | null {
  try {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    if (!key) return null;
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
    const s = raw?.currentSession ?? raw;
    return s?.user?.id ? (s as Session) : null;
  } catch {
    return null;
  }
}

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    const check = () =>
      supabase!.auth.getSession().then(
        ({ data, error }) => {
          // Offline and the sign-in needs refreshing: carry on with the saved session.
          if (!data.session && (!navigator.onLine || (error && /fetch|network|load failed/i.test(error.message)))) {
            setSession(savedSession());
          } else {
            setSession(data.session);
          }
        },
        () => setSession(savedSession()),
      );
    void check();
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (!s && event !== 'SIGNED_OUT' && !navigator.onLine) return; // don't sign out just because there's no signal
      setSession(s);
    });
    const onOnline = () => void check(); // refresh the sign-in once there's a connection
    addEventListener('online', onOnline);
    return () => {
      data.subscription.unsubscribe();
      removeEventListener('online', onOnline);
    };
  }, []);

  if (session === undefined) return <main className="page center"><p className="muted">Loading…</p></main>;
  if (session === null) return <SignIn />;
  return <>{children(session)}</>;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const creds = { email: email.trim(), password };
    const { data, error } =
      mode === 'signin' ? await supabase!.auth.signInWithPassword(creds) : await supabase!.auth.signUp(creds);
    setBusy(false);
    if (error) {
      setError(
        error.message.includes('Invalid login')
          ? 'That email and password don’t match.'
          : error.message.includes('Signups not allowed')
            ? 'New accounts are switched off. Sign in instead.'
            : error.message,
      );
    } else if (mode === 'create' && !data.session) {
      setError('Account made, but Supabase wants an email confirmation. Turn off “Confirm email” in Supabase, then sign in.');
      setMode('signin');
    }
  };

  return (
    <main className="page signin">
      <header className="page-head">
        <h1 className="h1">Life Dashboard</h1>
        <p className="muted">{mode === 'signin' ? 'Sign in to see your list.' : 'Create your account. You only do this once.'}</p>
      </header>
      <form className="stack" onSubmit={submit}>
        <label className="card field">
          <span className="field-label">Email</span>
          <input className="big-input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="card field">
          <span className="field-label">Password{mode === 'create' ? ' (at least 8 characters)' : ''}</span>
          <input
            className="big-input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={mode === 'create' ? 8 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={busy || !email.includes('@') || password.length < (mode === 'create' ? 8 : 1)}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="link-btn" onClick={() => { setMode(mode === 'signin' ? 'create' : 'signin'); setError(null); }}>
          {mode === 'signin' ? 'First time? Create your account' : 'Already have an account? Sign in'}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
