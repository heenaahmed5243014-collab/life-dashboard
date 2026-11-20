-- Life Dashboard: update 18.
-- Social media jobs (with an AI agent assigned to each) and an email tracker.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create table if not exists public.smm_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client      text not null default '' check (length(client) <= 80),
  title       text not null check (length(btrim(title)) between 1 and 200),
  platform    text not null default 'Instagram' check (length(platform) <= 30),
  brief       text not null default '' check (length(brief) <= 4000),
  due         date,
  agent       text check (agent is null or length(agent) <= 30),
  status      text not null default 'todo' check (status in ('todo', 'review', 'ready', 'posted')),
  output      text not null default '' check (length(output) <= 12000),
  created_at  timestamptz not null default now()
);

create table if not exists public.email_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender      text not null default '' check (length(sender) <= 120),
  subject     text not null check (length(btrim(subject)) between 1 and 200),
  kind        text not null default 'reply' check (kind in ('reply', 'waiting')),
  summary     text not null default '' check (length(summary) <= 600),
  next_step   text not null default '' check (length(next_step) <= 200),
  due         date,
  status      text not null default 'open' check (status in ('open', 'done')),
  created_at  timestamptz not null default now()
);

alter table public.smm_tasks   enable row level security;
alter table public.email_items enable row level security;
drop policy if exists "own rows" on public.smm_tasks;
drop policy if exists "own rows" on public.email_items;
create policy "own rows" on public.smm_tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.email_items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
