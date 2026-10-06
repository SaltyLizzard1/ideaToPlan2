// Send Plan (n8n Code node, run once for all items). PREPARED, not in the published handler.
// Decides whether the routine reply the gate approved may be sent at all. Everything here is a reason NOT
// to send. In shadow mode the answer is always no.
const cfg = $('Mailbox Config').first().json;
const msg = $('Normalize and Filter').first().json;
const gate = $('Decision Gate').first().json;

if (cfg.shadow !== false || gate.send_to_customer !== true) return [{ json: { send: false, holds: [], wanted: false } }];

const lower = (v) => String(v || '').trim().toLowerCase();
const to = lower(msg.customer_email);
const ours = [cfg.mailbox].concat(cfg.own_addresses || [], cfg.public_addresses || []).map(lower);
const holds = [];
if (cfg.sending_enabled !== true) holds.push('sending is switched off in Mailbox Config');
// Only the categories listed in auto_send_categories are answered automatically. Every other routine
// category, and every category when the list is missing, is held as a draft for the owner.
const autoCategories = Array.isArray(cfg.auto_send_categories) ? cfg.auto_send_categories.map(lower) : [];
if (!autoCategories.includes(lower(gate.category))) holds.push('questions in the category "' + String(gate.category) + '" are held for the owner');
// Mail that arrived through the forwarded public mailbox is held until forwarding has been verified.
if (cfg.hold_forwarded !== false && msg.via_public_address === true) holds.push('this email came through the forwarded public mailbox, and those replies are held for the owner');
// While this list is not empty, a reply may go only to these addresses. Everyone else gets a held draft.
const onlyTo = (cfg.send_only_to || []).map(lower);
if (onlyTo.length && !onlyTo.includes(to)) holds.push('sending is limited to the test address for now');
if (msg.dry_run) holds.push('this is a dry run');
if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(to)) holds.push('the customer address is not a plain email address');
if (ours.includes(to)) holds.push('the sender is one of the business\'s own addresses, so a reply would go back to the mailbox');
if (!msg.sender_verified) holds.push('the sender address could not be verified');
if (msg.reply_to_differs) holds.push('the email asks for replies at a different address than the sender');
if (!msg.rfc_message_id) holds.push('the email has no Message-ID to thread the reply on');
if (!String(gate.reply_text || '').trim()) holds.push('there is no reply text');

return [{ json: { send: holds.length === 0, holds, wanted: true, to } }];
