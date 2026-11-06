-- Life Dashboard: update 8: bills and refunds, plus updates 6 and 7 (daily interest, income) in case they haven't run yet.
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
  daily_travel numeric(10, 2) not null default 0 check (daily_travel >= 0),
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
-- (for a database where this table was created before travel was added)
alter table public.income_settings add column if not exists daily_travel numeric(10, 2) not null default 0 check (daily_travel >= 0);

alter table public.income_settings enable row level security;
alter table public.payslips enable row level security;
drop policy if exists "own rows" on public.income_settings;
drop policy if exists "own rows" on public.payslips;
create policy "own rows" on public.income_settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.payslips
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Your starting figures: £144.72 a day, Monday to Friday, £9.75 travel a work day, and the 5 Nov payslip totals
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
  insert into public.income_settings (user_id, daily_rate, work_days, daily_travel) values (uid, 144.72, '{0,1,2,3,4}', 9.75)
  on conflict (user_id) do nothing;
  update public.income_settings set daily_travel = 9.75 where user_id = uid and daily_travel = 0;
  insert into public.payslips (user_id, paid_on, gross, net) values (uid, '2026-11-05', 3064.02, 2333.94)
  on conflict (user_id, paid_on) do nothing;
end $$;

-- Update 8a: bills and subscriptions
create table if not exists public.bills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  amount      numeric(10, 2) not null check (amount >= 0),
  frequency   text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'yearly')),
  due_day     smallint not null default 1 check (due_day between 0 and 31),  -- monthly: 1-31, weekly: 0 = Monday ... 6 = Sunday
  due_month   smallint check (due_month between 1 and 12),                  -- yearly only
  kind        text not null default 'bill' check (kind in ('bill', 'subscription', 'debt', 'saving')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.bills enable row level security;
drop policy if exists "own rows" on public.bills;
create policy "own rows" on public.bills
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Update 8b: refunds on returns
alter table public.tasks add column if not exists refund_amount numeric(10, 2) check (refund_amount is null or refund_amount >= 0);
alter table public.tasks add column if not exists refund_status text check (refund_status is null or refund_status in ('waiting', 'received'));
alter table public.tasks add column if not exists dropped_off_on date;
alter table public.tasks add column if not exists refund_received_on date;
create index if not exists tasks_refund_waiting_idx on public.tasks (user_id) where refund_status = 'waiting';

-- Fill in refund amounts from prices already in titles, e.g. "Return glasses (£12.99)"
update public.tasks
set refund_amount = (substring(title from '£\s*([0-9]+(?:\.[0-9]{1,2})?)'))::numeric
where refund_amount is null and title ~ '£\s*[0-9]'
  and (title ~* '\m(return|returns|refund|exchange)\M' or notes ilike '%return window%'
       or subcategory_id in (select id from public.subcategories where lower(btrim(name)) = 'returns'));
