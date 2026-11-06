-- Life Dashboard: update 10.
-- Your own affirmations for the Mirror work card.
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
