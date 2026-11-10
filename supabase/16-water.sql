-- Life Dashboard: update 16.
-- Water: one total per day, in millilitres. Paste into Supabase > SQL Editor > New query,
-- then press Run. Safe to run more than once.

create table if not exists public.water (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  ml          integer not null check (ml between 0 and 10000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.water enable row level security;
drop policy if exists "own rows" on public.water;
create policy "own rows" on public.water
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
