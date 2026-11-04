// Sends a quick note to Claude (through our private /api/capture helper)
// and turns the answer into a task, note or routine.
import { supabase } from './backend';
import { hhmm, longDate, reminderAt, today, type Day } from './dates';
import type { Domain, Routine, Task, TimeOfDay } from './types';
import type { NewRoutine, NewTask } from './store';

export interface CaptureResult {
  title: string;
  kind: 'task' | 'routine' | 'note';
  domain: string;
  date: string | null;
  time: string | null;
  reminder: boolean;
  days: number[];
  time_of_day: TimeOfDay;
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

export async function askClaude(text: string, domains: Domain[]): Promise<CaptureResult> {
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
        today: today(),
        weekday: longDate(today()).split(' ')[0],
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      }),
    });
  } catch {
    throw 'offline' as CaptureError;
  }
  if (res.ok) return (await res.json()) as CaptureResult;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (body.error === 'not_configured' || res.status === 404) {
    try { sessionStorage.setItem(AI_OFF_KEY, '1'); } catch { /* ignore */ }
    throw 'not_configured' as CaptureError;
  }
  if (body.error === 'bad_key' || body.error === 'no_credit') throw body.error as CaptureError;
  throw 'failed' as CaptureError;
}

export const ERROR_TEXT: Record<CaptureError, string> = {
  not_configured: 'Claude isn’t connected yet, so it went to the Inbox.',
  bad_key: 'Claude’s API key isn’t working, so it went to the Inbox.',
  no_credit: 'Your Anthropic credit has run out, so it went to the Inbox.',
  offline: 'No connection to Claude, so it went to the Inbox.',
  failed: 'Claude couldn’t sort that one, so it went to the Inbox.',
};

/** Matches Claude's domain name to one of the user's domains (Inbox if no match). */
export function matchDomain(name: string, domains: Domain[], inbox: Domain): Domain {
  const n = name.trim().toLowerCase();
  return domains.find((d) => d.name.toLowerCase() === n || d.short_name.toLowerCase() === n) ?? inbox;
}

/** Converts Claude's answer into what the store saves. */
export function toRecord(
  r: CaptureResult,
  domains: Domain[],
  inbox: Domain,
): { task: NewTask } | { routine: NewRoutine } {
  const domain = matchDomain(r.domain, domains, inbox);
  if (r.kind === 'routine') {
    const realDomain = domain.is_inbox ? domains.find((d) => !d.is_inbox) ?? domain : domain;
    return {
      routine: {
        title: r.title,
        domain_id: realDomain.id,
        days: r.days.length ? [...new Set(r.days)].sort() : [0, 1, 2, 3, 4, 5, 6],
        time_of_day: r.time_of_day,
      },
    };
  }
  const time = hhmm(r.time);
  // A reminder or time with no day means today.
  const date: Day | null = r.date ?? (r.reminder || time ? today() : null);
  return {
    task: {
      title: r.title,
      kind: r.kind,
      domain_id: domain.id,
      due: date,
      due_time: date ? time : null,
      remind_at: r.reminder && date ? reminderAt(date, time) : null,
    },
  };
}

export type Recent = { type: 'task'; item: Task } | { type: 'routine'; item: Routine };

export function recentlyAdded(tasks: Task[], routines: Routine[], n = 5): Recent[] {
  const all: Recent[] = [
    ...tasks.map((item) => ({ type: 'task' as const, item })),
    ...routines.map((item) => ({ type: 'routine' as const, item })),
  ];
  return all.sort((a, b) => b.item.created_at.localeCompare(a.item.created_at)).slice(0, n);
}
