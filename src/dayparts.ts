// The day in three parts. Used by the plan, the morning debrief and the live pill.
export type PartKey = 'morning' | 'afternoon' | 'evening';
export const PARTS: { key: PartKey; label: string; emoji: string; from: number; to: number }[] = [
  { key: 'morning', label: 'Morning', emoji: '🌅', from: 0, to: 12 },
  { key: 'afternoon', label: 'Afternoon', emoji: '☀️', from: 12, to: 17 },
  { key: 'evening', label: 'Evening', emoji: '🌙', from: 17, to: 24 },
];
export const partOfHour = (h: number): PartKey => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');
export const partNow = (d = new Date()) => partOfHour(d.getHours());
export const PART = Object.fromEntries(PARTS.map((p) => [p.key, p])) as Record<PartKey, (typeof PARTS)[number]>;
