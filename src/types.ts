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
  drop_off: string | null; // returns: Post Office, InPost locker...
  qr_path: string | null; // returns: private QR screenshot in storage
  subcategory_id: string | null;
  refund_amount?: number | null; // returns: how much comes back
  refund_status?: 'waiting' | 'received' | null;
  dropped_off_on?: Day | null;
  refund_received_on?: Day | null;
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
  chunks: number; // e.g. 2 for steps in 10k chunks
  chunk_label: string | null; // e.g. "10k"
  created_at: string;
}

export interface Tick {
  routine_id: string;
  day: Day;
  count: number; // how many chunks are done that day
}

export interface Subcategory {
  id: string;
  domain_id: string;
  name: string;
  note: string;
  sort: number;
}

export interface Account {
  id: string;
  name: string;
  is_debt: boolean;
  active: boolean;
  sort: number;
  daily_growth?: number; // e.g. 2.02 for a Cash ISA earning £2.02 a day
}

export interface Balance {
  account_id: string;
  month: Day; // first of the month
  amount: number;
  recorded_on?: Day | null; // the day it was typed in; interest counts from here
}

export interface IncomeSettings {
  daily_rate: number; // before tax
  work_days: number[]; // 0 = Monday ... 6 = Sunday
  daily_travel?: number; // spent on travel each work day
}

export type BillFrequency = 'weekly' | 'monthly' | 'yearly';
export type BillKind = 'bill' | 'subscription' | 'debt' | 'saving';

export interface Bill {
  id: string;
  name: string;
  amount: number;
  frequency: BillFrequency;
  due_day: number; // monthly: 1-31 · weekly: 0 = Monday ... 6 = Sunday · yearly: day of due_month
  due_month: number | null; // yearly only, 1-12
  kind: BillKind;
  active: boolean;
}

export interface Payslip {
  id: string;
  paid_on: Day;
  gross: number;
  net: number;
}

export interface Weight {
  day: Day;
  lb: number;
}

/** The fixed domains, plus Inbox. Created on first sign-in. */
/** Domains that have been retired. Their items move to Inbox (routines to Home) on next load. */
export const REMOVED_DOMAINS = ['Concierge job'];

export const DEFAULT_DOMAINS: Omit<Domain, 'id'>[] = [
  { name: 'Work', short_name: 'Work', color: '#3F6FB5', is_inbox: false, sort: 1 },
  { name: 'Job search', short_name: 'Job search', color: '#A5620B', is_inbox: false, sort: 2 },
  { name: 'Made in Heaven Visuals', short_name: 'Made in Heaven', color: '#C2366F', is_inbox: false, sort: 3 },
  { name: 'Side ideas', short_name: 'Side ideas', color: '#6A4BC4', is_inbox: false, sort: 4 },
  { name: 'Personal & home', short_name: 'Home', color: '#3E7A64', is_inbox: false, sort: 5 },
  { name: 'Inbox', short_name: 'Inbox', color: '#76637A', is_inbox: true, sort: 99 },
];

export interface StepDay {
  day: Day;
  count: number;
  source?: string;
}

/** target null = emergency fund, worked out from bills and travel. */
export interface SavingsGoal {
  id: string;
  name: string;
  target: number | null;
  months: number;
  account_id: string | null;
  sort: number;
}
