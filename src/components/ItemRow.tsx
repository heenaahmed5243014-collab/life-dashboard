import type { Task } from '../types';
import { useStore } from '../store';
import { dueLabel, hhmm } from '../dates';
import { go } from '../router';
import { useToast } from '../toast';
import { Bell, Check } from '../icons';

export function whenText(t: Task): string {
  if (t.kind === 'idea') return 'Idea';
  const time = hhmm(t.due_time);
  if (t.due) return dueLabel(t.due) + (time ? ` ${time}` : '');
  if (t.kind === 'note') return 'Note';
  return t.kind === 'project' ? 'Project' : 'No date';
}

/** One task line: a tick button to complete it, and the text to open it. */
export default function ItemRow({ task, big = false, tag }: { task: Task; big?: boolean; tag?: string }) {
  const store = useStore();
  const toast = useToast();
  const d = store.domain(task.domain_id);
  const done = task.status === 'done';

  const toggle = () => {
    if (done) {
      store.updateTask(task.id, { status: 'open', closed_at: null });
      return;
    }
    store.updateTask(task.id, { status: 'done', closed_at: new Date().toISOString() });
    toast({ message: 'Done', undo: () => store.updateTask(task.id, { status: 'open', closed_at: null }) });
  };

  return (
    <div className={`row${big ? ' row-big' : ''}${done ? ' is-done' : ''}`}>
      <button type="button" className="tick" onClick={toggle} aria-pressed={done} aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}>
        <Check />
      </button>
      <button type="button" className="row-body" onClick={() => go(`/item/${task.id}`)}>
        <span className="row-title">{task.title}</span>
        <span className="row-meta">
          <span className="dot" style={{ background: d.color }} />
          {d.short_name}{tag ? '' : ` · ${whenText(task)}`}
          {task.remind_at && task.status === 'open' && <Bell />}
        </span>
      </button>
      {tag && <span className={tag.startsWith('Today') ? 'tag tag-today' : 'tag'}>{tag}</span>}
    </div>
  );
}
