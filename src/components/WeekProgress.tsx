// "This week so far": what got done in each area since Monday, so progress is visible on slow weeks.
import { useStore } from '../store';
import { addDays, parseDay, today, weekday } from '../dates';

export default function WeekProgress() {
  const store = useStore();
  const now = today();
  const monday = parseDay(addDays(now, -weekday(now))).getTime();
  const done = store.tasks.filter((t) => t.status === 'done' && t.closed_at && Date.parse(t.closed_at) >= monday && t.kind !== 'idea');
  const apps = new Set(store.subcategories.filter((x) => x.name.trim().toLowerCase() === 'applications').map((x) => x.id));
  const clients = new Set(store.subcategories.filter((x) => x.name.trim().toLowerCase() === 'client work').map((x) => x.id));
  const rows = store.domains
    .filter((d) => !d.is_inbox)
    .map((d) => {
      const mine = done.filter((t) => t.domain_id === d.id);
      const a = mine.filter((t) => t.subcategory_id && apps.has(t.subcategory_id) && !/^follow up/i.test(t.title)).length;
      const c = mine.filter((t) => t.subcategory_id && clients.has(t.subcategory_id)).length;
      const extra = [a ? `${a} application${a === 1 ? '' : 's'} sent` : '', c ? `${c} client job${c === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
      return { d, n: mine.length, extra };
    })
    .filter((r) => r.n > 0);
  const ticks = store.ticks.filter((t) => t.day >= addDays(now, -weekday(now))).reduce((s, t) => s + (t.count ?? 1), 0);
  if (!rows.length && !ticks) return null;
  return (
    <section className="card stack" aria-label="This week so far">
      <div className="between"><span className="eyebrow">This week so far</span><span className="count">{done.length} done</span></div>
      <ul className="week-progress">
        {rows.map(({ d, n, extra }) => (
          <li key={d.id}>
            <span className="dot" style={{ background: d.color }} />
            <span className="wp-name">{d.short_name}</span>
            <span className="wp-n">{n} done{extra ? ` · ${extra}` : ''}</span>
          </li>
        ))}
        {ticks > 0 && <li><span className="dot" style={{ background: 'var(--violet)' }} /><span className="wp-name">Routines</span><span className="wp-n">{ticks} ticks</span></li>}
      </ul>
    </section>
  );
}
