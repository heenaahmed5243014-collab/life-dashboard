// How things sit under an area (scope section 2): projects, loose tasks, routines, ideas.
// Two areas track a stage on their projects (scope section 5).
import type { Domain, Subcategory, Task } from './types';

interface AreaConfig {
  projectsLabel: string; // what this area calls its projects
  one: string; // "application"
  many: string; // "applications"
  stages: string[] | null;
}

const CONFIG: Record<string, AreaConfig> = {
  'Job search': { projectsLabel: 'Applications', one: 'application', many: 'applications', stages: ['Applied', 'Test', 'Interview', 'Offer', 'Closed'] },
  'Made in Heaven Visuals': { projectsLabel: 'Clients & shoots', one: 'shoot', many: 'shoots', stages: ['Booked', 'Shot', 'Editing', 'Delivered'] },
};

export function areaConfig(d: Domain): AreaConfig {
  return CONFIG[d.name] ?? { projectsLabel: 'Projects', one: 'project', many: 'projects', stages: null };
}

/** Returns get their own heading (as in the Brain Planner): anything worded as a return, or imported with a return window. */
export function isReturn(t: Task): boolean {
  return /\b(return|returns|refund|exchange|send back)\b/i.test(t.title) || /return window/i.test(t.notes);
}

/** Projects at a final stage are shown as finished. */
export function isFinalStage(stage: string | null): boolean {
  return stage === 'Closed' || stage === 'Delivered';
}

/** The Returns sub-category of an area, if it has one. */
export function returnsSubOf(subs: Subcategory[]): Subcategory | undefined {
  return subs.find((x) => x.name.trim().toLowerCase() === 'returns');
}

/**
 * Which sub-category an item shows under: the one it was given, or Returns
 * for anything that looks like a return in an area that has a Returns sub-category.
 */
export function groupOf(t: Task, subs: Subcategory[]): Subcategory | null {
  const own = t.subcategory_id ? subs.find((x) => x.id === t.subcategory_id) : undefined;
  if (own) return own;
  const r = returnsSubOf(subs);
  return r && t.kind === 'task' && isReturn(t) ? r : null;
}

/** All open returns across every area: filed under a Returns sub-category, or worded as a return. */
export function allReturns(tasks: Task[], subs: Subcategory[]): Task[] {
  const returnIds = new Set(subs.filter((x) => x.name.trim().toLowerCase() === 'returns').map((x) => x.id));
  return tasks.filter((t) => t.status === 'open' && t.kind === 'task' && ((t.subcategory_id && returnIds.has(t.subcategory_id)) || (!t.subcategory_id && isReturn(t))));
}

/**
 * A picture (3D style, in public/img/areas/) or emoji for an area, matched by name.
 * Add a picture by dropping the file in public/img/areas/ and listing it in AREA_IMAGES.
 */
const AREA_IMAGES: [RegExp, string][] = [
  [/made in heaven|photo|visual|shoot/i, '/img/areas/camera.png'],
  [/job|career|interview/i, '/img/areas/jobsearch.png'],
  [/^work$|work\b/i, '/img/areas/desk.png'],
  [/side|idea/i, '/img/areas/sketchbook.png'],
];
const AREA_EMOJI: [RegExp, string][] = [
  [/made in heaven|photo|visual|shoot/i, '📸'], [/job|career|interview/i, '🎯'], [/^work$|work\b/i, '💼'],
  [/side|idea/i, '💡'], [/personal|home/i, '🏡'], [/inbox/i, '📥'], [/gym|fitness|health/i, '🏋️‍♀️'],
  [/money|finance/i, '💷'], [/study|learn|course/i, '📚'], [/family/i, '👨‍👩‍👧'], [/travel|trip/i, '✈️'],
];
export function areaPic(name: string): { img?: string; emoji: string } {
  const img = AREA_IMAGES.find(([re]) => re.test(name))?.[1];
  return { img, emoji: AREA_EMOJI.find(([re]) => re.test(name))?.[1] ?? '✨' };
}
