// Morning debrief notifications on this device (Web Push). On iPhone this only works when the
// app has been added to the Home Screen (iOS 16.4 or later).
import { supabase } from './backend';

const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export type PushSupport = 'ok' | 'needs-home-screen' | 'unsupported' | 'blocked';

export function pushSupport(): PushSupport {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'needs-home-screen';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ok';
}

async function vapidKey(): Promise<string> {
  const { data, error } = await supabase!.rpc('vapid_public_key');
  if (error) throw new Error(/does not exist|schema/i.test(error.message) ? 'Needs database update 14 first.' : error.message);
  if (data) return data as string;
  // First time: make this app's notification keys (kept in your database, never shown anywhere)
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d!;
  const set = await supabase!.rpc('set_vapid_keys', { p_public: pub, p_private: priv });
  if (set.error) throw new Error(set.error.message);
  return set.data as string;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export interface PushState { on: boolean; time: string }

export async function readPushState(): Promise<PushState | null> {
  const sub = await currentSubscription();
  if (!sub || !supabase) return null;
  const { data } = await supabase.from('push_subscriptions').select('debrief_on, debrief_time').eq('endpoint', sub.endpoint).maybeSingle();
  if (!data) return null;
  return { on: data.debrief_on as boolean, time: String(data.debrief_time).slice(0, 5) };
}

/** Ask permission, subscribe this device and save the time. */
export async function enablePush(time: string): Promise<void> {
  if (!supabase) throw new Error('Notifications need you to be signed in (not in demo mode).');
  const support = pushSupport();
  if (support === 'needs-home-screen') throw new Error('On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then open it from there.');
  if (support === 'unsupported') throw new Error('This browser can’t show notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are turned off for this app. Allow them in your phone’s Settings → Notifications.');
  const key = await vapidKey();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, debrief_time: time, debrief_on: true,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
  }, { onConflict: 'endpoint' });
  if (error) throw new Error(/does not exist|schema/i.test(error.message) ? 'Needs database update 14 first.' : error.message);
}

export async function setPushTime(time: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub || !supabase) return;
  await supabase.from('push_subscriptions').update({ debrief_time: time, last_sent: null }).eq('endpoint', sub.endpoint);
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub || !supabase) return;
  await supabase.from('push_subscriptions').update({ debrief_on: false }).eq('endpoint', sub.endpoint);
}

export async function sendTestPush(): Promise<string> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const res = await fetch('/api/push-test', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} });
  const body = (await res.json().catch(() => ({}))) as { sent?: number; error?: string; detail?: string; failed?: string[] };
  if (res.ok && body.sent) return 'Test sent. It should arrive in a few seconds.';
  if (body.error === 'no_devices') return 'Switch notifications on first.';
  if (res.status === 503) return 'Needs database update 14 first.';
  return `Couldn’t send the test${body.detail || body.failed?.[0] ? ` (${(body.detail || body.failed![0]).slice(0, 90)})` : ''}.`;
}
