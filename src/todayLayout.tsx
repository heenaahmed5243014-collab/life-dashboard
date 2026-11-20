// Today's layout: which cards show, their order, and which are folded down to one line.
// Remembered on this phone. The debrief and evening reset stay at the top when they're due.
import { useEffect, useState, type ReactNode } from 'react';

export type CardId = 'quick' | 'top' | 'slip' | 'subs' | 'onboard' | 'smm' | 'email' | 'routines' | 'mirror' | 'todos' | 'plan' | 'next' | 'soon' | 'week' | 'money' | 'weight';

export const CARDS: { id: CardId; emoji: string; label: string }[] = [
  { id: 'quick', emoji: '⚡', label: 'Quick buttons' },
  { id: 'top', emoji: '⭐', label: 'Top 3' },
  { id: 'slip', emoji: '🐢', label: 'Slipping' },
  { id: 'subs', emoji: '✂️', label: 'Subscriptions to cancel' },
  { id: 'onboard', emoji: '🤝', label: 'Client onboarding' },
  { id: 'email', emoji: '✉️', label: 'Email' },
  { id: 'smm', emoji: '📣', label: 'Social media' },
  { id: 'routines', emoji: '🔁', label: 'Routine' },
  { id: 'mirror', emoji: '🕊️', label: 'Quiet moment' },
  { id: 'todos', emoji: '✅', label: 'Today’s to-dos' },
  { id: 'plan', emoji: '🗓️', label: 'Plan for the day' },
  { id: 'next', emoji: '👉', label: 'Do this next' },
  { id: 'soon', emoji: '📬', label: 'Next 3 days & Inbox' },
  { id: 'week', emoji: '📈', label: 'Weekly progress' },
  { id: 'money', emoji: '💷', label: 'Net worth' },
  { id: 'weight', emoji: '🌸', label: 'My journey' },
];

/** col: which column on desktop ('main' left, 'rail' right). Unset = the card's usual column. */
export interface CardPref { id: CardId; show: boolean; fold: boolean; col?: 'main' | 'rail' }

/** Cards that sit in the right-hand column on desktop unless you move them. */
export const RAIL_DEFAULT = new Set<CardId>(['next', 'slip', 'subs', 'email', 'soon', 'money', 'weight', 'week']);
export const colOf = (p: CardPref): 'main' | 'rail' => p.col ?? (RAIL_DEFAULT.has(p.id) ? 'rail' : 'main');

const KEY = 'ld:today-layout';
const EVENT = 'ld:today-layout';
const DEFAULT: CardPref[] = CARDS.map((c) => ({ id: c.id, show: true, fold: false }));

export function readLayout(): CardPref[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CardPref[] | null;
    if (!Array.isArray(saved)) return DEFAULT;
    const known = saved.filter((p) => CARDS.some((c) => c.id === p.id));
    // Cards added in later versions go in their default place.
    for (const c of DEFAULT) if (!known.some((p) => p.id === c.id)) known.splice(DEFAULT.indexOf(c), 0, c);
    return known;
  } catch { return DEFAULT; }
}

export function saveLayout(l: CardPref[] | null) {
  try { if (l) localStorage.setItem(KEY, JSON.stringify(l)); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  dispatchEvent(new Event(EVENT));
}

export function setCard(id: CardId, changes: Partial<CardPref>) {
  saveLayout(readLayout().map((p) => (p.id === id ? { ...p, ...changes } : p)));
}

export function moveCard(id: CardId, dir: -1 | 1) {
  const l = [...readLayout()];
  const i = l.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  saveLayout(l);
}

/** Drag and drop: put a card before another card (or at the end of a column), switching column if needed. */
export function moveCardTo(id: CardId, beforeId: CardId | null, col?: 'main' | 'rail') {
  const l = readLayout();
  const me = l.find((p) => p.id === id);
  if (!me || id === beforeId) return;
  const rest = l.filter((p) => p.id !== id);
  const moved = { ...me, ...(col ? { col } : {}) };
  let i = beforeId ? rest.findIndex((p) => p.id === beforeId) : -1;
  if (i < 0) {
    // End of the column: after the last card that's in that column
    const target = col ?? colOf(me);
    const last = rest.map((p, k) => (colOf(p) === target ? k : -1)).filter((k) => k >= 0).pop();
    i = last === undefined ? rest.length : last + 1;
  }
  rest.splice(i, 0, moved);
  saveLayout(rest);
}

export function useLayout(): CardPref[] {
  const [l, setL] = useState(readLayout);
  useEffect(() => {
    const sync = () => setL(readLayout());
    addEventListener(EVENT, sync);
    return () => removeEventListener(EVENT, sync);
  }, []);
  return l;
}

/** A card folded down to one line. Tap to open it again. */
export function Folded({ id, summary }: { id: CardId; summary?: string }) {
  const c = CARDS.find((x) => x.id === id)!;
  return (
    <button type="button" className="card folded-card" aria-expanded={false} onClick={() => setCard(id, { fold: false })}>
      <span className="folded-emoji" aria-hidden="true">{c.emoji}</span>
      <span className="folded-label">{c.label}</span>
      {summary && <span className="folded-sum">{summary}</span>}
      <span className="folded-chev" aria-hidden="true">›</span>
    </button>
  );
}

/** Wraps an open card with a small "Fold" button so it can be tucked away again. */
export function Foldable({ id, children }: { id: CardId; children: ReactNode }) {
  const c = CARDS.find((x) => x.id === id)!;
  return (
    <div className="foldable">
      <button type="button" className="fold-btn" onClick={() => setCard(id, { fold: true })} aria-label={`Fold ${c.label}`}>⌃</button>
      {children}
    </div>
  );
}

export function CustomiseSheet({ onClose, desktop = false }: { onClose: () => void; desktop?: boolean }) {
  const layout = useLayout();
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet custom-sheet" role="dialog" aria-modal="true" aria-label="Customise Today">
        <div className="sheet-head"><h2 className="sheet-title">Customise Today</h2><button type="button" className="link-btn" onClick={onClose}>Done</button></div>
        <p className="note">Switch cards off, fold the ones you only need now and then, and move them up or down{desktop ? ', or between the left and right columns' : ''}. You can also drag any card on Today by its ⠿ handle. Your morning debrief and evening reset always come first when they’re due.</p>
        <ul className="custom-list">
          {layout.map((p, i) => {
            const c = CARDS.find((x) => x.id === p.id)!;
            return (
              <li key={p.id} className={p.show ? 'custom-row' : 'custom-row off'}>
                <span className="emoji-tile small" aria-hidden="true">{c.emoji}</span>
                <span className="custom-name">
                  <b>{c.label}</b>
                  {p.show && (
                    <span className="custom-opts">
                      <label className="custom-fold">
                        <input type="checkbox" checked={p.fold} onChange={(e) => setCard(p.id, { fold: e.target.checked })} /> Folded
                      </label>
                      {desktop && p.id !== 'quick' && (
                        <span className="custom-col" role="radiogroup" aria-label={`${c.label} column`}>
                          <button type="button" role="radio" aria-checked={colOf(p) === 'main'} className={colOf(p) === 'main' ? 'on' : ''} onClick={() => setCard(p.id, { col: 'main' })}>Left</button>
                          <button type="button" role="radio" aria-checked={colOf(p) === 'rail'} className={colOf(p) === 'rail' ? 'on' : ''} onClick={() => setCard(p.id, { col: 'rail' })}>Right</button>
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className="custom-move">
                  <button type="button" className="mv-btn" aria-label={`Move ${c.label} up`} disabled={i === 0} onClick={() => moveCard(p.id, -1)}>↑</button>
                  <button type="button" className="mv-btn" aria-label={`Move ${c.label} down`} disabled={i === layout.length - 1} onClick={() => moveCard(p.id, 1)}>↓</button>
                </span>
                <button type="button" role="switch" aria-checked={p.show} aria-label={`Show ${c.label}`} className={`switch${p.show ? ' on' : ''}`} onClick={() => setCard(p.id, { show: !p.show })}><i /></button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn small more" onClick={() => saveLayout(null)}>Reset to the original layout</button>
      </div>
    </div>
  );
}
