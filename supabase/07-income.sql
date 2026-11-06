-- Life Dashboard: update 7 (income), plus update 6 (daily interest) in case it hasn't run yet.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

-- Update 6: daily interest on accounts (e.g. Cash ISA £2.02 a day)
alter table public.accounts add column if not exists daily_growth numeric(10, 2) not null default 0
  check (daily_growth >= 0 and daily_growth < 10000);
alter table public.balances add column if not exists recorded_on date;
update public.balances set recorded_on = month where recorded_on is null;
update public.accounts set daily_growth = 2.02 where daily_growth = 0 and name ~* 'cash\s*isa';

-- Update 7: income
create table if not exists public.income_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  daily_rate  numeric(10, 2) not null default 0 check (daily_rate >= 0),
  work_days   smallint[] not null default '{0,1,2,3,4}' check (work_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  updated_at  timestamptz not null default now()
);
create table if not exists public.payslips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  paid_on     date not null,
  gross       numeric(10, 2) not null check (gross >= 0),
  net         numeric(10, 2) not null check (net >= 0),
  created_at  timestamptz not null default now(),
  unique (user_id, paid_on)
);
alter table public.income_settings enable row level security;
alter table public.payslips enable row level security;
drop policy if exists "own rows" on public.income_settings;
drop policy if exists "own rows" on public.payslips;
create policy "own rows" on public.income_settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.payslips
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Your starting figures: £144.72 a day, Monday to Friday, and the 5 Nov payslip totals
do $$
declare
  uid uuid;
  n int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise exception 'Expected exactly one account, found %. Tables were added; starting figures were not.', n;
  end if;
  select id into uid from auth.users limit 1;
  insert into public.income_settings (user_id, daily_rate, work_days) values (uid, 144.72, '{0,1,2,3,4}')
  on conflict (user_id) do nothing;
  insert into public.payslips (user_id, paid_on, gross, net) values (uid, '2026-11-05', 3064.02, 2333.94)
  on conflict (user_id, paid_on) do nothing;
end $$;
