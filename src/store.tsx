// Holds everything the screens show, and saves changes to the backend.
// Changes appear on screen straight away; if saving fails, you get a message
// and the app reloads what's really in the database.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Backend, Snapshot } from './backend';
import type { Domain, Routine, Task, Tick } from './types';
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
  toggleTick(routineId: string, day: string): void;
  reload(): void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

const FALLBACK: Domain = { id: '', name: 'Unknown', short_name: 'Unknown', color: '#9A9A92', is_inbox: false, sort: 0 };

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
        toast({ message: 'Couldn’t save that. Check your connection and try again.' });
        reload();
      });
    },
    [toast, reload],
  );

  const store = useMemo<Store | null>(() => {
    if (!data) return null;
    const byId = new Map(data.domains.map((d) => [d.id, d]));
    const inbox = data.domains.find((d) => d.is_inbox) ?? data.domains[0] ?? FALLBACK;
    return {
      ...data,
      inbox,
      domain: (id) => byId.get(id) ?? FALLBACK,
      addTask(fields) {
        const stamp = nowIso();
        const t: Task = {
          id: crypto.randomUUID(), kind: 'task', project_id: null, due: null, status: 'open', stage: null, notes: '',
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
        const r: Routine = { id: crypto.randomUUID(), time_of_day: 'day', active: true, created_at: nowIso(), ...fields };
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
      toggleTick(routineId, day) {
        const tick: Tick = { routine_id: routineId, day };
        const has = data.ticks.some((t) => t.routine_id === routineId && t.day === day);
        setData((d) => d && {
          ...d,
          ticks: has ? d.ticks.filter((t) => !(t.routine_id === routineId && t.day === day)) : [...d.ticks, tick],
        });
        save(has ? backend.removeTick(tick) : backend.addTick(tick));
      },
      reload,
    };
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
