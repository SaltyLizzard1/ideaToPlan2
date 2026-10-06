// Normalize and Filter (n8n Code node, run once for all items).
// Turns one inbound message into a fixed shape and decides whether it is customer mail at all.
// Automated mail, the automation's own mail and newsletter traffic are ignored and never answered.
// Each execution of this workflow handles exactly one message, handed over by the poller. The message is
// read from the trigger, because Mailbox Config outputs the configuration only.
const cfg = $('Mailbox Config').first().json;
const m = $('One Email').first().json || {};
// A dry run comes only from the batch test caller. It never calls the model and counts against its own limit.
const dry = m._dry_run && typeof m._dry_run === 'object' ? m._dry_run : null;

const lower = (v) => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
const capBytes = (s, max) => {
  let out = String(s);
  while (Buffer.byteLength(out, 'utf8') > max) out = out.slice(0, Math.max(0, Math.min(out.length - 1, Math.floor(out.length * 0.9))));
  return out;
};
const headerOf = (name) => {
  const h = m.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  const v = key ? h[key] : m[name] !== undefined ? m[name] : m[name.toLowerCase()];
  const line = Array.isArray(v) ? v.join(', ') : String(v === undefined || v === null ? '' : v);
  // The Gmail Trigger stores each header as its whole line ("Auto-Submitted: auto-replied"), so drop the name.
  const prefix = name.toLowerCase() + ':';
  return (line.toLowerCase().startsWith(prefix) ? line.slice(prefix.length) : line).trim();
};
const parseAddress = (v) => {
  if (v && typeof v === 'object') {
    const first = Array.isArray(v.value) ? v.value[0] : v;
    if (first && first.address) return { email: lower(first.address), name: String(first.name || '').trim() };
    if (v.text) v = v.text;
  }
  const s = String(v || '');
  const match = s.match(/<([^<>\s]+@[^<>\s]+)>/) || s.match(/([^\s<>"']+@[^\s<>"']+)/);
  return { email: match ? lower(match[1]) : '', name: s.replace(/<[^>]*>/, '').replace(/"/g, '').trim() };
};

const from = parseAddress(m.from || m.From || headerOf('from'));
const subject = String(m.subject || m.Subject || headerOf('subject') || '').trim();
const text = String(m.text || m.textPlain || m.snippet || '').replace(/\r/g, '').trim();
const messageId = String(m.id || m.messageId || '').trim();
const threadId = String(m.threadId || '').trim();
const labels = Array.isArray(m.labelIds) ? m.labelIds : [];
const replyTo = parseAddress(m.replyTo || headerOf('reply-to'));
// Gmail records its own SPF, DKIM and DMARC verdicts for mail it received. A sender is treated as verified
// only when Gmail says the message really came from the From domain.
const auth = headerOf('authentication-results').toLowerCase();
const senderVerified = /\bdmarc=pass\b/.test(auth) || (/\bdkim=pass\b/.test(auth) && /\bspf=pass\b/.test(auth));

const own = [cfg.mailbox].concat(cfg.own_addresses || []).map(lower);
const reasons = [];
if (!messageId || !threadId) reasons.push('no message id or thread id');
if (!from.email) reasons.push('no sender address');
if (own.includes(from.email)) reasons.push('sent by this mailbox or by the automation');
if (labels.includes('SENT') && !labels.includes('INBOX')) reasons.push('sent mail, not received');
// Also catches the word after a separator, as in forwarding-noreply@google.com.
if (/(^|[._+-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|alerts?)[@+._-]/.test(from.email)) reasons.push('automated sender address');
if (/^(auto-generated|auto-replied|auto-notified)/i.test(headerOf('auto-submitted'))) reasons.push('auto-submitted header');
if (/^(bulk|list|junk|auto_reply)/i.test(headerOf('precedence'))) reasons.push('bulk or list precedence');
if (headerOf('list-unsubscribe') || headerOf('list-id')) reasons.push('mailing list or newsletter mail');
if (headerOf('x-autoreply') || headerOf('x-autorespond')) reasons.push('auto-reply header');
if (/^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|undeliverable|delivery status notification|mail delivery (failed|subsystem))/i.test(subject)) reasons.push('auto-reply or bounce subject');
if ((cfg.system_subject_prefixes || []).some((p) => subject.toLowerCase().startsWith(String(p).toLowerCase()))) reasons.push('subject is one of the automation\'s own emails');

// Launch guards, all set in Mailbox Config. Mail dated before the launch cutoff is never handled.
const sentAt = Date.parse(m.date || headerOf('date'));
const cutoff = cfg.launch_cutoff ? Date.parse(cfg.launch_cutoff) : NaN;
if (!Number.isNaN(cutoff) && (Number.isNaN(sentAt) || sentAt < cutoff)) reasons.push('dated before the launch cutoff, or undated');
// Acceptance window: while this list is not empty, only these senders are handled.
const onlySenders = (cfg.acceptance_senders || []).map(lower);
// A dry run is exempt: it can only come from a manual test workflow and can never reach the model.
if (!dry && onlySenders.length && !onlySenders.includes(from.email)) reasons.push('acceptance window: not a designated test sender');

return [{
  json: {
    action: reasons.length ? 'ignore' : 'handle',
    ignore_reasons: reasons,
    brand: cfg.brand,
    mailbox: lower(cfg.mailbox),
    provider: 'gmail',
    provider_message_id: messageId,
    provider_thread_id: threadId,
    customer_email: from.email,
    customer_name: from.name,
    reply_to_differs: !!replyTo.email && replyTo.email !== from.email,
    // True when the message was written to one of the public addresses and reached this mailbox by
    // forwarding: the original To still names that address, or Gmail's forwarding header does.
    via_public_address: (cfg.public_addresses || []).map(lower).some((a) => a && (
      [m.to, m.cc].flatMap((v) => (v && Array.isArray(v.value) ? v.value : [])).some((x) => lower(x && x.address) === a)
      || headerOf('x-forwarded-for').toLowerCase().includes(a))),
    // Used only by the prepared scope filter and reply path.
    to_addresses: [m.to, m.cc].flatMap((v) => (v && Array.isArray(v.value) ? v.value : [])).map((a) => lower(a && a.address)).filter(Boolean),
    rfc_message_id: /^<[^<>\s]+>$/.test(String(m.messageId || headerOf('message-id')).trim()) ? String(m.messageId || headerOf('message-id')).trim() : '',
    sender_verified: senderVerified,
    subject,
    // The body is capped in bytes, not characters, so one email cannot become one very large model request
    // whatever script it is written in.
    text: capBytes(text, 6000),
    text_truncated: capBytes(text, 6000).length < text.length,
    received_at: new Date().toISOString(),
    // The model call limit is counted in the database (Claim Model Call), so it holds across executions.
    dry_run: !!dry,
    // "{month}" in the configured scope becomes the current month (UTC), which makes the limit a monthly one.
    budget_scope: dry ? 'dryrun:' + String(dry.scope || 'default') : String(cfg.budget_scope || '').replace('{month}', new Date().toISOString().slice(0, 7)),
    budget_max: Math.max(0, Math.floor(Number(dry ? dry.max : cfg.max_model_calls) || 0)),
  },
}];
