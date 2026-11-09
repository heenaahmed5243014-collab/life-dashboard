import type { Task } from '../types';
import { taskEmoji } from '../emoji';
import { useStore } from '../store';
import { dueLabel, hhmm } from '../dates';
import { go } from '../router';
import { useToast } from '../toast';
import { Bell, Check, Star } from '../icons';
import { cheer } from '../cheers';

export function whenText(t: Task): string {
  if (t.kind === 'idea') return 'Idea';
  if (t.kind === 'goal') return 'Life goal';
  const time = hhmm(t.due_time);
  if (t.due) return dueLabel(t.due) + (time ? ` ${time}` : '') + (t.repeat ? ' ↻' : '');
  if (t.kind === 'note') return 'Note';
  return t.kind === 'project' ? 'Project' : 'No date';
}

export function minutesLabel(m: number): string {
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1).replace('.0', '')} hr${m >= 120 ? 's' : ''}`;
}

/** Brain Planner tags: time estimate, energy. */
export function EffortTags({ task }: { task: Task }) {
  return (
    <>
      {task.minutes ? <span className={task.minutes <= 15 ? 'tag t-sage' : 'tag'}>{minutesLabel(task.minutes)}</span> : null}
      {task.energy === 'low' && <span className="tag">Low energy</span>}
      {task.energy === 'high' && <span className="tag">Needs focus</span>}
    </>
  );
}

/** One task line: tick box, the words (tap to open), tags, and a star for Top 3. */
export default function ItemRow({ task, big = false, tag }: { task: Task; big?: boolean; tag?: string }) {
  const store = useStore();
  const toast = useToast();
  const d = store.domain(task.domain_id);
  const steps = task.kind === 'task' ? store.tasks.filter((x) => x.project_id === task.id && x.status !== 'not_doing') : [];
  const done = task.status === 'done';
  const canStar = task.status === 'open' && (task.kind === 'task' || task.kind === 'project');

  const toggle = () => {
    if (done) {
      store.updateTask(task.id, { status: 'open', closed_at: null });
      return;
    }
    store.updateTask(task.id, { status: 'done', closed_at: new Date().toISOString(), starred: false });
    if (!task.repeat) toast({ message: cheer(), undo: () => store.updateTask(task.id, { status: 'open', closed_at: null, starred: task.starred }) });
  };

  const star = () => {
    if (!task.starred && store.tasks.filter((t) => t.starred && t.status === 'open').length >= 3) {
      toast({ message: 'Top 3 is full. Unstar one first.' });
      return;
    }
    store.updateTask(task.id, { starred: !task.starred });
    if (!task.starred) toast({ message: 'Added to Top 3' });
  };

  const hasEffort = Boolean(task.minutes || task.energy === 'low' || task.energy === 'high');

  return (
    <div className={`row${big ? ' row-big' : ''}${done ? ' is-done' : ''}`}>
      <button type="button" className="tick" onClick={toggle} aria-pressed={done} aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}>
        <span className="box"><Check size={16} /></span>
      </button>
      <button type="button" className="row-body" onClick={() => go(`/item/${task.id}`)}>
        <span className="row-title"><span className="t-emoji" aria-hidden="true">{taskEmoji(task, d.name)}</span>{task.title}</span>
        <span className="row-meta">
          <span className="dot" style={{ background: d.color }} />
          {d.short_name}{tag ? '' : ` · ${whenText(task)}`}
          {task.remind_at && task.status === 'open' && <Bell />}
          {steps.length > 0 && <span className="tag">{steps.filter((x) => x.status === 'done').length}/{steps.length} steps</span>}
        </span>
        {hasEffort && !done && <span className="meta"><EffortTags task={task} /></span>}
      </button>
      {tag && <span className={tag.startsWith('Today') ? 'tag tag-today' : 'tag'}>{tag}</span>}
      {canStar && (
        <button type="button" className={task.starred ? 'star-btn on' : 'star-btn'} aria-pressed={task.starred} aria-label={task.starred ? `Remove ${task.title} from Top 3` : `Add ${task.title} to Top 3`} onClick={star}>
          <Star filled={task.starred} />
        </button>
      )}
    </div>
  );
}
