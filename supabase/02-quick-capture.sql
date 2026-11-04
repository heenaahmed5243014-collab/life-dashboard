-- Life Dashboard: update 2 (quick capture).
-- Adds a time and a reminder to tasks, and a new "note" type.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists remind_at timestamptz;

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('task', 'project', 'idea', 'note'));

create index if not exists tasks_user_created_idx on public.tasks (user_id, created_at desc);
