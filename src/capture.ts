// Sends a quick note to Claude (through our private /api/capture helper)
// and turns the answer into a task, note or routine.
import { supabase } from './backend';
import { hhmm, longDate, reminderAt, today, type Day } from './dates';
import type { Domain, Routine, Subcategory, Task, TimeOfDay } from './types';
import type { NewRoutine, NewTask } from './store';
import { areaConfig } from './areas';

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
  time_of_day: TimeOfDay;
  follow_up_title: string | null;
  follow_up_date: string | null;
  group?: string | null;
  refund_amount?: number | null;
  repeat?: 'week' | '2weeks' | '4weeks' | 'month' | null;
  emoji?: string | null;
}

export type CaptureError = 'not_configured' | 'bad_key' | 'no_credit' | 'offline' | 'failed';

const AI_OFF_KEY = 'ld:aiOff';

/** Remembers (for this browser session) that Claude isn't set up, so we stop trying. */
export function aiKnownOff(): boolean {
  try {
    return sessionStorage.getItem(AI_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/** Asks our helper (once per session) whether Claude is set up. Costs nothing. */
export async function checkClaude(): Promise<boolean> {
  if (aiKnownOff()) return false;
  try {
    const res = await fetch('/api/capture');
    const body = (await res.json()) as { configured?: boolean };
    if (!res.ok || !body.configured) {
      try { sessionStorage.setItem(AI_OFF_KEY, '1'); } catch { /* ignore */ }
      return false;
    }
    return true;
  } catch {
    return true; // offline or unknown: let the save try, it falls back safely
  }
}

/** Groups inside areas, as Claude sees them: "Area > Group". */
export const groupLabel = (s: Subcategory, domains: Domain[]) => `${domains.find((d) => d.id === s.domain_id)?.name ?? ''} > ${s.name.trim()}`;

export async function askClaude(text: string, domains: Domain[], subs: Subcategory[] = []): Promise<CaptureResult> {
  lastCaptureProblem = '';
  const now = new Date();
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  let res: Response;
  try {
    res = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        text,
        domains: domains.map((d) => d.name),
        groups: subs.filter((s) => domains.some((d) => d.id === s.domain_id)).map((s) => groupLabel(s, domains)),
        today: today(),
        weekday: longDate(today()).split(' ')[0],
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      }),
    });
  } catch {
    throw 'offline' as CaptureError;
  }
  if (res.ok) return (await res.json()) as CaptureResult;
  const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (body.error === 'not_configured' || res.status === 404) {
    try { sessionStorage.setItem(AI_OFF_KEY, '1'); } catch { /* ignore */ }
    throw 'not_configured' as CaptureError;
  }
  if (body.error === 'bad_key' || body.error === 'no_credit') throw body.error as CaptureError;
  // Keep the real reason so the message can show it.
  lastCaptureProblem = [body.error ?? `error ${res.status}`, body.detail].filter(Boolean).join(': ');
  throw 'failed' as CaptureError;
}

/** The last reason Claude couldn't sort something (shown in the message). */
export let lastCaptureProblem = '';

export const ERROR_TEXT: Record<CaptureError, string> = {
  not_configured: 'Claude isn’t connected yet, so it went to the Inbox.',
  bad_key: 'Claude’s API key isn’t working, so it went to the Inbox.',
  no_credit: 'Your Anthropic credit has run out, so it went to the Inbox.',
  offline: 'Couldn’t reach Claude just now, so it went to the Inbox.',
  failed: 'Claude couldn’t sort that one, so it went to the Inbox.',
};

/** Matches Claude's domain name to one of the user's domains (Inbox if no match). */
export function matchDomain(name: string, domains: Domain[], inbox: Domain): Domain {
  const n = name.trim().toLowerCase();
  return domains.find((d) => d.name.toLowerCase() === n || d.short_name.toLowerCase() === n) ?? inbox;
}

type Rec = { task: NewTask } | { routine: NewRoutine };

/** Converts Claude's answer into what the store saves: the item, plus at most one follow-up. */
export function toRecords(r: CaptureResult, domains: Domain[], inbox: Domain, subs: Subcategory[] = []): Rec[] {
  const domain = matchDomain(r.domain, domains, inbox);
  // Only use a group that really exists in the chosen area.
  const group = r.group ? subs.find((s) => s.domain_id === domain.id && groupLabel(s, domains).toLowerCase() === r.group!.trim().toLowerCase()) : undefined;
  const refund = typeof r.refund_amount === 'number' && Number.isFinite(r.refund_amount) && r.refund_amount >= 0 && r.refund_amount < 100000 ? Math.round(r.refund_amount * 100) / 100 : null;
  if (r.kind === 'routine') {
    const realDomain = domain.is_inbox ? domains.find((d) => !d.is_inbox) ?? domain : domain;
    return [{
      routine: {
        title: r.title,
        domain_id: realDomain.id,
        days: r.days.length ? [...new Set(r.days)].sort() : [0, 1, 2, 3, 4, 5, 6],
        time_of_day: r.time_of_day,
      },
    }];
  }
  const time = hhmm(r.time);
  const isIdea = r.kind === 'idea' || r.kind === 'goal';
  // A reminder or time with no day means today.
  const date: Day | null = isIdea ? null : r.date ?? (r.reminder || time ? today() : null);
  const stages = areaConfig(domain).stages;
  const recs: Rec[] = [{
    task: {
      title: r.title,
      kind: r.kind,
      minutes: r.minutes && r.minutes > 0 ? Math.round(r.minutes) : null,
      energy: r.energy ?? null,
      step: r.first_step || null,
      stage: r.kind === 'project' && stages ? (r.stage && stages.includes(r.stage) ? r.stage : stages[0]) : null,
      domain_id: domain.id,
      due: date,
      due_time: date ? time : null,
      remind_at: r.reminder && date ? reminderAt(date, time) : null,
      subcategory_id: group?.id ?? null,
      ...(r.repeat && date ? { repeat: r.repeat } : {}),
      ...(r.emoji && [...r.emoji].length <= 4 ? { icon: r.emoji } : {}),
      ...(r.kind === 'task' && refund !== null ? { refund_amount: refund } : {}),
    },
  }];
  if (!isIdea && r.follow_up_title && r.follow_up_date && /^\d{4}-\d{2}-\d{2}$/.test(r.follow_up_date)) {
    recs.push({ task: { title: r.follow_up_title, kind: 'task', domain_id: domain.id, due: r.follow_up_date, subcategory_id: group?.id ?? null } });
  }
  return recs;
}

export type Recent = { type: 'task'; item: Task } | { type: 'routine'; item: Routine };

export function recentlyAdded(tasks: Task[], routines: Routine[], n = 5): Recent[] {
  const all: Recent[] = [
    ...tasks.map((item) => ({ type: 'task' as const, item })),
    ...routines.map((item) => ({ type: 'routine' as const, item })),
  ];
  return all.sort((a, b) => b.item.created_at.localeCompare(a.item.created_at)).slice(0, n);
}
