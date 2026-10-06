// Build Reply (n8n Code node, run once for all items). PREPARED, not in the published handler.
// Builds the one reply as a raw message for the Gmail API. The recipient is the customer's own address, set
// here explicitly and never taken from a Reply-To header or from a forwarding mailbox. The reply is threaded
// on the customer's message by In-Reply-To, References and the Gmail thread id.
const msg = $('Normalize and Filter').first().json;
const gate = $('Decision Gate').first().json;
const plan = $('Send Plan').first().json;
if (plan.send !== true) throw new Error('Build Reply was reached without a send plan. Nothing was sent.');

const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const subjectText = oneLine(msg.subject).slice(0, 200);
const subject = /^re:/i.test(subjectText) ? subjectText : 'Re: ' + subjectText;
const body = String(gate.reply_text).replace(/\r?\n/g, '\r\n');

const mime = [
  'To: ' + plan.to,
  'Subject: =?UTF-8?B?' + b64(subject) + '?=',
  'In-Reply-To: ' + msg.rfc_message_id,
  'References: ' + msg.rfc_message_id,
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '',
  b64(body).replace(/.{76}/g, '$&\r\n'),
].join('\r\n');

return [{
  json: {
    to: plan.to,
    subject,
    in_reply_to: msg.provider_message_id,
    request_body: { threadId: msg.provider_thread_id, raw: Buffer.from(mime, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') },
  },
}];
