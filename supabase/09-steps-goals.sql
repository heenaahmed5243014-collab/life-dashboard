-- Life Dashboard: update 9.
-- Steps from Apple Health (via an iPhone Shortcut), savings goals and no-spend days.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

-- 1. Steps: one number per day
create table if not exists public.steps (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  count       integer not null check (count between 0 and 200000),
  source      text not null default 'manual',
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- 2. A private link code the iPhone Shortcut uses to send steps (it can only save steps, nothing else)
create table if not exists public.step_links (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

-- 3. Savings goals. A goal with no target is your emergency fund: the app works out
--    the target from your bills and travel (months x a month's essentials).
create table if not exists public.savings_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  target      numeric(12, 2) check (target is null or target > 0),
  months      smallint not null default 3 check (months between 1 and 12),
  account_id  uuid references public.accounts (id) on delete set null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- 4. No-spend days
create table if not exists public.no_spend_days (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  primary key (user_id, day)
);

-- 5. Privacy: each person only sees their own rows
alter table public.steps         enable row level security;
alter table public.step_links    enable row level security;
alter table public.savings_goals enable row level security;
alter table public.no_spend_days enable row level security;
drop policy if exists "own rows" on public.steps;
drop policy if exists "own rows" on public.step_links;
drop policy if exists "own rows" on public.savings_goals;
drop policy if exists "own rows" on public.no_spend_days;
create policy "own rows" on public.steps
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.step_links
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows" on public.savings_goals
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.no_spend_days
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 6. Make (or replace) your Shortcut link code. Only you, signed in, can do this.
create or replace function public.new_step_link() returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if uid is null then raise exception 'Not signed in'; end if;
  insert into public.step_links (user_id, token) values (uid, tok)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return tok;
end $$;
revoke all on function public.new_step_link() from public, anon;
grant execute on function public.new_step_link() to authenticated;

-- 7. What the Shortcut calls: saves the day's steps and ticks the steps routine's 10k chunks.
create or replace function public.log_steps(p_token text, p_steps numeric, p_day date default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  d date := coalesce(p_day, (now() at time zone 'Europe/London')::date);
  n integer := round(coalesce(p_steps, 0));
  r record;
  size integer;
  done smallint;
begin
  select user_id into uid from public.step_links where token = p_token and length(p_token) >= 32;
  if uid is null then raise exception 'Unknown link code. Make a new one in the app.'; end if;
  if n < 0 or n > 200000 then raise exception 'That step count looks wrong: %', n; end if;
  if d > (now() at time zone 'Europe/London')::date + 1 or d < (now() at time zone 'Europe/London')::date - 31 then
    raise exception 'That date is out of range: %', d;
  end if;

  insert into public.steps (user_id, day, count, source, updated_at) values (uid, d, n, 'apple health', now())
  on conflict (user_id, day) do update set count = excluded.count, source = excluded.source, updated_at = now();

  for r in select id, chunks, chunk_label, title from public.routines
           where user_id = uid and active and title ~* 'steps' loop
    size := coalesce(
      (substring(r.chunk_label from '([0-9]+(?:\.[0-9]+)?)\s*k'))::numeric * 1000,
      (substring(r.title from '([0-9]+(?:\.[0-9]+)?)\s*k'))::numeric * 1000 / greatest(r.chunks, 1),
      10000)::integer;
    done := least(r.chunks, floor(n::numeric / greatest(size, 1)))::smallint;
    if done > 0 then
      insert into public.routine_ticks (routine_id, user_id, day, count) values (r.id, uid, d, done)
      on conflict (routine_id, day) do update set count = greatest(public.routine_ticks.count, excluded.count);
    end if;
  end loop;

  return 'Saved ' || to_char(n, 'FM999,999') || ' steps for ' || to_char(d, 'Dy DD Mon');
end $$;
revoke all on function public.log_steps(text, numeric, date) from public;
grant execute on function public.log_steps(text, numeric, date) to anon, authenticated;

-- 8. Start you off with an emergency fund goal (3 months of essentials), once.
insert into public.savings_goals (user_id, name, target, months, account_id, sort)
select u.id, 'Emergency fund', null, 3,
  (select a.id from public.accounts a where a.user_id = u.id and a.name ~* '(isa|saving)' and not a.is_debt order by a.sort limit 1), 1
from auth.users u
where not exists (select 1 from public.savings_goals g where g.user_id = u.id);
