// POST /api/capture
// Turns one line of everyday text into a tidy, sorted item using Claude.
// Runs on Vercel's servers, so the Anthropic API key never reaches the phone.
// Only signed-in users of this app can call it (checked against Supabase).

import Anthropic from '@anthropic-ai/sdk';

// Change this to 'claude-haiku-5-5' for a much cheaper (slightly less clever) option.
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

interface CaptureRequest {
  text: string;
  domains: string[]; // the user's domain names, e.g. "Job search"
  today: string; // "2026-11-04" in the user's time zone
  weekday: string; // "Wednesday"
  time: string; // "14:05"
}

export interface CaptureResult {
  title: string;
  kind: 'task' | 'project' | 'routine' | 'note' | 'idea';
  stage: string | null;
  domain: string;
  date: string | null;
  time: string | null;
  reminder: boolean;
  days: number[];
  time_of_day: 'commute' | 'day' | 'evening';
  follow_up_title: string | null;
  follow_up_date: string | null;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function isSignedIn(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL || !SUPABASE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
  });
  return res.ok;
}

function schema(domains: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'kind', 'stage', 'domain', 'date', 'time', 'reminder', 'days', 'time_of_day', 'follow_up_title', 'follow_up_date'],
    properties: {
      title: { type: 'string', description: 'Short, clear wording that starts with a verb where it makes sense. No date/time words.' },
      kind: { type: 'string', enum: ['task', 'project', 'routine', 'note', 'idea'] },
      stage: { type: ['string', 'null'], enum: ['Applied', 'Test', 'Interview', 'Offer', 'Closed', 'Booked', 'Shot', 'Editing', 'Delivered', null] },
      domain: { type: 'string', enum: domains },
      date: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null if no day was mentioned' },
      time: { type: ['string', 'null'], description: '24-hour HH:MM, or null if no time was mentioned' },
      reminder: { type: 'boolean' },
      days: { type: 'array', items: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] }, description: 'Routine days, 0=Monday..6=Sunday. Empty unless kind is routine.' },
      time_of_day: { type: 'string', enum: ['commute', 'day', 'evening'] },
      follow_up_title: { type: ['string', 'null'] },
      follow_up_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    },
  };
}

const SYSTEM = `You sort quick notes for a personal to-do app. The user types one line, often casually, on their phone.

Decide:
- title: rewrite it as a short, clean item. Fix spelling and capitals. Remove filler like "remind me to", "I need to", and remove date and time words (they go in their own fields). Keep names and details.
- kind: "project" for something with an end point that will hold several tasks: one job application, or one client shoot. "task" for one-off things to do. "routine" for things that repeat (e.g. "gym mon wed fri", "every evening tidy up"). "note" for information to keep that isn't an action (e.g. "Sam's door code is 4512"). "idea" for side-business or someday thoughts (events, photo booth, head spa, "maybe I could...") unless the user clearly says it's a to-do.
- domain: the best match from the list. Hints: job applications, interviews, recruiters, CVs -> job search. Photo or video shoots, clients, galleries, editing, social posts for clients -> Made in Heaven Visuals. Business ideas like events, photo booth, head spa -> side ideas. Gym, home, shopping, returns, health, family, admin -> personal & home. If it is genuinely unclear, use "Inbox".
- date: resolve words like "tomorrow", "Friday", "next week" (use Monday of next week), "in 3 days" against today's date. Null if none.
- time: 24-hour HH:MM if a time is mentioned ("10am" -> "10:00", "half 2" -> "14:30" unless clearly morning). Null if none.
- reminder: true only if the user asks to be reminded ("remind me", "ping me", "don't let me forget").
- days and time_of_day: only matter for routines. time_of_day: morning travel -> "commute", evening -> "evening", otherwise "day".
- stage: only for projects. Job applications: Applied, Test, Interview, Offer or Closed. Client shoots: Booked, Shot, Editing or Delivered. Otherwise null.
- follow_up_title and follow_up_date: usually both null. Only two cases add one extra task, which goes inside the project:
  - The user says they applied for a job (e.g. "applied to Trifid"): a project titled "<Company> application", stage "Applied", no date; follow_up_title "Follow up with <company>", follow_up_date 7 days after today.
  - The user mentions a photo or video shoot for a client (e.g. "shoot for Amira on Sat"): a project titled "<Client> shoot", stage "Booked", date = the shoot day; follow_up_title "Deliver gallery to <client>", follow_up_date 14 days after the shoot.
  Never add anything else.`;

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'not_configured' });
  if (!(await isSignedIn(req))) return json(401, { error: 'not_signed_in' });

  let body: CaptureRequest;
  try {
    body = (await req.json()) as CaptureRequest;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const text = String(body.text ?? '').trim().slice(0, 500);
  const domains = Array.isArray(body.domains) ? body.domains.map(String).slice(0, 20) : [];
  if (!text || domains.length === 0) return json(400, { error: 'bad_request' });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(domains) } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `Today is ${body.weekday} ${body.today}; the time is ${body.time}.\n` +
            `Domains: ${domains.join(', ')}\n\n` +
            `Text: ${text}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') return json(422, { error: 'refused' });
    const out = response.content.find((b) => b.type === 'text');
    if (!out || out.type !== 'text') return json(502, { error: 'no_output' });
    const result = JSON.parse(out.text) as CaptureResult;
    return json(200, result);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return json(503, { error: 'bad_key' });
    if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'rate_limited' });
    if (error instanceof Anthropic.APIError) {
      console.error('Anthropic error', error.status, error.message);
      // 400 with "credit balance" means the account needs topping up
      return json(502, { error: error.status === 400 && /credit/i.test(error.message) ? 'no_credit' : 'api_error' });
    }
    console.error(error);
    return json(500, { error: 'server_error' });
  }
}

/** GET /api/capture: tells the app whether Claude is set up (no AI call, no cost). */
export function GET(): Response {
  return json(200, { configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}
