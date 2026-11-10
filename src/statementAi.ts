// Sends statement pictures or a PDF to our /api/statement helper, which asks Claude to read them.
// Photos are shrunk on the phone first (smaller, faster, cheaper). Nothing is stored.
import { supabase } from './backend';
import { today } from './dates';
import type { StatementSummary } from './statement';

export interface AiStatement extends StatementSummary {
  account: string | null; // account name Claude matched, if clear
}

const MAX_SIDE = 1800;

/** Shrinks a photo/screenshot to a JPEG no bigger than MAX_SIDE, returned as base64. */
async function shrink(file: File): Promise<{ media_type: string; data: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('Couldn’t open that picture. Try a screenshot or a JPEG/PNG photo.');
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export interface AiPayment { date: string; description: string; amount: number; category: string }

/** Lists every money-out payment in pictures or a PDF of a statement, sorted into budget categories. */
export async function readPaymentsWithClaude(files: File[], categories: { key: string; name: string }[]): Promise<AiPayment[]> {
  if (!navigator.onLine) throw new Error('Reading a picture needs an internet connection.');
  const pdf = files.find(isPdf);
  if (pdf && pdf.size > 3_000_000) throw new Error('That PDF is too big. Try one month at a time, or screenshots.');
  const payload = pdf ? [{ media_type: 'application/pdf', data: await toBase64(pdf) }] : await Promise.all(files.slice(0, 4).map(shrink));
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  let res: Response;
  try {
    res = await fetch('/api/statement', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ files: payload, accounts: [], categories, mode: 'payments', today: today() }),
    });
  } catch {
    throw new Error('Couldn’t reach Claude just now. Try again in a moment.');
  }
  const body = (await res.json().catch(() => ({}))) as { readable?: boolean; problem?: string; payments?: AiPayment[]; error?: string; detail?: string };
  if (!res.ok) {
    if (body.error === 'not_configured' || res.status === 404) throw new Error('Claude isn’t connected, so pictures can’t be read. CSV files still work.');
    if (body.error === 'no_credit') throw new Error('Your Anthropic credit has run out, so the statement couldn’t be read.');
    throw new Error(`Claude couldn’t read that${body.detail ? ` (${String(body.detail).slice(0, 100)})` : ''}.`);
  }
  if (!body.readable) throw new Error(body.problem || 'That doesn’t look like a statement. Try a clearer screenshot.');
  return (body.payments ?? []).filter((p) => p.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date)).map((p) => ({ ...p, amount: Math.round(Math.abs(p.amount) * 100) / 100 }));
}

export async function readStatementWithClaude(files: File[], accounts: string[]): Promise<AiStatement> {
  if (!navigator.onLine) throw new Error('Reading a picture needs an internet connection.');
  const pdf = files.find(isPdf);
  if (pdf && pdf.size > 3_000_000) throw new Error('That PDF is too big. Try a statement for one month, or screenshots.');
  const payload = pdf ? [{ media_type: 'application/pdf', data: await toBase64(pdf) }] : await Promise.all(files.slice(0, 4).map(shrink));
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  let res: Response;
  try {
    res = await fetch('/api/statement', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ files: payload, accounts, today: today() }),
    });
  } catch {
    throw new Error('Couldn’t reach Claude just now. Try again in a moment.');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const e = body.error;
    if (e === 'not_configured' || res.status === 404) throw new Error('Claude isn’t connected, so pictures can’t be read. CSV files still work.');
    if (e === 'no_credit') throw new Error('Your Anthropic credit has run out, so the picture couldn’t be read.');
    if (res.status === 413) throw new Error('That’s too big to send. Try fewer pictures at once.');
    throw new Error(`Claude couldn’t read that${body.detail ? ` (${String(body.detail).slice(0, 100)})` : ''}.`);
  }
  if (!body.readable) throw new Error(String(body.problem || 'That doesn’t look like a statement. Try a clearer screenshot.'));
  const t = today();
  const from = (body.period_from as string) || (body.balance_date as string) || t;
  const to = (body.period_to as string) || (body.balance_date as string) || t;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.abs(v) * 100) / 100 : 0);
  return {
    from: from <= to ? from : to,
    to: (body.balance_date as string) || to,
    count: typeof body.payments === 'number' ? body.payments : 0,
    moneyIn: num(body.money_in),
    moneyOut: num(body.money_out),
    closing: typeof body.closing_balance === 'number' ? Math.abs(body.closing_balance) : null,
    top: Array.isArray(body.top) ? (body.top as { name: string; amount: number }[]).slice(0, 5).map((x) => ({ name: String(x.name), amount: num(x.amount) })) : [],
    topBy: 'payee',
    account: typeof body.account === 'string' ? body.account : null,
  };
}
