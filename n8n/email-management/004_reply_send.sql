-- Email management: the atomic claim that must be won before a reply is sent to a customer.
-- PREPARED, NOT RUN. Nothing sends until this exists AND shadow is off AND sending_enabled is true.
--
-- This script changes one existing object: the list of allowed event types on email_events gains three
-- values. Existing rows are unaffected. It adds one index and one function.

begin;

alter table public.email_events drop constraint email_events_event_type_check;
alter table public.email_events add constraint email_events_event_type_check
  check (event_type in ('received', 'classified', 'draft', 'reply_sent', 'escalated', 'owner_alert', 'alert_failed',
                        'failed', 'owner_action', 'send_claimed', 'send_failed', 'send_unknown'));

-- One send claim per customer message, for ever. A rerun, a retry or a second execution cannot claim again,
-- so a message that may already have been answered is never answered twice.
create unique index email_events_one_send_claim_per_message
  on public.email_events ((detail ->> 'in_reply_to')) where event_type = 'send_claimed';

-- Claims the right to send one reply to one customer message.
--   claimed = true   this execution, and only this one, may send
--   claimed = false  reason says why: the conversation is no longer held by this execution, the reply cap is
--                    reached, or this message was claimed before
-- The conversation row is locked first, so two claims for the same conversation run one after the other.
create function public.email_claim_send(p_thread_id uuid, p_in_reply_to text, p_max integer default 1)
returns table (claimed boolean, reason text)
language plpgsql security invoker set search_path = public as $$
declare
  t public.email_threads%rowtype;
  n integer;
begin
  select * into t from email_threads where id = p_thread_id for update;
  if not found then
    return query select false, 'the conversation does not exist'::text; return;
  end if;
  if t.status <> 'processing' or t.processing_message_id is distinct from p_in_reply_to then
    return query select false, 'the conversation is no longer held by this run'::text; return;
  end if;
  if t.has_unhandled_message then
    return query select false, 'another email arrived in this conversation'::text; return;
  end if;
  if t.auto_reply_count >= p_max then
    return query select false, 'the automated reply limit for this conversation is reached'::text; return;
  end if;

  insert into email_events (thread_id, event_type, direction, actor, summary, detail)
  values (t.id, 'send_claimed', 'internal', 'system', 'A reply send was claimed for this message.',
          jsonb_build_object('in_reply_to', p_in_reply_to))
  on conflict ((detail ->> 'in_reply_to')) where event_type = 'send_claimed' do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    return query select false, 'a send was already claimed for this message'::text; return;
  end if;

  update email_threads set auto_reply_count = auto_reply_count + 1, updated_at = now() where id = t.id;
  return query select true, 'claimed'::text;
end $$;

revoke all on function public.email_claim_send(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.email_claim_send(uuid, text, integer) to service_role;

commit;
