// POST /api/outlook — connects your Outlook mailbox to the Email card (Microsoft Graph).
//  { action: 'start', redirect }          -> { url }   Microsoft sign-in page
//  { action: 'finish', code, redirect }   -> same as sync, after saving the (encrypted) sign-in
//  { action: 'sync' }                     -> { connected, email, added, updated, closed }
//  { action: 'disconnect' }               -> { connected: false }
// Only you (signed in to the app) can call it. The Microsoft sign-in is stored encrypted, and only
// sender, subject and a short preview of each new email are read. Nothing is sent anywhere else
// except to Claude, which decides what needs you.
//
// Needs in Vercel: MS_CLIENT_ID and MS_CLIENT_SECRET (from your Microsoft app registration), ANTHROPIC_API_KEY.

import Anthropic from '@anthropic-ai/sdk';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_KEY;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const SCOPE = 'offline_access User.Read Mail.Read';
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/* ---------- the locked Microsoft sign-in ---------- */
const key = () => createHash('sha256').update(`${CLIENT_SECRET}:life-dashboard-mail`).digest();
function lock(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function unlock(s: string): string {
  const [iv, tag, data] = s.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

/* ---------- your database, as you ---------- */
function db(token: string) {
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: SB_KEY!, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`database ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  };
  return call;
}
async function userOf(token: string): Promise<string | null> {
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY!, authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return ((await res.json()) as { id: string }).id;
}

/* ---------- Microsoft ---------- */
async function tokens(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!, scope: SCOPE, ...params }),
  });
  const out = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !out.access_token) {
    const e = new Error(out.error_description?.split('\r\n')[0] ?? out.error ?? 'Microsoft sign-in failed');
    (e as Error & { code?: string }).code = out.error;
    throw e;
  }
  return out as { access_token: string; refresh_token?: string };
}
async function graph<T>(access: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { headers: { authorization: `Bearer ${access}` } });
  if (!res.ok) throw new Error(`Outlook ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json() as Promise<T>;
}

interface Msg { id: string; conversationId: string; subject: string | null; bodyPreview: string; receivedDateTime?: string; sentDateTime?: string; inferenceClassification?: string; from?: { emailAddress: { name: string; address: string } }; toRecipients?: { emailAddress: { name: string; address: string } }[] }
interface Item { id: string; kind: 'reply' | 'waiting'; conversation_id: string | null; source_id: string | null }

/* ---------- Claude decides what needs you ---------- */
const orNull = (s: Record<string, unknown>) => ({ anyOf: [s, { type: 'null' }] });
const SORT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['emails'],
  properties: {
    emails: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['n', 'track', 'sender', 'subject', 'summary', 'next_step', 'due'],
        properties: {
          n: { type: 'integer' },
          track: { type: 'boolean', description: 'IN: true only if Heena must reply, decide or do something. False for newsletters, receipts, notifications, marketing, automated mail, FYI. OUT: true only if Heena asked something or is clearly waiting for an answer.' },
          sender: { type: 'string', description: 'IN: who it is from. OUT: who she is waiting on. A short name or company.' },
          subject: { type: 'string', description: 'What it is about, under 70 characters' },
          summary: { type: 'string', description: 'One short sentence' },
          next_step: { type: 'string', description: 'IN: the next action for Heena, starting with a verb. OUT: e.g. "Chase if no reply by Friday". Under 80 characters.' },
          due: { ...orNull({ type: 'string' }), description: 'YYYY-MM-DD if a deadline is mentioned or clearly implied, else null' },
        },
      },
    },
  },
};

type Sorted = { n: number; track: boolean; sender: string; subject: string; summary: string; next_step: string; due: string | null };
async function sortMail(list: { dir: 'IN' | 'OUT'; m: Msg }[]): Promise<Sorted[]> {
  if (!list.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const text = list.map(({ dir, m }, n) => {
    const who = dir === 'IN' ? `From: ${m.from?.emailAddress.name ?? ''} <${m.from?.emailAddress.address ?? ''}>` : `To: ${(m.toRecipients ?? []).map((r) => r.emailAddress.name || r.emailAddress.address).join(', ')}`;
    return `#${n} ${dir}\n${who}\nSubject: ${(m.subject ?? '').slice(0, 150)}\nPreview: ${m.bodyPreview.replace(/\s+/g, ' ').slice(0, 400)}`;
  }).join('\n\n');
  const client = new Anthropic();
  const r = await client.messages.create({
    model: MODEL, max_tokens: 6000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SORT_SCHEMA } },
    system: `You sort email for Heena, who runs Made in Heaven Visuals (photography and social media management). Today is ${today}. IN = emails she received. OUT = emails she sent. Return one entry per email, using its number as n. Be strict: only track what genuinely needs her or what she is waiting on. Write in British English. Dates must be on or after today.`,
    messages: [{ role: 'user', content: text }],
  });
  const out = r.content.find((b) => b.type === 'text');
  if (r.stop_reason === 'refusal' || !out || out.type !== 'text') return [];
  return (JSON.parse(out.text) as { emails: Sorted[] }).emails;
}

const addDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const validDay = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= addDays(0) ? d : null);
const clip = (s: string, n: number) => (s ?? '').trim().slice(0, n);

async function sync(token: string) {
  const q = db(token);
  const rows = (await q('mail_connections?select=email,token_enc,last_sync')) as { email: string; token_enc: string; last_sync: string | null }[];
  const conn = rows[0];
  if (!conn) return { connected: false };
  let t;
  try {
    t = await tokens({ grant_type: 'refresh_token', refresh_token: unlock(conn.token_enc) });
  } catch (e) {
    if ((e as { code?: string }).code === 'invalid_grant' || /unsupported state|auth/i.test(String(e))) return { connected: true, email: conn.email, reconnect: true };
    throw e;
  }
  const since = conn.last_sync ?? new Date(Date.now() - 3 * 864e5).toISOString();
  const started = new Date().toISOString();
  const sel = '$select=id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,inferenceClassification&$top=30';
  const [inbox, sent] = await Promise.all([
    graph<{ value: Msg[] }>(t.access_token, `/me/mailFolders/inbox/messages?${sel}&$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc`),
    graph<{ value: Msg[] }>(t.access_token, `/me/mailFolders/sentitems/messages?${sel}&$filter=sentDateTime ge ${since}&$orderby=sentDateTime desc`),
  ]);
  const me = conn.email.toLowerCase();
  const incoming = inbox.value.filter((m) => m.inferenceClassification !== 'other' && m.from?.emailAddress.address.toLowerCase() !== me);
  const outgoing = sent.value;

  // What's already on the card for these conversations
  const convs = [...new Set([...incoming, ...outgoing].map((m) => m.conversationId))];
  const ids = [...incoming, ...outgoing].map((m) => m.id);
  const list = (vals: string[]) => encodeURIComponent(vals.map((v) => `"${v.replace(/"/g, '')}"`).join(','));
  const open: Item[] = convs.length ? (await q(`email_items?select=id,kind,conversation_id,source_id&status=eq.open&conversation_id=in.(${list(convs)})`)) as Item[] : [];
  const seen = new Set<string>(ids.length ? ((await q(`email_items?select=source_id&source_id=in.(${list(ids)})`)) as { source_id: string }[]).map((r) => r.source_id) : []);

  let closed = 0, updated = 0;
  // 1. You replied in a thread that needed a reply: tick it off. (Newest first, so one pass is enough.)
  const repliedConvs = new Set(outgoing.map((m) => m.conversationId));
  for (const item of open.filter((i) => i.kind === 'reply' && i.conversation_id && repliedConvs.has(i.conversation_id))) {
    const lastIn = incoming.find((m) => m.conversationId === item.conversation_id)?.receivedDateTime ?? '';
    const lastOut = outgoing.find((m) => m.conversationId === item.conversation_id)?.sentDateTime ?? '';
    if (lastOut > lastIn) { await q(`email_items?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) }); closed++; item.kind = 'done' as 'reply'; }
  }
  // 2. They answered something you were waiting on: it becomes "reply needed".
  const flip = open.filter((i) => i.kind === 'waiting' && i.conversation_id && incoming.some((m) => m.conversationId === i.conversation_id && (m.receivedDateTime ?? '') > (outgoing.find((o) => o.conversationId === i.conversation_id)?.sentDateTime ?? '')));
  const tracked = new Set(open.map((i) => i.conversation_id));

  // 3. New emails: let Claude decide. Only the newest message per conversation, skipping ones already handled.
  const fresh: { dir: 'IN' | 'OUT'; m: Msg }[] = [];
  const usedConv = new Set<string>();
  const all = [...incoming.map((m) => ({ dir: 'IN' as const, m, at: m.receivedDateTime ?? '' })), ...outgoing.map((m) => ({ dir: 'OUT' as const, m, at: m.sentDateTime ?? '' }))].sort((a, b) => b.at.localeCompare(a.at));
  for (const x of all) {
    if (seen.has(x.m.id) || usedConv.has(x.m.conversationId)) continue;
    usedConv.add(x.m.conversationId);
    const waitingHere = flip.find((i) => i.conversation_id === x.m.conversationId);
    if (tracked.has(x.m.conversationId) && !waitingHere) continue; // already on the card and nothing changed
    fresh.push({ dir: x.dir, m: x.m });
  }
  const sorted = await sortMail(fresh.slice(0, 40));
  const add: Record<string, unknown>[] = [];
  for (const s of sorted) {
    const f = fresh[s.n];
    if (!f) continue;
    const waitingHere = flip.find((i) => i.conversation_id === f.m.conversationId);
    if (waitingHere && f.dir === 'IN') {
      await q(`email_items?id=eq.${waitingHere.id}`, { method: 'PATCH', body: JSON.stringify({ kind: 'reply', summary: clip(s.summary, 600), next_step: clip(s.next_step, 200) || 'Reply', due: validDay(s.due) ?? addDays(1), source_id: f.m.id }) });
      updated++;
      continue;
    }
    if (!s.track) continue;
    add.push({
      sender: clip(s.sender, 120), subject: clip(s.subject, 200) || clip(f.m.subject ?? '', 200) || '(no subject)',
      kind: f.dir === 'IN' ? 'reply' : 'waiting', summary: clip(s.summary, 600), next_step: clip(s.next_step, 200),
      due: validDay(s.due) ?? (f.dir === 'OUT' ? addDays(3) : null), status: 'open', source_id: f.m.id, conversation_id: f.m.conversationId,
    });
  }
  if (add.length) await q('email_items', { method: 'POST', body: JSON.stringify(add) });
  await q('mail_connections?provider=eq.outlook', { method: 'PATCH', body: JSON.stringify({ last_sync: started, ...(t.refresh_token ? { token_enc: lock(t.refresh_token) } : {}) }) });
  return { connected: true, email: conn.email, added: add.length, updated, closed, last_sync: started };
}

export async function POST(req: Request): Promise<Response> {
  if (!SB_URL || !SB_KEY) return json(503, { error: 'not_configured' });
  if (!CLIENT_ID || !CLIENT_SECRET) return json(503, { error: 'outlook_not_configured' });
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !(await userOf(token))) return json(401, { error: 'not_signed_in' });
  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_request' }); }
  const redirect = String(body.redirect ?? '');
  const okRedirect = /^https:\/\/[^/]+\/$/.test(redirect) || /^http:\/\/localhost(:\d+)?\/$/.test(redirect);
  try {
    if (body.action === 'start') {
      if (!okRedirect) return json(400, { error: 'bad_redirect' });
      const url = `${AUTH}/authorize?${new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: redirect, response_mode: 'query', scope: SCOPE, state: String(body.state ?? ''), prompt: 'select_account' })}`;
      return json(200, { url });
    }
    if (body.action === 'finish') {
      if (!okRedirect || !body.code) return json(400, { error: 'bad_request' });
      const t = await tokens({ grant_type: 'authorization_code', code: body.code, redirect_uri: redirect });
      if (!t.refresh_token) return json(502, { error: 'no_refresh' });
      const me = await graph<{ mail: string | null; userPrincipalName: string }>(t.access_token, '/me?$select=mail,userPrincipalName');
      await db(token)('mail_connections', {
        method: 'POST', headers: { prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ provider: 'outlook', email: (me.mail ?? me.userPrincipalName ?? '').slice(0, 200), token_enc: lock(t.refresh_token), last_sync: new Date(Date.now() - 3 * 864e5).toISOString() }),
      });
      return json(200, await sync(token));
    }
    if (body.action === 'sync') return json(200, await sync(token));
    if (body.action === 'disconnect') {
      await db(token)('mail_connections?provider=eq.outlook', { method: 'DELETE' });
      return json(200, { connected: false });
    }
    return json(400, { error: 'bad_request' });
  } catch (error) {
    if (error instanceof Anthropic.APIError) return json(502, { error: 'claude_error', detail: `${error.status ?? ''} ${error.message}`.slice(0, 160) });
    console.error(error);
    return json(500, { error: 'server_error', detail: String(error instanceof Error ? error.message : error).slice(0, 160) });
  }
}
