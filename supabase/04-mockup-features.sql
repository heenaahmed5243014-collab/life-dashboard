-- Life Dashboard: update 4.
-- Routine chunks (10k steps), Returns QR codes, sub-categories, a Work area,
-- net worth balances and weight.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

-- 1. Routines that come in chunks (e.g. steps: 2 x 10k)
alter table public.routines add column if not exists chunks smallint not null default 1 check (chunks between 1 and 10);
alter table public.routines add column if not exists chunk_label text;
alter table public.routine_ticks add column if not exists count smallint not null default 1 check (count between 1 and 10);

-- 2. Returns: where it goes back, and a private QR code screenshot
alter table public.tasks add column if not exists drop_off text;
alter table public.tasks add column if not exists qr_path text;

-- 3. Sub-categories inside each area
create table if not exists public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain_id   uuid not null references public.domains (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  note        text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (domain_id, name)
);
alter table public.tasks add column if not exists subcategory_id uuid references public.subcategories (id) on delete set null;
create index if not exists tasks_subcategory_idx on public.tasks (subcategory_id);

-- 4. Net worth: your accounts, and one balance per account per month
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  is_debt     boolean not null default false,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists public.balances (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  amount      numeric(12, 2) not null check (amount >= 0),
  primary key (account_id, month)
);

-- 5. Weight: one entry per day, in pounds
create table if not exists public.weights (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  lb          numeric(5, 1) not null check (lb between 50 and 600),
  primary key (user_id, day)
);

-- 6. Privacy: each person only sees and changes their own rows
alter table public.subcategories enable row level security;
alter table public.accounts      enable row level security;
alter table public.balances      enable row level security;
alter table public.weights       enable row level security;
drop policy if exists "own rows" on public.subcategories;
drop policy if exists "own rows" on public.accounts;
drop policy if exists "own rows" on public.balances;
drop policy if exists "own rows" on public.weights;
create policy "own rows" on public.subcategories
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.accounts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.balances
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.weights
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 7. A private storage folder for QR screenshots (each person can only reach their own files)
insert into storage.buckets (id, name, public) values ('qr', 'qr', false) on conflict (id) do nothing;
drop policy if exists "qr: own files read" on storage.objects;
drop policy if exists "qr: own files add" on storage.objects;
drop policy if exists "qr: own files delete" on storage.objects;
create policy "qr: own files read" on storage.objects for select to authenticated
  using (bucket_id = 'qr' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "qr: own files add" on storage.objects for insert to authenticated
  with check (bucket_id = 'qr' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "qr: own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'qr' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 8. Your data: Work area, starting sub-categories, filing what's already there,
--    steps split into 2 x 10k.
do $$
declare
  uid uuid;
  n int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise exception 'Expected exactly one account, found %. Nothing was changed.', n;
  end if;
  select id into uid from auth.users limit 1;

  insert into public.domains (user_id, name, short_name, color, is_inbox, sort)
  values (uid, 'Work', 'Work', '#3F6FB5', false, 1)
  on conflict (user_id, name) do nothing;

  insert into public.subcategories (user_id, domain_id, name, note, sort)
  select uid, d.id, v.name, v.note, v.sort
  from (values
    ('Personal & home', 'Returns', 'Do first. Screenshot every QR code, then one post office trip.', 1),
    ('Personal & home', 'Quick admin', 'Lunch-break jobs.', 2),
    ('Personal & home', 'Decide or buy', 'No rush.', 3),
    ('Work', 'Day job', '', 1),
    ('Work', 'Admin & HR', '', 2),
    ('Made in Heaven Visuals', 'Client work', 'Edits and shoots. Give each one its own time slot.', 1),
    ('Made in Heaven Visuals', 'Website & portfolio', '', 2),
    ('Job search', 'Applications', '', 1),
    ('Job search', 'Interview prep', '', 2),
    ('Side ideas', 'Ideas', 'Parked until you pick one.', 1)
  ) as v(area, name, note, sort)
  join public.domains d on d.user_id = uid and d.name = v.area
  on conflict (domain_id, name) do nothing;

  -- File existing items into their sub-category (only items not already filed)
  update public.tasks t set subcategory_id = s.id
  from public.subcategories s join public.domains d on d.id = s.domain_id
  where t.user_id = uid and t.subcategory_id is null and t.domain_id = d.id and t.status = 'open'
    and (
      (s.name = 'Returns' and t.kind = 'task' and (t.title ~* '\m(return|returns|refund|exchange)\M' or t.notes ilike '%return window%'))
      or (s.name = 'Quick admin' and t.title in ('Book laser appointment', 'Sort Oyster connector', 'Set up ADHD planner'))
      or (s.name = 'Decide or buy' and t.title in ('Watch vs Apple Watch vs Sekonda', 'Vibration plate', 'Water flosser', 'Large hoops'))
      or (s.name = 'Client work' and t.title in ('Edit Tisha''s wedding photos', 'Photoshoot'))
      or (s.name = 'Website & portfolio' and t.title = 'Made in Heaven Visuals website')
      or (s.name = 'Interview prep' and (t.title = 'Interview practice' or t.title ilike 'Civil Service Fast Stream%'))
      or (s.name = 'Applications' and t.kind = 'task' and t.title ~* '(application|cover letter|follow up with|message the founder)')
      or (s.name = 'Ideas' and t.kind = 'idea')
    );

  -- Steps: two 10k chunks
  update public.routines set chunks = 2, chunk_label = '10k'
  where user_id = uid and chunks = 1 and title ~* '20k steps';
end $$;
