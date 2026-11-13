// "You hit a target! Choose your prize": pick one prize from your pool for this milestone.
import { useState } from 'react';
import { useStore } from '../store';
import { poolPrizes, type Milestone } from '../weightRewards';
import { today } from '../dates';
import { useToast } from '../toast';

export default function ChoosePrize({ m, onClose }: { m: Milestone; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const prizes = poolPrizes(store.rewards);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = prizes.find((p) => p.id === pick);
  const confirm = () => {
    if (!chosen) return;
    store.updateReward(chosen.id, { kg: m.kg, target_lb: m.lb, unlocked_on: today() });
    toast({ message: `🎉 ${chosen.emoji ?? '🎁'} ${chosen.title} is yours. You earned it!` });
    onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet prize-sheet" role="dialog" aria-modal="true" aria-label="Choose your prize">
        <div className="prize-hero" aria-hidden="true">🎉</div>
        <h2 className="prize-title">You hit −{m.kg} kg!</h2>
        <p className="note prize-sub">Choose your prize. The others stay in your pool for next time.</p>
        <div className="prize-grid" role="radiogroup" aria-label="Prizes">
          {prizes.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={pick === p.id} className={`prize-tile${pick === p.id ? ' on' : ''}`} onClick={() => setPick(p.id)}>
              <span className="prize-emoji" aria-hidden="true">{p.emoji ?? '🎁'}</span>
              <span className="prize-name">{p.title}</span>
            </button>
          ))}
        </div>
        <div className="row prize-btns">
          <button type="button" className="btn primary" disabled={!chosen} onClick={confirm}>{chosen ? `Choose ${chosen.title}` : 'Pick one'}</button>
          <button type="button" className="btn" onClick={onClose}>Decide later</button>
        </div>
      </div>
    </div>
  );
}
