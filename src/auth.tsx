// Sign-in with a 6-digit code sent by email. No passwords to remember.
// A code (rather than a link) is used because on iPhone a link would open in
// Safari instead of the home-screen app.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './backend';

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="page center"><p className="muted">Loading…</p></main>;
  if (session === null) return <SignIn />;
  return <>{children(session)}</>;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (error) setError(error.message);
    else setStep('code');
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('That code didn’t work. Check it, or send a new one.');
  };

  return (
    <main className="page signin">
      <header className="page-head">
        <h1 className="h1">Life Dashboard</h1>
        <p className="muted">
          {step === 'email' ? 'Sign in with your email. We’ll send you a 6-digit code.' : `We sent a code to ${email}. It can take a minute.`}
        </p>
      </header>
      {step === 'email' ? (
        <form className="stack" onSubmit={sendCode}>
          <label className="card field">
            <span className="field-label">Email</span>
            <input className="big-input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <label className="card field">
            <span className="field-label">Code from the email</span>
            <input className="big-input code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button type="submit" className="primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="link-btn" onClick={() => { setStep('email'); setCode(''); }}>Use a different email</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
