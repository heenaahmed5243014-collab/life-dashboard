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

export type TaskKind = 'task' | 'project' | 'idea' | 'note' | 'goal';
export type Energy = 'low' | 'mid' | 'high';
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
  minutes: number | null; // time estimate
  energy: Energy | null;
  step: string | null; // the tiny first step
  starred: boolean; // pinned to Top 3
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

/** The fixed domains, plus Inbox. Created on first sign-in. */
/** Domains that have been retired. Their items move to Inbox (routines to Home) on next load. */
export const REMOVED_DOMAINS = ['Concierge job'];

export const DEFAULT_DOMAINS: Omit<Domain, 'id'>[] = [
  { name: 'Job search', short_name: 'Job search', color: '#A5620B', is_inbox: false, sort: 2 },
  { name: 'Made in Heaven Visuals', short_name: 'Made in Heaven', color: '#C2366F', is_inbox: false, sort: 3 },
  { name: 'Side ideas', short_name: 'Side ideas', color: '#6A4BC4', is_inbox: false, sort: 4 },
  { name: 'Personal & home', short_name: 'Home', color: '#3E7A64', is_inbox: false, sort: 5 },
  { name: 'Inbox', short_name: 'Inbox', color: '#76637A', is_inbox: true, sort: 99 },
];
