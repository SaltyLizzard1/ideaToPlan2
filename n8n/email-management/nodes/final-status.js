// Final Status (n8n Code node, run once for all items). PREPARED, not in the published handler.
// Every path ends here: no send wanted, send held, send claim refused, sent, not sent, unknown, and the case
// where the reply went out but writing that down failed. It gives Finish one status and one reason.
const gate = $('Decision Gate').first().json;
const plan = $('Send Plan').first().json;
const ran = (name) => { try { return $(name).isExecuted === true; } catch (e) { return false; } };
const input = $input.first().json || {};

const done = (thread_status, status_reason, extra = {}) => [{ json: { thread_status, status_reason, notify_owner: thread_status !== 'replied', ...extra } }];

if (plan.send !== true) {
  if (plan.wanted && plan.holds.length) return done('needs_attention', 'A routine reply was drafted but not sent: ' + plan.holds.join('; ') + '.');
  return done(gate.thread_status === 'replied' ? 'needs_attention' : gate.thread_status, gate.status_reason);
}

const claim = ran('Claim Send') ? $('Claim Send').first().json || {} : {};
if (claim.claimed !== true) {
  return done('needs_attention', 'A routine reply was drafted but not sent: ' + (claim.reason || 'the send could not be claimed') + '. Nothing was sent by this run.');
}

if (!ran('Send Outcome')) return done('needs_attention', 'The send was claimed but its outcome is not known. Check the Sent folder before doing anything. It will not be sent again automatically.');
const outcome = $('Send Outcome').first().json;
// Record Send Event passes its error here when the outcome could not be written to the history.
if (input.error) {
  const what = outcome.state === 'sent'
    ? 'The reply WAS sent to ' + outcome.to + ' (Gmail message ' + outcome.gmail_message_id + ') but could not be recorded. Do not send it again.'
    : outcome.status_reason + ' That outcome could not be recorded either.';
  return done('needs_attention', what, { record_failed: true });
}
return done(outcome.thread_status, outcome.status_reason);
