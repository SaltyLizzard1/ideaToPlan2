-- Email management: conversations, action history, lead notifications, and a read-only role for the owner view.
-- PREPARED, NOT RUN. Run by Liz in the Supabase SQL editor, as one script.
--
-- Reviewed against the existing schema on 2026-10-06 (read through the API):
--   existing tables: idea_submissions, leap_test_results, plan_versions, quiz_results, quiz_submissions,
--                    rate_limits, stripe_redemptions, trend_cache
--   existing functions: check_rate_limit, rls_auto_enable, set_quiz_detail
--   No name below collides with any of them. idea_submissions.id is a uuid primary key, so the foreign key is valid.
--   This script adds objects only. It alters and drops nothing that exists.
--
-- Notes for this project:
--   * The ensure_rls event trigger turns RLS on for new public tables. RLS is also enabled explicitly here.
--   * New tables do not get DML grants for service_role by default, so they are granted below.
--   * No DELETE is granted anywhere: history is append-only.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- 1. Conversations and their history
-- ---------------------------------------------------------------------------------------------------------
create table public.email_threads (
  id                     uuid primary key default gen_random_uuid(),
  brand                  text not null check (brand in ('i2p', 'qylat')),
  mailbox                text not null,
  provider               text not null default 'gmail',
  provider_thread_id     text not null,
  customer_email         text not null,
  customer_name          text,
  subject                text,
  status                 text not null default 'received'
                         check (status in ('received', 'processing', 'replied', 'needs_attention', 'failed')),
  status_reason          text,
  category               text,
  submission_id          uuid references public.idea_submissions (id) on delete set null,
  auto_reply_count       integer not null default 0 check (auto_reply_count >= 0),
  processing_started_at  timestamptz,
  processing_message_id  text,
  has_unhandled_message  boolean not null default false,
  last_message_at        timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint email_threads_one_per_provider_thread unique (mailbox, provider_thread_id)
);

create table public.email_events (
  id                   uuid primary key default gen_random_uuid(),
  thread_id            uuid not null references public.email_threads (id) on delete restrict,
  event_type           text not null
                       check (event_type in ('received', 'classified', 'draft', 'reply_sent', 'escalated',
                                             'owner_alert', 'alert_failed', 'failed', 'owner_action')),
  direction            text not null check (direction in ('inbound', 'outbound', 'internal')),
  provider_message_id  text,
  actor                text not null default 'system',
  summary              text,
  body                 text,
  detail               jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

-- One received event per provider message, and one sent reply per message answered.
create unique index email_events_one_received_per_message
  on public.email_events (provider_message_id) where event_type = 'received';
create unique index email_events_one_reply_per_message
  on public.email_events ((detail ->> 'in_reply_to')) where event_type = 'reply_sent';
create index email_events_thread_time on public.email_events (thread_id, created_at);
create index email_threads_status_time on public.email_threads (status, last_message_at desc);
create index email_threads_customer on public.email_threads (lower(customer_email));

-- ---------------------------------------------------------------------------------------------------------
-- 2. Atomic claim, finish, reply claim and stuck sweep
--    Each function is one transaction. The thread row is locked by the upsert or update, so two executions
--    working on the same conversation run one after the other, never at the same time.
-- ---------------------------------------------------------------------------------------------------------

-- Records an inbound message and claims the conversation for processing, or says why not.
--   claimed = true            this execution, and only this one, may handle the message
--   reason  = 'duplicate'     the message was recorded before: stop, do nothing, alert nobody
--   reason  = 'busy'          another message of this conversation is being handled right now: the message is
--                             recorded, the conversation is flagged, and it will end as needs_attention
create function public.email_claim_message(
  p_brand text, p_mailbox text, p_provider text, p_provider_thread_id text, p_provider_message_id text,
  p_customer_email text, p_customer_name text, p_subject text, p_body text, p_lease_minutes integer default 10
) returns table (thread_id uuid, claimed boolean, reason text, auto_reply_count integer, prior_status text)
language plpgsql security invoker set search_path = public as $$
declare
  t public.email_threads%rowtype;
  n integer;
begin
  if coalesce(p_provider_message_id, '') = '' or coalesce(p_provider_thread_id, '') = '' then
    raise exception 'email_claim_message needs a message id and a thread id';
  end if;

  insert into email_threads (brand, mailbox, provider, provider_thread_id, customer_email, customer_name, subject)
  values (p_brand, lower(p_mailbox), p_provider, p_provider_thread_id, lower(p_customer_email), p_customer_name, p_subject)
  on conflict (mailbox, provider_thread_id) do update set last_message_at = now()
  returning * into t;                                   -- the row is locked until this function returns

  insert into email_events (thread_id, event_type, direction, provider_message_id, actor, summary, body)
  values (t.id, 'received', 'inbound', p_provider_message_id, lower(p_customer_email), p_subject, p_body)
  on conflict (provider_message_id) where event_type = 'received' do nothing;
  get diagnostics n = row_count;

  if n = 0 then
    return query select t.id, false, 'duplicate'::text, t.auto_reply_count, t.status;
    return;
  end if;

  if t.status = 'processing' and t.processing_started_at > now() - make_interval(mins => p_lease_minutes) then
    update email_threads set has_unhandled_message = true, updated_at = now() where id = t.id;
    return query select t.id, false, 'busy'::text, t.auto_reply_count, t.status;
    return;
  end if;

  update email_threads
     set status = 'processing', status_reason = null, processing_started_at = now(),
         processing_message_id = p_provider_message_id, has_unhandled_message = false, updated_at = now()
   where id = t.id;
  return query select t.id, true, 'claimed'::text, t.auto_reply_count, t.status;
end $$;

-- Ends processing. Applies only if this execution still holds the claim. If another message arrived meanwhile,
-- the conversation ends as needs_attention whatever status was asked for, so nothing is hidden behind 'replied'.
create function public.email_finish_message(
  p_thread_id uuid, p_provider_message_id text, p_status text, p_reason text,
  p_category text default null, p_submission_id uuid default null
) returns table (applied boolean, final_status text)
language plpgsql security invoker set search_path = public as $$
declare
  s text;
begin
  if p_status not in ('replied', 'needs_attention', 'failed') then
    raise exception 'email_finish_message: status % is not a final status', p_status;
  end if;
  update email_threads
     set status = case when has_unhandled_message then 'needs_attention' else p_status end,
         status_reason = case when has_unhandled_message
                              then 'Another email arrived while this one was being handled. Read the whole conversation. ' || coalesce(p_reason, '')
                              else p_reason end,
         category = coalesce(p_category, category),
         submission_id = coalesce(p_submission_id, submission_id),
         processing_started_at = null, processing_message_id = null, updated_at = now()
   where id = p_thread_id and status = 'processing' and processing_message_id = p_provider_message_id
  returning status into s;
  if s is null then
    return query select false, (select status from email_threads where id = p_thread_id);
  else
    return query select true, s;
  end if;
end $$;

-- Reserves the right to send one automated reply. False means the cap is reached: do not send.
create function public.email_claim_reply(p_thread_id uuid, p_max integer default 1)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  n integer;
begin
  update email_threads set auto_reply_count = auto_reply_count + 1, updated_at = now()
   where id = p_thread_id and auto_reply_count < p_max;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Marks every conversation stuck in received or processing as failed, records it, and returns the rows.
-- One statement, so two sweeps running together cannot both return the same conversation.
create function public.email_fail_stuck(p_minutes integer default 20)
returns table (thread_id uuid, brand text, customer_email text, subject text, was_status text)
language plpgsql security invoker set search_path = public as $$
begin
  return query
  with stuck as (
    select id, status as was from email_threads
     where status in ('received', 'processing') and updated_at < now() - make_interval(mins => p_minutes)
     for update skip locked
  ), marked as (
    update email_threads e
       set status = 'failed',
           status_reason = 'Stuck in ' || stuck.was || ' for more than ' || p_minutes || ' minutes. Nothing was sent.',
           processing_started_at = null, processing_message_id = null, updated_at = now()
      from stuck where e.id = stuck.id
    returning e.id, e.brand, e.customer_email, e.subject, stuck.was
  ), logged as (
    insert into email_events (thread_id, event_type, direction, actor, summary)
    select m.id, 'failed', 'internal', 'watchdog', 'Stuck in ' || m.was || ' for more than ' || p_minutes || ' minutes. Nothing was sent.'
      from marked m
    returning 1
  )
  select m.id, m.brand, m.customer_email, m.subject, m.was from marked m, (select count(*) from logged) l;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Lead notifications (Skills Matcher). One row per lead; the unique index makes retries harmless.
-- ---------------------------------------------------------------------------------------------------------
create table public.lead_notifications (
  id             uuid primary key default gen_random_uuid(),
  brand          text not null check (brand in ('i2p', 'qylat')),
  source         text not null,
  email          text not null,
  notify_status  text not null default 'pending' check (notify_status in ('pending', 'sent', 'failed')),
  notify_error   text,
  created_at     timestamptz not null default now(),
  notified_at    timestamptz
);
create unique index lead_notifications_one_per_lead on public.lead_notifications (brand, source, lower(email));

-- ---------------------------------------------------------------------------------------------------------
-- 4. Access
-- ---------------------------------------------------------------------------------------------------------
alter table public.email_threads enable row level security;
alter table public.email_events enable row level security;
alter table public.lead_notifications enable row level security;

revoke all on public.email_threads, public.email_events, public.lead_notifications from anon, authenticated;
grant select, insert, update on public.email_threads to service_role;
grant select, insert on public.email_events to service_role;
grant select, insert, update on public.lead_notifications to service_role;

revoke all on function public.email_claim_message(text, text, text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.email_finish_message(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.email_claim_reply(uuid, integer) from public, anon, authenticated;
revoke all on function public.email_fail_stuck(integer) from public, anon, authenticated;
grant execute on function public.email_claim_message(text, text, text, text, text, text, text, text, text, integer) to service_role;
grant execute on function public.email_finish_message(uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.email_claim_reply(uuid, integer) to service_role;
grant execute on function public.email_fail_stuck(integer) to service_role;

-- Read-only role for the owner view. It can read the two conversation tables and nothing else:
-- no orders, no payments, no quiz data, no writes. The owner view signs in as this role with its own token.
create role owner_inbox_ro nologin;
grant usage on schema public to owner_inbox_ro;
grant select on public.email_threads, public.email_events to owner_inbox_ro;
create policy owner_inbox_read_threads on public.email_threads for select to owner_inbox_ro using (true);
create policy owner_inbox_read_events on public.email_events for select to owner_inbox_ro using (true);
grant owner_inbox_ro to authenticator;

commit;

-- Check after running (read-only):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('email_threads', 'email_events', 'lead_notifications');
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'email_%';
--   select grantee, privilege_type, table_name from information_schema.role_table_grants where grantee = 'owner_inbox_ro';
