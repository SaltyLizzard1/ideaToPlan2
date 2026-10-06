// Focused checks for the inbound email logic. No network, no model, no n8n.
// Run: node --test n8n/email-management/tests/email-handling.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(root, 'nodes', f), 'utf8');
// Runs an n8n Code node body with mocked $input and $('Node Name').
const run = (file, input, nodes = {}) => {
  const items = Array.isArray(input) ? input : [input];
  const $input = { first: () => ({ json: items[0] }), all: () => items.map((json) => ({ json })) };
  const $ = (name) => ({ first: () => ({ json: nodes[name] }), isExecuted: nodes[name] !== undefined });
  return new Function('$input', '$', src(file))($input, $)[0].json;
};

const CFG = {
  brand: 'i2p', brand_name: 'IdeaToPlan', mailbox: 'liz@ideatoplan.to', own_addresses: [],
  system_subject_prefixes: ['[I2P inbox]', 'ALERT: n8n failure', 'Approve:', 'Sent but not recorded'],
  shadow: true, min_confidence: 0.8, max_auto_replies: 1, approved_money: ['$25', '$50'], approved_durations: ['72 hours'],
  model: 'anthropic/claude-sonnet-4.6', approved_info: 'Plans are delivered within 72 hours. Starter is $25. Growth is $50.',
};
const mail = (o = {}) => ({
  id: 'm1', threadId: 't1', labelIds: ['INBOX', 'UNREAD'],
  from: { value: [{ address: 'Customer@Example.com', name: 'Pat Customer' }] },
  subject: 'Where is my plan?', text: 'Hi, I ordered on Monday. Has my plan been sent yet?', headers: {}, ...o,
});
// The handler reads the message from its trigger (One Email). Its direct input is the configuration, as in n8n.
const filter = (m, cfg = CFG) => run('normalize-filter.js', cfg, { 'Mailbox Config': cfg, 'One Email': m });

test('filter: a normal customer email is handled and normalised', () => {
  const r = filter(mail());
  assert.equal(r.action, 'handle');
  assert.equal(r.customer_email, 'customer@example.com');
  assert.equal(r.provider_message_id, 'm1');
  assert.equal(r.brand, 'i2p');
});
test('filter: launch cutoff ignores older and undated mail, and handles newer mail', () => {
  const cfg = { ...CFG, launch_cutoff: '2026-10-06T06:50:00Z' };
  assert.equal(filter(mail({ date: '2026-10-06T06:49:59.000Z' }), cfg).action, 'ignore');
  assert.equal(filter(mail(), cfg).action, 'ignore');
  assert.equal(filter(mail({ date: '2026-10-06T06:50:01.000Z' }), cfg).action, 'handle');
  assert.equal(filter(mail({ headers: { date: 'Date: Tue, 6 Oct 2026 14:00:00 +0700' } }), cfg).action, 'handle');
});
test('filter: acceptance window handles only the designated test sender', () => {
  const cfg = { ...CFG, acceptance_senders: ['LizAlfond@gmail.com'] };
  assert.equal(filter(mail(), cfg).action, 'ignore');
  assert.equal(filter(mail({ from: { value: [{ address: 'lizalfond@gmail.com' }] } }), cfg).action, 'handle');
});
test('filter: the call limit comes from the configuration, and is zero when none is set', () => {
  const r = filter(mail(), { ...CFG, budget_scope: 'acceptance', max_model_calls: 6 });
  assert.deepEqual([r.dry_run, r.budget_scope, r.budget_max], [false, 'acceptance', 6]);
  const none = filter(mail());
  assert.deepEqual([none.dry_run, none.budget_scope, none.budget_max], [false, '', 0]);
});
test('batch test: two eligible emails and one ignored, all dry runs sharing a limit of one', () => {
  const wf = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const cfg = JSON.parse(wf.nodes.find((n) => n.name === 'Mailbox Config').parameters.jsonOutput);
  const batch = new Function(src('batch-test-emails.js'))().map((i) => i.json);
  const out = batch.map((m) => filter(m, cfg));
  // A dry run is exempt from the test-sender restriction; in handler v2 the scope filter leaves the middle one alone.
  assert.deepEqual(out.map((r) => r.action), ['handle', 'handle', 'handle']);
  assert.equal(new Set(batch.map((m) => m.id)).size, 3);
  for (const r of out) assert.deepEqual([r.dry_run, r.budget_max], [true, 1]);
  assert.equal(out[0].budget_scope, out[2].budget_scope);
  assert.match(out[0].budget_scope, /^dryrun:batchtest-/);
  assert.notEqual(out[0].budget_scope, cfg.budget_scope);
});
test('no model call: a refused or dry-run call escalates to the owner and is never treated as a reply', () => {
  const refused = run('no-model-call.js', {}, { 'Claim Model Call': { allowed: false, calls_used: 6, calls_max: 6 } });
  assert.match(refused.no_model_call, /limit is reached \(6 of 6 used\)/);
  const dry = run('no-model-call.js', {}, { 'Claim Model Call': { allowed: true, calls_used: 1, calls_max: 1 } });
  assert.match(dry.no_model_call, /dry run/);
  const parsed = run('parse-ai-answer.js', refused);
  assert.deepEqual(Object.keys(parsed), ['no_model_call']);
  const g = gate({ ai: parsed, cfg: { ...CFG, shadow: false } });
  assert.equal(g.outcome, 'escalate');
  assert.equal(g.send_to_customer, false);
  assert.deepEqual(g.reasons, ['no model call was made: ' + refused.no_model_call]);
});
test('workflow file: no model call is made unless the database grants it, and never on a dry run', () => {
  const wf = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const n = (name) => wf.nodes.find((x) => x.name === name);
  assert.equal(n('One Email').type, 'n8n-nodes-base.executeWorkflowTrigger');
  assert.ok(!wf.nodes.some((x) => x.type === 'n8n-nodes-base.gmailTrigger'));
  assert.match(n('Claim Model Call').parameters.url, /\/rpc\/email_claim_model_call$/);
  assert.equal(wf.connections['Build AI Request'].main[0][0].node, 'Claim Model Call');
  assert.equal(wf.connections['Claim Model Call'].main[0][0].node, 'Call Allowed?');
  assert.equal(wf.connections['Call Allowed?'].main[0][0].node, 'AI Draft');
  assert.equal(wf.connections['Call Allowed?'].main[1][0].node, 'No Model Call');
  // AI Draft has exactly one way in.
  const into = Object.entries(wf.connections).filter(([, c]) => c.main.some((o) => o.some((t) => t.node === 'AI Draft'))).map(([k]) => k);
  assert.deepEqual(into, ['Call Allowed?']);
  assert.match(n('Call Allowed?').parameters.conditions.conditions[0].leftValue, /allowed === true && .*dry_run !== true/);
  for (const file of ['i2p-inbox-poller.workflow.json', 'i2p-batch-test.workflow.json']) {
    const w = JSON.parse(readFileSync(join(root, 'workflows', file), 'utf8'));
    const each = w.nodes.find((x) => x.name === 'Handle Each Email');
    assert.equal(each.parameters.mode, 'each');
    assert.equal(each.parameters.options.waitForSubWorkflow, false);
    assert.equal(each.parameters.workflowId.value, 'NyrlhbzF91PuUiT1');
    assert.ok(!w.nodes.some((x) => x.type === 'n8n-nodes-base.gmail' || x.type === 'n8n-nodes-base.httpRequest'), file + ' sends and calls nothing itself');
  }
});
test('filter: simplified Gmail shape (From string, snippet) is also read', () => {
  const r = filter({ id: 'm2', threadId: 't2', labelIds: ['INBOX'], From: 'Pat <pat@example.com>', Subject: 'Question', snippet: 'How does it work?' });
  assert.equal(r.action, 'handle');
  assert.equal(r.customer_email, 'pat@example.com');
});
for (const [label, m] of [
  ['mail sent by this mailbox', mail({ from: { value: [{ address: 'liz@ideatoplan.to' }] } })],
  ['sent mail without INBOX label', mail({ labelIds: ['SENT'] })],
  ['no-reply sender', mail({ from: { value: [{ address: 'no-reply@stripe.com' }] } })],
  ['mailer-daemon bounce', mail({ from: { value: [{ address: 'mailer-daemon@googlemail.com' }] } })],
  ['auto-submitted header', mail({ headers: { 'Auto-Submitted': 'auto-replied' } })],
  ['newsletter or Kit mail (List-Unsubscribe)', mail({ headers: { 'List-Unsubscribe': '<mailto:u@kit.com>' } })],
  ['bulk precedence', mail({ headers: { precedence: 'bulk' } })],
  ['out of office subject', mail({ subject: 'Automatic reply: Where is my plan?' })],
  ['the automation\'s own alert', mail({ from: { value: [{ address: 'someone@example.com' }] }, subject: 'ALERT: n8n failure in IdeaToPlan' })],
  ['the automation\'s own owner alert (loop guard)', mail({ subject: '[I2P inbox] Needs you: Where is my plan?' })],
  ['an approval request', mail({ subject: 'Approve: Starter plan for Pat (NO MACHINE REVIEW)' })],
  ['missing message id', mail({ id: '' })],
]) test('filter: ignores ' + label, () => assert.equal(filter(m).action, 'ignore'));

// A recent order: submitted one hour ago, so it is inside the 72 hour window whenever the tests run.
const HOUR = 3600000;
const ORDER = { id: 'o1', status: 'generated', package: 'Starter', submitted_at: new Date(Date.now() - HOUR).toISOString(), plan_generated_at: new Date(Date.now() - HOUR / 2).toISOString(), delivered_at: null };
const GOOD_AI = { category: 'order_status', confidence: 0.93, needs_owner: false, reply_text: 'Hi Pat, your order is recorded and your plan has been generated. Plans are delivered within 72 hours of your order.\n\nElizabeth Alfond, IdeaToPlan' };
const gate = ({ ai = GOOD_AI, msg = filter(mail()), cfg = CFG, thread = { auto_reply_count: 0, prior_status: 'received' }, orders = [ORDER], withheld_reason = '' } = {}) =>
  run('decision-gate.js', ai, { 'Mailbox Config': cfg, 'Normalize and Filter': msg, 'Thread State': thread, 'Order Lookup': { orders: withheld_reason ? [] : orders, withheld_reason } });

// ---- sender verification and order privacy ----
const VERIFIED = { 'authentication-results': 'Authentication-Results: mx.google.com; dkim=pass header.i=@example.com; spf=pass smtp.mailfrom=example.com; dmarc=pass header.from=example.com' };
test('filter: headers stored as whole lines are read (auto-reply, verification, reply-to)', () => {
  assert.equal(filter(mail({ headers: { 'auto-submitted': 'Auto-Submitted: auto-replied' } })).action, 'ignore');
  assert.equal(filter(mail({ headers: VERIFIED })).sender_verified, true);
  assert.equal(filter(mail()).sender_verified, false);
  assert.equal(filter(mail({ headers: { 'authentication-results': 'Authentication-Results: mx.google.com; dkim=fail; spf=pass; dmarc=fail' } })).sender_verified, false);
  assert.equal(filter(mail({ replyTo: { value: [{ address: 'someone-else@example.net' }] } })).reply_to_differs, true);
  assert.equal(filter(mail({ replyTo: { value: [{ address: 'customer@example.com' }] } })).reply_to_differs, false);
});
const lookup = (msg, rows) => run('order-lookup.js', rows, { 'Normalize and Filter': msg });
const ROW = { ...ORDER, email: 'Customer@Example.com' };
test('order lookup: a verified sender gets only their own order', () => {
  const r = lookup(filter(mail({ headers: VERIFIED })), [ROW]);
  assert.equal(r.withheld_reason, '');
  assert.deepEqual(r.orders.map((o) => o.id), ['o1']);
  assert.equal(r.orders[0].email, undefined, 'the order email is not passed on');
});
test('order lookup: a look-alike address returned by the pattern search is dropped', () => {
  const r = lookup(filter(mail({ headers: VERIFIED, from: { value: [{ address: 'a_b@example.com' }] } })), [{ ...ORDER, id: 'other', email: 'axb@example.com' }]);
  assert.deepEqual(r.orders, []);
  assert.equal(r.rows_returned, 1);
  assert.equal(r.rows_matching_sender, 0);
});
test('order lookup: an unverified sender gets no order details', () => {
  const r = lookup(filter(mail()), [ROW]);
  assert.match(r.withheld_reason, /could not be verified/);
  assert.deepEqual(r.orders, []);
});
test('order lookup: a different Reply-To address gets no order details', () => {
  const r = lookup(filter(mail({ headers: VERIFIED, replyTo: { value: [{ address: 'thief@example.net' }] } })), [ROW]);
  assert.match(r.withheld_reason, /different address/);
  assert.deepEqual(r.orders, []);
});
test('ai request: withheld order details never reach the model', () => {
  const r = run('build-ai-request.js', {}, { 'Mailbox Config': CFG, 'Normalize and Filter': filter(mail()), 'Order Lookup': { orders: [], withheld_reason: 'the sender address could not be verified' } });
  const sys = r.request_body.messages[0].content;
  assert.match(sys, /Order details are not available/);
  assert.doesNotMatch(sys, /status generated/);
});
test('gate: a general question needs no order and no verified sender', () => {
  const r = gate({ cfg: { ...CFG, shadow: false }, orders: [], withheld_reason: 'the sender address could not be verified',
    ai: { category: 'how_it_works', confidence: 0.9, needs_owner: false, reply_text: 'You fill in a short form about your idea and I send your plan as a PDF. Plans are delivered within 72 hours.\n\nElizabeth Alfond, IdeaToPlan' } });
  assert.equal(r.outcome, 'reply', JSON.stringify(r.reasons));
  assert.equal(r.matched_order_id, null);
});

test('gate: routine reply in shadow mode is drafted, never sent, and shown to the owner', () => {
  const r = gate();
  assert.equal(r.outcome, 'reply');
  assert.equal(r.send_to_customer, false);
  assert.equal(r.thread_status, 'needs_attention');
  assert.equal(r.matched_order_id, 'o1');
});
test('gate: shadow is the default when the setting is missing', () => {
  const { shadow, ...noShadow } = CFG;
  assert.equal(gate({ cfg: noShadow }).send_to_customer, false);
});
test('gate: with shadow off, a clean routine reply would be sent', () => {
  const r = gate({ cfg: { ...CFG, shadow: false } });
  assert.equal(r.send_to_customer, true);
  assert.equal(r.thread_status, 'replied');
});
const escalates = (label, args, pattern) => test('gate: escalates ' + label, () => {
  const r = gate({ cfg: { ...CFG, shadow: false }, ...args });
  assert.equal(r.outcome, 'escalate', JSON.stringify(r.reasons));
  assert.equal(r.send_to_customer, false);
  assert.equal(r.thread_status, 'needs_attention');
  assert.match(r.status_reason, pattern);
});
escalates('a refund request even when the model calls it routine', { msg: filter(mail({ text: 'I want a refund please.' })) }, /refund/);
escalates('a payment dispute', { msg: filter(mail({ text: 'I was charged twice and will dispute this with my bank.' })) }, /payment problem|dispute/);
escalates('a legal threat', { msg: filter(mail({ text: 'My lawyer will be in touch.' })) }, /legal/);
escalates('a privacy request', { msg: filter(mail({ text: 'Please delete my data under GDPR.' })) }, /privacy/);
escalates('a complaint', { msg: filter(mail({ text: 'This is unacceptable.' })) }, /complaint/);
escalates('a non-routine category', { ai: { ...GOOD_AI, category: 'plan_content_question' } }, /not a routine category/);
escalates('low confidence', { ai: { ...GOOD_AI, confidence: 0.55 } }, /below 0.8/);
escalates('a missing confidence', { ai: { ...GOOD_AI, confidence: undefined } }, /no usable confidence/);
escalates('an unreadable model answer', { ai: { parse_error: 'invalid JSON' } }, /could not be read/);
escalates('when the model asks for the owner', { ai: { ...GOOD_AI, needs_owner: true, owner_reason: 'two questions' } }, /asked for the owner/);
escalates('an empty reply', { ai: { ...GOOD_AI, reply_text: '  ' } }, /no reply/);
escalates('a second automated reply in one conversation (loop guard)', { thread: { auto_reply_count: 1, status: 'replied' } }, /already had 1 automated reply/);
escalates('an order question with no order on record', { orders: [] }, /no order was found/);
escalates('an order question with two orders on record', { orders: [ORDER, { ...ORDER, id: 'o2' }] }, /2 orders/);
escalates('a draft that states a calendar date', { ai: { ...GOOD_AI, reply_text: 'Your plan will arrive on 9 October.' } }, /calendar date/);
escalates('a draft that implies a time', { ai: { ...GOOD_AI, reply_text: 'Your plan will arrive tomorrow.' } }, /delivery time/);
escalates('a draft with an unapproved duration', { ai: { ...GOOD_AI, reply_text: 'You will have it within 24 hours.' } }, /duration that is not approved/);
escalates('a draft with an unapproved amount', { ai: { ...GOOD_AI, reply_text: 'The upgrade costs $30.' } }, /amount that is not approved/);
escalates('a draft that offers a refund', { ai: { ...GOOD_AI, reply_text: 'I can offer you a refund.' } }, /refund, guarantee/);
escalates('a customer who says the plan is late', { msg: filter(mail({ text: 'My plan is late. Where is it?' })) }, /late or has not arrived/);
escalates('a customer who has still not received the plan', { msg: filter(mail({ text: 'I still have not received anything.' })) }, /late or has not arrived/);
escalates('an order past 72 hours that is not delivered, even for a polite question', { orders: [{ ...ORDER, submitted_at: new Date(Date.now() - 80 * HOUR).toISOString() }] }, /more than 72 hours ago/);
test('gate: an order past 72 hours that WAS delivered does not escalate', () => {
  const r = gate({ cfg: { ...CFG, shadow: false }, orders: [{ ...ORDER, submitted_at: new Date(Date.now() - 80 * HOUR).toISOString(), delivered_at: new Date(Date.now() - 20 * HOUR).toISOString() }] });
  assert.equal(r.outcome, 'reply', JSON.stringify(r.reasons));
});
escalates('an order question from an unverified sender', { withheld_reason: 'the sender address could not be verified' }, /order details were withheld/);
escalates('a draft naming someone else\'s email address', { ai: { ...GOOD_AI, reply_text: 'Your plan went to jo@other.example.' } }, /not this customer/);
escalates('a draft containing an internal record id', { ai: { ...GOOD_AI, reply_text: 'Your order 948f81ed-26d1-43ac-9628-d780f8ea8fa4 is recorded.' } }, /internal record id/);
test('gate: the customer\'s own address and the public contact address are allowed in a draft', () => {
  const r = gate({ cfg: { ...CFG, shadow: false, public_addresses: ['ideatoplanincome@gmail.com'] }, ai: { ...GOOD_AI, reply_text: 'I have your order under customer@example.com. You can also write to ideatoplanincome@gmail.com.' } });
  assert.equal(r.outcome, 'reply', JSON.stringify(r.reasons));
});
test('gate: approved duration and approved amounts do not escalate', () => {
  const r = gate({ cfg: { ...CFG, shadow: false }, ai: { ...GOOD_AI, category: 'pricing', reply_text: 'Starter is $25 and Growth is $50. Plans are delivered within 72 hours.' } });
  assert.equal(r.outcome, 'reply', JSON.stringify(r.reasons));
});

test('ai request: refuses to build, so no model call, until approved information is signed off', () => {
  for (const approved_info of ['', 'PASTE APPROVED INFORMATION HERE AFTER SIGN-OFF']) {
    assert.throws(() => run('build-ai-request.js', {}, { 'Mailbox Config': { ...CFG, approved_info }, 'Normalize and Filter': filter(mail()), 'Order Lookup': { orders: [ORDER] } }), /not been signed off/);
  }
});
test('ai request: carries the approved text and only this sender\'s order facts', () => {
  const r = run('build-ai-request.js', {}, { 'Mailbox Config': CFG, 'Normalize and Filter': filter(mail()), 'Order Lookup': { orders: [ORDER] } });
  const sys = r.request_body.messages[0].content;
  assert.match(sys, /Plans are delivered within 72 hours/);
  assert.match(sys, /status generated/);
  assert.match(sys, /delivered not yet/);
  assert.equal(r.request_body.temperature, 0);
  assert.match(r.request_body.messages[1].content, /customer@example\.com/);
});
test('parse: reads a JSON answer, including one wrapped in a code fence', () => {
  const r = run('parse-ai-answer.js', { choices: [{ message: { content: '```json\n{"category":"thanks","confidence":0.9,"needs_owner":false,"reply_text":"You are welcome."}\n```' } }] });
  assert.equal(r.category, 'thanks');
  assert.equal(r.parse_error, undefined);
});
test('parse: unreadable answers become parse_error', () => {
  assert.ok(run('parse-ai-answer.js', { choices: [{ message: { content: 'Sure! Here you go.' } }] }).parse_error);
  assert.ok(run('parse-ai-answer.js', {}).parse_error);
});

for (const file of ['i2p-inbound-shadow.workflow.json', 'email-watchdog.workflow.json']) {
  test('workflow file ' + file + ': well formed and cannot email a customer', () => {
    const wf = JSON.parse(readFileSync(join(root, 'workflows', file), 'utf8'));
    const names = wf.nodes.map((n) => n.name);
    assert.equal(new Set(names).size, names.length, 'node names are unique');
    assert.equal(new Set(wf.nodes.map((n) => n.id)).size, wf.nodes.length, 'node ids are unique');
    for (const [from, c] of Object.entries(wf.connections)) {
      assert.ok(names.includes(from), 'connection source exists: ' + from);
      for (const out of c.main) for (const t of out) assert.ok(names.includes(t.node), 'connection target exists: ' + t.node);
    }
    const gmail = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.gmail');
    assert.ok(gmail.length > 0);
    for (const n of gmail) assert.equal(n.parameters.sendTo, 'liz@ideatoplan.to', n.name + ' sends only to the owner');
    assert.equal(wf.active, undefined, 'the file does not ask to be activated');
    assert.equal(wf.settings.errorWorkflow, 'BFirlikXaAuti0bh');
  });
}
test('workflow file: claim, finish and stuck sweep are single database calls', () => {
  const inbound = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const url = (name) => inbound.nodes.find((n) => n.name === name).parameters.url;
  assert.match(url('Thread State'), /\/rpc\/email_claim_message$/);
  assert.match(url('Finish'), /\/rpc\/email_finish_message$/);
  assert.match(url('Finish As Failed'), /\/rpc\/email_finish_message$/);
  // Nothing after the claim runs unless the claim was won, and no alert goes out unless the finish applied.
  assert.equal(inbound.connections['Claimed?'].main[0][0].node, 'Fetch Orders');
  assert.equal(inbound.connections['Claimed?'].main[1][0].node, 'Not Claimed');
  assert.equal(inbound.connections['Still Ours?'].main[0][0].node, 'Owner Alert');
  assert.equal(inbound.connections['Still Ours?'].main[1][0].node, 'Late Result');
  const dog = JSON.parse(readFileSync(join(root, 'workflows', 'email-watchdog.workflow.json'), 'utf8'));
  assert.match(dog.nodes.find((n) => n.name === 'Fail Stuck').parameters.url, /\/rpc\/email_fail_stuck$/);
});
test('workflow file: every failure is recorded, including a failed alert', () => {
  for (const file of ['i2p-inbound-shadow.workflow.json', 'email-watchdog.workflow.json']) {
    const wf = JSON.parse(readFileSync(join(root, 'workflows', file), 'utf8'));
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.gmail')) {
      assert.equal(n.onError, 'continueErrorOutput', n.name + ' has an error output');
      assert.equal(wf.connections[n.name].main[1][0].node, 'Record Alert Failure', n.name + ' failure is recorded');
      assert.equal(n.retryOnFail, false, n.name + ' is not retried, so an alert cannot be sent twice');
    }
    const rec = wf.nodes.find((x) => x.name === 'Record Alert Failure');
    assert.match(rec.parameters.jsonBody, /alert_failed/);
  }
  const inbound = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const ai = inbound.nodes.find((n) => n.name === 'AI Draft');
  assert.equal(ai.onError, 'continueErrorOutput');
  assert.equal(ai.retryOnFail, false);
  assert.equal(inbound.connections['AI Draft'].main[1][0].node, 'Record Failure');
  assert.equal(inbound.connections['Record Failure'].main[0][0].node, 'Finish As Failed');
  assert.equal(inbound.connections['Finish As Failed'].main[0][0].node, 'Failure Alert');
});
test('workflow file: the inbound handler is in shadow mode and carries the approved text as signed off', () => {
  const wf = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const cfg = JSON.parse(wf.nodes.find((n) => n.name === 'Mailbox Config').parameters.jsonOutput);
  assert.equal(cfg.shadow, true);
  assert.equal(cfg.approved_info, readFileSync(join(root, 'approved-info-i2p.APPROVED.txt'), 'utf8').trim());
  assert.match(cfg.approved_info, /typically delivered within 72 hours of submission\. What happens if a plan takes longer is set out in the terms at ideatoplan\.to\/terms/);
  // The approved text must not weaken the published late-delivery policy, and must not restate it either.
  assert.doesNotMatch(cfg.approved_info, /estimate, not a guarantee|not guaranteed|will refund|refund you/);
  assert.doesNotMatch(cfg.approved_info, /refund you|guarantee of delivery|delivered in 72 hours/);
  for (const prefix of ['[I2P inbox]', 'ALERT: n8n failure', 'Approve:']) assert.ok(cfg.system_subject_prefixes.includes(prefix));
});
test('gate: with the approved text, a pricing reply naming the 90-day roadmap and the 72 hour estimate is routine', () => {
  const wf = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const cfg = { ...JSON.parse(wf.nodes.find((n) => n.name === 'Mailbox Config').parameters.jsonOutput), shadow: false };
  const r = gate({ cfg, orders: [], ai: { category: 'pricing', confidence: 0.92, needs_owner: false,
    reply_text: 'Starter is $25 and includes a 90-day roadmap. Growth is $50. Standard plans are typically delivered within 72 hours of submission. What happens if a plan takes longer is set out in the terms at ideatoplan.to/terms.\n\nElizabeth Alfond, IdeaToPlan' } });
  assert.equal(r.outcome, 'reply', JSON.stringify(r.reasons));
});
test('gate: with the approved text, repeating the approved disclaimer word for word is routine', () => {
  const wf = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const cfg = { ...JSON.parse(wf.nodes.find((n) => n.name === 'Mailbox Config').parameters.jsonOutput), shadow: false };
  const r = gate({ cfg, orders: [], ai: { category: 'delivery_timing', confidence: 0.9, needs_owner: false,
    reply_text: 'Standard plans are typically delivered within 72 hours of submission. This is an estimate, not a guarantee. A plan carries no guarantee of any business outcome.\n\nElizabeth Alfond, IdeaToPlan' } });
  // delivery_timing with no order on record still goes to the owner; the disclaimer itself must not be the reason.
  assert.ok(!r.reasons.some((x) => /refund, guarantee/.test(x)), JSON.stringify(r.reasons));
  const general = gate({ cfg, orders: [], ai: { category: 'how_it_works', confidence: 0.9, needs_owner: false,
    reply_text: 'Standard plans are typically delivered within 72 hours of submission. This is an estimate, not a guarantee.\n\nElizabeth Alfond, IdeaToPlan' } });
  assert.equal(general.outcome, 'reply', JSON.stringify(general.reasons));
});
test('gate: with the approved text, a draft that turns the estimate into a promise is blocked', () => {
  const wf = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'));
  const cfg = { ...JSON.parse(wf.nodes.find((n) => n.name === 'Mailbox Config').parameters.jsonOutput), shadow: false };
  const r = gate({ cfg, ai: { ...GOOD_AI, reply_text: 'I guarantee your plan within 72 hours.' } });
  assert.equal(r.outcome, 'escalate');
});

// ---- form, voice and unsupported claims (the five drafts from the 2026-10-06 acceptance run) ----
const SIG = '\n\nElizabeth Alfond, IdeaToPlan';
const builtCfg = () => JSON.parse(JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-shadow.workflow.json'), 'utf8'))
  .nodes.find((n) => n.name === 'Mailbox Config').parameters.jsonOutput);
const general = (reply_text, extra = {}) => gate({ cfg: { ...builtCfg(), shadow: false }, orders: [],
  ai: { category: 'pricing', confidence: 0.99, needs_owner: false, reply_text, ...extra } });
const has = (r, re) => r.reasons.some((x) => re.test(x));

test('gate: acceptance draft 1 is blocked (em dash, stock phrases, "securely")', () => {
  const r = general('Hi Elizabeth,\n\nThanks for reaching out! Here\'s a quick overview:\n\nEvery plan is drafted using AI and reviewed by a person before it reaches you — nothing is sent automatically.\n\nThe Starter plan is $25. Payment is processed securely through Stripe.\n\nFeel free to reply if you have any other questions!' + SIG);
  assert.equal(r.outcome, 'escalate');
  assert.ok(has(r, /em dash or en dash/));
  assert.ok(has(r, /stock phrase/));
  assert.ok(has(r, /assurance that is not in the approved information: "securely"/));
});
test('gate: acceptance draft 2 is blocked (markdown, en dash, "our")', () => {
  const r = general('Hi,\n\nThanks for reaching out! Here\'s a quick breakdown of our two plans:\n\n**Starter – $25**\nIncludes an actionable business plan.\n\n**Growth – $50**\nIncludes everything in Starter.' + SIG);
  assert.ok(has(r, /not plain text/));
  assert.ok(has(r, /em dash or en dash/));
  assert.ok(has(r, /"we" or "our"/));
});
test('gate: acceptance drafts 3, 4 and 5 are blocked (third person, order claim, contact promise, "soon")', () => {
  const three = general('Hi,\n\nI\'ve received your refund request. Refund questions are something Elizabeth looks into personally, so I\'ve flagged this for her attention and she\'ll be in touch with you directly.' + SIG);
  assert.ok(has(three, /about Elizabeth or a team/));
  assert.ok(has(three, /contact the customer or follow up/));
  assert.ok(has(three, /seen or checked something/));
  const four = general('Hi Elizabeth,\n\nI can see your order and I want to make sure this gets attention. I\'m passing your message along.' + SIG);
  assert.ok(has(four, /seen or checked something/));
  assert.ok(has(four, /contact the customer or follow up/));
  const five = general('Hi Elizabeth,\n\nUpgrading is not something I can arrange from here. An answer is coming soon!' + SIG);
  assert.ok(has(five, /delivery time that is not recorded/));
});
test('gate: a plain first-person reply built from the approved text passes, also for a customer called Elizabeth', () => {
  const r = general('Hi Elizabeth,\n\nStarter is $25. It includes an actionable business plan built around your idea, a revenue model and pricing strategy, a 90-day roadmap with clear milestones, and a professional PDF.\n\nGrowth is $50. It includes everything in Starter, plus competitor research and landscape analysis, a SWOT analysis, and a viability verdict with a go/no-go assessment.\n\nPrices are in US dollars. Payment is processed through Stripe.' + SIG);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.outcome, 'reply');
});
test('gate: an assurance word is allowed only when the approved text uses it', () => {
  assert.deepEqual(general('Hi,\n\nStarter includes a professional PDF.' + SIG).reasons, []);
  assert.ok(has(general('Hi,\n\nYour details are kept private and safe.' + SIG), /"private"/));
});
test('prompt: the model is told the form, the voice, and to leave owner matters without a draft', () => {
  const cfg = builtCfg();
  const req = run('build-ai-request.js', {}, { 'Mailbox Config': cfg, 'Normalize and Filter': filter(mail()), 'Order Lookup': { orders: [] } }).request_body;
  const sys = req.messages[0].content;
  for (const re of [/Plain text only/, /no em dashes and no en dashes/, /first person/, /never write "we" or "our"/, /No stock phrases/, /Never promise that anyone will contact/, /set reply_text to an empty string/]) assert.match(sys, re);
  assert.equal(req.max_tokens, 700);
});
test('filter: the body is capped in bytes, and a monthly limit scope is filled in', () => {
  const long = filter(mail({ text: '漢'.repeat(5000) }));
  assert.ok(Buffer.byteLength(long.text, 'utf8') <= 6000);
  assert.equal(long.text_truncated, true);
  assert.equal(filter(mail({ text: 'short' })).text_truncated, false);
  const r = filter(mail(), { ...CFG, budget_scope: 'i2p-{month}', max_model_calls: 300 });
  assert.match(r.budget_scope, /^i2p-\d{4}-\d{2}$/);
});
