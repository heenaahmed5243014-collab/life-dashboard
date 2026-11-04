import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Task, TaskKind } from '../types';
import { addDays, dueLabel, today } from '../dates';
import { back, go } from '../router';
import { useToast } from '../toast';
import Header from '../components/Header';
import ItemRow from '../components/ItemRow';
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
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setNotes(task.notes), [task.notes]);

  const projects = store.tasks.filter((p) => p.kind === 'project' && p.status === 'open' && p.id !== task.id);
  const children = task.kind === 'project' ? store.tasks.filter((c) => c.project_id === task.id && c.status === 'open') : [];

  const save = (changes: Partial<Task>) => store.updateTask(task.id, changes);
  const before = { status: task.status, closed_at: task.closed_at, due: task.due };
  const isOpen = task.status === 'open';

  const close = (status: 'done' | 'not_doing') => {
    save({ status, closed_at: new Date().toISOString() });
    toast({ message: status === 'done' ? 'Done' : 'Let go. It’s off your list.', undo: () => save(before) });
    back();
  };

  const snooze = (n: number) => {
    const now = today();
    const base = task.due && task.due > now ? task.due : now;
    const due = addDays(base, n);
    save({ due });
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

        <FieldBlock label="Type">
          <Segmented<TaskKind>
            label="Type"
            value={task.kind}
            onChange={(kind) => save(kind === 'idea' ? { kind, due: null } : { kind })}
            options={[
              { value: 'task', label: 'Task' },
              { value: 'project', label: 'Project' },
              { value: 'idea', label: 'Idea' },
            ]}
          />
        </FieldBlock>

        {task.kind !== 'idea' && (
          <FieldBlock label="When">
            <DatePicker value={task.due} onChange={(due) => save({ due })} />
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
