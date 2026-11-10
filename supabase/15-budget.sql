-- Life Dashboard: update 15.
-- Budgets and everyday spending (Groceries, Eating out, Transport). Spends come from what you log
-- and from statements you upload. Paste into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once.

create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_-]{1,30}$'),
  name        text not null check (length(btrim(name)) between 1 and 40),
  emoji       text not null default '💷',
  amount      numeric(10, 2) not null default 0 check (amount >= 0),   -- per pay month
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);

create table if not exists public.spends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  amount      numeric(10, 2) not null check (amount > 0 and amount < 100000),
  category    text not null default 'other',
  note        text not null default '' check (length(note) <= 120),
  source      text not null default 'manual' check (source in ('manual', 'quick', 'statement')),
  import_key  text,                                   -- statement lines, so the same one isn't added twice
  created_at  timestamptz not null default now()
);
create index if not exists spends_user_day_idx on public.spends (user_id, day);
create unique index if not exists spends_import_key_idx on public.spends (user_id, import_key) where import_key is not null;

alter table public.budgets enable row level security;
alter table public.spends  enable row level security;
drop policy if exists "own rows" on public.budgets;
drop policy if exists "own rows" on public.spends;
create policy "own rows" on public.budgets
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.spends
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Starting budgets (change the amounts in the app). Transport starts at your travel per month.
insert into public.budgets (user_id, key, name, emoji, amount, sort)
select u.id, v.key, v.name, v.emoji,
       case when v.key = 'transport'
            then coalesce((select round(i.daily_travel * coalesce(array_length(i.work_days, 1), 5) * 52 / 12) from public.income_settings i where i.user_id = u.id), v.amount)
            else v.amount end,
       v.sort
from auth.users u
cross join (values ('groceries', 'Groceries', '🛒', 200, 1), ('eating_out', 'Eating out', '🍔', 100, 2), ('transport', 'Transport', '🚆', 210, 3)) as v(key, name, emoji, amount, sort)
on conflict (user_id, key) do nothing;
