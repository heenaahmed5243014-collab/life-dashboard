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
