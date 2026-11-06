// POST /api/statement
// Reads a picture (screenshot or photo) or PDF of a bank statement with Claude and returns
// only the figures the app needs. Nothing is stored here. Only signed-in users can call it.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.STATEMENT_MODEL || 'claude-haiku-5-5';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface StatementRequest {
  files: { media_type: string; data: string }[]; // base64, no data: prefix
  accounts: string[]; // the user's account names
  today: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function isSignedIn(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL || !SUPABASE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
  return res.ok;
}

const orNull = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

function schema(accounts: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['readable', 'problem', 'account', 'closing_balance', 'balance_date', 'period_from', 'period_to', 'money_in', 'money_out', 'top', 'payments'],
    properties: {
      readable: { type: 'boolean', description: 'false if this is not a bank statement or banking app screen, or is too blurry to read' },
      problem: { ...orNull({ type: 'string' }), description: 'If not readable: a short, friendly reason. Else null.' },
      account: accounts.length ? { ...orNull({ type: 'string', enum: accounts }), description: 'Which of the user\'s accounts this is, only if clear from the bank/account name. Else null.' } : { type: 'null' },
      closing_balance: { ...orNull({ type: 'number' }), description: 'The latest balance shown, in pounds, as a positive number (for a credit card, the amount owed). Null if no balance is shown.' },
      balance_date: { ...orNull({ type: 'string' }), description: 'YYYY-MM-DD the closing balance is for. Null if not shown.' },
      period_from: { ...orNull({ type: 'string' }), description: 'YYYY-MM-DD of the earliest payment shown' },
      period_to: { ...orNull({ type: 'string' }), description: 'YYYY-MM-DD of the latest payment shown' },
      money_in: { type: 'number', description: 'Total of money coming in across the payments shown (0 if none)' },
      money_out: { type: 'number', description: 'Total of money going out across the payments shown, as a positive number (0 if none)' },
      payments: { type: 'integer', description: 'How many payments are shown' },
      top: {
        type: 'array',
        description: 'Up to 5 biggest outgoing payees or categories, largest first',
        items: { type: 'object', additionalProperties: false, required: ['name', 'amount'], properties: { name: { type: 'string' }, amount: { type: 'number' } } },
      },
    },
  };
}

const SYSTEM = `You read UK bank statements and banking app screenshots for a personal money tracker.
Only report what you can actually see. Never guess or invent figures. Amounts are in pounds.
If several pictures are given, they are parts of the same statement or app screen: combine them and count each payment once.
"closing_balance" is the most recent balance visible (e.g. "Balance", "Available balance" is NOT the same: prefer the actual balance; use available only if it's the only one).
Dates: UK format (05/11 is 5 November). Use the year shown, or today's year if none is shown and the date isn't in the future.`;

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'not_configured' });
  if (!(await isSignedIn(req))) return json(401, { error: 'not_signed_in' });

  let body: StatementRequest;
  try {
    body = (await req.json()) as StatementRequest;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const files = Array.isArray(body.files) ? body.files.slice(0, 4) : [];
  const accounts = Array.isArray(body.accounts) ? body.accounts.map(String).slice(0, 20) : [];
  if (!files.length || files.some((f) => typeof f?.data !== 'string' || !(IMAGE_TYPES.includes(f.media_type) || f.media_type === 'application/pdf'))) {
    return json(400, { error: 'bad_request', detail: 'Use photos, screenshots or a PDF' });
  }

  const content: Anthropic.ContentBlockParam[] = files.map((f) =>
    f.media_type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } }
      : { type: 'image', source: { type: 'base64', media_type: f.media_type as 'image/jpeg', data: f.data } },
  );
  content.push({ type: 'text', text: `Today is ${body.today}. My accounts: ${accounts.join(', ') || 'none listed'}. Read this statement.` });

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(accounts) } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') return json(422, { error: 'refused' });
    if (response.stop_reason === 'max_tokens') return json(502, { error: 'api_error', detail: 'answer was cut off' });
    const out = response.content.find((b) => b.type === 'text');
    if (!out || out.type !== 'text') return json(502, { error: 'no_output' });
    return json(200, JSON.parse(out.text));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return json(503, { error: 'bad_key' });
    if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'rate_limited' });
    if (error instanceof Anthropic.APIError) {
      console.error('Anthropic error', error.status, error.message);
      return json(502, { error: error.status === 400 && /credit/i.test(error.message) ? 'no_credit' : 'api_error', detail: `${error.status ?? ''} ${error.message}`.trim().slice(0, 160) });
    }
    console.error(error);
    return json(500, { error: 'server_error', detail: String(error instanceof Error ? error.message : error).slice(0, 160) });
  }
}
