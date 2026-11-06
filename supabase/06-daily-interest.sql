-- Life Dashboard: update 6 (daily interest for net worth).
-- Lets an account grow by a set amount each day (e.g. a Cash ISA earning £2.02 a day),
-- and remembers the day each balance was typed in so the estimate starts from there.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

alter table public.accounts add column if not exists daily_growth numeric(10, 2) not null default 0
  check (daily_growth >= 0 and daily_growth < 10000);
alter table public.balances add column if not exists recorded_on date;
update public.balances set recorded_on = month where recorded_on is null;

-- Your Cash ISA earns £2.02 a day
update public.accounts set daily_growth = 2.02
where daily_growth = 0 and name ~* 'cash\s*isa';
