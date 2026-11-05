import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Energy, Task, TaskKind } from '../types';
import { addDays, dueLabel, hhmm, reminderAt, today } from '../dates';
import { Bell, Star } from '../icons';
import { cheer } from '../cheers';
import { areaConfig } from '../areas';
import { back, go } from '../router';
import { useToast } from '../toast';
import Header from '../components/Header';
import ItemRow, { minutesLabel } from '../components/ItemRow';
import { DatePicker, DomainPicker, FieldBlock, Segmented } from '../components/Fields';

export default function ItemScreen({ id }: { id: string }) {
  const store = useStore();
  const task = store.tasks.find((t) => t.id === id);
  if (!task) {
    return (
      <>
        <Header title="" />
        <main className="page page-form"><p className="muted">This item isn’t here any more.</p></main>
      </>
    );
  }
  return <ItemDetail task={task} />;
}

function ItemDetail({ task }: { task: Task }) {
  const store = useStore();
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [step, setStep] = useState(task.step ?? '');
  useEffect(() => setStep(task.step ?? ''), [task.step]);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setNotes(task.notes), [task.notes]);

  const projects = store.tasks.filter((p) => p.kind === 'project' && p.status === 'open' && p.id !== task.id && p.domain_id === task.domain_id);
  const children = task.kind === 'project' ? store.tasks.filter((c) => c.project_id === task.id && c.status === 'open') : [];

  const save = (changes: Partial<Task>) => store.updateTask(task.id, changes);
  const before = { status: task.status, closed_at: task.closed_at, due: task.due, remind_at: task.remind_at };
  const isOpen = task.status === 'open';
  const stages = areaConfig(store.domain(task.domain_id)).stages;

  const close = (status: 'done' | 'not_doing') => {
    save({ status, closed_at: new Date().toISOString(), starred: false });
    toast({ message: status === 'done' ? cheer() : 'Let go. It’s off your list.', undo: () => save(before) });
    back();
  };

  const snooze = (n: number) => {
    const now = today();
    const base = task.due && task.due > now ? task.due : now;
    const due = addDays(base, n);
    save({ due, remind_at: task.remind_at ? reminderAt(due, task.due_time) : null });
    const label = dueLabel(due, now);
    toast({ message: `Moved to ${label === 'Tomorrow' ? 'tomorrow' : label}`, undo: () => save(before) });
    back();
  };

  return (
    <>
      <Header title={task.kind === 'project' ? 'Project' : task.kind === 'idea' ? 'Idea' : 'Task'} />
      <main className="page page-form">
        <div className="card field">
          <label htmlFor="item-title" className="field-label">Title</label>
          <textarea
            id="item-title"
            className="big-input"
            rows={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title.trim() !== task.title && save({ title: title.trim() })}
          />
        </div>

        {!isOpen && (
          <div className="card closed-note">
            <span>{task.status === 'done' ? 'Done' : 'Marked as not doing'}</span>
            <button type="button" className="link-btn" onClick={() => save({ status: 'open', closed_at: null })}>Bring it back</button>
          </div>
        )}

        <FieldBlock label="Domain">
          <DomainPicker value={task.domain_id} onChange={(domain_id) => save({ domain_id })} />
        </FieldBlock>

        {task.kind === 'project' && stages && (
          <FieldBlock label="Stage">
            <div className="chips" role="radiogroup" aria-label="Stage">
              {stages.map((st) => {
                const on = task.stage === st;
                return (
                  <button key={st} type="button" role="radio" aria-checked={on} className={on ? 'chip on' : 'chip'} onClick={() => save({ stage: on ? null : st })}>
                    {st}
                  </button>
                );
              })}
            </div>
          </FieldBlock>
        )}

        <FieldBlock label="Type">
          <Segmented<TaskKind>
            label="Type"
            value={task.kind}
            onChange={(kind) => save(kind === 'idea' || kind === 'goal' ? { kind, due: null, due_time: null, remind_at: null, starred: false } : { kind })}
            options={[
              { value: 'task', label: 'Task' },
              { value: 'project', label: 'Project' },
              { value: 'idea', label: 'Idea' },
              { value: 'note', label: 'Note' },
              { value: 'goal', label: 'Goal' },
            ]}
          />
        </FieldBlock>

        {task.kind !== 'idea' && task.kind !== 'goal' && (
          <FieldBlock label="When">
            <DatePicker
              value={task.due}
              onChange={(due) => save(due ? { due, remind_at: task.remind_at ? reminderAt(due, task.due_time) : null } : { due, due_time: null, remind_at: null })}
            />
            {task.due && (
              <div className="time-row">
                <label className="chip chip-input wide">
                  {hhmm(task.due_time) ?? 'Add a time'}
                  <input
                    type="time"
                    aria-label="Time"
                    value={hhmm(task.due_time) ?? ''}
                    onChange={(e) => {
                      const t = e.target.value || null;
                      save({ due_time: t, remind_at: task.remind_at ? reminderAt(task.due!, t) : null });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={task.remind_at ? 'chip on' : 'chip'}
                  aria-pressed={!!task.remind_at}
                  onClick={() => save({ remind_at: task.remind_at ? null : reminderAt(task.due!, task.due_time) })}
                >
                  <Bell /> {task.remind_at ? `Reminder ${hhmm(task.due_time) ?? '09:00'}` : 'Remind me'}
                </button>
              </div>
            )}
          </FieldBlock>
        )}

        {task.kind === 'task' && projects.length > 0 && (
          <FieldBlock label="Part of a project">
            <select className="select" aria-label="Project" value={task.project_id ?? ''} onChange={(e) => save({ project_id: e.target.value || null })}>
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </FieldBlock>
        )}

        {children.length > 0 && (
          <FieldBlock label="Tasks in this project">
            <div className="list">{children.map((c) => <ItemRow key={c.id} task={c} />)}</div>
          </FieldBlock>
        )}

        {(task.kind === 'task' || task.kind === 'project') && (
          <>
            <FieldBlock label="Top 3">
              <button
                type="button"
                className={task.starred ? 'chip on' : 'chip'}
                aria-pressed={task.starred}
                onClick={() => {
                  if (!task.starred && store.tasks.filter((t) => t.starred && t.status === 'open').length >= 3) {
                    toast({ message: 'Top 3 is full. Unstar one first.' });
                    return;
                  }
                  save({ starred: !task.starred });
                }}
              >
                <Star filled={task.starred} /> {task.starred ? 'In your Top 3' : 'Add to Top 3'}
              </button>
            </FieldBlock>

            <FieldBlock label="How long?">
              <div className="chips" role="radiogroup" aria-label="Time estimate">
                {[5, 10, 15, 30, 60, 90].map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={task.minutes === m} className={task.minutes === m ? 'chip on' : 'chip'} onClick={() => save({ minutes: task.minutes === m ? null : m })}>
                    {minutesLabel(m)}
                  </button>
                ))}
              </div>
            </FieldBlock>

            <FieldBlock label="Energy">
              <Segmented<'' | Energy>
                label="Energy"
                value={task.energy ?? ''}
                onChange={(e) => save({ energy: e || null })}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'mid', label: 'Medium' },
                  { value: 'high', label: 'Focus' },
                  { value: '', label: 'Unset' },
                ]}
              />
            </FieldBlock>

            <FieldBlock label="First step">
              <input
                className="card step-input"
                aria-label="First step"
                value={step}
                placeholder="The tiniest thing that gets it started"
                onChange={(e) => setStep(e.target.value)}
                onBlur={() => step.trim() !== (task.step ?? '') && save({ step: step.trim() || null })}
              />
            </FieldBlock>
          </>
        )}

        <FieldBlock label="Notes">
          <textarea
            className="card notes"
            rows={4}
            aria-label="Notes"
            value={notes}
            placeholder="Anything useful: links, names, order numbers"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== task.notes && save({ notes })}
          />
        </FieldBlock>

        {task.project_id && (
          <button type="button" className="link-btn" onClick={() => go(`/item/${task.project_id}`)}>Open the project</button>
        )}
      </main>

      {isOpen && (
        <div className="bottom-bar actions">
          <button type="button" className="primary" onClick={() => close('done')}>Done</button>
          <div className="action-row">
            <button type="button" className="secondary" onClick={() => snooze(1)}>+1 day</button>
            <button type="button" className="secondary" onClick={() => snooze(7)}>+1 week</button>
            <button type="button" className="secondary" onClick={() => close('not_doing')}>Not doing this</button>
          </div>
        </div>
      )}
    </>
  );
}
