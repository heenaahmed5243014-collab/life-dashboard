// Where data is saved. The real app uses Supabase.
// "Demo mode" (add ?demo to the address) keeps everything in memory so the
// screens can be tried before Supabase is connected. Nothing is saved in demo mode.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_DOMAINS, type Domain, type Routine, type Task, type Tick } from './types';
import { addDays, today, type Day } from './dates';

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
      const since = new Date(addDays(now, -RECENT_DAYS)).toISOString();
      const [open, closed, routines, ticks] = await Promise.all([
        sb.from('tasks').select('*').eq('status', 'open'),
        sb.from('tasks').select('*').neq('status', 'open').gte('closed_at', since),
        sb.from('routines').select('*').eq('active', true).order('created_at'),
        sb.from('routine_ticks').select('routine_id, day').gte('day', addDays(now, -RECENT_DAYS)),
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
    id: crypto.randomUUID(), title, domain_id: id(dom), kind: 'task', project_id: null, due, status: 'open',
    stage: null, notes: '', created_at: stamp, touched_at: stamp, closed_at: null, ...extra,
  });
  const tasks: Task[] = [
    task('Chase Bulletproof about the PM role', 'Job search', addDays(now, -1)),
    task('Send the wedding gallery to the client', 'Made in Heaven', now),
    task('Return the boots', 'Home', addDays(now, 2)),
    task('Update the parcel log', 'Concierge', now),
    task('Schedule this week’s clinic posts', 'Made in Heaven', now),
    task('HMICFRS: check for an interview invite', 'Job search', addDays(now, 1)),
    task('Handover notes for the new building', 'Concierge', addDays(now, 5)),
    task('Book the theory test', 'Home', null),
    task('Add new shoots to the portfolio site', 'Made in Heaven', null),
    task('Photo booth: price a starter kit', 'Side ideas', null, { kind: 'idea' }),
    task('Head spa: look into training courses', 'Side ideas', null, { kind: 'idea' }),
    task('Ask Sam about weekend cover', 'Inbox', null),
  ];
  const routine = (title: string, dom: string, days: number[], time_of_day: Routine['time_of_day']): Routine => ({
    id: crypto.randomUUID(), title, domain_id: id(dom), days, time_of_day, active: true, created_at: stamp,
  });
  const routines = [
    routine('Gym', 'Home', [0, 1, 2, 3, 4, 5, 6], 'day'),
    routine('20k steps', 'Home', [0, 1, 2, 3, 4, 5, 6], 'commute'),
    routine('Evening reset', 'Home', [0, 1, 2, 3, 4, 5, 6], 'evening'),
  ];
  const noop = async () => {};
  return {
    load: async () => ({ domains, tasks, routines, ticks: [] }),
    insertTask: noop, updateTask: noop, insertRoutine: noop, updateRoutine: noop, addTick: noop, removeTick: noop,
  };
}
