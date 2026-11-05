// How things sit under an area (scope section 2): projects, loose tasks, routines, ideas.
// Two areas track a stage on their projects (scope section 5).
import type { Domain, Task } from './types';

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
