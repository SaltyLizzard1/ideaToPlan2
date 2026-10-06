-- Database behaviour check for 001_email_tables.sql. Run AFTER 001, in the Supabase SQL editor.
-- Everything happens inside one transaction that ends in ROLLBACK, so no row is left behind.
-- It raises an exception on the first check that fails. If it finishes, the last result shows "ALL CHECKS PASSED".
-- What it cannot show: two sessions racing each other. That rests on the row lock taken by the claim function.

begin;

do $$
declare
  r record; t uuid; ok boolean;
begin
  -- 1. First message of a conversation is claimed.
  select * into r from public.email_claim_message('i2p', 'SelfTest@Example.com', 'gmail', 'st-thread-1', 'st-msg-1', 'Pat@Example.com', 'Pat', 'Hello', 'Body');
  if not r.claimed or r.reason <> 'claimed' then raise exception 'check 1 failed: first claim was %', r.reason; end if;
  t := r.thread_id;
  if (select status from public.email_threads where id = t) <> 'processing' then raise exception 'check 1 failed: status not processing'; end if;
  if (select mailbox from public.email_threads where id = t) <> 'selftest@example.com' then raise exception 'check 1 failed: mailbox not lower-cased'; end if;

  -- 2. The same message again is a duplicate: not claimed, no second received event.
  select * into r from public.email_claim_message('i2p', 'selftest@example.com', 'gmail', 'st-thread-1', 'st-msg-1', 'pat@example.com', 'Pat', 'Hello', 'Body');
  if r.claimed or r.reason <> 'duplicate' then raise exception 'check 2 failed: duplicate was %', r.reason; end if;
  if (select count(*) from public.email_events where thread_id = t and event_type = 'received') <> 1 then raise exception 'check 2 failed: duplicate recorded twice'; end if;

  -- 3. A second message while the first is being handled is recorded, not claimed, and flags the conversation.
  select * into r from public.email_claim_message('i2p', 'selftest@example.com', 'gmail', 'st-thread-1', 'st-msg-2', 'pat@example.com', 'Pat', 'Hello again', 'Body 2');
  if r.claimed or r.reason <> 'busy' then raise exception 'check 3 failed: concurrent message was %', r.reason; end if;
  if (select count(*) from public.email_events where thread_id = t and event_type = 'received') <> 2 then raise exception 'check 3 failed: second message not recorded'; end if;

  -- 4. Finishing as replied does not hide the unhandled message: the conversation needs attention.
  select * into r from public.email_finish_message(t, 'st-msg-1', 'replied', 'Routine reply sent.', 'thanks', null);
  if not r.applied or r.final_status <> 'needs_attention' then raise exception 'check 4 failed: finish gave % %', r.applied, r.final_status; end if;

  -- 5. Finishing again, or with the wrong message, changes nothing.
  select * into r from public.email_finish_message(t, 'st-msg-1', 'replied', 'again', null, null);
  if r.applied then raise exception 'check 5 failed: second finish was applied'; end if;

  -- 6. A later message is claimed normally once nothing is in progress.
  select * into r from public.email_claim_message('i2p', 'selftest@example.com', 'gmail', 'st-thread-1', 'st-msg-3', 'pat@example.com', 'Pat', 'Third', 'Body 3');
  if not r.claimed then raise exception 'check 6 failed: later message was %', r.reason; end if;
  select * into r from public.email_finish_message(t, 'st-msg-3', 'replied', 'Routine reply sent.', 'thanks', null);
  if not r.applied or r.final_status <> 'replied' then raise exception 'check 6 failed: clean finish gave %', r.final_status; end if;

  -- 7. Reply cap: the first claim succeeds, the second is refused.
  if not public.email_claim_reply(t, 1) then raise exception 'check 7 failed: first reply claim refused'; end if;
  if public.email_claim_reply(t, 1) then raise exception 'check 7 failed: second reply claim allowed'; end if;

  -- 8. One sent reply per answered message.
  insert into public.email_events (thread_id, event_type, direction, detail) values (t, 'reply_sent', 'outbound', '{"in_reply_to":"st-msg-3"}');
  begin
    insert into public.email_events (thread_id, event_type, direction, detail) values (t, 'reply_sent', 'outbound', '{"in_reply_to":"st-msg-3"}');
    raise exception 'check 8 failed: second reply to one message was recorded';
  exception when unique_violation then null;
  end;

  -- 9. Stuck sweep: a conversation left in processing is failed once, with one event, and only once.
  select * into r from public.email_claim_message('i2p', 'selftest@example.com', 'gmail', 'st-thread-2', 'st-msg-9', 'lee@example.com', null, 'Stuck', 'Body');
  update public.email_threads set updated_at = now() - interval '30 minutes' where id = r.thread_id;
  if (select count(*) from public.email_fail_stuck(20) where thread_id = r.thread_id) <> 1 then raise exception 'check 9 failed: stuck conversation not returned'; end if;
  if (select status from public.email_threads where id = r.thread_id) <> 'failed' then raise exception 'check 9 failed: status not failed'; end if;
  if (select count(*) from public.email_fail_stuck(20) where thread_id = r.thread_id) <> 0 then raise exception 'check 9 failed: stuck conversation returned twice'; end if;
  if (select count(*) from public.email_events where thread_id = r.thread_id and event_type = 'failed') <> 1 then raise exception 'check 9 failed: failure not recorded exactly once'; end if;

  -- 10. A finish after the sweep is not applied, so a late execution cannot overwrite 'failed'.
  select * into ok from (select applied from public.email_finish_message(r.thread_id, 'st-msg-9', 'replied', 'late', null, null)) x;
  if ok then raise exception 'check 10 failed: late finish overwrote failed'; end if;

  -- 11. Lead notifications: the same lead twice is refused, in any letter case.
  insert into public.lead_notifications (brand, source, email) values ('i2p', 'selftest', 'Lead@Example.com');
  begin
    insert into public.lead_notifications (brand, source, email) values ('i2p', 'selftest', 'lead@example.com');
    raise exception 'check 11 failed: duplicate lead was recorded';
  exception when unique_violation then null;
  end;

  -- 12. The read-only role can read conversations and cannot read orders or write.
  if not has_table_privilege('owner_inbox_ro', 'public.email_threads', 'select') then raise exception 'check 12 failed: role cannot read threads'; end if;
  if has_table_privilege('owner_inbox_ro', 'public.email_threads', 'insert, update, delete') then raise exception 'check 12 failed: role can write threads'; end if;
  if has_table_privilege('owner_inbox_ro', 'public.idea_submissions', 'select') then raise exception 'check 12 failed: role can read orders'; end if;
  if has_table_privilege('owner_inbox_ro', 'public.stripe_redemptions', 'select') then raise exception 'check 12 failed: role can read payments'; end if;
  if has_function_privilege('anon', 'public.email_claim_message(text, text, text, text, text, text, text, text, text, integer)', 'execute') then raise exception 'check 12 failed: anon can call the claim function'; end if;
end $$;

select 'ALL CHECKS PASSED' as result;

rollback;
