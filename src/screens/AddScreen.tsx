import { useState } from 'react';
import { useStore } from '../store';
import type { TaskKind, TimeOfDay } from '../types';
import type { Day } from '../dates';
import { back } from '../router';
import { useToast } from '../toast';
import Header from '../components/Header';
import { DatePicker, DaysPicker, DomainPicker, FieldBlock, Segmented } from '../components/Fields';

// A plain add form for now. Session 2 adds the one-box capture with mic and AI sorting on top.

type Kind = TaskKind | 'routine';

export default function AddScreen({ presetDomain }: { presetDomain: string | null }) {
  const store = useStore();
  const toast = useToast();
  const firstReal = store.domains.find((d) => !d.is_inbox)?.id ?? store.inbox.id;
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('task');
  const [domainId, setDomainId] = useState(presetDomain && store.domains.some((d) => d.id === presetDomain) ? presetDomain : store.inbox.id);
  const [due, setDue] = useState<Day | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');

  const isRoutine = kind === 'routine';
  // Routines always belong to a real domain, never the Inbox.
  const routineDomain = domainId === store.inbox.id ? firstReal : domainId;
  const canSave = title.trim().length > 0 && (!isRoutine || days.length > 0);

  const save = () => {
    if (!canSave) return;
    if (isRoutine) {
      store.addRoutine({ title: title.trim(), domain_id: routineDomain, days, time_of_day: timeOfDay });
    } else {
      store.addTask({ title: title.trim(), kind, domain_id: domainId, due: kind === 'idea' ? null : due });
    }
    toast({ message: 'Added' });
    back();
  };

  return (
    <>
      <Header title="Add" close />
      <main className="page page-form">
        <div className="card field">
          <label htmlFor="add-title" className="field-label">What is it?</label>
          <textarea id="add-title" className="big-input" rows={2} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Return the boots" />
        </div>

        <FieldBlock label="Type">
          <Segmented<Kind>
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'task', label: 'Task' },
              { value: 'routine', label: 'Routine' },
              { value: 'project', label: 'Project' },
              { value: 'idea', label: 'Idea' },
            ]}
          />
        </FieldBlock>

        <FieldBlock label="Domain">
          <DomainPicker value={isRoutine ? routineDomain : domainId} onChange={setDomainId} allowInbox={!isRoutine} />
        </FieldBlock>

        {(kind === 'task' || kind === 'project') && (
          <FieldBlock label="When">
            <DatePicker value={due} onChange={setDue} />
          </FieldBlock>
        )}

        {isRoutine && (
          <>
            <FieldBlock label="Which days">
              <DaysPicker value={days} onChange={setDays} />
            </FieldBlock>
            <FieldBlock label="Time of day">
              <Segmented<TimeOfDay>
                label="Time of day"
                value={timeOfDay}
                onChange={setTimeOfDay}
                options={[
                  { value: 'commute', label: 'Commute' },
                  { value: 'day', label: 'Day' },
                  { value: 'evening', label: 'Evening' },
                ]}
              />
            </FieldBlock>
          </>
        )}

        {kind === 'idea' && <p className="muted small">Ideas have no date and stay off Today until you decide to start one.</p>}
      </main>
      <div className="bottom-bar">
        <button type="button" className="primary" disabled={!canSave} onClick={save}>Save</button>
      </div>
    </>
  );
}
