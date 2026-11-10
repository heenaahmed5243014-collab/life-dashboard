// Morning debrief: your day at a glance, split into Morning, Afternoon and Evening,
// plus anything that needs a heads-up. Shows on Today each morning until you tap "Start my day".
import { useStore } from '../store';
import { buildDay } from '../today';
import { longDate, today, addDays, daysBetween, hhmm, shortDate } from '../dates';
import { PARTS, partOfHour, type PartKey } from '../dayparts';
import { taskEmoji } from '../emoji';
import { dueFollowUps } from './OutreachTab';
import { allReturns } from '../areas';
import { stepGoal, stepSummary } from '../steps';
import { milestones } from '../weightRewards';
import { plannedSession } from './GymSessions';
import { useDebrief, markDebriefDone } from '../debrief';
import { useWorkMode } from '../workmode';
import { useMoneyMask } from '../pin';
import { useShowWeight } from '../weightPref';
import { go } from '../router';


interface Line { key: string; emoji: string; text: string; time?: string; onClick?: () => void }

export default function MorningDebrief({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const settings = useDebrief();
  const mask = useMoneyMask();
  const showWeight = useShowWeight();
  const work = useWorkMode();
  const now = today();
  const plan = buildDay(store.tasks, store.routines, store.ticks, now);

  const byPart: Record<PartKey, Line[]> = { morning: [], afternoon: [], evening: [] };
  for (const t of plan.timed) {
    const time = hhmm(t.due_time)!;
    byPart[partOfHour(Number(time.slice(0, 2)))].push({ key: t.id, emoji: taskEmoji(t, store.domain(t.domain_id).name), text: t.title, time, onClick: () => go(`/item/${t.id}`) });
  }
  const allDay: Line[] = [];
  for (const { routine: r } of plan.routines) {
    const session = /gym/i.test(r.title) ? plannedSession(r, now) : null;
    const line = { key: r.id, emoji: '↻', text: session ? `${r.title} · ${session}` : r.title };
    if (r.time_of_day === 'commute') byPart.morning.unshift(line);
    else if (r.time_of_day === 'evening') byPart.evening.push(line);
    else allDay.push(line);
  }
  const top = store.tasks.filter((t) => t.starred && t.status === 'open');

  // Heads-ups: things that are easy to forget
  const heads: Line[] = [];
  // Money stays on the Money tab, not in the debrief.
  if (settings.headsUp) {
    for (const l of dueFollowUps(store.leads, now)) heads.push({ key: `f${l.id}`, emoji: '📨', text: `Follow up with ${l.name}`, onClick: () => go(`/area/${l.domain_id}/outreach`) });
    if (!work.active) {
      for (const t of allReturns(store.tasks, store.subcategories).filter((t) => t.due && daysBetween(now, t.due) <= 2)) heads.push({ key: `r${t.id}`, emoji: '📦', text: `${t.title} · return by ${t.due === now ? 'today' : shortDate(t.due!)}`, onClick: () => go('/returns') });
    }
    const overdue = store.tasks.filter((t) => t.status === 'open' && t.kind === 'task' && t.due && t.due < now).length;
    if (overdue) heads.push({ key: 'slip', emoji: '🐢', text: `${overdue} thing${overdue === 1 ? '' : 's'} carried over. Pick one, snooze the rest.` });
  }

  const steps = settings.health ? stepSummary(store.steps, stepGoal(store.routines), now) : null;
  const yesterdaySteps = settings.health ? store.steps.find((s) => s.day === addDays(now, -1))?.count : undefined;
  const reward = settings.health && showWeight && !work.active ? milestones(store.weights, store.rewards, store.tasks, now).find((m) => !m.reached && m.reward) : undefined;
  const hour = new Date().getHours();

  const finish = () => { markDebriefDone(now); onClose(); };

  return (
    <section className="card debrief" aria-label="Morning debrief">
      <div className="between">
        <span className="eyebrow">{hour < 12 ? 'Morning debrief' : 'Today’s debrief'}</span>
        <button type="button" className="link-btn quiet" onClick={onClose} aria-label="Close the debrief">Hide</button>
      </div>
      <h2 className="debrief-title">{hour < 12 ? 'Good morning, Heena ☀️' : hour < 17 ? 'Here’s the rest of today' : 'Here’s your evening'}</h2>
      <p className="note">{longDate(now)} · {plan.timed.length + plan.routines.length === 0 && top.length === 0 ? 'A clear day. Pick one thing that would make it feel good.' : `${plan.timed.length} planned · ${plan.routines.length} routine${plan.routines.length === 1 ? '' : 's'} · ${top.length}/3 in your Top 3`}</p>

      {top.length > 0 && (
        <div className="debrief-top">
          <span className="debrief-label">⭐ Top 3</span>
          <ul>{top.map((t) => <li key={t.id}><button type="button" onClick={() => go(`/item/${t.id}`)}>{taskEmoji(t, store.domain(t.domain_id).name)} {mask(t.title)}</button></li>)}</ul>
        </div>
      )}

      <div className="debrief-parts">
        {PARTS.map((p) => {
          const lines = byPart[p.key];
          const past = hour >= p.to;
          return (
            <div key={p.key} className={`debrief-part${past ? ' past' : ''}${hour >= p.from && hour < p.to ? ' now' : ''}`}>
              <span className="debrief-label">{p.emoji} {p.label}</span>
              {lines.length ? (
                <ul>{lines.map((l) => (
                  <li key={l.key}>
                    {l.time && <span className="debrief-time">{l.time}</span>}
                    {l.onClick ? <button type="button" onClick={l.onClick}>{l.emoji} {mask(l.text)}</button> : <span>{l.emoji} {mask(l.text)}</span>}
                  </li>
                ))}</ul>
              ) : <p className="note">Nothing fixed. Room to breathe.</p>}
            </div>
          );
        })}
      </div>
      {allDay.length > 0 && <p className="note debrief-allday">Through the day: {allDay.map((l) => l.text).join(' · ')}</p>}

      {heads.length > 0 && (
        <div className="debrief-heads">
          <span className="debrief-label">👀 Heads-up</span>
          <ul>{heads.slice(0, 6).map((l) => <li key={l.key}>{l.onClick ? <button type="button" onClick={l.onClick}>{l.emoji} {mask(l.text)}</button> : <span>{l.emoji} {mask(l.text)}</span>}</li>)}</ul>
        </div>
      )}

      {(steps || reward) && (
        <div className="debrief-stats">
          {steps && <span className="debrief-stat"><b>{yesterdaySteps !== undefined ? yesterdaySteps.toLocaleString('en-GB') : (steps.goal / 1000) + 'k'}</b><small>{yesterdaySteps !== undefined ? 'steps yesterday' : 'steps to aim for'}{steps.streak > 1 ? ` · 🔥 ${steps.streak}` : ''}</small></span>}
          {reward && <span className="debrief-stat"><b>{reward.reward!.emoji} {reward.lb.toFixed(1)} lb</b><small>{reward.reward!.title}</small></span>}
        </div>
      )}

      <button type="button" className="btn primary debrief-go" onClick={finish}>Start my day</button>
    </section>
  );
}
