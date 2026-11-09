-- Life Dashboard: update 12.
-- Gym session types, repeating events, interest rates for savings (passive income) and task emojis.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

-- 1. Gym: what each session was (Legs, Arms, Cardio...), and the plan for each day of the week
alter table public.routine_ticks add column if not exists session text check (session is null or length(session) <= 40);
alter table public.routines add column if not exists session_types text[];          -- e.g. {Legs,Arms,Cardio}
alter table public.routines add column if not exists session_plan text[];           -- 7 entries, Monday first, e.g. {Legs,null,Arms,...}
update public.routines set session_types = array['Legs', 'Arms', 'Back', 'Core', 'Cardio', 'Full body']
  where session_types is null and title ~* '\m(gym|workout|weights|training)\M';

-- 2. Repeating events: every week, every 2 weeks, every 4 weeks or every month
alter table public.tasks add column if not exists repeat text check (repeat is null or repeat in ('week', '2weeks', '4weeks', 'month'));

-- 3. Savings interest rate (AER %), so daily interest follows the real balance
alter table public.accounts add column if not exists aer numeric(5, 2) check (aer is null or (aer >= 0 and aer < 30));

-- 4. An emoji for each task (picked automatically; you can change it)
alter table public.tasks add column if not exists icon text check (icon is null or length(icon) <= 16);
