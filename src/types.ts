// The shapes of the rows in the Supabase database (see supabase/schema.sql).
import type { Day } from './dates';

export interface Domain {
  id: string;
  name: string;
  short_name: string;
  color: string;
  is_inbox: boolean;
  sort: number;
}

export type TaskKind = 'task' | 'project' | 'idea' | 'note';
export type TaskStatus = 'open' | 'done' | 'not_doing';
export type TimeOfDay = 'commute' | 'day' | 'evening';

export interface Task {
  id: string;
  title: string;
  domain_id: string;
  kind: TaskKind;
  project_id: string | null;
  due: Day | null;
  due_time: string | null; // "10:00" (Supabase may add ":00" seconds)
  remind_at: string | null; // ISO timestamp
  status: TaskStatus;
  stage: string | null;
  notes: string;
  created_at: string;
  touched_at: string;
  closed_at: string | null;
}

export interface Routine {
  id: string;
  title: string;
  domain_id: string;
  days: number[]; // 0 = Monday ... 6 = Sunday
  time_of_day: TimeOfDay;
  active: boolean;
  created_at: string;
}

export interface Tick {
  routine_id: string;
  day: Day;
}

/** The five fixed domains from the scope, plus Inbox. Created on first sign-in. */
export const DEFAULT_DOMAINS: Omit<Domain, 'id'>[] = [
  { name: 'Concierge job', short_name: 'Concierge', color: '#5E73A0', is_inbox: false, sort: 1 },
  { name: 'Job search', short_name: 'Job search', color: '#C0763A', is_inbox: false, sort: 2 },
  { name: 'Made in Heaven Visuals', short_name: 'Made in Heaven', color: '#B5577A', is_inbox: false, sort: 3 },
  { name: 'Side ideas', short_name: 'Side ideas', color: '#8A74B8', is_inbox: false, sort: 4 },
  { name: 'Personal & home', short_name: 'Home', color: '#4F8A6E', is_inbox: false, sort: 5 },
  { name: 'Inbox', short_name: 'Inbox', color: '#9A9A92', is_inbox: true, sort: 99 },
];
