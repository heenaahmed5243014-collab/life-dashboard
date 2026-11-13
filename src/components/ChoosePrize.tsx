// "You hit a target! Choose your prize": your prizes spring up out of a gift pocket (like the
// wallet cards in the reference recording). Tap one to lift it, then confirm.
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { poolPrizes, type Milestone } from '../weightRewards';
import { today } from '../dates';
import { useToast } from '../toast';

const COLOURS = ['#C9C1FF', '#BFEBC9', '#FFFFFF', '#FFD9E8', '#FFE7A3', '#CFE6FF'];
const STEP = 46; // how much of each card shows above the next

export default function ChoosePrize({ m, onClose }: { m: Milestone; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const prizes = poolPrizes(store.rewards);
  const [pick, setPick] = useState<string | null>(null);
  const [won, setWon] = useState(false);
  const chosen = prizes.find((p) => p.id === pick);
  const n = prizes.length;
  const pocketTop = n * STEP + 26;
  const confirm = () => {
    if (!chosen) return;
    setWon(true);
    setTimeout(() => {
      store.updateReward(chosen.id, { kg: m.kg, target_lb: m.lb, unlocked_on: today() });
      toast({ message: `🎉 ${chosen.emoji ?? '🎁'} ${chosen.title} is yours. You earned it!` });
      onClose();
    }, 900);
  };
  // Rendered on the page itself, not inside the card, so it always covers the whole screen
  return createPortal(
    <div className="pz-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`pz${won ? ' won' : ''}`} role="dialog" aria-modal="true" aria-label="Choose your prize">
        <div className="pz-stack" style={{ height: pocketTop + 190 }} role="radiogroup" aria-label="Prizes">
          {prizes.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={pick === p.id}
              className={`pz-card${pick === p.id ? ' on' : ''}${pick && pick !== p.id ? ' dim' : ''}`}
              style={{ top: i * STEP, background: COLOURS[i % COLOURS.length], animationDelay: `${0.25 + i * 0.05}s`, '--tuck': `${pocketTop - i * STEP + 8}px`, '--over': `${-(34 + (n - i) * 9)}px` } as CSSProperties}
              onClick={() => setPick(pick === p.id ? null : p.id)}
            >
              <span className="pz-card-emoji" aria-hidden="true">{p.emoji ?? '🎁'}</span>
              <span className="pz-card-name">{p.title}</span>
              <span className="pz-card-tick" aria-hidden="true">{pick === p.id ? '✓' : ''}</span>
            </button>
          ))}
          <div className="pz-pocket" style={{ top: pocketTop }}>
            <span className="pz-confetti" aria-hidden="true">🎉</span>
            <h2 className="pz-title">You hit −{m.kg} kg!</h2>
            <p className="pz-sub">{chosen ? `${chosen.emoji ?? '🎁'} ${chosen.title}` : 'Tap a prize to choose it'}</p>
            <div className="pz-btns">
              <button type="button" className="pz-btn primary" disabled={!chosen || won} onClick={confirm}>{chosen ? 'This one!' : 'Pick one'}</button>
              <button type="button" className="pz-btn" onClick={onClose}>Later</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
