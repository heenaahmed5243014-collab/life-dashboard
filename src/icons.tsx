const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const Check = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.4} {...base}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const Plus = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" strokeWidth={2.2} {...base}><path d="M12 5v14M5 12h14" /></svg>
);
export const Close = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth={2} {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const BackArrow = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth={2} {...base}><path d="M15 6l-6 6 6 6" /></svg>
);
export const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth={2} {...base}><path d="M9 6l6 6-6 6" /></svg>
);
export const Save = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth={1.9} {...base}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
);
export const Bell = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} aria-hidden={false} role="img" aria-label="Reminder set"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 21h4" /></svg>
);
export const Sparkle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth={1.9} {...base}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
);
export const Person = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth={1.9} {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
export const Mic = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth={1.9} {...base}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
