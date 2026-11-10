// Steps & water on Today: a row of tabs you can swipe sideways. Tap a tab to open it,
// tap it again to close it. Swiping across the open panel moves to the next or previous tab.
import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { useStore } from '../store';
import { today, WEEKDAY_SHORT, weekday } from '../dates';
import { stepGoal, stepSummary } from '../steps';
import { GLASS_ML, GOAL_CHOICES, litres, setWaterGoal, waterGoal, waterOn, waterStreak } from '../water';
import StepsCard from './StepsCard';

type TabKey = 'steps' | 'water' | 'week' | 'streaks' | 'goals';
const TABS: { key: TabKey; emoji: string; label: string; img?: string }[] = [
  { key: 'steps', emoji: '👟', label: 'Steps', img: '/img/steps.png' },
  { key: 'water', emoji: '💧', label: 'Water', img: '/img/water.png' },
  { key: 'week', emoji: '📅', label: 'This week' },
  { key: 'streaks', emoji: '🔥', label: 'Streaks' },
  { key: 'goals', emoji: '🎯', label: 'Goals' },
];
const TAB_KEY = 'ld:move-tab';
const readTab = (): TabKey | null => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === 'none') return null;
    return TABS.some((t) => t.key === v) ? (v as TabKey) : 'steps';
  } catch { return 'steps'; }
};
const k = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString('en-GB')}k` : String(n));

export default function MoveCard() {
  const store = useStore();
  const now = today();
  const [tab, setTabState] = useState<TabKey | null>(readTab);
  const [goal, setGoal] = useState(waterGoal);
  const stripRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const stepsGoal = stepGoal(store.routines);
  const s = stepSummary(store.steps, stepsGoal, now);
  const ml = waterOn(store.water, now);
  const waterReady = store.waterReady !== false;

  const setTab = (t: TabKey | null) => {
    setTabState(t);
    try { localStorage.setItem(TAB_KEY, t ?? 'none'); } catch { /* ignore */ }
  };
  // Keep the chosen tab in view in the scrolling row.
  useEffect(() => {
    if (!tab) return;
    stripRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [tab]);

  const move = (dir: 1 | -1) => {
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + dir + TABS.length) % TABS.length].key;
    setTab(next);
    stripRef.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  };
  const onTouchStart = (e: TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !tab) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  };

  const addWater = (delta: number) => store.setWater(now, Math.max(0, ml + delta));
  const glasses = Math.ceil(goal / GLASS_ML);
  const filled = Math.floor(ml / GLASS_ML);
  const week = s.week.map((w) => ({ ...w, ml: waterOn(store.water, w.day) }));
  const wStreak = waterStreak(store.water, goal, now);

  return (
    <section className="card move-card" aria-label="Steps and water">
      <div className="move-tabs" role="tablist" aria-label="Steps and water" ref={stripRef} onKeyDown={onKey}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              data-tab={t.key}
              id={`move-tab-${t.key}`}
              aria-selected={on}
              aria-controls={on ? 'move-panel' : undefined}
              tabIndex={on || (!tab && t.key === 'steps') ? 0 : -1}
              className={on ? 'move-tab on' : 'move-tab'}
              onClick={() => setTab(on ? null : t.key)}
            >
              <span className="move-tab-emoji" aria-hidden="true">{t.img ? <img src={t.img} alt="" /> : t.emoji}</span>
              {t.label}
              {t.key === 'steps' && s.today !== null && <span className="move-tab-count">{k(s.today)}</span>}
              {t.key === 'water' && waterReady && <span className="move-tab-count">{litres(ml)}</span>}
            </button>
          );
        })}
      </div>

      {!tab && (
        <p className="note move-summary">
          👟 {s.today === null ? 'No steps yet' : `${s.today.toLocaleString('en-GB')} steps`} · 💧 {waterReady ? `${litres(ml)} of ${litres(goal)}` : 'water not set up'}. Tap a tab to open it.
        </p>
      )}

      {tab && (
        <div id="move-panel" role="tabpanel" aria-labelledby={`move-tab-${tab}`} className="move-panel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {tab === 'steps' && <StepsCard bare />}

          {tab === 'water' && (!waterReady ? (
            <p className="note">Water needs database update 16. Ask Claude for the link.</p>
          ) : (
            <div className="water-panel">
              <div className="water-head">
                <span className="water-big">{ml.toLocaleString('en-GB')}<small> ml</small></span>
                <span className="note">{ml >= goal ? 'Goal done 🎉' : `${(goal - ml).toLocaleString('en-GB')} ml to go · goal ${litres(goal)}`}</span>
              </div>
              <div className="glasses" role="group" aria-label={`${filled} of ${glasses} glasses`}>
                {Array.from({ length: glasses }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i < filled ? 'glass on' : 'glass'}
                    aria-pressed={i < filled}
                    aria-label={`Glass ${i + 1}${i < filled ? ', drunk' : ''}`}
                    onClick={() => store.setWater(now, i < filled && i === filled - 1 ? i * GLASS_ML : (i + 1) * GLASS_ML)}
                  >
                    <svg viewBox="0 0 24 30" aria-hidden="true"><path d="M3 3h18l-2.2 23.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" className="glass-cup" /><path d="M4.6 12h14.8l-1.6 14.1a1.2 1.2 0 0 1-1.2 1H7.4a1.2 1.2 0 0 1-1.2-1z" className="glass-water" /></svg>
                  </button>
                ))}
              </div>
              <div className="water-btns">
                <button type="button" className="btn small" onClick={() => addWater(-GLASS_ML)} disabled={ml <= 0}>− 250 ml</button>
                <button type="button" className="btn primary small" onClick={() => addWater(GLASS_ML)}>+ Glass</button>
                <button type="button" className="btn small" onClick={() => addWater(500)}>+ Bottle 500</button>
              </div>
            </div>
          ))}

          {tab === 'week' && (
            <div className="move-week" role="img" aria-label={`This week: ${s.hitThisWeek} days at the steps goal, ${week.filter((w) => w.ml >= goal).length} days at the water goal`}>
              {week.map((w) => (
                <span key={w.day} className={`mw-day${w.day === now ? ' now' : ''}`}>
                  <span className="mw-bars">
                    <i className="mw-steps" style={{ height: `${w.count ? Math.max(6, Math.min(100, (w.count / stepsGoal) * 100)) : 0}%` }} />
                    <i className="mw-water" style={{ height: `${w.ml ? Math.max(6, Math.min(100, (w.ml / goal) * 100)) : 0}%` }} />
                  </span>
                  <b>{WEEKDAY_SHORT[weekday(w.day)][0]}</b>
                </span>
              ))}
              <span className="mw-key"><i className="mw-steps" /> Steps <i className="mw-water" /> Water · full bar = goal</span>
            </div>
          )}

          {tab === 'streaks' && (
            <div className="move-stats">
              <div><span className="eyebrow">👟 Steps</span><b>{s.streak} day{s.streak === 1 ? '' : 's'}</b><span className="note">in a row at {k(stepsGoal)}</span></div>
              <div><span className="eyebrow">💧 Water</span><b>{waterReady ? `${wStreak} day${wStreak === 1 ? '' : 's'}` : '—'}</b><span className="note">in a row at {litres(goal)}</span></div>
              <p className="note">A missed day just starts a new run. Nothing is lost.</p>
            </div>
          )}

          {tab === 'goals' && (
            <div className="stack">
              <span className="eyebrow">Water goal a day</span>
              <div className="chip-scroll" role="radiogroup" aria-label="Water goal">
                {GOAL_CHOICES.map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={goal === g} className={goal === g ? 'chip on' : 'chip'} onClick={() => { setWaterGoal(g); setGoal(g); }}>{litres(g)}</button>
                ))}
              </div>
              <p className="note">Steps goal: {k(stepsGoal)}, taken from your steps routine. Change it on the routine.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
