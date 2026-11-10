-- Life Dashboard: update 14.
-- Morning debrief notifications. Your phone's notification details are stored here, and every
-- 15 minutes the database checks whether it's time for your debrief and asks the app's server to send it.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Private settings only the database itself can read (never reachable from the app or the internet)
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (key, value)
values ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- 2. Devices that get the debrief, and when
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint      text not null unique check (endpoint ~ '^https://'),
  p256dh        text not null,
  auth          text not null,
  debrief_time  time not null default '07:30',
  tz            text not null default 'Europe/London',
  debrief_on    boolean not null default true,
  last_sent     date,
  created_at    timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own rows" on public.push_subscriptions;
create policy "own rows" on public.push_subscriptions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3. The notification "keys" (made on your phone the first time you switch notifications on)
create or replace function public.vapid_public_key() returns text
language sql security definer set search_path = public stable as $$
  select value from public.app_secrets where key = 'vapid_public'
$$;
revoke all on function public.vapid_public_key() from public, anon;
grant execute on function public.vapid_public_key() to authenticated;

create or replace function public.set_vapid_keys(p_public text, p_private text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_public !~ '^[A-Za-z0-9_-]{80,100}$' or p_private !~ '^[A-Za-z0-9_-]{40,50}$' then raise exception 'Bad keys'; end if;
  insert into public.app_secrets (key, value) values ('vapid_public', p_public) on conflict (key) do nothing;
  insert into public.app_secrets (key, value) values ('vapid_private', p_private) on conflict (key) do nothing;
  return (select value from public.app_secrets where key = 'vapid_public');
end $$;
revoke all on function public.set_vapid_keys(text, text) from public, anon;
grant execute on function public.set_vapid_keys(text, text) to authenticated;

-- 4. The debrief text for one person on one day
create or replace function public.debrief_text(p_user uuid, p_day date) returns text
language plpgsql security definer set search_path = public stable as $$
declare
  n_timed int; first_title text; first_time text; tops text; n_follow int := 0; n_returns int; n_today int;
begin
  select count(*) into n_timed from tasks where user_id = p_user and status = 'open' and due = p_day and due_time is not null;
  select title, to_char(due_time, 'HH24:MI') into first_title, first_time from tasks
    where user_id = p_user and status = 'open' and due = p_day and due_time is not null order by due_time limit 1;
  select count(*) into n_today from tasks where user_id = p_user and status = 'open' and kind = 'task' and due <= p_day;
  select string_agg(title, ', ') into tops from (select title from tasks where user_id = p_user and status = 'open' and starred order by created_at limit 3) t;
  begin
    select count(*) into n_follow from leads where user_id = p_user and follow_up <= p_day and stage not in ('won', 'no', 'todo');
  exception when undefined_table then n_follow := 0; end;
  select count(*) into n_returns from tasks t join subcategories s on s.id = t.subcategory_id
    where t.user_id = p_user and t.status = 'open' and lower(btrim(s.name)) = 'returns' and t.due between p_day and p_day + 2;
  if n_today = 0 and tops is null then
    return 'A clear day. Open your debrief and pick one thing that would feel good.';
  end if;
  return concat_ws(' · ',
    case when n_timed > 0 then n_timed || ' planned, first: ' || first_title || ' at ' || first_time end,
    case when tops is not null then 'Top 3: ' || tops end,
    case when n_follow > 0 then n_follow || ' follow-up' || case when n_follow = 1 then '' else 's' end || ' due' end,
    case when n_returns > 0 then n_returns || ' return' || case when n_returns = 1 then '' else 's' end || ' due soon' end,
    case when n_timed = 0 and tops is null then n_today || ' thing' || case when n_today = 1 then '' else 's' end || ' on today' end);
end $$;
revoke all on function public.debrief_text(uuid, date) from public, anon, authenticated;

-- 5. What the server asks for every 15 minutes (only works with the private timer password)
create or replace function public.debrief_due(p_secret text)
returns table (endpoint text, p256dh text, auth text, title text, body text, vapid_public text, vapid_private text)
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret is distinct from (select value from public.app_secrets where key = 'cron') then
    raise exception 'Not allowed';
  end if;
  return query
  with due as (
    update public.push_subscriptions s set last_sent = (now() at time zone s.tz)::date
    where s.debrief_on
      and (s.last_sent is null or s.last_sent < (now() at time zone s.tz)::date)
      and (now() at time zone s.tz)::time >= s.debrief_time
      and (now() at time zone s.tz)::time < s.debrief_time + interval '3 hours'
    returning s.*
  )
  select d.endpoint, d.p256dh, d.auth, '☀️ Morning debrief'::text,
         public.debrief_text(d.user_id, (now() at time zone d.tz)::date),
         (select value from public.app_secrets where key = 'vapid_public'),
         (select value from public.app_secrets where key = 'vapid_private')
  from due d;
end $$;
revoke all on function public.debrief_due(text) from public;
grant execute on function public.debrief_due(text) to anon, authenticated;

-- 6. "Send a test" from the app: your own devices only
create or replace function public.debrief_test()
returns table (endpoint text, p256dh text, auth text, title text, body text, vapid_public text, vapid_private text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return query
  select s.endpoint, s.p256dh, s.auth, '☀️ Morning debrief (test)'::text,
         public.debrief_text(s.user_id, (now() at time zone s.tz)::date),
         (select value from public.app_secrets where key = 'vapid_public'),
         (select value from public.app_secrets where key = 'vapid_private')
  from public.push_subscriptions s where s.user_id = auth.uid();
end $$;
revoke all on function public.debrief_test() from public, anon;
grant execute on function public.debrief_test() to authenticated;

-- 7. Forget a device whose notifications have expired
create or replace function public.drop_push_endpoint(p_secret text, p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is distinct from (select value from public.app_secrets where key = 'cron') then raise exception 'Not allowed'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end $$;
revoke all on function public.drop_push_endpoint(text, text) from public;
grant execute on function public.drop_push_endpoint(text, text) to anon, authenticated;

-- 8. The 15-minute timer: asks the app's server to send any debriefs that are due
select cron.schedule(
  'ld-morning-debrief',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://life-dashboard-two-opal.vercel.app/api/push-debrief',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select value from public.app_secrets where key = 'cron')),
    body := '{}'::jsonb
  );
  $job$
);
