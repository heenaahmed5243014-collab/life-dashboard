// POST /api/breakdown
// Suggests small, doable steps for one task (ADHD-friendly). Nothing is stored.
// Only signed-in users of this app can call it.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function isSignedIn(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL || !SUPABASE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
  return res.ok;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['steps'],
  properties: {
    steps: {
      type: 'array',
      description: '3 to 7 steps, in order',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'minutes'],
        properties: {
          title: { type: 'string', description: 'One small, concrete action starting with a verb, under 70 characters' },
          minutes: { type: 'integer', description: 'Rough minutes: 5, 10, 15, 20, 30, 45 or 60' },
        },
      },
    },
  },
};

const SYSTEM = `You break one task into small steps for someone with ADHD, so it feels easy to start.
Give 3 to 7 steps in the order they'd be done. Each step is one concrete physical action that starts with a verb ("Open the order email", not "Think about returns").
The first step should take under 5 minutes. Keep steps specific to the task and its details. Don't repeat steps the user already has. No headings, no advice, no numbering in the text.`;

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'not_configured' });
  if (!(await isSignedIn(req))) return json(401, { error: 'not_signed_in' });
  let body: { title?: string; notes?: string; existing?: string[] };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const title = String(body.title ?? '').trim().slice(0, 200);
  if (!title) return json(400, { error: 'bad_request' });
  const notes = String(body.notes ?? '').trim().slice(0, 800);
  const existing = Array.isArray(body.existing) ? body.existing.map(String).slice(0, 20) : [];

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Task: ${title}${notes ? `\nNotes: ${notes}` : ''}${existing.length ? `\nSteps I already have: ${existing.join('; ')}` : ''}` }],
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
