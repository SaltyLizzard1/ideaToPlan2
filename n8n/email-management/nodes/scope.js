// In Scope (n8n Code node, run once for all items). PREPARED, not in the published handler.
// The mailbox is a working mailbox, so only I2P customer mail is handled. A message is in scope only when
// one of these is true. Anything else is ambiguous and is left in the inbox untouched for manual review:
// no record, no model call, no alert.
//   1. the sender already has an order on record (an existing I2P customer)
//   2. the message belongs to a conversation that is already on record (an existing I2P conversation)
//   3. it was addressed to one of the public I2P addresses (the original I2P destination)
//   4. the subject or body names IdeaToPlan explicitly
// Words like "my order", "business plan" or "starter plan" are NOT enough on their own.
const cfg = $('Mailbox Config').first().json;
const msg = $('Normalize and Filter').first().json;
const lookup = $('Order Lookup').first().json || {};
const knownConversation = $input.all().some((i) => i.json && i.json.id);
const scope = cfg.scope || {};

const out = (inScope, reason) => [{ json: { in_scope: inScope, scope_reason: reason } }];
if (scope.enabled !== true) return out(true, 'scope filter is off');

if (Number(lookup.rows_matching_sender) > 0) return out(true, 'the sender has an order on record');
if (knownConversation) return out(true, 'the conversation is already on record');

const publicAddresses = (cfg.public_addresses || []).map((a) => String(a).toLowerCase());
if (msg.via_public_address === true || (msg.to_addresses || []).some((a) => publicAddresses.includes(a))) return out(true, 'addressed to a public IdeaToPlan address');

// Explicit references only: the name, with or without spaces or hyphens, or the site address.
const text = (String(msg.subject || '') + '\n' + String(msg.text || '')).toLowerCase();
const named = text.match(/\bidea[\s-]?to[\s-]?plan\b|\bideatoplan\.to\b|\bidea2plan\b/);
if (named) return out(true, 'the email names IdeaToPlan ("' + named[0] + '")');

return out(false, 'not an existing customer or conversation, not sent to an IdeaToPlan address, and IdeaToPlan is not named: left in the inbox for manual review');
