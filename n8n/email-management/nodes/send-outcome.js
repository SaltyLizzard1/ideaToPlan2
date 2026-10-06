// Send Outcome (n8n Code node, run once for all items). PREPARED, not in the published handler.
// Reads what the Gmail send step returned and sorts it into exactly one of three states:
//   sent      Gmail returned a message id. The reply went out.
//   not_sent  Gmail refused the request outright (a 4xx answer). Nothing went out.
//   unknown   anything else: a timeout, a dropped connection, a 5xx answer, or no answer at all. The reply may
//             or may not have gone out. It is NEVER sent again automatically; the owner checks the Sent folder.
const r = $input.first().json || {};
const built = $('Build Reply').first().json;

const err = r.error;
const text = err ? (typeof err === 'string' ? err : String(err.message || err.description || JSON.stringify(err))) : '';
const codeMatch = text.match(/\b([45]\d\d)\b/);
const status = Number((err && (err.httpCode || err.status || err.statusCode)) || (codeMatch && codeMatch[1]) || 0);

let state;
if (!err && typeof r.id === 'string' && r.id.length > 0) state = 'sent';
else if (err && status >= 400 && status < 500 && status !== 408) state = 'not_sent';
else state = 'unknown';

const base = { state, to: built.to, in_reply_to: built.in_reply_to, gmail_message_id: state === 'sent' ? r.id : null, gmail_thread_id: state === 'sent' ? (r.threadId || null) : null, error: text.slice(0, 300) };
if (state === 'sent') {
  return [{ json: { ...base, event_type: 'reply_sent', thread_status: 'replied', status_reason: 'Routine reply sent to ' + built.to + '.' } }];
}
if (state === 'not_sent') {
  return [{ json: { ...base, event_type: 'send_failed', thread_status: 'needs_attention', status_reason: 'The reply was NOT sent: Gmail refused it (' + (status || 'error') + '). Nothing reached the customer. Answer this one by hand.' } }];
}
return [{ json: { ...base, event_type: 'send_unknown', thread_status: 'needs_attention', status_reason: 'The send did not confirm, so the reply may or may not have reached ' + built.to + '. Check the Sent folder before doing anything. It will not be sent again automatically.' } }];
