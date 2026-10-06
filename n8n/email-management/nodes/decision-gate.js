// Decision Gate (n8n Code node, run once for all items).
// Code, not the model, decides what happens to an inbound email. The gate fails closed: anything it cannot
// read, anything outside the routine categories, and anything that touches money, disputes or sensitive
// matters goes to the owner. In shadow mode nothing is ever sent to a customer, whatever the outcome.
const cfg = $('Mailbox Config').first().json;
const msg = $('Normalize and Filter').first().json;
const thread = $('Thread State').first().json || {};
const lookup = $('Order Lookup').first().json || {};
const orders = lookup.orders || [];
const ai = $input.first().json || {};

const ROUTINE = ['order_status', 'delivery_timing', 'how_it_works', 'pricing', 'thanks'];
const minConfidence = Number(cfg.min_confidence) > 0 ? Number(cfg.min_confidence) : 0.8;
const maxAutoReplies = Number.isInteger(cfg.max_auto_replies) ? cfg.max_auto_replies : 1;
const approvedMoney = (cfg.approved_money || []).map(String);
const approvedDurations = (cfg.approved_durations || []).map((d) => String(d).toLowerCase());

const reasons = [];
const customerText = (String(msg.subject || '') + '\n' + String(msg.text || '')).toLowerCase();

// 1. Words in the customer's own email that always need the owner, whatever the model said.
const TRIPWIRES = [
  [/\brefund|money back|reimburse|charge ?back/, 'customer mentions a refund or chargeback'],
  [/\bdispute|unauthori[sz]ed|fraud|scam|stolen card|double[- ]charged|charged twice|overcharged/, 'customer mentions a payment problem or dispute'],
  [/\bcancel/, 'customer mentions cancelling'],
  [/\blawyer|attorney|legal action|\bsue\b|lawsuit|small claims|trading standards|consumer protection/, 'customer mentions legal action'],
  [/\bgdpr|delete my data|data protection|right to be forgotten|privacy request|subject access/, 'data or privacy request'],
  [/\bcomplain|unacceptable|disgust|terrible|worst|rip[- ]?off|angry|furious/, 'complaint or strong dissatisfaction'],
  [/\bsuicid|self[- ]harm|kill myself|emergency|bereave|passed away|died\b/, 'sensitive personal situation'],
  [/\bjournalist|press|reporter|media enquiry|interview request/, 'press or media request'],
  [/\b(late|overdue|delayed|still waiting|still have not|still haven'?t|not (yet )?(received|arrived)|taking (so|too) long|past (the )?72)\b/, 'customer says the order is late or has not arrived'],
];
for (const [re, why] of TRIPWIRES) if (re.test(customerText)) reasons.push(why);

// 2. The model's answer must be complete and readable, or the email goes to the owner.
const category = String(ai.category || '').trim().toLowerCase();
const confidence = Number(ai.confidence);
const reply = String(ai.reply_text || '').trim();
if (ai.no_model_call) {
  reasons.push('no model call was made: ' + String(ai.no_model_call).slice(0, 160));
} else {
  if (ai.parse_error) reasons.push('the model answer could not be read: ' + String(ai.parse_error).slice(0, 120));
  if (!category) reasons.push('the model gave no category');
  else if (!ROUTINE.includes(category)) reasons.push('category "' + category + '" is not a routine category');
  if (!(confidence >= 0 && confidence <= 1)) reasons.push('the model gave no usable confidence');
  else if (confidence < minConfidence) reasons.push('confidence ' + confidence + ' is below ' + minConfidence);
  if (ai.needs_owner === true) reasons.push('the model asked for the owner: ' + String(ai.owner_reason || 'no reason given').slice(0, 160));
  if (!reply) reasons.push('the model wrote no reply');
}

// 3. Reply loops and duplicates.
if (Number(thread.auto_reply_count || 0) >= maxAutoReplies) reasons.push('this conversation already had ' + thread.auto_reply_count + ' automated repl' + (thread.auto_reply_count === 1 ? 'y' : 'ies'));
if (thread.prior_status === 'needs_attention') reasons.push('this conversation is already waiting for the owner');

// 4. General questions need no order. An answer about an order needs a verified sender and exactly one order
//    under that sender's own address, so one customer can never be told about another customer's order.
if (['order_status', 'delivery_timing'].includes(category)) {
  if (lookup.withheld_reason) reasons.push('order details were withheld: ' + lookup.withheld_reason);
  else if (orders.length === 0) reasons.push('no order was found for this sender address');
  else if (orders.length > 1) reasons.push(orders.length + ' orders were found for this sender address');
}

// 4b. An order that is past 72 hours and not recorded as delivered is a late order: the owner answers it.
if (orders.length === 1 && !orders[0].delivered_at && orders[0].submitted_at) {
  const hours = (Date.now() - new Date(orders[0].submitted_at).getTime()) / 3600000;
  if (hours > 72) reasons.push('this order was submitted more than 72 hours ago and is not recorded as delivered');
}

// 5. The draft may not state a date, a duration or an amount that is not in the approved information,
//    and may not promise anything.
const draft = reply.toLowerCase();
const MONTHS = 'jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?';
if (new RegExp('\\b\\d{1,2}(st|nd|rd|th)? (' + MONTHS + ')\\b|\\b(' + MONTHS + ') \\d{1,2}\\b|\\b\\d{1,2}[/.-]\\d{1,2}([/.-]\\d{2,4})?\\b').test(draft)) reasons.push('the draft states a calendar date');
if (/\b(today|tonight|tomorrow|this (morning|afternoon|evening|week)|next week|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|shortly|very soon|any minute|right away)\b/.test(draft)) reasons.push('the draft implies a delivery time that is not recorded');
for (const d of draft.match(/\b(?:within|in|under|about|around)?\s*\d+\s*(?:-|to)?\s*\d*\s*(?:minutes?|hours?|days?|weeks?|business days?)\b/g) || []) {
  const norm = d.replace(/\s+/g, ' ').replace(/^(within|in|under|about|around) /, '').trim();
  if (!approvedDurations.includes(norm)) reasons.push('the draft states a duration that is not approved: "' + norm + '"');
}
for (const amt of draft.match(/[$£€]\s?\d[\d,]*(\.\d+)?/g) || []) {
  if (!approvedMoney.includes(amt.replace(/\s/g, ''))) reasons.push('the draft states an amount that is not approved: "' + amt + '"');
}
// "not a guarantee" and "no guarantee" are the approved disclaimers, so they are not treated as an offer.
if (/\b(refund|guarantee|i promise|we promise|compensat|free of charge|discount|credit your)\b/.test(draft.replace(/\b(not a|no) guarantee\b/g, ''))) reasons.push('the draft offers or discusses a refund, guarantee, discount or compensation');

// 5b. Form and voice. A reply is plain text, written by Elizabeth in the first person, with no stock phrases.
if (/[‒–—―]/.test(reply)) reasons.push('the draft contains an em dash or en dash');
if (/\*\*|__|`|^#{1,6}\s|^\s*[-*•]\s|\[[^\]]+\]\([^)]+\)/m.test(reply)) reasons.push('the draft is not plain text (markdown or bullet points)');
const canned = draft.match(/\b(thanks?( you)? (so much )?for (reaching out|getting in touch|your (email|message|interest|patience|question))|great question|good question|i hope this (email|message|helps|finds)|feel free to|(don't|do not) hesitate|happy to help|glad to help|we appreciate|i appreciate your patience|sorry for the (wait|delay|inconvenience)|rest assured)\b/);
if (canned) reasons.push('the draft uses a stock phrase: "' + canned[0] + '"');
// The greeting line and the signature are set aside, so a customer who is also called Elizabeth is not a problem.
const bodyOnly = draft.split('\n').filter((line, i) => !(i === 0 && /^(hi|hello|dear)\b[^.!?]*,?\s*$/.test(line.trim())) && !/^elizabeth alfond, /.test(line.trim())).join('\n');
if (/\belizabeth\b|\bshe\b|\bshe'(ll|s)\b|\bthe owner\b|\bthe team\b|\bour team\b/.test(bodyOnly)) reasons.push('the draft speaks about Elizabeth or a team instead of speaking as Elizabeth');
if (/\b(we|we're|we'll|we've|our)\b/.test(bodyOnly)) reasons.push('the draft says "we" or "our" instead of "I" or "my"');

// 5c. Claims nothing on record supports.
if (/\bi (can |could |do )?see (that )?(your|the|an?) (order|plan|payment|purchase|account|submission)|\bi('ve| have) (found|located|checked|pulled up|reviewed|looked (up|into|at)|received) (your|the) (order|plan|payment|purchase|account|submission|refund|request)|\bi('m| am) looking (at|into) (your|the)/.test(draft)) {
  reasons.push('the draft claims to have seen or checked something that is not on record');
}
const approvedText = String(cfg.approved_info || '').toLowerCase();
const ASSURANCES = ['securely', 'secure', 'safely', 'safe', 'encrypted', 'confidential', 'private', 'privately', 'instantly', 'immediately', 'expert', 'experts', 'certified', 'accurate', 'proven', 'trusted'];
for (const w of ASSURANCES) {
  if (new RegExp('\\b' + w + '\\b').test(draft) && !new RegExp('\\b' + w + '\\b').test(approvedText)) reasons.push('the draft makes an assurance that is not in the approved information: "' + w + '"');
}
if (/\b(be in touch|get back to you|contact you|reach out to you|follow up|hear (back )?from (me|us|her)|respond to you|reply to you|write to you|email you|look into (it|this|that)|flagged (this|it|your)|passing (this|it|your)|pass (this|it|your) (message |email |request )?(on|along))\b/.test(draft)) {
  reasons.push('the draft promises that someone will contact the customer or follow up');
}
if (/\b(soon|asap|as soon as possible|promptly|quickly|in no time|without delay)\b/.test(draft)) reasons.push('the draft implies a delivery time that is not recorded');

// 6. The draft may name no email address but this customer's and the business's own, and no record id.
const allowedAddresses = [String(msg.customer_email || '').toLowerCase(), String(cfg.mailbox || '').toLowerCase()]
  .concat((cfg.public_addresses || []).map((a) => String(a).toLowerCase()));
for (const a of draft.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []) {
  if (!allowedAddresses.includes(a)) reasons.push('the draft contains an email address that is not this customer\'s: "' + a + '"');
}
if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/.test(draft)) reasons.push('the draft contains an internal record id');

const unique = Array.from(new Set(reasons));
const outcome = unique.length ? 'escalate' : 'reply';
const shadow = cfg.shadow !== false; // shadow unless it is switched off explicitly

return [{
  json: {
    outcome,                                  // what the gate decided: reply or escalate
    send_to_customer: outcome === 'reply' && !shadow,
    shadow,
    thread_status: outcome === 'escalate' ? 'needs_attention' : shadow ? 'needs_attention' : 'replied',
    status_reason: outcome === 'escalate'
      ? unique.join('; ')
      : shadow ? 'Shadow mode: a routine reply was drafted and not sent. Review the draft.' : 'Routine reply sent.',
    reasons: unique,
    category: category || 'unknown',
    confidence: confidence >= 0 && confidence <= 1 ? confidence : null,
    reply_text: reply,
    matched_order_id: orders.length === 1 ? orders[0].id : null,
  },
}];
