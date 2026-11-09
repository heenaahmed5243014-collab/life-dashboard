-- Life Dashboard: update 13.
-- Rewards for weight milestones (one per kilogram lost): trips, experiences, treats.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create table if not exists public.weight_rewards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kg          numeric(4, 1) not null check (kg > 0 and kg <= 100),       -- kilograms lost, e.g. 3
  target_lb   numeric(5, 1) not null check (target_lb between 50 and 600), -- the weight that unlocks it
  title       text not null check (length(btrim(title)) between 1 and 120),
  emoji       text check (emoji is null or length(emoji) <= 16),
  unlocked_on date,
  claimed_on  date,
  created_at  timestamptz not null default now()
);
create index if not exists weight_rewards_user_idx on public.weight_rewards (user_id, target_lb);

alter table public.weight_rewards enable row level security;
drop policy if exists "own rows" on public.weight_rewards;
create policy "own rows" on public.weight_rewards
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
