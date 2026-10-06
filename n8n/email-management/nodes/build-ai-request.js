// Build AI Request (n8n Code node, run once for all items).
// Builds the one model request for an inbound email. The model may use only the approved information and the
// order facts given here. It refuses to build a request until the approved information has been signed off,
// so no model call can happen before then.
const cfg = $('Mailbox Config').first().json;
const msg = $('Normalize and Filter').first().json;
const lookup = $('Order Lookup').first().json || {};
const orders = lookup.orders || [];

const approved = String(cfg.approved_info || '').trim();
if (!approved || /^PASTE APPROVED INFORMATION/i.test(approved)) {
  throw new Error('Approved information has not been signed off and pasted into Mailbox Config. No model call was made.');
}

const orderFacts = lookup.withheld_reason
  ? 'Order details are not available for this email (' + lookup.withheld_reason + '). Do not state anything about any order.'
  : orders.length === 0
  ? 'No order was found for the sender address ' + msg.customer_email + '.'
  : orders.map((o, i) => 'Order ' + (i + 1) + ': package ' + (o.package || 'not recorded')
      + ', status ' + (o.status || 'not recorded')
      + ', submitted ' + (o.submitted_at || 'not recorded')
      + ', plan generated ' + (o.plan_generated_at || 'not yet')
      + ', delivered ' + (o.delivered_at || 'not yet') + '.').join('\n');

const system = [
  'You triage and draft replies to customer email for ' + cfg.brand_name + '. A person reviews what you produce.',
  'Use ONLY the APPROVED INFORMATION and the ORDER FACTS below. If the answer is not there, do not answer: set needs_owner to true.',
  'In the APPROVED INFORMATION, "Elizabeth" is the person you write as. Where it says a matter goes to Elizabeth, that means needs_owner is true.',
  'Never state or imply a delivery date or time. You may repeat a duration only if it appears word for word in the approved information.',
  'Never offer, promise, refuse or discuss refunds, discounts, compensation, guarantees or legal matters. Those go to the owner.',
  'Never invent facts about the order, the plan, the price or the company. Never ask for payment or card details.',
  'Categories: order_status, delivery_timing, how_it_works, pricing, thanks, refund, payment_dispute, cancellation, complaint, legal, privacy, plan_content_question, sensitive, unclear, other.',
  'Only order_status, delivery_timing, how_it_works, pricing and thanks are routine. Everything else needs the owner.',
  'A general question (how it works, pricing, thanks) needs no order: answer it from the approved information alone.',
  'Never mention another person, another email address, or any order that is not listed in the ORDER FACTS.',
  'If you are not confident, or the email asks several things and one is not routine, set needs_owner to true.',
  'Answer with one JSON object and nothing else: {"category": string, "confidence": number from 0 to 1, "needs_owner": boolean, "owner_reason": string, "reply_text": string}.',
  'reply_text is a short reply written as Elizabeth herself, in the first person ("I", "my"), signed on its own last line "Elizabeth Alfond, IdeaToPlan".',
  'Never write about Elizabeth, "she", "the owner" or "the team", and never write "we" or "our". You are writing as her.',
  'Plain text only: no markdown, no asterisks, no bullet points, no headings, no em dashes and no en dashes. Use commas, full stops and short paragraphs.',
  'Begin with "Hi," or "Hi" and the first name, then go straight to the answer. No stock phrases: no "thanks for reaching out", "great question", "feel free to", "happy to help", "sorry for the wait" or similar.',
  'State only what the APPROVED INFORMATION or the ORDER FACTS say, in their words. Add no adjective or assurance of your own (for example "securely", "safe", "instantly"). Never say you can see, have checked or have found anything.',
  'Never promise that anyone will contact the customer, follow up, or do anything "soon" or "shortly".',
  'When needs_owner is true, set reply_text to an empty string. Elizabeth writes those replies herself.',
  '',
  'APPROVED INFORMATION',
  approved,
  '',
  'ORDER FACTS (from the order records, for this sender address only)',
  orderFacts,
].join('\n');

const user = 'From: ' + (msg.customer_name ? String(msg.customer_name).slice(0, 120) + ' ' : '') + '<' + msg.customer_email + '>\n'
  + 'Subject: ' + String(msg.subject).slice(0, 300) + '\n\n' + msg.text + (msg.text_truncated ? '\n[The email was longer and has been cut here.]' : '');

// The size of everything the model is sent. When a limit is configured and the request is larger, no call
// is made and the email goes to the owner, so the cost of one call has a real upper bound.
const requestBytes = Buffer.byteLength(system, 'utf8') + Buffer.byteLength(user, 'utf8');
const maxBytes = Number(cfg.max_request_bytes) > 0 ? Number(cfg.max_request_bytes) : 0;

return [{
  json: {
    request_bytes: requestBytes,
    too_large: maxBytes > 0 && requestBytes > maxBytes,
    request_body: {
      model: cfg.model,
      temperature: 0,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    },
  },
}];
