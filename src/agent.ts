// Calls the /api/agent helper (social media agents and email sorting) with your sign-in.
import { supabase } from './backend';

export async function callAgent<T>(body: Record<string, unknown>): Promise<T> {
  if (!navigator.onLine) throw new Error('Agents need an internet connection.');
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  let res: Response;
  try {
    res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Couldn’t reach Claude just now. Try again in a moment.');
  }
  const out = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok) {
    if (out.error === 'not_configured' || res.status === 404) throw new Error('Claude isn’t connected here (it works on the live app).');
    if (out.error === 'no_credit') throw new Error('Your Anthropic credit has run out.');
    if (out.error === 'not_signed_in') throw new Error('Sign in again to use agents.');
    throw new Error(`Claude couldn’t do that${out.detail ? ` (${out.detail.slice(0, 100)})` : ''}.`);
  }
  return out;
}
