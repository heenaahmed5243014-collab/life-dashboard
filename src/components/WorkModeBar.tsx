// A slim bar while Work mode is on, so it's obvious why personal things aren't showing.
import { toggleWorkMode, useWorkMode } from '../workmode';
import { go } from '../router';

export function Briefcase({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 13h18" />
    </svg>
  );
}

export default function WorkModeBar() {
  const w = useWorkMode();
  if (!w.active) return null;
  return (
    <div className="workmode-bar" role="status">
      <Briefcase size={16} />
      <span>Work mode · personal things hidden</span>
      <button type="button" className="link-btn" onClick={() => go('/account')}>Settings</button>
      <button type="button" className="workmode-off" onClick={toggleWorkMode}>Turn off</button>
    </div>
  );
}

/** The Work mode switch for page headers. */
export function WorkModeButton() {
  const w = useWorkMode();
  return (
    <button
      type="button"
      className={`icon-btn workmode-btn${w.active ? ' on' : ''}`}
      aria-pressed={w.active}
      aria-label={w.active ? 'Work mode is on. Turn it off' : 'Turn on Work mode (hide personal things)'}
      title="Work mode"
      onClick={toggleWorkMode}
    >
      <Briefcase />
    </button>
  );
}
