// Shared helper: send web push notifications for rows returned by the database.
import webpush from 'web-push';

export interface PushRow { endpoint: string; p256dh: string; auth: string; title: string; body: string; vapid_public: string | null; vapid_private: string | null }

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

export async function rpc<T>(fn: string, args: Record<string, unknown>, userToken?: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY!, authorization: `Bearer ${userToken ?? SUPABASE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  return (await res.json()) as T;
}

/** Sends each notification. Returns the endpoints that have expired (the phone unsubscribed). */
export async function sendAll(rows: PushRow[]): Promise<{ sent: number; expired: string[]; failed: string[] }> {
  let sent = 0;
  const expired: string[] = [];
  const failed: string[] = [];
  for (const r of rows) {
    if (!r.vapid_public || !r.vapid_private) { failed.push('no keys'); continue; }
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify({ title: r.title, body: r.body, url: '/#/' }),
        { vapidDetails: { subject: 'https://life-dashboard-two-opal.vercel.app', publicKey: r.vapid_public, privateKey: r.vapid_private }, TTL: 4 * 3600, urgency: 'normal' },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) expired.push(r.endpoint);
      else failed.push(`${status ?? ''} ${(e as Error).message}`.slice(0, 120));
    }
  }
  return { sent, expired, failed };
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
