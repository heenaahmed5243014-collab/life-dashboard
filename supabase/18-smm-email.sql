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

-- Clients you're onboarding or working with, each with an onboarding checklist
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  handle      text not null default '' check (length(handle) <= 60),
  color       text not null default '#FF8A3D' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  checklist   jsonb not null default '{}'::jsonb,
  notes       text not null default '' check (length(notes) <= 4000),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Planned posts on the content calendar (with your own pictures)
create table if not exists public.content_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete cascade,
  day         date not null,
  time        text check (time is null or time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  platform    text not null default 'Instagram' check (length(platform) <= 30),
  kind        text not null default 'post' check (kind in ('post', 'reel', 'story', 'carousel')),
  caption     text not null default '' check (length(caption) <= 4000),
  status      text not null default 'idea' check (status in ('idea', 'draft', 'approved', 'scheduled', 'posted')),
  image_path  text,
  created_at  timestamptz not null default now()
);

alter table public.clients       enable row level security;
alter table public.content_posts enable row level security;
drop policy if exists "own rows" on public.clients;
drop policy if exists "own rows" on public.content_posts;
create policy "own rows" on public.clients
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.content_posts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A private folder for content pictures (only you can see them)
insert into storage.buckets (id, name, public) values ('content', 'content', false) on conflict (id) do nothing;
drop policy if exists "content: own files read" on storage.objects;
drop policy if exists "content: own files add" on storage.objects;
drop policy if exists "content: own files delete" on storage.objects;
create policy "content: own files read" on storage.objects for select to authenticated
  using (bucket_id = 'content' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "content: own files add" on storage.objects for insert to authenticated
  with check (bucket_id = 'content' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "content: own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'content' and (storage.foldername(name))[1] = (select auth.uid())::text);
