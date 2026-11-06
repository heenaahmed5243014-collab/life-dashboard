// Shown instead of a personal page while Work mode is on.
import Header from '../components/Header';
import { toggleWorkMode } from '../workmode';
import { Briefcase } from '../components/WorkModeBar';

export default function HiddenScreen() {
  return (
    <>
      <Header title="" />
      <main className="page page-form center hidden-page">
        <span className="hidden-icon"><Briefcase size={34} /></span>
        <h1 className="h2">Hidden in Work mode</h1>
        <p className="muted">This page is personal, so it’s hidden while Work mode is on.</p>
        <button type="button" className="btn" onClick={toggleWorkMode}>Turn off Work mode</button>
      </main>
    </>
  );
}
