-- Life Dashboard: update 17.
-- Body progress (body fat %, muscle mass, private progress photos), gym session length,
-- steps through the day (morning / afternoon / night), and subscriptions you want to cancel.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

-- 1. Body fat and muscle mass alongside each weigh-in (muscle in lb, like your weight)
alter table public.weights add column if not exists body_fat numeric(4, 1) check (body_fat is null or body_fat between 2 and 70);
alter table public.weights add column if not exists muscle   numeric(5, 1) check (muscle is null or muscle between 20 and 400);

-- 2. How long each gym session lasted, in minutes
alter table public.routine_ticks add column if not exists minutes smallint check (minutes is null or minutes between 1 and 600);

-- 3. Steps through the day: the total as it stood in the morning, afternoon and at night
create table if not exists public.step_checkins (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  part        text not null check (part in ('morning', 'afternoon', 'night')),
  count       integer not null check (count between 0 and 200000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day, part)
);
alter table public.step_checkins enable row level security;
drop policy if exists "own rows" on public.step_checkins;
create policy "own rows" on public.step_checkins
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Every time today's steps are saved (from the app or the Apple Health Shortcut),
-- remember the total for the part of the day it is now (UK time).
create or replace function public.steps_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  london timestamp := now() at time zone 'Europe/London';
  p text;
begin
  if new.day <> london::date then return new; end if;
  p := case when extract(hour from london) < 12 then 'morning'
            when extract(hour from london) < 17 then 'afternoon'
            else 'night' end;
  insert into public.step_checkins (user_id, day, part, count, updated_at)
  values (new.user_id, new.day, p, new.count, now())
  on conflict (user_id, day, part) do update set count = excluded.count, updated_at = now();
  return new;
end $$;
drop trigger if exists steps_checkin on public.steps;
create trigger steps_checkin after insert or update of count on public.steps
  for each row execute function public.steps_checkin();

-- 4. Subscriptions you want to cancel: the date to cancel by (the next renewal)
alter table public.bills add column if not exists cancel_by date;

-- 5. Progress photos: private, only you can see them
create table if not exists public.progress_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  path        text not null,
  created_at  timestamptz not null default now()
);
alter table public.progress_photos enable row level security;
drop policy if exists "own rows" on public.progress_photos;
create policy "own rows" on public.progress_photos
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public) values ('progress', 'progress', false) on conflict (id) do nothing;
drop policy if exists "progress: own files read" on storage.objects;
drop policy if exists "progress: own files add" on storage.objects;
drop policy if exists "progress: own files delete" on storage.objects;
create policy "progress: own files read" on storage.objects for select to authenticated
  using (bucket_id = 'progress' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress: own files add" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress: own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 6. Finance PIN saved to your account (a salted hash, never the PIN), so it stays on on every device
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pin_salt    text,
  pin_hash    text,
  updated_at  timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "own rows" on public.user_settings;
create policy "own rows" on public.user_settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
