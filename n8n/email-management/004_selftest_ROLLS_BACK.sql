-- Self-test for 004_reply_send.sql. Run after it, as one script. Everything here is rolled back.
-- Expect the last line of output: NOTICE "ALL SEND CLAIM CHECKS PASSED". Any failure raises an exception.
begin;
do $$
declare
  c record;
  tid uuid;
begin
  select thread_id into tid from email_claim_message('i2p', 'selftest@example.test', 'gmail', 'st-thread-004', 'st-msg-1',
                                                     'customer@example.test', 'Self Test', 'subject', 'body');

  select * into c from email_claim_send(tid, 'st-msg-other', 1);
  assert c.claimed = false and c.reason like '%no longer held%', 'a claim for a message this run does not hold is refused';

  select * into c from email_claim_send(tid, 'st-msg-1', 1);
  assert c.claimed = true, 'the first claim is granted';
  assert (select auto_reply_count from email_threads where id = tid) = 1, 'the reply count is 1';

  select * into c from email_claim_send(tid, 'st-msg-1', 5);
  assert c.claimed = false and c.reason like '%already claimed%', 'a second claim for the same message is refused, whatever the cap';
  assert (select auto_reply_count from email_threads where id = tid) = 1, 'the refused claim did not count';
  assert (select count(*) from email_events where thread_id = tid and event_type = 'send_claimed') = 1, 'exactly one claim is on record';

  perform email_finish_message(tid, 'st-msg-1', 'replied', 'test');
  select * into c from email_claim_send(tid, 'st-msg-1', 5);
  assert c.claimed = false and c.reason like '%no longer held%', 'a finished conversation cannot be claimed';

  perform email_claim_message('i2p', 'selftest@example.test', 'gmail', 'st-thread-004', 'st-msg-2', 'customer@example.test', 'Self Test', 'subject', 'body');
  select * into c from email_claim_send(tid, 'st-msg-2', 1);
  assert c.claimed = false and c.reason like '%limit%', 'the per-conversation reply limit holds for a later message';

  insert into email_events (thread_id, event_type, direction, detail) values (tid, 'send_unknown', 'internal', '{}'::jsonb);
  insert into email_events (thread_id, event_type, direction, detail) values (tid, 'send_failed', 'internal', '{}'::jsonb);
  raise notice 'ALL SEND CLAIM CHECKS PASSED';
end $$;
rollback;
