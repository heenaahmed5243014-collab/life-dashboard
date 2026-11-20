// Client onboarding on the Today deck: each new client's next step (tick it here),
// and this week's posts that still need a picture or approval.
import { useStore } from '../store';
import { go } from '../router';
import { useToast } from '../toast';
import { addDays, today } from '../dates';
import { onboardingProgress } from '../onboarding';

export default function OnboardCard() {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const clients = store.clients.filter((c) => !c.archived);
  const onboarding = clients.map((c) => ({ c, ...onboardingProgress(c) })).filter((x) => x.next).sort((a, b) => a.done - b.done);
  const week = store.posts.filter((p) => p.day >= now && p.day <= addDays(now, 6) && p.status !== 'posted' && clients.some((c) => c.id === p.client_id));
  const noPic = week.filter((p) => !p.image_path).length;
  const unapproved = week.filter((p) => p.status === 'idea' || p.status === 'draft').length;
  const late = store.posts.filter((p) => p.day < now && p.status !== 'posted' && p.status !== 'idea' && clients.some((c) => c.id === p.client_id)).length;

  return (
    <section className="card onboard-card" aria-label="Client onboarding">
      <div className="between">
        <span className="eyebrow">🤝 Client onboarding</span>
        <button type="button" className="link-btn" onClick={() => go('/content/clients')}>{clients.length ? 'All clients' : 'Add a client'}</button>
      </div>
      {store.smmReady === false && <p className="note">Needs database update 18 to save.</p>}
      {clients.length === 0 && <p className="note">No clients yet. Add one and the app walks you through onboarding, step by step.</p>}
      {clients.length > 0 && onboarding.length === 0 && <p className="note">Everyone’s fully onboarded 🎉</p>}
      <ul className="ob-list">
        {onboarding.slice(0, 4).map(({ c, done, total, next }) => (
          <li key={c.id} className="ob-row">
            <button type="button" className="cl-box" aria-label={`Mark ${next!.label} done for ${c.name}`}
              onClick={() => {
                store.updateClient(c.id, { checklist: { ...c.checklist, [next!.key]: true } });
                toast({ message: `${next!.emoji} ${next!.label} done for ${c.name}`, undo: () => store.updateClient(c.id, { checklist: { ...c.checklist, [next!.key]: false } }) });
              }} />
            <span className="ob-main">
              <b>{next!.emoji} {next!.label}</b>
              <span className="note"><i className="cp-dot" style={{ background: c.color }} />{c.name} · {done}/{total}</span>
            </span>
            <span className="ob-ring" style={{ ['--p' as string]: `${(done / total) * 360}deg`, ['--cc' as string]: c.color }} aria-hidden="true" />
          </li>
        ))}
      </ul>
      {clients.length > 0 && (
        <button type="button" className="ob-week" onClick={() => go('/content')}>
          <span><b>{week.length}</b> post{week.length === 1 ? '' : 's'} this week</span>
          {noPic > 0 && <span className="tag t-amber">{noPic} need a picture</span>}
          {unapproved > 0 && <span className="tag">{unapproved} to approve</span>}
          {late > 0 && <span className="tag tag-today">{late} late</span>}
          <span className="folded-chev" aria-hidden="true">›</span>
        </button>
      )}
    </section>
  );
}
