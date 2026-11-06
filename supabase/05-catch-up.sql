-- Life Dashboard: catch-up update (runs update 3, then update 4 again).
-- Your database is missing update 3. This adds it and files the copied items into sub-categories.
-- Paste into Supabase > SQL Editor > New query, then press Run. If a warning appears, choose 'Run this query'.


alter table public.tasks add column if not exists minutes int check (minutes is null or minutes between 1 and 1440);
alter table public.tasks add column if not exists energy text check (energy is null or energy in ('low', 'mid', 'high'));
alter table public.tasks add column if not exists step text;
alter table public.tasks add column if not exists starred boolean not null default false;
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('task', 'project', 'idea', 'note', 'goal'));

do $$
declare
  uid uuid;
  n int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise exception 'Expected exactly one account, found %. Nothing was copied.', n;
  end if;
  select id into uid from auth.users limit 1;
  if not exists (select 1 from public.domains where user_id = uid) then
    raise exception 'Open the app once first so your areas are created, then run this again.';
  end if;

  -- Tasks, goals and ideas
  insert into public.tasks (user_id, title, domain_id, kind, minutes, energy, step, notes, starred, due)
  select uid, v.title, d.id, v.kind, v.minutes, v.energy, v.step, coalesce(v.notes, ''), v.starred, v.due::date
  from (values
    ('Return ice tray (£19.99)', 'Personal & home', 'task', 10, 'low', 'Find the box and print the label.', 'Return window: check the order email for the last day.', false, null),
    ('Return glasses (£12.99)', 'Personal & home', 'task', 10, 'low', 'Find the order email and start the return.', 'Return window: check the order email for the last day.', false, null),
    ('Return headphones (£22)', 'Personal & home', 'task', 10, 'low', 'Start the return online and print the label.', 'Return window: check the order email for the last day.', false, null),
    ('Return eBay headphones', 'Personal & home', 'task', 10, 'low', 'Open eBay, go to Purchases, tap Return.', 'Return window: check the order email for the last day.', false, null),
    ('Return On Running trainers', 'Personal & home', 'task', 10, 'low', 'Check the return window in your order email.', 'Return window: check the order email for the last day.', false, null),
    ('Return cracked iPad mini', 'Personal & home', 'task', 20, 'mid', 'Take photos of the crack first, then start the return.', 'Return window: check the order email for the last day.', false, null),
    ('Tights (£19.99)', 'Personal & home', 'task', 10, 'low', 'Decide: keep or return?', 'Return window: check the order email for the last day.', false, null),
    ('TK Maxx (£27)', 'Personal & home', 'task', 10, 'low', 'Find the receipt. TK Maxx returns go back in store.', 'Return window: check the order email for the last day.', false, null),
    ('Book laser appointment', 'Personal & home', 'task', 5, 'low', 'Open the booking page and pick the first slot that works.', null, false, null),
    ('Sort Oyster connector', 'Personal & home', 'task', 10, 'low', 'Find what you need and do just the first step.', null, false, null),
    ('Set up ADHD planner', 'Personal & home', 'task', 5, 'low', 'You''re on it right now. Tick me!', null, false, null),
    ('Edit Tisha''s wedding photos', 'Made in Heaven Visuals', 'task', 90, 'high', 'Open the folder and cull the first 50 photos. That''s it.', null, false, null),
    ('Interview practice', 'Job search', 'task', 30, 'mid', 'Answer one question out loud: ''Tell me about yourself.''', null, false, null),
    ('Photoshoot', 'Made in Heaven Visuals', 'task', 60, 'high', 'Write down the date, place and 3 shot ideas.', null, false, null),
    ('Watch vs Apple Watch vs Sekonda', 'Personal & home', 'task', 15, 'low', 'Write what you actually want it to do.', null, false, null),
    ('Vibration plate', 'Personal & home', 'task', 15, 'low', 'Save two options and compare price.', null, false, null),
    ('Water flosser', 'Personal & home', 'task', 10, 'low', 'Pick one with good reviews and add to basket.', null, false, null),
    ('Large hoops', 'Personal & home', 'task', 10, 'low', 'Browse for 10 minutes, then stop.', null, false, null),
    ('120lb', 'Personal & home', 'goal', null, null, null, null, false, null),
    ('Pure Barre', 'Personal & home', 'goal', null, null, null, null, false, null),
    ('Kiss someone 😘', 'Personal & home', 'goal', null, null, null, null, false, null),
    ('Civil Service Fast Stream: Work Based Scenarios test', 'Job search', 'task', null, null, null, '', false, null),
    ('HMICFRS Social Media Manager application', 'Job search', 'task', null, null, null, '', false, null),
    ('Bulletproof Project Manager: follow up with Donna', 'Job search', 'task', null, null, null, '', false, '2026-11-05'),
    ('Brighter Box: message the founder', 'Job search', 'task', null, null, null, '', false, null),
    ('Trifid Media: send cover letter', 'Job search', 'task', null, null, null, '', false, null),
    ('Events and photo booth hire', 'Side ideas', 'idea', null, null, null, 'Idea for later: candy stand, welded bracelets, popcorn, mocktails, photo booth.', false, null)
  ) as v(title, area, kind, minutes, energy, step, notes, starred, due)
  join public.domains d on d.user_id = uid and d.name = case when exists (select 1 from public.domains x where x.user_id = uid and x.name = v.area) then v.area else 'Inbox' end
  where not exists (select 1 from public.tasks t where t.user_id = uid and lower(t.title) = lower(v.title));

  -- Projects
  insert into public.tasks (user_id, title, domain_id, kind, notes)
  select uid, v.title, d.id, 'project', coalesce(v.notes, '')
  from (values
    ('Made in Heaven Visuals website', 'Made in Heaven Visuals', null),
    ('Access to Work application', 'Personal & home', null)
  ) as v(title, area, notes)
  join public.domains d on d.user_id = uid and d.name = v.area
  where not exists (select 1 from public.tasks t where t.user_id = uid and lower(t.title) = lower(v.title));

  -- Steps inside those projects
  insert into public.tasks (user_id, title, domain_id, kind, project_id)
  select uid, v.title, p.domain_id, 'task', p.id
  from (values
    ('Turn the Canva portfolio into the website', 'Made in Heaven Visuals website'),
    ('Finish the client services pack (social media vs photography)', 'Made in Heaven Visuals website'),
    ('Finish the online form', 'Access to Work application')
  ) as v(title, project)
  join public.tasks p on p.user_id = uid and p.kind = 'project' and p.title = v.project
  where not exists (select 1 from public.tasks t where t.user_id = uid and lower(t.title) = lower(v.title));

  -- Routines (Gym 6-7:30am Mon/Wed/Fri, mirror work weekdays, fun night Friday, daily habits)
  insert into public.routines (user_id, title, domain_id, days, time_of_day)
  select uid, v.title, d.id, v.days::smallint[], v.tod
  from (values
    ('Gym (6:00–7:30am)', '{0,2,4}', 'commute'),
    ('Mirror work (2 min)', '{0,1,2,3,4}', 'day'),
    ('Fun night', '{4}', 'evening'),
    ('Hit 20k steps (walking pad counts)', '{0,1,2,3,4,5,6}', 'day'),
    ('Drink 2 litres of water', '{0,1,2,3,4,5,6}', 'day'),
    ('Phone away by 21:00', '{0,1,2,3,4,5,6}', 'evening')
  ) as v(title, days, tod)
  join public.domains d on d.user_id = uid and d.name = 'Personal & home'
  where not exists (
    select 1 from public.routines r
    where r.user_id = uid and r.active
      and (lower(r.title) = lower(v.title) or lower(split_part(v.title, ' (', 1)) = lower(r.title)
           or (v.title like 'Hit 20k%' and lower(r.title) like '%20k%'))
  );
end $$;


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
