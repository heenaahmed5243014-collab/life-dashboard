// Where data is saved. The real app uses Supabase.
// "Demo mode" (add ?demo to the address) keeps everything in memory so the
// screens can be tried before Supabase is connected. Nothing is saved in demo mode.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_DOMAINS, REMOVED_DOMAINS, type Domain, type Routine, type Task, type Tick } from './types';
import { addDays, today, type Day } from './dates';
import { TICK_HISTORY_DAYS } from './routines';

export interface Snapshot {
  domains: Domain[];
  tasks: Task[];
  routines: Routine[];
  ticks: Tick[];
}

export interface Backend {
  load(now: Day): Promise<Snapshot>;
  insertTask(t: Task): Promise<void>;
  updateTask(id: string, changes: Partial<Task>): Promise<void>;
  insertRoutine(r: Routine): Promise<void>;
  updateRoutine(id: string, changes: Partial<Routine>): Promise<void>;
  addTick(t: Tick): Promise<void>;
  removeTick(t: Tick): Promise<void>;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);
export const isDemo = new URLSearchParams(location.search).has('demo');

export const supabase: SupabaseClient | null = isConfigured && !isDemo ? createClient(url!, key!) : null;

const check = <T,>(res: { error: { message: string } | null; data?: unknown }) => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

/** Tasks closed more than this many days ago aren't loaded (they stay in the database). */
const RECENT_DAYS = 14;

export function supabaseBackend(sb: SupabaseClient): Backend {
  return {
    async load(now) {
      let domains = check<Domain[]>(await sb.from('domains').select('*').order('sort'));
      if (domains.length === 0) {
        // First sign-in: create the five domains plus Inbox.
        check(await sb.from('domains').upsert(DEFAULT_DOMAINS, { onConflict: 'user_id,name', ignoreDuplicates: true }));
        domains = check<Domain[]>(await sb.from('domains').select('*').order('sort'));
      }
      // Retire removed domains: move their items, then delete the domain. Nothing is lost.
      const retired = domains.filter((d) => REMOVED_DOMAINS.includes(d.name));
      const inbox = domains.find((d) => d.is_inbox);
      const home = domains.find((d) => d.name === 'Personal & home') ?? inbox;
      if (retired.length && inbox && home) {
        for (const d of retired) {
          check(await sb.from('tasks').update({ domain_id: inbox.id }).eq('domain_id', d.id));
          check(await sb.from('routines').update({ domain_id: home.id }).eq('domain_id', d.id));
          check(await sb.from('domains').delete().eq('id', d.id));
        }
        domains = domains.filter((d) => !REMOVED_DOMAINS.includes(d.name));
      }
      // Keep the built-in domains on the current colour palette.
      const stale = domains.filter((d) => {
        const def = DEFAULT_DOMAINS.find((x) => x.name === d.name);
        return def && def.color.toLowerCase() !== d.color.toLowerCase();
      });
      if (stale.length) {
        await Promise.all(stale.map((d) => sb.from('domains').update({ color: DEFAULT_DOMAINS.find((x) => x.name === d.name)!.color }).eq('id', d.id)));
        domains = domains.map((d) => ({ ...d, color: DEFAULT_DOMAINS.find((x) => x.name === d.name)?.color ?? d.color }));
      }
      const since = new Date(addDays(now, -RECENT_DAYS)).toISOString();
      const [open, closed, routines, ticks] = await Promise.all([
        sb.from('tasks').select('*').eq('status', 'open'),
        sb.from('tasks').select('*').neq('status', 'open').gte('closed_at', since),
        sb.from('routines').select('*').eq('active', true).order('created_at'),
        sb.from('routine_ticks').select('routine_id, day').gte('day', addDays(now, -TICK_HISTORY_DAYS)).limit(5000),
      ]);
      return {
        domains,
        tasks: [...check<Task[]>(open), ...check<Task[]>(closed)],
        routines: check<Routine[]>(routines),
        ticks: check<Tick[]>(ticks),
      };
    },
    async insertTask(t) {
      check(await sb.from('tasks').insert(t));
    },
    async updateTask(id, changes) {
      check(await sb.from('tasks').update(changes).eq('id', id));
    },
    async insertRoutine(r) {
      check(await sb.from('routines').insert(r));
    },
    async updateRoutine(id, changes) {
      check(await sb.from('routines').update(changes).eq('id', id));
    },
    async addTick(t) {
      check(await sb.from('routine_ticks').upsert(t, { onConflict: 'routine_id,day', ignoreDuplicates: true }));
    },
    async removeTick(t) {
      check(await sb.from('routine_ticks').delete().eq('routine_id', t.routine_id).eq('day', t.day));
    },
  };
}

/** In-memory sample data that matches the design mock-ups. */
export function demoBackend(): Backend {
  const now = today();
  const domains: Domain[] = DEFAULT_DOMAINS.map((d, i) => ({ ...d, id: `d${i}` }));
  const id = (name: string) => domains.find((d) => d.short_name === name)!.id;
  const stamp = new Date().toISOString();
  const task = (title: string, dom: string, due: Day | null, extra: Partial<Task> = {}): Task => ({
    id: crypto.randomUUID(), title, domain_id: id(dom), kind: 'task', project_id: null, due, due_time: null, remind_at: null, minutes: null, energy: null, step: null, starred: false, status: 'open',
    stage: null, notes: '', created_at: stamp, touched_at: stamp, closed_at: null, ...extra,
  });
  const tasks: Task[] = [
    task('Chase Bulletproof about the PM role', 'Job search', addDays(now, -1)),
    task('Send the wedding gallery to the client', 'Made in Heaven', now),
    task('Return the boots', 'Home', addDays(now, 2)),
    task('Schedule this week’s clinic posts', 'Made in Heaven', now),
    task('HMICFRS: check for an interview invite', 'Job search', addDays(now, 1)),
    task('Call the recruiter back', 'Job search', now, { due_time: '10:00' }),
    task('Edit Amira’s shoot', 'Made in Heaven', now, { due_time: '14:30', remind_at: new Date().toISOString() }),
    task('Interview prep: HMICFRS', 'Job search', addDays(now, 1), { due_time: '09:00' }),
    task('Trifid Media application', 'Job search', null, { kind: 'project', stage: 'Interview' }),
    task('HMICFRS application', 'Job search', null, { kind: 'project', stage: 'Applied' }),
    task('Amira wedding shoot', 'Made in Heaven', null, { kind: 'project', stage: 'Editing' }),
    task('Bedroom makeover', 'Home', null, { kind: 'project' }),
    task('Sort Oyster connector', 'Home', addDays(now, -5), { minutes: 10, energy: 'low', step: 'Find what you need and do just the first step.' }),
    task('TK Maxx (£27)', 'Home', null, { minutes: 10, energy: 'low', notes: 'Return window: check the order email for the last day.', step: 'Find the receipt. TK Maxx returns go back in store.' }),
    task('Return cracked iPad mini', 'Home', null, { minutes: 20, energy: 'mid', step: 'Take photos of the crack first, then start the return.' }),
    task('Edit Tisha’s wedding photos', 'Made in Heaven', null, { minutes: 90, energy: 'high', step: 'Open the folder and cull the first 50 photos. That’s it.', starred: true }),
    task('120lb', 'Home', null, { kind: 'goal' }),
    task('Pure Barre', 'Home', null, { kind: 'goal' }),
    task('Book the theory test', 'Home', null),
    task('Add new shoots to the portfolio site', 'Made in Heaven', null),
    task('Photo booth: price a starter kit', 'Side ideas', null, { kind: 'idea' }),
    task('Head spa: look into training courses', 'Side ideas', null, { kind: 'idea' }),
    task('Ask Sam about weekend cover', 'Inbox', null),
  ];
  const routine = (title: string, dom: string, days: number[], time_of_day: Routine['time_of_day']): Routine => ({
    id: crypto.randomUUID(), title, domain_id: id(dom), days, time_of_day, active: true, created_at: stamp,
  });
  const longAgo = new Date(Date.now() - 60 * 86400000).toISOString();
  const routines = [
    { ...routine('Gym', 'Home', [0, 2, 4], 'day'), created_at: longAgo },
    { ...routine('20k steps', 'Home', [0, 1, 2, 3, 4, 5, 6], 'commute'), created_at: longAgo },
    { ...routine('Evening reset', 'Home', [0, 1, 2, 3, 4, 5, 6], 'evening'), created_at: longAgo },
    { ...routine('Chase applications', 'Job search', [6], 'day'), created_at: longAgo },
  ];
  // Some made-up history so streaks show: each routine done on its last few due days.
  const ticks: Tick[] = [];
  const runs = [4, 2, 5, 3];
  routines.forEach((r, i) => {
    let left = runs[i];
    for (let d = addDays(now, -1); left > 0; d = addDays(d, -1)) {
      if (r.days.includes((new Date(d).getUTCDay() + 6) % 7)) {
        ticks.push({ routine_id: r.id, day: d });
        left--;
      }
    }
  });
  const noop = async () => {};
  return {
    load: async () => ({ domains, tasks, routines, ticks }),
    insertTask: noop, updateTask: noop, insertRoutine: noop, updateRoutine: noop, addTick: noop, removeTick: noop,
  };
}
