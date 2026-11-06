-- Life Dashboard: update 10.
-- Your own affirmations for the Mirror work card, plus Projects and Outreach for Made in Heaven Visuals.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create table if not exists public.affirmations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null check (length(btrim(text)) between 1 and 300),
  created_at  timestamptz not null default now()
);

alter table public.affirmations enable row level security;
drop policy if exists "own rows" on public.affirmations;
create policy "own rows" on public.affirmations
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Projects and outreach (Made in Heaven Visuals), as in the Brain Planner.
-- A project can be paused without being finished.
alter table public.tasks add column if not exists paused boolean not null default false;

-- Outreach pipeline: people you're contacting, the stage they're at, and when to follow up.
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain_id   uuid not null references public.domains (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  biz         text not null default '',
  channel     text not null default 'Instagram DM',
  stage       text not null default 'todo' check (stage in ('todo', 'contacted', 'follow', 'replied', 'won', 'no')),
  follow_up   date,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists leads_user_idx on public.leads (user_id, domain_id);
alter table public.leads enable row level security;
drop policy if exists "own rows" on public.leads;
create policy "own rows" on public.leads
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
