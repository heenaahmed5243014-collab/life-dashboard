// Rearrange Today's cards by dragging their ⠿ handle. Works with a finger or a mouse:
// press the handle, move, and let go where you want the card. On desktop you can drop it in either column.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { moveCardTo, type CardId } from '../todayLayout';

type Drop = { before: CardId | null; col: 'main' | 'rail' | null; el: Element | null; after: boolean };
let dragging: { id: CardId; ghost: HTMLElement; startY: number; offX: number; offY: number } | null = null;

function findDrop(x: number, y: number, self: CardId): Drop {
  const hit = document.elementFromPoint(x, y);
  const item = hit?.closest<HTMLElement>('[data-card]');
  const colEl = hit?.closest<HTMLElement>('[data-col]');
  const col = (colEl?.dataset.col as 'main' | 'rail' | undefined) ?? null;
  if (item && item.dataset.card !== self) {
    const r = item.getBoundingClientRect();
    const after = y > r.top + r.height / 2;
    if (!after) return { before: item.dataset.card as CardId, col, el: item, after: false };
    // Dropping on the lower half: before the next card in the same container
    let next = item.nextElementSibling as HTMLElement | null;
    while (next && !next.dataset.card) next = next.nextElementSibling as HTMLElement | null;
    return { before: (next?.dataset.card as CardId) ?? null, col, el: item, after: true };
  }
  return { before: null, col, el: colEl ?? null, after: true };
}

export function DeckItem({ id, label, children }: { id: CardId; label: string; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);
  useEffect(() => () => { dragging?.ghost.remove(); dragging = null; }, []);

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, zIndex: '60', pointerEvents: 'none', opacity: '0.92', transform: 'scale(1.02) rotate(-0.6deg)', boxShadow: '0 24px 48px rgba(0,0,0,0.22)', borderRadius: '24px', transition: 'none' });
    ghost.classList.add('deck-ghost');
    document.body.appendChild(ghost);
    dragging = { id, ghost, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top };
    document.body.classList.add('deck-dragging');
    setLifted(true);
    let drop: Drop = { before: null, col: null, el: null, after: true };
    const mark = (d: Drop) => {
      document.querySelectorAll('.deck-over-before, .deck-over-after, .deck-col-over').forEach((n) => n.classList.remove('deck-over-before', 'deck-over-after', 'deck-col-over'));
      if (d.el?.hasAttribute('data-card')) d.el.classList.add(d.after ? 'deck-over-after' : 'deck-over-before');
      else if (d.el) d.el.classList.add('deck-col-over');
    };
    const move = (ev: PointerEvent) => {
      if (!dragging) return;
      dragging.ghost.style.left = `${ev.clientX - dragging.offX}px`;
      dragging.ghost.style.top = `${ev.clientY - dragging.offY}px`;
      drop = findDrop(ev.clientX, ev.clientY, id);
      mark(drop);
      // Scroll the page when dragging near the top or bottom edge
      if (ev.clientY < 70) scrollBy(0, -14);
      else if (ev.clientY > innerHeight - 110) scrollBy(0, 14);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      mark({ before: null, col: null, el: null, after: true });
      dragging?.ghost.remove();
      dragging = null;
      document.body.classList.remove('deck-dragging');
      setLifted(false);
      if (drop.el) moveCardTo(id, drop.before, drop.col ?? undefined);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  return (
    <div ref={wrap} className={`deck-item${lifted ? ' lifted' : ''}`} data-card={id}>
      <button type="button" className="deck-handle" aria-label={`Move ${label} (drag)`} title="Drag to move" onPointerDown={onDown}>⠿</button>
      {children}
    </div>
  );
}
