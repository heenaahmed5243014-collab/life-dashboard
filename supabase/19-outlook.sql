-- Life Dashboard: update 19.
-- Connect your Outlook mailbox to the Email card. The app keeps a locked (encrypted) Microsoft sign-in
-- so it can check new mail when you open it; it never stores your password or your emails' full text.
-- Paste into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create table if not exists public.mail_connections (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  provider    text not null default 'outlook' check (provider in ('outlook')),
  email       text not null default '',
  token_enc   text not null,
  last_sync   timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.mail_connections enable row level security;
drop policy if exists "own rows" on public.mail_connections;
create policy "own rows" on public.mail_connections
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Emails that came in from Outlook remember which message and conversation they belong to,
-- so the same email is never added twice and a reply in the thread can update it.
alter table public.email_items add column if not exists source_id text;
alter table public.email_items add column if not exists conversation_id text;
create unique index if not exists email_items_source on public.email_items (user_id, source_id) where source_id is not null;
create index if not exists email_items_conversation on public.email_items (user_id, conversation_id) where conversation_id is not null;
