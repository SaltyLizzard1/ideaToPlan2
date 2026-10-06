// Classifies a failed customer send by what is actually known. n8n's error output carries only a text message.
// fingerprint_mismatch: the file to attach was not the approved one, so the send was never attempted: send_failed.
// local_validation: n8n refused the recipient before transmitting anything. Nothing was sent: send_failed.
// gmail_rejection:  Gmail verifiably refused the message: send_failed. Only patterns verified against n8n source are listed.
// uncertain:        anything else. The message may have gone out: send_unknown. This is the safe default.
const e = $input.first().json || {};
const p = $('Build Customer Email').first().json;
if (e.attachment_ok === false) {
  return [{ json: { ...p, send_status: 'send_failed', error_source: 'fingerprint_mismatch', error_message: 'The PDF to attach has fingerprint ' + (e.attachment_sha256 || '(no file)') + ', and the approved fingerprint is ' + (p.pdf_sha256 || '(none)') + '.' } }];
}
const raw = e.error;
const msg = String((raw && typeof raw === 'object' ? (raw.message || raw.description) : raw) || e.message || 'No error message returned');
const LOCAL_VALIDATION = [/^Invalid email address\b/i];
// n8n 2.20.9 produces this exact text only for an HTTP 400 response (node-api.error.ts, STATUS_CODE_MESSAGES['400']).
// A 400 needs a response from Gmail, so the message was refused, not lost. Other 4xx and all 5xx texts stay uncertain.
const GMAIL_REJECTION = [/^Bad request - please check your parameters\b/];
let source = 'uncertain';
if (LOCAL_VALIDATION.some((r) => r.test(msg))) source = 'local_validation';
else if (GMAIL_REJECTION.some((r) => r.test(msg))) source = 'gmail_rejection';
const status = source === 'uncertain' ? 'send_unknown' : 'send_failed';
return [{ json: { ...p, send_status: status, error_source: source, error_message: msg } }];
