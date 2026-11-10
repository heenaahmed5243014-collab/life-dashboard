// POST /api/capture
// Turns one line of everyday text into a tidy, sorted item using Claude.
// Runs on Vercel's servers, so the Anthropic API key never reaches the phone.
// Only signed-in users of this app can call it (checked against Supabase).

import Anthropic from '@anthropic-ai/sdk';

// Change this to 'claude-haiku-5-5' for a much cheaper (slightly less clever) option.
// Claude Haiku 5.5: fast and very cheap, plenty for sorting a short note.
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

interface CaptureRequest {
  text: string;
  domains: string[]; // the user's domain names, e.g. "Job search"
  groups?: string[]; // groups inside areas, as "Area > Group", e.g. "Personal & home > Returns"
  categories?: string[]; // budget category keys, e.g. groceries, eating_out, transport
  today: string; // "2026-11-04" in the user's time zone
  weekday: string; // "Wednesday"
  time: string; // "14:05"
}

export interface CaptureResult {
  title: string;
  kind: 'task' | 'project' | 'routine' | 'note' | 'idea' | 'goal';
  minutes: number | null;
  energy: 'low' | 'mid' | 'high' | null;
  first_step: string | null;
  stage: string | null;
  domain: string;
  date: string | null;
  time: string | null;
  reminder: boolean;
  days: number[];
  time_of_day: 'commute' | 'day' | 'evening';
  follow_up_title: string | null;
  follow_up_date: string | null;
  group: string | null;
  refund_amount: number | null;
  repeat: 'week' | '2weeks' | '4weeks' | 'month' | null;
  emoji: string;
  spend_amount: number | null;
  spend_category: string | null;
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

// Structured-output schema. "Can be empty" is written as anyOf [..., null], the documented form.
const orNull = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

function schema(domains: string[], groups: string[], categories: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'kind', 'stage', 'minutes', 'energy', 'first_step', 'domain', 'date', 'time', 'reminder', 'days', 'time_of_day', 'follow_up_title', 'follow_up_date', 'group', 'refund_amount', 'repeat', 'emoji', 'spend_amount', 'spend_category'],
    properties: {
      title: { type: 'string', description: 'Short, clear wording that starts with a verb where it makes sense. No date/time words.' },
      kind: { type: 'string', enum: ['task', 'project', 'routine', 'note', 'idea', 'goal'] },
      minutes: { ...orNull({ type: 'integer' }), description: 'Rough time estimate in minutes for a task, else null' },
      energy: orNull({ type: 'string', enum: ['low', 'mid', 'high'] }),
      first_step: { ...orNull({ type: 'string' }), description: 'One tiny, concrete first action for a task, else null' },
      stage: orNull({ type: 'string', enum: ['Applied', 'Test', 'Interview', 'Offer', 'Closed', 'Booked', 'Shot', 'Editing', 'Delivered'] }),
      domain: { type: 'string', enum: domains },
      date: { ...orNull({ type: 'string' }), description: 'YYYY-MM-DD, or null if no day was mentioned' },
      time: { ...orNull({ type: 'string' }), description: '24-hour HH:MM, or null if no time was mentioned' },
      reminder: { type: 'boolean' },
      days: { type: 'array', items: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] }, description: 'Routine days, 0=Monday..6=Sunday. Empty unless kind is routine.' },
      time_of_day: { type: 'string', enum: ['commute', 'day', 'evening'] },
      follow_up_title: orNull({ type: 'string' }),
      follow_up_date: { ...orNull({ type: 'string' }), description: 'YYYY-MM-DD' },
      group: groups.length
        ? { ...orNull({ type: 'string', enum: groups }), description: 'The group inside the chosen area, written exactly as listed, or null' }
        : { type: 'null' },
      refund_amount: { ...orNull({ type: 'number' }), description: 'For a return or refund: the money coming back in pounds, else null' },
      spend_amount: { ...orNull({ type: 'number' }), description: 'Only when the text records money already spent: the amount in pounds. Else null.' },
      spend_category: categories.length ? orNull({ type: 'string', enum: [...categories, 'other'] }) : { type: 'null' },
      emoji: { type: 'string', description: 'One emoji that fits the item, e.g. 📸 for a shoot, 🏊 for swimming, 📦 for a return' },
      repeat: { ...orNull({ type: 'string', enum: ['week', '2weeks', '4weeks', 'month'] }), description: 'For a repeating event or appointment, how often. Else null.' },
    },
  };
}

const SYSTEM = `You sort quick notes for a personal to-do app. The user types one line, often casually, on their phone.

Decide:
- title: rewrite it as a short, clean item. Fix spelling and capitals. Remove filler like "remind me to", "I need to", and remove date and time words (they go in their own fields). Keep names and details.
- Repeating events: something that happens on a set day, usually at a set time, again and again ("swimming every Thursday 8pm", "therapy every 4 weeks on Tuesday", "team call every other Monday 10am", "rent on the 1st every month") is kind "task" with date = the NEXT time it happens (today if it's later today), time if given, and repeat = "week", "2weeks" (every other week / fortnightly), "4weeks" or "month". Habits with no set time ("drink water every day", "gym mon wed fri") stay routines. Everything else: repeat null.
- kind: "project" for something with an end point that will hold several tasks: one job application, or one client shoot. "task" for one-off things to do. "routine" for things that repeat (e.g. "gym mon wed fri", "every evening tidy up"). "note" for information to keep that isn't an action (e.g. "Sam's door code is 4512"). "idea" for side-business or someday thoughts (events, photo booth, head spa, "maybe I could...") unless the user clearly says it's a to-do. "goal" for life goals that aren't to-dos (a target weight, "learn to swim", "travel to Japan").
- minutes, energy and first_step (tasks and projects only; null otherwise): the user has ADHD, so make starting easy. minutes: a realistic estimate (5, 10, 15, 20, 30, 45, 60, 90...). energy: "low" for quick admin that needs little focus, "high" for deep work like editing or writing, otherwise "mid". first_step: one tiny, concrete action that takes under 2 minutes, e.g. "Open the order email and tap Return".
- domain: the best match from the list. Hints: job applications, interviews, recruiters, CVs -> job search. Photo or video shoots, clients, galleries, editing, social posts for clients -> Made in Heaven Visuals. Business ideas like events, photo booth, head spa -> side ideas. Gym, home, shopping, returns, health, family, admin -> personal & home. If it is genuinely unclear, use "Inbox".
- date: resolve words like "tomorrow", "Friday", "next week" (use Monday of next week), "in 3 days" against today's date. Null if none.
- time: 24-hour HH:MM if a time is mentioned ("10am" -> "10:00", "half 2" -> "14:30" unless clearly morning). Null if none.
- reminder: true only if the user asks to be reminded ("remind me", "ping me", "don't let me forget").
- days and time_of_day: only matter for routines. time_of_day: morning travel -> "commute", evening -> "evening", otherwise "day".
- stage: only for projects. Job applications: Applied, Test, Interview, Offer or Closed. Client shoots: Booked, Shot, Editing or Delivered. Otherwise null.
- follow_up_title and follow_up_date: usually both null. Only two cases add one extra task, which goes inside the project:
  - The user says they applied for a job (e.g. "applied to Trifid"): a project titled "<Company> application", stage "Applied", no date; follow_up_title "Follow up with <company>", follow_up_date 7 days after today.
  - The user mentions a photo or video shoot for a client (e.g. "shoot for Amira on Sat"): a project titled "<Client> shoot", stage "Booked", date = the shoot day; follow_up_title "Deliver gallery to <client>", follow_up_date 14 days after the shoot.
  Never add anything else.
- spend_amount and spend_category: if the text just records something already bought ("lunch £8.50", "tesco 23.40", "spent £12 on an uber", "coffee 3.20"), set spend_amount and pick spend_category (groceries = supermarkets and food shops, eating_out = cafés, restaurants, takeaways, drinks, transport = trains, TfL, buses, taxis, fuel, else "other"); write the title as the shop or item. Plans to buy something later ("buy a new kettle") are tasks: spend fields null.
- group: some areas are split into groups, listed as "Area > Group". If one clearly fits the item AND belongs to the area you chose, give it exactly as listed (e.g. "Personal & home > Returns" for anything being sent back, "Made in Heaven Visuals > Client work" for edits and shoots, "Job search > Applications" for applications). If none clearly fits, null. Never invent a group.
- refund_amount: only for returns and refunds. The amount of money coming back, as a number in pounds (e.g. "return Zara jacket £39.99" -> 39.99, "refund 12" -> 12). Null if no amount is mentioned or it isn't a return.`;

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
  const categories = Array.isArray(body.categories) ? body.categories.map(String).filter((c) => /^[a-z0-9_-]{1,30}$/.test(c)).slice(0, 20) : [];
  const groups = Array.isArray(body.groups) ? body.groups.map(String).filter((g) => g.length <= 120).slice(0, 60) : [];
  if (!text || domains.length === 0) return json(400, { error: 'bad_request' });

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(domains, groups, categories) } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `Today is ${body.weekday} ${body.today}; the time is ${body.time}.\n` +
            `Domains: ${domains.join(', ')}\n` +
            `Groups: ${groups.length ? groups.join('; ') : 'none'}\n\n` +
            `Text: ${text}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') return json(422, { error: 'refused' });
    if (response.stop_reason === 'max_tokens') return json(502, { error: 'api_error', detail: 'answer was cut off' });
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
      return json(502, { error: error.status === 400 && /credit/i.test(error.message) ? 'no_credit' : 'api_error', detail: `${error.status ?? ''} ${error.message}`.trim().slice(0, 160) });
    }
    console.error(error);
    return json(500, { error: 'server_error', detail: String(error instanceof Error ? error.message : error).slice(0, 160) });
  }
}

/** GET /api/capture: tells the app whether Claude is set up (no AI call, no cost). */
export function GET(): Response {
  return json(200, { configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}
