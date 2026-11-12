// Steps on Routines: a row of tabs you can swipe sideways. Tap a tab to open it,
// tap it again to close it. Swiping across the open panel moves to the next or previous tab.
import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { useStore } from '../store';
import { today, WEEKDAY_SHORT, weekday } from '../dates';
import { stepGoal, stepSummary } from '../steps';
import { addDays, shortDate } from '../dates';
import StepsCard from './StepsCard';

type TabKey = 'steps' | 'week' | 'earlier' | 'streaks';
const TABS: { key: TabKey; emoji: string; label: string; img?: string }[] = [
  { key: 'steps', emoji: '👟', label: 'Steps', img: '/img/steps.png' },
  { key: 'week', emoji: '📅', label: 'This week' },
  { key: 'earlier', emoji: '✏️', label: 'Earlier days' },
  { key: 'streaks', emoji: '🔥', label: 'Streaks' },
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
  const [editDay, setEditDay] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const stripRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const stepsGoal = stepGoal(store.routines);
  const s = stepSummary(store.steps, stepsGoal, now);
  const stepsOn = (d: string) => store.steps.find((x) => x.day === d)?.count ?? null;
  const startEdit = (d: string) => { setEditDay(d); setDraft(stepsOn(d)?.toString() ?? ''); };
  const saveEdit = () => {
    const v = Math.round(Number(draft.replace(/[,\s]/g, '')));
    if (editDay && draft.trim() && Number.isFinite(v) && v >= 0 && v <= 200000) store.setSteps(editDay, v);
    setEditDay(null);
  };

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

  const week = s.week;
  const earlier = Array.from({ length: 14 }, (_, i) => addDays(now, -(i + 1)));

  return (
    <section className="card move-card" aria-label="Steps">
      <div className="move-tabs" role="tablist" aria-label="Steps" ref={stripRef} onKeyDown={onKey}>
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
            </button>
          );
        })}
      </div>

      {!tab && (
        <p className="note move-summary">
          👟 {s.today === null ? 'No steps yet today' : `${s.today.toLocaleString('en-GB')} steps today`}. Tap a tab to open it.
        </p>
      )}

      {tab && (
        <div id="move-panel" role="tabpanel" aria-labelledby={`move-tab-${tab}`} className="move-panel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {tab === 'steps' && <StepsCard bare />}

          {tab === 'week' && (
            <div className="stack">
              <div className="move-week" aria-label={`This week: ${s.hitThisWeek} days at the steps goal`}>
                {week.map((w) => (
                  <button key={w.day} type="button" className={`mw-day${w.day === now ? ' now' : ''}${editDay === w.day ? ' editing' : ''}`} disabled={w.day > now} onClick={() => startEdit(w.day)} aria-label={`${shortDate(w.day)}: ${w.count === null ? 'no steps logged' : `${w.count.toLocaleString('en-GB')} steps`}. Tap to change`}>
                    <span className="mw-bars"><i className="mw-steps" style={{ height: `${w.count ? Math.max(6, Math.min(100, (w.count / stepsGoal) * 100)) : 0}%` }} /></span>
                    <b>{WEEKDAY_SHORT[weekday(w.day)][0]}</b>
                  </button>
                ))}
              </div>
              <p className="note">Full bar = {k(stepsGoal)}. Tap a day to add or fix its steps.</p>
            </div>
          )}

          {tab === 'earlier' && (
            <ul className="earlier-list">
              {earlier.map((d) => {
                const v = stepsOn(d);
                return (
                  <li key={d}>
                    <button type="button" className={`earlier-row${editDay === d ? ' editing' : ''}`} onClick={() => startEdit(d)}>
                      <span>{shortDate(d)}</span>
                      <b className={v !== null && v >= stepsGoal ? 'hit' : ''}>{v === null ? 'Add steps' : `${v.toLocaleString('en-GB')}${v >= stepsGoal ? ' ✓' : ''}`}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {editDay && (tab === 'week' || tab === 'earlier') && (
            <div className="edit-steps">
              <label className="money-row">
                <span className="money-name">Steps on {shortDate(editDay)}</span>
                <span className="money-input"><input inputMode="numeric" autoFocus aria-label={`Steps on ${shortDate(editDay)}`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} /></span>
              </label>
              <div className="row"><button type="button" className="btn primary small" onClick={saveEdit}>Save</button><button type="button" className="btn small" onClick={() => setEditDay(null)}>Cancel</button></div>
            </div>
          )}

          {tab === 'streaks' && (
            <div className="move-stats">
              <div><span className="eyebrow">👟 Steps</span><b>{s.streak} day{s.streak === 1 ? '' : 's'}</b><span className="note">in a row at {k(stepsGoal)}</span></div>
              <div><span className="eyebrow">📅 This week</span><b>{s.hitThisWeek} day{s.hitThisWeek === 1 ? '' : 's'}</b><span className="note">at {k(stepsGoal)} so far</span></div>
              <p className="note">A missed day just starts a new run. Nothing is lost.</p>
            </div>
          )}

        </div>
      )}
    </section>
  );
}
