-- Life Dashboard: update 11.
-- Moves your two Brain Planner outreach contacts into Job search > Outreach.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

insert into public.leads (user_id, domain_id, name, biz, channel, stage, follow_up)
select d.user_id, d.id, v.name, v.biz, v.channel, v.stage, v.follow_up::date
from (values
  ('Brighter Box founder', 'Marketing & Growth Executive role', 'LinkedIn', 'todo', null),
  ('Donna at Bulletproof', 'Project Manager role', 'Email', 'follow', '2026-11-05')
) as v(name, biz, channel, stage, follow_up)
join public.domains d on d.name = 'Job search'
where not exists (
  select 1 from public.leads l where l.user_id = d.user_id and l.domain_id = d.id and lower(l.name) = lower(v.name)
);
