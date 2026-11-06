// Holds everything the screens show, and saves changes to the backend.
// Changes appear on screen straight away; if saving fails, you get a message
// and the app reloads what's really in the database.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Backend, Snapshot } from './backend';
import type { Account, Balance, Bill, Domain, IncomeSettings, Payslip, Routine, SavingsGoal, StepDay, Subcategory, Task, Weight } from './types';
import { stepSize } from './steps';
import { addDays, today, type Day } from './dates';
import { useToast } from './toast';

const nowIso = () => new Date().toISOString();

export type NewTask = Pick<Task, 'title' | 'domain_id'> & Partial<Task>;
export type NewRoutine = Pick<Routine, 'title' | 'domain_id' | 'days'> & Partial<Routine>;

interface Store extends Snapshot {
  domain(id: string): Domain;
  inbox: Domain;
  addTask(t: NewTask): Task;
  updateTask(id: string, changes: Partial<Task>): void;
  addRoutine(r: NewRoutine): Routine;
  updateRoutine(id: string, changes: Partial<Routine>): void;
  /** How many chunks of a routine are done on a day (0 if none). */
  tickCount(routineId: string, day: string): number;
  setTickCount(routineId: string, day: string, count: number): void;
  /** For one-chunk routines: tick or untick the whole day. */
  toggleTick(routineId: string, day: string): void;
  subcategoriesOf(domainId: string): Subcategory[];
  addSubcategory(domainId: string, name: string): Subcategory;
  updateSubcategory(id: string, changes: Partial<Subcategory>): void;
  removeSubcategory(id: string): void;
  addAccount(name: string, isDebt: boolean): Account;
  updateAccount(id: string, changes: Partial<Account>): void;
  setBalance(b: Balance): void;
  setWeight(w: Weight): void;
  setIncome(i: IncomeSettings): void;
  addPayslip(p: Omit<Payslip, 'id'>): void;
  deletePayslip(id: string): void;
  addBill(b: Omit<Bill, 'id' | 'active'>): Bill;
  updateBill(id: string, changes: Partial<Bill>): void;
  deleteBill(id: string): void;
  steps: StepDay[];
  goals: SavingsGoal[];
  noSpend: Day[];
  /** Saves the day's steps and ticks the steps routine's chunks to match. */
  setSteps(day: Day, count: number): void;
  addGoal(g: Omit<SavingsGoal, 'id' | 'sort'>): SavingsGoal;
  updateGoal(id: string, changes: Partial<SavingsGoal>): void;
  deleteGoal(id: string): void;
  toggleNoSpend(day: Day): void;
  stepLink(fresh: boolean): Promise<string | null>;
  uploadQr(task: Task, file: File): Promise<void>;
  removeQr(task: Task): void;
  qrUrl(path: string): Promise<string>;
  reload(): void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

const FALLBACK: Domain = { id: '', name: 'Unknown', short_name: 'Unknown', color: '#898781', is_inbox: false, sort: 0 };

export function StoreProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const toast = useToast();
  const [data, setData] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    backend.load(today()).then(
      (snap) => {
        setData(snap);
        setLoadError(null);
      },
      (e: Error) => setLoadError(e.message),
    );
  }, [backend]);

  useEffect(reload, [reload]);

  // Keep a copy on the phone after every change, so the app works offline.
  useEffect(() => {
    if (data && backend.saveSnapshot) backend.saveSnapshot(data);
  }, [data, backend]);

  // When offline changes have all synced, load the fresh copy; tell the user if one was refused.
  useEffect(() => {
    const onSynced = () => {
      toast({ message: 'Back online. Everything’s synced.' });
      reload();
    };
    const onError = () => toast({ message: 'One offline change couldn’t be saved. Check the item and try again.' });
    addEventListener('ld:synced', onSynced);
    addEventListener('ld:sync-error', onError);
    return () => {
      removeEventListener('ld:synced', onSynced);
      removeEventListener('ld:sync-error', onError);
    };
  }, [reload, toast]);

  // Reload when the app comes back to the front, so phone and PC stay in step.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const save = useCallback(
    (p: Promise<void>) => {
      p.catch((e: Error) => {
        console.error(e);
        // Only blame the connection when it really is the connection.
        const offline = !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e.message);
        toast({
          message: offline
            ? 'Couldn’t save that: no internet connection. Try again in a moment.'
            : /column|schema|relation|does not exist/i.test(e.message)
              ? 'Couldn’t save that: your database needs an update. Ask Claude for the latest Supabase update.'
              : `Couldn’t save that (${e.message.slice(0, 80)}).`,
        });
        reload();
      });
    },
    [toast, reload],
  );

  const store = useMemo<Store | null>(() => {
    if (!data) return null;
    const byId = new Map(data.domains.map((d) => [d.id, d]));
    const inbox = data.domains.find((d) => d.is_inbox) ?? data.domains[0] ?? FALLBACK;
    const api: Store = {
      ...data,
      steps: data.steps ?? [],
      goals: data.goals ?? [],
      noSpend: data.noSpend ?? [],
      inbox,
      domain: (id) => byId.get(id) ?? FALLBACK,
      addTask(fields) {
        const stamp = nowIso();
        const t: Task = {
          id: crypto.randomUUID(), kind: 'task', project_id: null, due: null, due_time: null, remind_at: null, minutes: null, energy: null, step: null, starred: false, drop_off: null, qr_path: null, subcategory_id: null, status: 'open', stage: null, notes: '',
          created_at: stamp, touched_at: stamp, closed_at: null, ...fields,
        };
        setData((d) => d && { ...d, tasks: [...d.tasks, t] });
        save(backend.insertTask(t));
        return t;
      },
      updateTask(id, changes) {
        const c = { ...changes, touched_at: nowIso() };
        const before = data.tasks.find((t) => t.id === id);
        setData((d) => d && { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...c } : t)) });
        save(backend.updateTask(id, c));
        if (!before) return;
        // Job applications: sending one adds a "follow up" a week later (undone if you reopen it).
        const sub = data.subcategories.find((x) => x.id === before.subcategory_id);
        const isApplication = sub?.name.trim().toLowerCase() === 'applications' && before.kind === 'task' && !/^follow up/i.test(before.title);
        if (!isApplication) return;
        const followTitle = `Follow up: ${before.title}`;
        if (changes.status === 'done' && before.status === 'open') {
          const exists = data.tasks.some((t) => t.title === followTitle && t.status === 'open');
          if (!exists) {
            api.addTask({ title: followTitle, domain_id: before.domain_id, subcategory_id: before.subcategory_id, due: addDays(today(), 7), minutes: 10, step: 'Send a short, friendly check-in email' });
            toast({ message: 'Nice. A follow-up is on your list for next week.' });
          }
        } else if (changes.status === 'open' && before.status === 'done') {
          const f = data.tasks.find((t) => t.title === followTitle && t.status === 'open' && Date.now() - Date.parse(t.created_at) < 3600_000);
          if (f) api.updateTask(f.id, { status: 'not_doing', closed_at: nowIso() });
        }
      },
      addRoutine(fields) {
        const r: Routine = { id: crypto.randomUUID(), time_of_day: 'day', active: true, created_at: nowIso(), chunks: 1, chunk_label: null, ...fields };
        setData((d) => d && { ...d, routines: [...d.routines, r] });
        save(backend.insertRoutine(r));
        return r;
      },
      updateRoutine(id, changes) {
        setData((d) => d && {
          ...d,
          routines: d.routines.map((r) => (r.id === id ? { ...r, ...changes } : r)).filter((r) => r.active),
        });
        save(backend.updateRoutine(id, changes));
      },
      tickCount(routineId, day) {
        return data.ticks.find((t) => t.routine_id === routineId && t.day === day)?.count ?? 0;
      },
      setTickCount(routineId, day, count) {
        setData((d) => d && {
          ...d,
          ticks: [
            ...d.ticks.filter((t) => !(t.routine_id === routineId && t.day === day)),
            ...(count > 0 ? [{ routine_id: routineId, day, count }] : []),
          ],
        });
        save(backend.setTick(routineId, day, count));
      },
      toggleTick(routineId, day) {
        const r = data.routines.find((x) => x.id === routineId);
        const full = r?.chunks ?? 1;
        const has = data.ticks.find((t) => t.routine_id === routineId && t.day === day)?.count ?? 0;
        api.setTickCount(routineId, day, has >= full ? 0 : full);
      },
      subcategoriesOf(domainId) {
        return data.subcategories.filter((x) => x.domain_id === domainId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      },
      addSubcategory(domainId, name) {
        const sort = Math.max(0, ...data.subcategories.filter((x) => x.domain_id === domainId).map((x) => x.sort)) + 1;
        const x: Subcategory = { id: crypto.randomUUID(), domain_id: domainId, name: name.trim(), note: '', sort };
        setData((d) => d && { ...d, subcategories: [...d.subcategories, x] });
        save(backend.insertSubcategory(x));
        return x;
      },
      updateSubcategory(id, changes) {
        setData((d) => d && { ...d, subcategories: d.subcategories.map((x) => (x.id === id ? { ...x, ...changes } : x)) });
        save(backend.updateSubcategory(id, changes));
      },
      removeSubcategory(id) {
        // Items in it stay in the area, just without a sub-category.
        setData((d) => d && {
          ...d,
          subcategories: d.subcategories.filter((x) => x.id !== id),
          tasks: d.tasks.map((t) => (t.subcategory_id === id ? { ...t, subcategory_id: null } : t)),
        });
        save(backend.deleteSubcategory(id));
      },
      addAccount(name, isDebt) {
        const a: Account = { id: crypto.randomUUID(), name: name.trim(), is_debt: isDebt, active: true, sort: data.accounts.length + 1 };
        setData((d) => d && { ...d, accounts: [...d.accounts, a] });
        save(backend.insertAccount(a));
        return a;
      },
      updateAccount(id, changes) {
        setData((d) => d && { ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...changes } : a)) });
        save(backend.updateAccount(id, changes));
      },
      setBalance(b) {
        setData((d) => d && {
          ...d,
          balances: [...d.balances.filter((x) => !(x.account_id === b.account_id && x.month === b.month)), b],
        });
        save(backend.setBalance(b));
      },
      setWeight(w) {
        setData((d) => d && { ...d, weights: [...d.weights.filter((x) => x.day !== w.day), w].sort((a, b) => a.day.localeCompare(b.day)) });
        save(backend.setWeight(w));
      },
      setIncome(i) {
        setData((d) => d && { ...d, income: i });
        save(backend.setIncome(i));
      },
      addPayslip(p) {
        const slip: Payslip = { id: crypto.randomUUID(), ...p };
        setData((d) => d && { ...d, payslips: [slip, ...d.payslips.filter((x) => x.paid_on !== p.paid_on)].sort((a, b) => b.paid_on.localeCompare(a.paid_on)) });
        save(backend.addPayslip(slip));
      },
      deletePayslip(id) {
        setData((d) => d && { ...d, payslips: d.payslips.filter((x) => x.id !== id) });
        save(backend.deletePayslip(id));
      },
      addBill(fields) {
        const b: Bill = { id: crypto.randomUUID(), active: true, ...fields };
        setData((d) => d && { ...d, bills: [...(d.bills ?? []), b] });
        save(backend.insertBill(b));
        return b;
      },
      updateBill(id, changes) {
        setData((d) => d && { ...d, bills: (d.bills ?? []).map((b) => (b.id === id ? { ...b, ...changes } : b)) });
        save(backend.updateBill(id, changes));
      },
      deleteBill(id) {
        setData((d) => d && { ...d, bills: (d.bills ?? []).filter((b) => b.id !== id) });
        save(backend.deleteBill(id));
      },
      setSteps(day, count) {
        const s: StepDay = { day, count, source: 'manual' };
        setData((d) => d && { ...d, steps: [...(d.steps ?? []).filter((x) => x.day !== day), s].sort((a, b) => a.day.localeCompare(b.day)) });
        save(backend.setSteps(s));
        for (const r of data.routines.filter((x) => /steps/i.test(x.title))) {
          const done = Math.min(r.chunks, Math.floor(count / stepSize(r)));
          if (done > api.tickCount(r.id, day)) api.setTickCount(r.id, day, done);
        }
      },
      addGoal(fields) {
        const g: SavingsGoal = { id: crypto.randomUUID(), sort: (data.goals ?? []).length + 1, ...fields };
        setData((d) => d && { ...d, goals: [...(d.goals ?? []), g] });
        save(backend.insertGoal(g));
        return g;
      },
      updateGoal(id, changes) {
        setData((d) => d && { ...d, goals: (d.goals ?? []).map((g) => (g.id === id ? { ...g, ...changes } : g)) });
        save(backend.updateGoal(id, changes));
      },
      deleteGoal(id) {
        setData((d) => d && { ...d, goals: (d.goals ?? []).filter((g) => g.id !== id) });
        save(backend.deleteGoal(id));
      },
      toggleNoSpend(day) {
        const on = !(data.noSpend ?? []).includes(day);
        setData((d) => d && { ...d, noSpend: on ? [...(d.noSpend ?? []), day] : (d.noSpend ?? []).filter((x) => x !== day) });
        save(backend.setNoSpend(day, on));
      },
      stepLink(fresh) {
        return backend.stepLink(fresh);
      },
      async uploadQr(task, file) {
        const old = task.qr_path;
        const path = await backend.uploadQr(task.id, file);
        api.updateTask(task.id, { qr_path: path });
        if (old) backend.removeQr(old).catch(() => {});
      },
      removeQr(task) {
        if (!task.qr_path) return;
        const old = task.qr_path;
        api.updateTask(task.id, { qr_path: null });
        backend.removeQr(old).catch(() => {});
      },
      qrUrl(path) {
        return backend.qrUrl(path);
      },
      reload,
    };
    return api;
  }, [data, backend, save, reload, toast]);

  if (loadError && !data) {
    return (
      <main className="page center">
        <h1 className="h2">Couldn’t load your list</h1>
        <p className="muted">{loadError}</p>
        <button type="button" className="primary" onClick={reload}>Try again</button>
      </main>
    );
  }
  if (!store) return <main className="page center"><p className="muted">Loading…</p></main>;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
