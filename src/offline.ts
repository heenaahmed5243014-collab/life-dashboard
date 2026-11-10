// Offline support for your data.
// - A copy of your list is kept on the phone, so the app opens and works with no signal.
// - Changes made offline wait in a queue on the phone and are sent, in order,
//   as soon as there's a connection again.
import type { Backend, Snapshot } from './backend';
import type { Day } from './dates';

/** Changes that can wait in the queue (QR uploads need a connection, so they aren't here). */
const QUEUEABLE = [
  'insertTask', 'updateTask', 'insertRoutine', 'updateRoutine', 'setTick',
  'insertDomain', 'insertSubcategory', 'updateSubcategory', 'deleteSubcategory',
  'insertAccount', 'updateAccount', 'setBalance', 'setWeight', 'removeQr',
  'setIncome', 'addPayslip', 'deletePayslip', 'insertBill', 'updateBill', 'deleteBill',
  'setSteps', 'setWater', 'insertGoal', 'updateGoal', 'deleteGoal', 'setNoSpend',
  'insertAffirmation', 'deleteAffirmation', 'insertLead', 'updateLead', 'deleteLead', 'insertReward', 'updateReward', 'deleteReward', 'insertSpends', 'updateSpend', 'deleteSpend', 'upsertBudget', 'deleteBudget',
] as const;
type QueueableName = (typeof QUEUEABLE)[number];

interface Op {
  m: QueueableName;
  a: unknown[];
}

export interface SyncStatus {
  online: boolean;
  pending: number;
  usingSaved: boolean; // showing the saved copy because the database couldn't be reached
}

export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (typeof navigator !== 'undefined' && !navigator.onLine) ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|network connection was lost|timed? ?out|ERR_INTERNET|offline/i.test(msg);
}

/** Saving something that's already there (e.g. the connection dropped after it saved) counts as done. */
const isAlreadyThere = (e: unknown) => /duplicate key|already exists|23505/i.test(e instanceof Error ? e.message : String(e));

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: offline copy just won't update */
  }
};

export interface OfflineBackend extends Backend {
  saveSnapshot(s: Snapshot): void;
  status(): SyncStatus;
  flush(): Promise<void>;
}

export function withOffline(real: Backend, userId: string): OfflineBackend {
  const QUEUE_KEY = `ld:queue:${userId}`;
  const SNAP_KEY = `ld:snapshot:${userId}`;
  let queue: Op[] = read<Op[]>(QUEUE_KEY, []);
  let usingSaved = false;
  let flushing: Promise<void> | null = null;
  let timer: number | undefined;

  const emit = () => dispatchEvent(new CustomEvent<SyncStatus>('ld:sync', { detail: api.status() }));
  const persist = () => {
    write(QUEUE_KEY, queue);
    emit();
  };
  const later = (ms = 4000) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void api.flush(), ms);
  };

  const call = (op: Op) => (real[op.m] as (...a: unknown[]) => Promise<void>)(...op.a);

  const queued = (m: QueueableName) => async (...a: unknown[]) => {
    const op: Op = { m, a };
    // Keep changes in order: if anything is still waiting, this waits behind it.
    if (queue.length || !navigator.onLine) {
      queue.push(op);
      persist();
      later();
      return;
    }
    try {
      await call(op);
    } catch (e) {
      if (isAlreadyThere(e)) return;
      if (!isNetworkError(e)) throw e;
      queue.push(op);
      persist();
      later();
    }
  };

  const api = {
    ...real,
    ...Object.fromEntries(QUEUEABLE.map((m) => [m, queued(m)])),

    async load(now: Day): Promise<Snapshot> {
      if (queue.length && navigator.onLine) await api.flush();
      const saved = read<Snapshot | null>(SNAP_KEY, null);
      // Changes still waiting to sync aren't in the database yet, so the saved copy is the truth.
      if (queue.length && saved) {
        usingSaved = true;
        emit();
        return saved;
      }
      try {
        const fresh = await real.load(now);
        usingSaved = false;
        write(SNAP_KEY, fresh);
        emit();
        return fresh;
      } catch (e) {
        if (saved && isNetworkError(e)) {
          usingSaved = true;
          emit();
          return saved;
        }
        throw e;
      }
    },

    async uploadQr(taskId: string, file: File) {
      if (!navigator.onLine) throw new Error('offline');
      return real.uploadQr(taskId, file);
    },

    saveSnapshot(s: Snapshot) {
      write(SNAP_KEY, s);
    },

    status(): SyncStatus {
      return { online: navigator.onLine, pending: queue.length, usingSaved };
    },

    flush(): Promise<void> {
      if (flushing) return flushing;
      flushing = (async () => {
        while (queue.length && navigator.onLine) {
          const op = queue[0];
          try {
            await call(op);
          } catch (e) {
            if (isNetworkError(e)) break; // still offline: try again later
            if (!isAlreadyThere(e)) {
              console.error('Dropped a change the database refused', op, e);
              dispatchEvent(new CustomEvent('ld:sync-error', { detail: e instanceof Error ? e.message : String(e) }));
            }
          }
          queue.shift();
          persist();
        }
        if (!queue.length && usingSaved) {
          usingSaved = false;
          dispatchEvent(new Event('ld:synced'));
        }
        emit();
        if (queue.length) later(20000);
      })().finally(() => {
        flushing = null;
      });
      return flushing;
    },
  } as OfflineBackend;

  addEventListener('online', () => {
    emit();
    void api.flush();
  });
  addEventListener('offline', emit);
  if (queue.length) later(1500);
  return api;
}
