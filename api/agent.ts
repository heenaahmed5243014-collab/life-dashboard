// POST /api/agent
// Two jobs for the Today deck, both using Claude. Nothing is stored here.
//  - { mode: 'smm', agent, client, title, platform, brief }  -> { output } a draft from that social media agent
//  - { mode: 'email', text }                                -> { sender, subject, kind, due, summary, next_step }
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

const BASE = `You work for Heena, who runs Made in Heaven Visuals (photography and social media management for small UK businesses such as aesthetics clinics and bridal brands).
Write in British English. Be practical and ready to use: no preamble, no "here is", no markdown headings or bold. Use simple line breaks and short numbered lists where helpful.`;

const AGENTS: Record<string, string> = {
  captions: `${BASE}
You are the caption writer. Write 3 caption options for the post. Each: a scroll-stopping first line, 2 to 4 short lines, a clear call to action, and 2 or 3 fitting emojis. Match the platform's style. Label them 1, 2, 3.`,
  ideas: `${BASE}
You are the ideas agent. Give 6 post or reel ideas for this job. For each: a punchy title, the format (reel, carousel, story, static), and one line on what to film or show. Mix educational, behind-the-scenes, social proof and offer posts.`,
  hashtags: `${BASE}
You are the hashtag researcher. Give 20 hashtags in three groups on separate lines: 6 broad, 8 niche, 6 local (UK/London where relevant). Lowercase, no repeats. Then one line of advice on where to put them.`,
  planner: `${BASE}
You are the weekly content planner. Plan Monday to Sunday: for each day give the post type, a one-line idea, and the best posting time. Keep it realistic for one person (4 to 5 posts, stories on the other days).`,
  replies: `${BASE}
You are the reply drafter. The brief contains comments or DMs. Draft a warm, professional reply to each one, numbered to match, and suggest booking or a next step where it fits. Keep each reply under 50 words.`,
};

const orNull = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const EMAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sender', 'subject', 'kind', 'due', 'summary', 'next_step'],
  properties: {
    sender: { type: 'string', description: 'Who it is from: a person or company name, short' },
    subject: { type: 'string', description: 'What it is about, under 70 characters' },
    kind: { type: 'string', enum: ['reply', 'waiting'], description: 'reply = Heena needs to reply or act; waiting = Heena is waiting on them' },
    due: { ...orNull({ type: 'string', description: 'YYYY-MM-DD' }), description: 'A deadline mentioned or clearly implied, else null' },
    summary: { type: 'string', description: 'One sentence on what the email says' },
    next_step: { type: 'string', description: 'The single next action for Heena, starting with a verb, under 80 characters' },
  },
};

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'not_configured' });
  if (!(await isSignedIn(req))) return json(401, { error: 'not_signed_in' });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_request' }); }
  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (body.mode === 'email') {
      const text = String(body.text ?? '').trim().slice(0, 8000);
      if (!text) return json(400, { error: 'bad_request' });
      const r = await client.messages.create({
        model: MODEL, max_tokens: 2000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: EMAIL_SCHEMA } },
        system: `You sort emails for a busy person. Today is ${today}. Read the email (or a description of one) and fill in the fields. Dates must be real dates on or after today.`,
        messages: [{ role: 'user', content: text }],
      });
      if (r.stop_reason === 'refusal') return json(422, { error: 'refused' });
      const out = r.content.find((b) => b.type === 'text');
      if (!out || out.type !== 'text') return json(502, { error: 'no_output' });
      return json(200, JSON.parse(out.text));
    }
    const sys = AGENTS[String(body.agent ?? '')];
    if (!sys) return json(400, { error: 'unknown_agent' });
    const title = String(body.title ?? '').trim().slice(0, 200);
    if (!title) return json(400, { error: 'bad_request' });
    const r = await client.messages.create({
      model: MODEL, max_tokens: 2500,
      output_config: { effort: 'low' },
      system: sys,
      messages: [{ role: 'user', content: `Client: ${String(body.client ?? '').slice(0, 80) || 'not given'}\nPlatform: ${String(body.platform ?? 'Instagram').slice(0, 30)}\nJob: ${title}\nBrief: ${String(body.brief ?? '').slice(0, 3000) || 'none'}` }],
    });
    if (r.stop_reason === 'refusal') return json(422, { error: 'refused' });
    const text = r.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim();
    if (!text) return json(502, { error: 'no_output' });
    return json(200, { output: text.slice(0, 11000) });
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
