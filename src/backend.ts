// Where data is saved. The real app uses Supabase.
// "Demo mode" (add ?demo to the address) keeps everything in memory so the
// screens can be tried before Supabase is connected. Nothing is saved in demo mode.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_DOMAINS, REMOVED_DOMAINS, type Account, type Balance, type Domain, type Routine, type Subcategory, type Task, type Tick, type Weight } from './types';
import { addDays, today, type Day } from './dates';
import { TICK_HISTORY_DAYS } from './routines';

export interface Snapshot {
  domains: Domain[];
  tasks: Task[];
  routines: Routine[];
  ticks: Tick[];
  subcategories: Subcategory[];
  accounts: Account[];
  balances: Balance[];
  weights: Weight[];
}

export interface Backend {
  load(now: Day): Promise<Snapshot>;
  insertTask(t: Task): Promise<void>;
  updateTask(id: string, changes: Partial<Task>): Promise<void>;
  insertRoutine(r: Routine): Promise<void>;
  updateRoutine(id: string, changes: Partial<Routine>): Promise<void>;
  /** count 0 removes the tick for that day. */
  setTick(routineId: string, day: Day, count: number): Promise<void>;
  insertSubcategory(s: Subcategory): Promise<void>;
  updateSubcategory(id: string, changes: Partial<Subcategory>): Promise<void>;
  deleteSubcategory(id: string): Promise<void>;
  insertAccount(a: Account): Promise<void>;
  updateAccount(id: string, changes: Partial<Account>): Promise<void>;
  setBalance(b: Balance): Promise<void>;
  setWeight(w: Weight): Promise<void>;
  /** Saves a QR screenshot privately and returns where it's stored. */
  uploadQr(taskId: string, file: File): Promise<string>;
  /** A short-lived link to show a stored QR screenshot. */
  qrUrl(path: string): Promise<string>;
  removeQr(path: string): Promise<void>;
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
      const [open, closed, routines, ticks, subcategories, accounts, balances, weights] = await Promise.all([
        sb.from('tasks').select('*').eq('status', 'open'),
        sb.from('tasks').select('*').neq('status', 'open').gte('closed_at', since),
        sb.from('routines').select('*').eq('active', true).order('created_at'),
        sb.from('routine_ticks').select('routine_id, day, count').gte('day', addDays(now, -TICK_HISTORY_DAYS)).limit(5000),
        sb.from('subcategories').select('id, domain_id, name, note, sort').order('sort'),
        sb.from('accounts').select('id, name, is_debt, active, sort').order('sort'),
        sb.from('balances').select('account_id, month, amount').gte('month', addDays(now, -260)),
        sb.from('weights').select('day, lb').gte('day', addDays(now, -180)).order('day'),
      ]);
      return {
        domains,
        tasks: [...check<Task[]>(open), ...check<Task[]>(closed)],
        routines: check<Routine[]>(routines),
        ticks: check<Tick[]>(ticks),
        subcategories: check<Subcategory[]>(subcategories),
        accounts: check<Account[]>(accounts),
        balances: check<Balance[]>(balances).map((b) => ({ ...b, amount: Number(b.amount) })),
        weights: check<Weight[]>(weights).map((w) => ({ ...w, lb: Number(w.lb) })),
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
    async setTick(routineId, day, count) {
      if (count <= 0) check(await sb.from('routine_ticks').delete().eq('routine_id', routineId).eq('day', day));
      else check(await sb.from('routine_ticks').upsert({ routine_id: routineId, day, count }, { onConflict: 'routine_id,day' }));
    },
    async insertSubcategory(x) {
      check(await sb.from('subcategories').insert(x));
    },
    async updateSubcategory(id, changes) {
      check(await sb.from('subcategories').update(changes).eq('id', id));
    },
    async deleteSubcategory(id) {
      check(await sb.from('subcategories').delete().eq('id', id));
    },
    async insertAccount(a) {
      check(await sb.from('accounts').insert(a));
    },
    async updateAccount(id, changes) {
      check(await sb.from('accounts').update(changes).eq('id', id));
    },
    async setBalance(b) {
      check(await sb.from('balances').upsert(b, { onConflict: 'account_id,month' }));
    },
    async setWeight(w) {
      check(await sb.from('weights').upsert(w, { onConflict: 'user_id,day' }));
    },
    async uploadQr(taskId, file) {
      const { data } = await sb.auth.getUser();
      if (!data.user) throw new Error('Not signed in');
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${data.user.id}/${taskId}-${Date.now()}.${ext}`;
      check(await sb.storage.from('qr').upload(path, file, { contentType: file.type || 'image/png', upsert: false }));
      return path;
    },
    async qrUrl(path) {
      const res = await sb.storage.from('qr').createSignedUrl(path, 3600);
      return check<{ signedUrl: string }>(res).signedUrl;
    },
    async removeQr(path) {
      check(await sb.storage.from('qr').remove([path]));
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
    id: crypto.randomUUID(), title, domain_id: id(dom), kind: 'task', project_id: null, due, due_time: null, remind_at: null, minutes: null, energy: null, step: null, starred: false, drop_off: null, qr_path: null, subcategory_id: null, status: 'open',
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
    id: crypto.randomUUID(), title, domain_id: id(dom), days, time_of_day, active: true, created_at: stamp, chunks: 1, chunk_label: null,
  });
  const longAgo = new Date(Date.now() - 60 * 86400000).toISOString();
  const routines = [
    { ...routine('Gym', 'Home', [0, 2, 4], 'day'), created_at: longAgo },
    { ...routine('20k steps', 'Home', [0, 1, 2, 3, 4, 5, 6], 'commute'), created_at: longAgo, chunks: 2, chunk_label: '10k' },
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
        ticks.push({ routine_id: r.id, day: d, count: r.chunks });
        left--;
      }
    }
  });
  // Sub-categories, as set up by update 4
  const sub = (area: string, name: string, note = '', sort = 0): Subcategory => ({ id: crypto.randomUUID(), domain_id: id(area), name, note, sort });
  const subcategories = [
    sub('Home', 'Returns', 'Do first. Screenshot every QR code, then one post office trip.', 1),
    sub('Home', 'Quick admin', 'Lunch-break jobs.', 2),
    sub('Work', 'Day job', '', 1),
    sub('Work', 'Admin & HR', '', 2),
    sub('Made in Heaven', 'Client work', 'Edits and shoots. Give each one its own time slot.', 1),
    sub('Job search', 'Applications', '', 1),
    sub('Side ideas', 'Ideas', 'Parked until you pick one.', 1),
  ];
  const subId = (name: string) => subcategories.find((x) => x.name === name)!.id;
  for (const t of tasks) {
    if (/^return|tk maxx/i.test(t.title)) t.subcategory_id = subId('Returns');
    if (t.title === 'Sort Oyster connector' || t.title === 'Book the theory test') t.subcategory_id = subId('Quick admin');
    if (/Tisha|Amira/.test(t.title) && t.kind === 'task') t.subcategory_id = subId('Client work');
    if (t.kind === 'idea') t.subcategory_id = subId('Ideas');
  }
  const ipad = tasks.find((t) => t.title === 'Return cracked iPad mini')!;
  Object.assign(ipad, { due: addDays(now, 2), drop_off: 'Post Office' });
  const boots = tasks.find((t) => t.title === 'Return the boots')!;
  boots.drop_off = 'InPost locker';
  // Example money and weight history
  const accounts: Account[] = [
    { id: 'a1', name: 'Current account', is_debt: false, active: true, sort: 1 },
    { id: 'a2', name: 'Savings', is_debt: false, active: true, sort: 2 },
    { id: 'a3', name: 'Credit card', is_debt: true, active: true, sort: 3 },
  ];
  const monthStart = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const balances: Balance[] = [];
  [[900, 2400, 600], [1000, 2700, 550], [1100, 3000, 500], [1150, 3200, 480], [1200, 3400, 450]].forEach((row, i) => {
    row.forEach((amount, j) => balances.push({ account_id: accounts[j].id, month: monthStart(5 - i), amount }));
  });
  const weights: Weight[] = [134.2, 133.6, 133.9, 132.8, 132.4, 131.9].map((lb, i) => ({ day: addDays(now, -7 * (6 - i)), lb }));
  const qrFiles = new Map<string, string>();
  const noop = async () => {};
  return {
    load: async () => ({ domains, tasks, routines, ticks, subcategories, accounts, balances, weights }),
    insertTask: noop, updateTask: noop, insertRoutine: noop, updateRoutine: noop, setTick: noop,
    insertSubcategory: noop, updateSubcategory: noop, deleteSubcategory: noop,
    insertAccount: noop, updateAccount: noop, setBalance: noop, setWeight: noop,
    uploadQr: async (taskId, file) => {
      const path = `demo/${taskId}-${Date.now()}`;
      qrFiles.set(path, URL.createObjectURL(file));
      return path;
    },
    qrUrl: async (path) => qrFiles.get(path) ?? '',
    removeQr: async (path) => { qrFiles.delete(path); },
  };
}
