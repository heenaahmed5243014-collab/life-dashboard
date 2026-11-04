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
