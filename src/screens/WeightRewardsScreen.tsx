// Weight rewards: a milestone for every kilogram lost, each with a reward you choose
// (a trip, an experience, a treat). It unlocks when your weight gets there.
import { useState } from 'react';
import { useStore } from '../store';
import Header from '../components/Header';
import { milestones, recentLb, startLb, goalLb, LB_PER_KG, type Milestone } from '../weightRewards';
import { shortDate, today } from '../dates';
import { useToast } from '../toast';

const EMOJIS = ['✈️', '🏝️', '💆', '🎟️', '🍽️', '👗', '🎢', '🧖', '💅', '🎁', '🏨', '🚗'];
const fix = (n: number) => n.toFixed(1);

export default function WeightRewardsScreen() {
  const store = useStore();
  const now = today();
  const list = milestones(store.weights, store.rewards, store.tasks, now);
  const start = startLb(store.weights, store.rewards);
  const current = recentLb(store.weights, now);
  const goal = goalLb(store.tasks);
  const lostKg = start !== null && current !== null ? Math.max(0, (start - current) / LB_PER_KG) : 0;
  const next = list.find((m) => !m.reached);

  return (
    <>
      <Header title="Journey rewards" />
      <main className="page page-form wr-page">
        {store.rewardsReady === false && <p className="note warn-text">Rewards need database update 13. Ask Claude for the link.</p>}
        {start === null ? (
          <p className="note">Log your first weigh-in on the Today screen, and your milestones appear here.</p>
        ) : (
          <>
            <section className="card hero stack">
              <div className="between"><span className="eyebrow">So far</span><span className="count">{goal ? `Goal ${goal} lb` : 'Set a goal like “120lb” in Life goals'}</span></div>
              <div className="big-money">−{lostKg.toFixed(1)} kg <span className="note">({fix(Math.max(0, start - (current ?? start)))} lb)</span></div>
              <p className="note">Started at {fix(start)} lb · now {current !== null ? `${fix(current)} lb` : '—'}{next ? ` · ${fix(Math.max(0, (current ?? start) - next.lb))} lb to the next milestone` : ''}.</p>
              <p className="note">Milestones count your 7-day average when you’ve weighed in more than once, so one light day doesn’t unlock early.</p>
            </section>
            <p className="sub">Add a reward to any kilogram. Trips, experiences, treats: whatever keeps you going.</p>
            <ol className="wr-list">
              {list.map((m) => <MilestoneRow key={m.kg} m={m} isNext={m === next} disabled={store.rewardsReady === false} />)}
            </ol>
          </>
        )}
      </main>
    </>
  );
}

function MilestoneRow({ m, isNext, disabled }: { m: Milestone; isNext: boolean; disabled: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.reward?.title ?? '');
  const [emoji, setEmoji] = useState(m.reward?.emoji ?? '🎁');
  const r = m.reward;
  const save = () => {
    const t = title.trim();
    if (!t) return;
    if (r) store.updateReward(r.id, { title: t, emoji });
    else store.addReward({ kg: m.kg, target_lb: m.lb, title: t, emoji, ...(m.reached ? {} : {}) });
    setEditing(false);
    toast({ message: m.reached ? `${emoji} ${t}: you’ve already earned this one!` : `${emoji} ${t} waits for you at ${fix(m.lb)} lb` });
  };
  return (
    <li className={`wr-row${m.reached ? ' reached' : ''}${isNext ? ' next' : ''}`}>
      <div className="wr-mark" aria-hidden="true">{m.reached ? '✓' : `${m.kg}`}</div>
      <div className="wr-body">
        <div className="between">
          <span className="row-title">−{m.kg} kg</span>
          <span className="note">{fix(m.lb)} lb{isNext ? ' · next' : m.reached ? ' · reached' : ''}</span>
        </div>
        {editing ? (
          <div className="stack wr-edit">
            <div className="chips wr-emojis">
              {EMOJIS.map((e) => <button key={e} type="button" aria-pressed={emoji === e} className={emoji === e ? 'emoji-btn on' : 'emoji-btn'} onClick={() => setEmoji(e)}>{e}</button>)}
            </div>
            <form className="add-sub todo-add" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <label className="visually-hidden" htmlFor={`wr-${m.kg}`}>Reward for {m.kg} kg</label>
              <input id={`wr-${m.kg}`} className="step-input" autoFocus value={title} maxLength={120} placeholder="e.g. Weekend in Lisbon, spa day" onChange={(e) => setTitle(e.target.value)} />
              <button type="submit" className="btn primary">Save</button>
            </form>
            <div className="row">
              <button type="button" className="link-btn quiet" onClick={() => setEditing(false)}>Cancel</button>
              {r && <button type="button" className="link-btn quiet push-right" onClick={() => { store.deleteReward(r.id); setEditing(false); }}>Remove reward</button>}
            </div>
          </div>
        ) : r ? (
          <div className="wr-reward">
            <span className="wr-emoji" aria-hidden="true">{r.emoji ?? '🎁'}</span>
            <button type="button" className="wr-title" onClick={() => setEditing(true)}>{r.title}</button>
            {r.claimed_on ? (
              <span className="tag t-sage">Enjoyed {shortDate(r.claimed_on)} 🎉</span>
            ) : m.reached ? (
              <button type="button" className="btn small primary" onClick={() => { store.updateReward(r.id, { claimed_on: today(), unlocked_on: r.unlocked_on ?? today() }); toast({ message: `Enjoy it! ${r.emoji ?? '🎉'}` }); }}>Unlocked! Mark enjoyed</button>
            ) : (
              <span className="tag">Locked</span>
            )}
          </div>
        ) : (
          <button type="button" className="link-btn wr-add" disabled={disabled} onClick={() => setEditing(true)}>+ Add a reward</button>
        )}
      </div>
    </li>
  );
}
