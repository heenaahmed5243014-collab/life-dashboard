import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Routine, TimeOfDay } from '../types';
import { daysLabel, today, weekday } from '../dates';
import { back } from '../router';
import { useToast } from '../toast';
import Header from '../components/Header';
import { DaysPicker, DomainPicker, FieldBlock, Segmented } from '../components/Fields';
import ChunkTicks from '../components/ChunkTicks';

export default function RoutineScreen({ id }: { id: string }) {
  const store = useStore();
  const routine = store.routines.find((r) => r.id === id);
  if (!routine) {
    return (
      <>
        <Header title="" />
        <main className="page page-form"><p className="muted">This routine isn’t here any more.</p></main>
      </>
    );
  }
  return <RoutineDetail routine={routine} />;
}

function RoutineDetail({ routine }: { routine: Routine }) {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const [title, setTitle] = useState(routine.title);
  useEffect(() => setTitle(routine.title), [routine.title]);
  const [label, setLabel] = useState(routine.chunk_label ?? '');
  useEffect(() => setLabel(routine.chunk_label ?? ''), [routine.chunk_label]);
  const doneToday = store.tickCount(routine.id, now) >= routine.chunks;
  const dueToday = routine.days.includes(weekday(now));
  const save = (changes: Partial<Routine>) => store.updateRoutine(routine.id, changes);

  const stop = () => {
    if (!confirm(`Stop the routine “${routine.title}”? Its history is kept.`)) return;
    save({ active: false });
    toast({ message: 'Routine stopped', undo: () => store.updateRoutine(routine.id, { active: true }) });
    back();
  };

  return (
    <>
      <Header title="Routine" />
      <main className="page page-form">
        <div className="card field">
          <label htmlFor="routine-title" className="field-label">Title</label>
          <textarea
            id="routine-title"
            className="big-input"
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title.trim() !== routine.title && save({ title: title.trim() })}
          />
        </div>

        <FieldBlock label={`Which days · ${daysLabel(routine.days)}`}>
          <DaysPicker value={routine.days} onChange={(days) => days.length > 0 && save({ days })} />
        </FieldBlock>

        <FieldBlock label="Split into chunks">
          <div className="chips" role="radiogroup" aria-label="Number of chunks">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={routine.chunks === n} className={routine.chunks === n ? 'chip on' : 'chip'} onClick={() => save({ chunks: n })}>
                {n === 1 ? 'No split' : `${n} chunks`}
              </button>
            ))}
          </div>
          {routine.chunks > 1 && (
            <label className="card field chunk-label-field">
              <span className="field-label">Each chunk is… (e.g. 10k, 1 litre, 15 min)</span>
              <input
                className="step-input"
                value={label}
                placeholder="10k"
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => label.trim() !== (routine.chunk_label ?? '') && save({ chunk_label: label.trim() || null })}
              />
            </label>
          )}
          {routine.chunks > 1 && <p className="note">Your streak counts a day once all {routine.chunks} are ticked.</p>}
        </FieldBlock>

        <FieldBlock label="Time of day">
          <Segmented<TimeOfDay>
            label="Time of day"
            value={routine.time_of_day}
            onChange={(time_of_day) => save({ time_of_day })}
            options={[
              { value: 'commute', label: 'Commute' },
              { value: 'day', label: 'Day' },
              { value: 'evening', label: 'Evening' },
            ]}
          />
        </FieldBlock>

        <FieldBlock label="Domain">
          <DomainPicker value={routine.domain_id} onChange={(domain_id) => save({ domain_id })} allowInbox={false} />
        </FieldBlock>

        <button type="button" className="link-btn quiet" onClick={stop}>Stop this routine</button>
      </main>
      {dueToday && (
        <div className="bottom-bar">
          {routine.chunks > 1 ? (
            <ChunkTicks routine={routine} day={now} />
          ) : (
            <button type="button" className={doneToday ? 'secondary' : 'primary'} onClick={() => store.toggleTick(routine.id, now)}>
              {doneToday ? 'Done today · tap to undo' : 'Mark done for today'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
