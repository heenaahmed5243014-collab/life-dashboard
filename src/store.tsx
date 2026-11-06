// Holds everything the screens show, and saves changes to the backend.
// Changes appear on screen straight away; if saving fails, you get a message
// and the app reloads what's really in the database.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Backend, Snapshot } from './backend';
import type { Account, Balance, Bill, Domain, IncomeSettings, Payslip, Routine, Subcategory, Task, Weight } from './types';
import { today } from './dates';
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
        setData((d) => d && { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...c } : t)) });
        save(backend.updateTask(id, c));
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
  }, [data, backend, save, reload]);

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
