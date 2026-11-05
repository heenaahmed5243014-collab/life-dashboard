// A routine split into chunks (e.g. steps: First 10k, Second 10k). Each chunk is its own tick.
import type { Routine } from '../types';
import { useStore } from '../store';
import { useToast } from '../toast';
import { cheer } from '../cheers';
import { Check } from '../icons';

const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

export function chunkName(r: Routine, i: number): string {
  return r.chunk_label ? `${ORDINAL[i]} ${r.chunk_label}` : `${i + 1} of ${r.chunks}`;
}

export default function ChunkTicks({ routine, day, disabled = false }: { routine: Routine; day: string; disabled?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const count = store.tickCount(routine.id, day);

  const tap = (i: number) => {
    const next = count > i ? i : i + 1; // tick up to this one, or untick it and any after
    store.setTickCount(routine.id, day, next);
    if (next === routine.chunks && count < routine.chunks) toast({ message: cheer() });
  };

  return (
    <div className="chunks" style={{ gridTemplateColumns: `repeat(${Math.min(routine.chunks, 3)}, minmax(0, 1fr))` }}>
      {Array.from({ length: routine.chunks }, (_, i) => {
        const done = count > i;
        return (
          <button
            key={i}
            type="button"
            className={done ? 'chunk on' : 'chunk'}
            aria-pressed={done}
            disabled={disabled}
            onClick={() => tap(i)}
          >
            <span className="box"><Check size={16} /></span>
            <span className="chunk-text">
              <span className="chunk-name">{chunkName(routine, i)}</span>
              <span className="chunk-sub">{done ? 'Done' : 'Tap when done'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
