-- Life Dashboard: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run more than once.

-- 1. Domains: the five areas of life, plus an Inbox for things that aren't sorted yet.
create table if not exists public.domains (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  short_name  text not null,
  color       text not null,
  is_inbox    boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- 2. Tasks: every task, project and idea (one row each).
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  domain_id   uuid not null references public.domains (id) on delete restrict,
  kind        text not null default 'task' check (kind in ('task', 'project', 'idea')),
  project_id  uuid references public.tasks (id) on delete set null,
  due         date,
  status      text not null default 'open' check (status in ('open', 'done', 'not_doing')),
  stage       text,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  touched_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_domain_idx on public.tasks (domain_id);
create index if not exists tasks_project_idx on public.tasks (project_id);

-- 3. Routines: things that repeat on set days (0 = Monday ... 6 = Sunday).
create table if not exists public.routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  domain_id    uuid not null references public.domains (id) on delete restrict,
  days         smallint[] not null check (cardinality(days) > 0 and days <@ array[0,1,2,3,4,5,6]::smallint[]),
  time_of_day  text not null default 'day' check (time_of_day in ('commute', 'day', 'evening')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists routines_domain_idx on public.routines (domain_id);

-- 4. Routine ticks: one row each time a routine is ticked, so streaks can come later.
create table if not exists public.routine_ticks (
  routine_id  uuid not null references public.routines (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (routine_id, day)
);
create index if not exists routine_ticks_user_day_idx on public.routine_ticks (user_id, day);

-- 5. Privacy: each signed-in person can only ever see and change their own rows.
alter table public.domains       enable row level security;
alter table public.tasks         enable row level security;
alter table public.routines      enable row level security;
alter table public.routine_ticks enable row level security;

drop policy if exists "own rows" on public.domains;
drop policy if exists "own rows" on public.tasks;
drop policy if exists "own rows" on public.routines;
drop policy if exists "own rows" on public.routine_ticks;

create policy "own rows" on public.domains
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.routines
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.routine_ticks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The five domains themselves are created by the app the first time you sign in.
