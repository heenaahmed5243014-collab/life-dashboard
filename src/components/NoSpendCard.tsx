// No-spend days: tap a day this week when you bought nothing extra (bills don't count).
import { useStore } from '../store';
import { addDays, today, weekday, WEEKDAY_SHORT, parseDay } from '../dates';

export default function NoSpendCard() {
  const store = useStore();
  const now = today();
  const set = new Set(store.noSpend);
  const monday = addDays(now, -weekday(now));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const monthCount = store.noSpend.filter((d) => d.slice(0, 7) === now.slice(0, 7)).length;
  let streak = 0;
  for (let i = set.has(now) ? 0 : 1; i < 120 && set.has(addDays(now, -i)); i++) streak++;
  return (
    <section className="card stack" aria-label="No-spend days">
      <div className="between"><span className="eyebrow">No-spend days</span><span className="count">{monthCount} this month</span></div>
      <div className="ns-week" role="group" aria-label="This week">
        {week.map((d) => {
          const on = set.has(d);
          const future = d > now;
          return (
            <button key={d} type="button" disabled={future} aria-pressed={on} aria-label={`${WEEKDAY_SHORT[weekday(d)]} ${parseDay(d).getDate()}${on ? ', no-spend day' : ''}`} className={`ns-day${on ? ' on' : ''}${d === now ? ' is-today' : ''}`} onClick={() => store.toggleNoSpend(d)}>
              <span>{WEEKDAY_SHORT[weekday(d)].slice(0, 1)}</span>
              <b>{on ? '✓' : parseDay(d).getDate()}</b>
            </button>
          );
        })}
      </div>
      <p className="note">{streak > 1 ? `🔥 ${streak} in a row. ` : ''}Tap a day you didn’t buy anything extra. Bills and travel don’t count.</p>
    </section>
  );
}
