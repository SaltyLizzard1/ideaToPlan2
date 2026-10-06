// The prepared customer reply path and scope filter, run end to end with scripted responses.
// No network, no model, no n8n, no email. Run: node --test n8n/email-management/tests/reply-path.test.mjs
// The database is an in-memory stand-in that follows 004_reply_send.sql; the real functions have their own
// self-test (004_selftest_ROLLS_BACK.sql). Gmail and the history write are scripted per test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(root, 'nodes', f), 'utf8');
const run = (file, input, nodes = {}) => {
  const $input = { first: () => ({ json: input }), all: () => (Array.isArray(input) ? input : [input]).map((json) => ({ json })) };
  const $ = (name) => ({ first: () => ({ json: nodes[name] }), isExecuted: nodes[name] !== undefined });
  return new Function('$input', '$', src(file))($input, $)[0].json;
};
const wf = JSON.parse(readFileSync(join(root, 'workflows', 'i2p-inbound-reply-path.PREPARED.workflow.json'), 'utf8'));
const BUILT = JSON.parse(wf.nodes.find((n) => n.name === 'Mailbox Config').parameters.jsonOutput);
// The live configuration for these tests: no acceptance window, replies switched on unless a test says otherwise.
// BUILT is the configuration as it is live in n8n. LIVE only drops the launch cutoff so test dates do not matter.
const LIVE = { ...BUILT, launch_cutoff: '' };

const VERIFIED = { 'authentication-results': 'mx.google.com; dkim=pass; spf=pass; dmarc=pass' };
const mail = (o = {}) => ({
  id: 'm1', threadId: 't1', labelIds: ['INBOX'], headers: VERIFIED, messageId: '<abc123@mail.example.com>',
  from: { value: [{ address: 'pat@example.com', name: 'Pat Customer' }] }, to: { value: [{ address: 'liz@ideatoplan.to' }] },
  subject: 'Starter plan details', text: 'Hi, what do I get with the IdeaToPlan Starter plan and how much is it?', date: new Date().toISOString(), ...o,
});
const GOOD_DRAFT = { category: 'pricing', confidence: 0.97, needs_owner: false,
  reply_text: 'Hi Pat,\n\nThe Starter plan is $25. It includes an actionable business plan built around your idea, a revenue model and pricing strategy, a 90-day roadmap with clear milestones, and a professional PDF.\n\nPayment is processed through Stripe.\n\nElizabeth Alfond, IdeaToPlan' };

// In-memory stand-in for the conversation tables and the two claim functions.
const makeDb = () => {
  const db = { threads: new Map(), events: [] };
  db.claimMessage = (msg) => {
    let t = db.threads.get(msg.provider_thread_id);
    if (!t) { t = { id: 'th-' + msg.provider_thread_id, status: 'received', auto_reply_count: 0, processing_message_id: null }; db.threads.set(msg.provider_thread_id, t); }
    if (db.events.some((e) => e.event_type === 'received' && e.provider_message_id === msg.provider_message_id)) return { thread_id: t.id, claimed: false, reason: 'duplicate', auto_reply_count: t.auto_reply_count, prior_status: t.status };
    db.events.push({ event_type: 'received', provider_message_id: msg.provider_message_id });
    const prior = t.status;
    Object.assign(t, { status: 'processing', processing_message_id: msg.provider_message_id });
    return { thread_id: t.id, claimed: true, reason: 'claimed', auto_reply_count: t.auto_reply_count, prior_status: prior };
  };
  db.claimSend = (threadId, inReplyTo, max) => {
    const t = [...db.threads.values()].find((x) => x.id === threadId);
    if (!t) return { claimed: false, reason: 'the conversation does not exist' };
    if (t.status !== 'processing' || t.processing_message_id !== inReplyTo) return { claimed: false, reason: 'the conversation is no longer held by this run' };
    if (t.auto_reply_count >= max) return { claimed: false, reason: 'the automated reply limit for this conversation is reached' };
    if (db.events.some((e) => e.event_type === 'send_claimed' && e.in_reply_to === inReplyTo)) return { claimed: false, reason: 'a send was already claimed for this message' };
    db.events.push({ event_type: 'send_claimed', in_reply_to: inReplyTo });
    t.auto_reply_count += 1;
    return { claimed: true, reason: 'claimed' };
  };
  db.finish = (threadId, messageId, status, reason) => {
    const t = [...db.threads.values()].find((x) => x.id === threadId);
    if (!t || t.status !== 'processing' || t.processing_message_id !== messageId) return { applied: false, final_status: t ? t.status : null };
    Object.assign(t, { status, status_reason: reason, processing_message_id: null });
    return { applied: true, final_status: status };
  };
  return db;
};

// Walks the prepared workflow for one email. gmail(request) is the scripted send: it returns what the
// HTTP node would hand on, either { id, threadId } or { error }. recordFails makes the history write fail.
const handle = (m, { cfg = LIVE, db = makeDb(), orders = [], ai = GOOD_DRAFT, gmail = () => ({ id: 'gm-1', threadId: 't1' }), recordFails = false, sendNodeDisabled = false, reclaimInsteadOfNewMessage = false } = {}) => {
  const trace = { gmailCalls: 0, modelCalls: 0, alerts: [], db };
  const N = run('normalize-filter.js', cfg, { 'Mailbox Config': cfg, 'One Email': m });
  trace.N = N;
  if (N.action !== 'handle') return { ...trace, end: 'Not Customer Mail' };
  const lookup = run('order-lookup.js', orders, { 'Normalize and Filter': N });
  // Known Conversation: the rows the read-only lookup would return for this Gmail thread.
  const known = db.threads.has(N.provider_thread_id) ? [{ id: db.threads.get(N.provider_thread_id).id }] : [{}];
  trace.scope = run('scope.js', known, { 'Mailbox Config': cfg, 'Normalize and Filter': N, 'Order Lookup': lookup });
  if (!trace.scope.in_scope) return { ...trace, end: 'Out Of Scope' };
  const T = reclaimInsteadOfNewMessage ? { ...db.claimMessage(N), claimed: true } : db.claimMessage(N);
  if (!T.claimed) return { ...trace, end: 'Not Claimed' };
  trace.modelCalls += 1; // the model answer is scripted by `ai`
  const nodes = { 'Mailbox Config': cfg, 'Normalize and Filter': N, 'Thread State': T, 'Order Lookup': lookup };
  nodes['Decision Gate'] = run('decision-gate.js', ai, nodes);
  nodes['Send Plan'] = run('send-plan.js', {}, nodes);
  let finalInput = {};
  if (nodes['Send Plan'].send === true) {
    nodes['Claim Send'] = db.claimSend(T.thread_id, N.provider_message_id, cfg.max_auto_replies);
    if (nodes['Claim Send'].claimed === true) {
      nodes['Build Reply'] = run('build-reply.js', {}, nodes);
      let sendResult;
      if (sendNodeDisabled) sendResult = nodes['Build Reply']; // a disabled node passes its input through
      else { trace.gmailCalls += 1; trace.request = nodes['Build Reply']; sendResult = gmail(nodes['Build Reply']); }
      nodes['Send Outcome'] = run('send-outcome.js', sendResult, nodes);
      if (recordFails) finalInput = { error: { message: 'permission denied for table email_events' } };
      else db.events.push({ event_type: nodes['Send Outcome'].event_type, in_reply_to: nodes['Send Outcome'].in_reply_to, gmail_message_id: nodes['Send Outcome'].gmail_message_id, to: nodes['Send Outcome'].to });
    }
  }
  const FSt = run('final-status.js', finalInput, nodes);
  const fin = db.finish(T.thread_id, N.provider_message_id, FSt.thread_status, FSt.status_reason);
  if (fin.applied && FSt.notify_owner) trace.alerts.push(FSt.status_reason);
  return { ...trace, end: fin.applied ? (FSt.notify_owner ? 'Owner Alert' : 'Replied') : 'Late Result', gate: nodes['Decision Gate'], plan: nodes['Send Plan'], outcome: nodes['Send Outcome'], final: FSt, thread: [...db.threads.values()][0] };
};
const decodeRaw = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

// ---- sending ----
test('reply path: a routine reply is sent once, to the customer, threaded, and its Gmail id is recorded', () => {
  const r = handle(mail());
  assert.equal(r.end, 'Replied');
  assert.equal(r.gmailCalls, 1);
  assert.deepEqual(r.alerts, []);
  assert.equal(r.thread.status, 'replied');
  assert.equal(r.thread.auto_reply_count, 1);
  const sent = r.db.events.find((e) => e.event_type === 'reply_sent');
  assert.deepEqual([sent.gmail_message_id, sent.to, sent.in_reply_to], ['gm-1', 'pat@example.com', 'm1']);
  const mime = decodeRaw(r.request.request_body.raw);
  assert.match(mime, /^To: pat@example\.com\r\n/);
  assert.match(mime, /\r\nIn-Reply-To: <abc123@mail\.example\.com>\r\n/);
  assert.match(mime, /\r\nReferences: <abc123@mail\.example\.com>\r\n/);
  assert.equal(r.request.request_body.threadId, 't1');
  assert.equal((mime.match(/^To:/gm) || []).length, 1);
  assert.doesNotMatch(mime, /^(Cc|Bcc):/m);
  const body = Buffer.from(mime.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.equal(body.replace(/\r\n/g, '\n'), GOOD_DRAFT.reply_text);
});
test('reply path: the three locks each stop a send on their own (shadow, sending switched off, disabled node)', () => {
  const shadow = handle(mail(), { cfg: { ...LIVE, shadow: true } });
  assert.deepEqual([shadow.gmailCalls, shadow.end, shadow.plan.send], [0, 'Owner Alert', false]);
  assert.match(shadow.final.status_reason, /Shadow mode/);
  const off = handle(mail(), { cfg: { ...LIVE, sending_enabled: false } });
  assert.deepEqual([off.gmailCalls, off.end], [0, 'Owner Alert']);
  assert.match(off.final.status_reason, /not sent: sending is switched off/);
  assert.equal(off.thread.auto_reply_count, 0);
  const disabled = handle(mail(), { sendNodeDisabled: true });
  assert.equal(disabled.gmailCalls, 0);
  assert.equal(disabled.outcome.state, 'unknown');
  assert.equal(disabled.end, 'Owner Alert');
  // As live since 2026-10-06: shadow off, no address limit, general categories only, forwarded mail held.
  assert.deepEqual([BUILT.shadow, BUILT.sending_enabled, BUILT.send_only_to, BUILT.hold_forwarded, BUILT.max_auto_replies],
    [false, true, [], false, 1]);
  assert.deepEqual(BUILT.auto_send_categories, ['how_it_works', 'pricing', 'thanks']);
});
test('reply path: with shadow off, a reply goes to the test address only; everyone else gets a held draft', () => {
  const cfg = { ...BUILT, launch_cutoff: '', shadow: false, send_only_to: ['lizalfond@gmail.com'] };
  const other = handle(mail(), { cfg });
  assert.deepEqual([other.gmailCalls, other.end], [0, 'Owner Alert']);
  assert.match(other.final.status_reason, /not sent: sending is limited to the test address for now/);
  assert.equal(other.thread.auto_reply_count, 0);
  const test = handle(mail({ from: { value: [{ address: 'lizalfond@gmail.com', name: 'Elizabeth Alfond' }] } }), { cfg });
  assert.deepEqual([test.gmailCalls, test.end, test.thread.status], [1, 'Replied', 'replied']);
  assert.match(decodeRaw(test.request.request_body.raw), /^To: lizalfond@gmail\.com\r\n/);
});
test('reply path: the reply never goes to a Reply-To address, an unverified sender, or back to our own mailboxes', () => {
  const replyTo = handle(mail({ replyTo: { value: [{ address: 'attacker@example.net' }] } }));
  assert.equal(replyTo.gmailCalls, 0);
  assert.match(replyTo.final.status_reason, /different address than the sender/);
  const unverified = handle(mail({ headers: {} }));
  assert.equal(unverified.gmailCalls, 0);
  assert.match(unverified.final.status_reason, /could not be verified/);
  const forwarded = handle(mail({ from: { value: [{ address: 'ideatoplanincome@gmail.com' }] } }));
  assert.equal(forwarded.gmailCalls, 0);
  assert.match(forwarded.final.status_reason, /reply would go back to the mailbox/);
  const noId = handle(mail({ messageId: '' }));
  assert.equal(noId.gmailCalls, 0);
  assert.match(noId.final.status_reason, /no Message-ID/);
});
test('reply path: an escalated email is never sent, whatever the switches say', () => {
  const r = handle(mail({ subject: 'Refund request', text: 'I would like a refund for my IdeaToPlan business plan.' }), { ai: { category: 'refund', confidence: 0.99, needs_owner: true, reply_text: '' } });
  assert.deepEqual([r.gmailCalls, r.end, r.plan.wanted], [0, 'Owner Alert', false]);
  assert.equal(r.thread.status, 'needs_attention');
});

// ---- which categories are answered automatically ----
test('categories: how it works, pricing and thanks are sent; order status and delivery timing are held for the owner', () => {
  assert.deepEqual(BUILT.auto_send_categories, ['how_it_works', 'pricing', 'thanks']);
  const ONE_ORDER = { id: 'o1', email: 'pat@example.com', status: 'generated', package: 'Starter', submitted_at: new Date().toISOString(), plan_generated_at: new Date().toISOString(), delivered_at: null };
  const draft = (category, reply_text) => ({ category, confidence: 0.97, needs_owner: false, reply_text });
  const SIGN = '\n\nElizabeth Alfond, IdeaToPlan';
  for (const [category, text] of [
    ['how_it_works', 'Hi Pat,\n\nYou submit details about your business idea and receive a written business plan as a PDF.' + SIGN],
    ['pricing', GOOD_DRAFT.reply_text],
    ['thanks', 'Hi Pat,\n\nYou can reply by email with questions about your plan.' + SIGN],
  ]) {
    const r = handle(mail(), { ai: draft(category, text) });
    assert.deepEqual([category, r.gate.outcome, r.gmailCalls, r.end], [category, 'reply', 1, 'Replied']);
  }
  for (const category of ['order_status', 'delivery_timing']) {
    const db = makeDb();
    // A draft the gate itself approves: verified sender, exactly one order, no date, no promise.
    const r = handle(mail({ subject: 'My IdeaToPlan order', text: 'Has my IdeaToPlan plan been generated?' }),
      { db, orders: [ONE_ORDER], ai: draft(category, 'Hi Pat,\n\nYour order is recorded and your plan has been generated. Standard plans are typically delivered within 72 hours of submission.' + SIGN) });
    assert.deepEqual([category, r.gate.outcome, r.gate.send_to_customer], [category, 'reply', true], JSON.stringify(r.gate.reasons));
    assert.equal(r.gmailCalls, 0, category);
    assert.equal(r.end, 'Owner Alert');
    assert.match(r.final.status_reason, new RegExp('drafted but not sent: questions in the category "' + category + '" are held for the owner'));
    assert.equal(r.thread.status, 'needs_attention');
    assert.equal(r.thread.auto_reply_count, 0);
    assert.ok(!db.events.some((e) => e.event_type === 'send_claimed' || e.event_type === 'reply_sent'));
  }
});
test('categories: a missing or empty list sends nothing, and escalation categories never reach the send decision', () => {
  for (const cfg of [{ ...LIVE, auto_send_categories: [] }, (() => { const c = { ...LIVE }; delete c.auto_send_categories; return c; })()]) {
    const r = handle(mail(), { cfg });
    assert.deepEqual([r.gmailCalls, r.end], [0, 'Owner Alert']);
    assert.match(r.final.status_reason, /held for the owner/);
  }
  // Even if a non-routine category were listed by mistake, the gate escalates it before any send is planned.
  const cfg = { ...LIVE, auto_send_categories: ['how_it_works', 'pricing', 'thanks', 'refund', 'complaint', 'legal', 'privacy', 'payment_dispute', 'cancellation'] };
  for (const category of ['refund', 'complaint', 'legal', 'privacy', 'payment_dispute', 'cancellation']) {
    const r = handle(mail(), { cfg, ai: { category, confidence: 0.99, needs_owner: false, reply_text: 'Hi Pat,\n\nStarter is $25.\n\nElizabeth Alfond, IdeaToPlan' } });
    assert.deepEqual([category, r.gate.outcome, r.plan.wanted, r.gmailCalls], [category, 'escalate', false, 0]);
  }
});

// ---- mail forwarded from the public Gmail address ----
test('forwarding: with the hold switched on, forwarded mail keeps the customer as sender, is in scope, is drafted, and is held', () => {
  const HELD = { ...LIVE, hold_forwarded: true };
  const plain = { subject: 'Hello', text: 'How does it work and what does it cost?' };
  // Gmail automatic forwarding keeps From and To as the customer wrote them and adds X-Forwarded headers.
  const byTo = handle(mail({ ...plain, to: { value: [{ address: 'ideatoplanincome@gmail.com' }] } }), { cfg: HELD });
  const byHeader = handle(mail({ ...plain, to: { value: [{ address: 'undisclosed@example.org' }] },
    headers: { ...VERIFIED, 'x-forwarded-for': 'X-Forwarded-For: ideatoplanincome@gmail.com liz@ideatoplan.to', 'x-forwarded-to': 'X-Forwarded-To: liz@ideatoplan.to' } }), { cfg: HELD });
  for (const r of [byTo, byHeader]) {
    assert.equal(r.N.customer_email, 'pat@example.com');
    assert.equal(r.N.via_public_address, true);
    assert.match(r.scope.scope_reason, /public IdeaToPlan address/);
    assert.deepEqual([r.gate.outcome, r.gmailCalls, r.end], ['reply', 0, 'Owner Alert']);
    assert.match(r.final.status_reason, /drafted but not sent: this email came through the forwarded public mailbox/);
    assert.equal(r.thread.auto_reply_count, 0);
  }
  // Mail written straight to the mailbox is not affected.
  assert.equal(handle(mail()).N.via_public_address, false);
  assert.equal(handle(mail()).gmailCalls, 1);
});
test('forwarding: if forwarding breaks sender verification, the reply is held, never sent on weaker evidence', () => {
  const unverified = { 'authentication-results': 'mx.google.com; dkim=fail; spf=softfail; dmarc=fail', 'x-forwarded-for': 'ideatoplanincome@gmail.com liz@ideatoplan.to' };
  for (const cfg of [LIVE, { ...LIVE, hold_forwarded: true }]) {
    const r = handle(mail({ subject: 'Hello', text: 'How does it work?', headers: unverified, to: { value: [{ address: 'ideatoplanincome@gmail.com' }] } }), { cfg });
    assert.equal(r.N.sender_verified, false);
    assert.equal(r.gmailCalls, 0);
    assert.match(r.final.status_reason, /could not be verified/);
  }
  // As live: the hold is lifted, so with verification intact a forwarded general question is answered, to the customer.
  const ok = handle(mail({ subject: 'Hello', text: 'How does it work?', to: { value: [{ address: 'ideatoplanincome@gmail.com' }] } }));
  // A forwarded order question is still held, like any direct one.
  const order = handle(mail({ subject: 'Hello', text: 'Has my plan been generated?', to: { value: [{ address: 'ideatoplanincome@gmail.com' }] } }),
    { orders: [{ id: 'o1', email: 'pat@example.com', status: 'generated', package: 'Starter', submitted_at: new Date().toISOString(), plan_generated_at: new Date().toISOString(), delivered_at: null }],
      ai: { category: 'order_status', confidence: 0.97, needs_owner: false, reply_text: 'Hi Pat,\n\nYour order is recorded and your plan has been generated.\n\nElizabeth Alfond, IdeaToPlan' } });
  assert.equal(order.gmailCalls, 0);
  assert.match(order.final.status_reason, /category "order_status" are held for the owner/);
  assert.equal(ok.gmailCalls, 1);
  assert.match(decodeRaw(ok.request.request_body.raw), /^To: pat@example\.com\r\n/);
});
test('approved text: the plan review sentence is the first-person wording, and a reply using it passes the gate', () => {
  assert.ok(BUILT.approved_info.includes('Business plans are drafted using AI and reviewed by me before delivery. A plan is sent only after I approve it.'));
  assert.ok(!/Nothing is sent automatically|reviewed by a person/.test(BUILT.approved_info));
  const r = handle(mail(), { ai: { category: 'how_it_works', confidence: 0.95, needs_owner: false,
    reply_text: 'Hi Pat,\n\nYou submit details about your business idea and receive a written business plan as a PDF. Business plans are drafted using AI and reviewed by me before delivery. A plan is sent only after I approve it.\n\nElizabeth Alfond, IdeaToPlan' } });
  assert.deepEqual(r.gate.reasons, []);
  assert.equal(r.end, 'Replied');
});

test('forwarding: Gmail\'s own forwarding confirmation and other no-reply senders are ignored, real people are not', () => {
  for (const address of ['forwarding-noreply@google.com', 'noreply@stripe.com', 'accounts-no-reply@example.com', 'team.notifications@example.com', 'mailer-daemon@googlemail.com']) {
    const db = makeDb();
    const r = handle(mail({ from: { value: [{ address }] }, subject: 'Gmail Forwarding Confirmation', text: 'ideatoplanincome@gmail.com has requested to automatically forward mail to liz@ideatoplan.to. Confirmation code: 000000' }), { db });
    assert.equal(r.end, 'Not Customer Mail', address);
    assert.deepEqual([r.modelCalls, r.gmailCalls, db.threads.size], [0, 0, 0], address);
  }
  for (const address of ['noreen.reply@example.com', 'albert@example.com', 'pat@example.com']) {
    assert.equal(handle(mail({ from: { value: [{ address }] } })).N.action, 'handle', address);
  }
});

// ---- uncertain outcomes ----
test('reply path: Gmail refusing the request (4xx) is "not sent", told to the owner, and not retried', () => {
  for (const error of [{ message: '400 - Invalid To header', httpCode: '400' }, { message: 'Request failed with status code 403' }, { message: 'Too many requests', httpCode: 429 }]) {
    const r = handle(mail(), { gmail: () => ({ error }) });
    assert.equal(r.outcome.state, 'not_sent');
    assert.equal(r.gmailCalls, 1);
    assert.equal(r.end, 'Owner Alert');
    assert.match(r.alerts[0], /NOT sent/);
    assert.ok(r.db.events.some((e) => e.event_type === 'send_failed'));
    assert.ok(!r.db.events.some((e) => e.event_type === 'reply_sent'));
  }
});
test('reply path: a timeout, a dropped connection, a 5xx or an empty answer is "unknown": owner told to check Sent, never resent', () => {
  for (const result of [{ error: { message: 'timeout of 30000ms exceeded' } }, { error: { message: 'socket hang up', code: 'ECONNRESET' } },
    { error: { message: '503 - Service Unavailable', httpCode: '503' } }, { error: { message: 'Request Timeout', httpCode: 408 } }, {}, { error: 'unknown' }]) {
    const db = makeDb();
    const r = handle(mail(), { db, gmail: () => result });
    assert.equal(r.outcome.state, 'unknown', JSON.stringify(result));
    assert.equal(r.gmailCalls, 1);
    assert.match(r.alerts[0], /may or may not have reached pat@example\.com.*Check the Sent folder.*not be sent again automatically/);
    assert.equal(r.thread.status, 'needs_attention');
    assert.ok(db.events.some((e) => e.event_type === 'send_unknown'));
    // The same message handed in again, even if the conversation claim were somehow won again, cannot send.
    const again = handle(mail(), { db, reclaimInsteadOfNewMessage: true });
    assert.equal(again.gmailCalls, 0);
    // A new message in the same conversation cannot be auto-answered either: the reply limit is used.
    const next = handle(mail({ id: 'm2', messageId: '<def456@mail.example.com>' }), { db });
    assert.equal(next.gmailCalls, 0);
    assert.match(next.final.status_reason, /reply limit|already waiting/);
  }
});
test('reply path: sent but the history write failed: the owner is told it WAS sent, with the Gmail id, and it is not resent', () => {
  const db = makeDb();
  const r = handle(mail(), { db, recordFails: true });
  assert.equal(r.gmailCalls, 1);
  assert.equal(r.end, 'Owner Alert');
  assert.match(r.alerts[0], /WAS sent to pat@example\.com \(Gmail message gm-1\) but could not be recorded\. Do not send it again\./);
  assert.equal(r.thread.status, 'needs_attention');
  assert.equal(handle(mail(), { db }).end, 'Not Claimed');
  assert.equal(handle(mail(), { db, reclaimInsteadOfNewMessage: true }).gmailCalls, 0);
});
test('reply path: the same message processed twice sends once', () => {
  const db = makeDb();
  assert.equal(handle(mail(), { db }).gmailCalls, 1);
  const second = handle(mail(), { db });
  assert.deepEqual([second.end, second.gmailCalls], ['Not Claimed', 0]);
  assert.equal(db.events.filter((e) => e.event_type === 'reply_sent').length, 1);
});
test('reply path: header injection through the subject is not possible', () => {
  const r = handle(mail({ subject: 'Pricing\r\nBcc: attacker@example.net' }));
  const mime = decodeRaw(r.request.request_body.raw);
  assert.doesNotMatch(mime.split('\r\n\r\n')[0], /^Bcc:/m);
  assert.equal(mime.split('\r\n\r\n')[0].split('\r\n').length, 7);
});

// ---- narrow scope filter ----
const UNCLEAR = { category: 'unclear', confidence: 0.4, needs_owner: true, reply_text: '' };
const ORDER = { id: 'o1', email: 'pat@example.com', status: 'generated', package: 'Starter', submitted_at: new Date().toISOString(), plan_generated_at: null, delivered_at: null };
test('scope: an existing customer, an existing conversation, the I2P address, or the name IdeaToPlan puts mail in scope', () => {
  const plain = { subject: 'Quick question', text: 'Can you help me with something?' };
  const customer = handle(mail(plain), { orders: [ORDER], ai: UNCLEAR });
  assert.match(customer.scope.scope_reason, /order on record/);
  const viaPublic = handle(mail({ ...plain, to: { value: [{ address: 'IdeaToPlanIncome@gmail.com' }] } }), { ai: UNCLEAR });
  assert.match(viaPublic.scope.scope_reason, /public IdeaToPlan address/);
  for (const text of ['I saw IdeaToPlan online, how does it work?', 'Question about Idea To Plan pricing', 'Is idea-to-plan right for me?', 'I found you at ideatoplan.to']) {
    assert.match(handle(mail({ subject: 'Hello', text }), { ai: UNCLEAR }).scope.scope_reason, /names IdeaToPlan/, text);
  }
  // A follow-up with no name and no order is in scope because its conversation is already on record.
  const db = makeDb();
  assert.equal(handle(mail({ subject: 'Hello', text: 'How does IdeaToPlan work?' }), { db, ai: UNCLEAR }).end, 'Owner Alert');
  const followUp = handle(mail({ id: 'm2', messageId: '<def456@mail.example.com>', subject: 'Re: Hello', text: 'Thanks, one more thing.' }), { db, ai: UNCLEAR });
  assert.match(followUp.scope.scope_reason, /conversation is already on record/);
});
test('scope: generic words alone are ambiguous, and ambiguous mail is left in the inbox untouched', () => {
  const ambiguous = [
    ['Where is my order', 'Hi, my order has not arrived yet.'],
    ['Business plan', 'Can you look over the business plan I attached before Friday?'],
    ['Starter plan', 'Your starter plan renews next month. Growth plan pricing is changing.'],
    ['My plan', 'What happened to my plan? I would like a refund.'],
    ['Skills matcher', 'Do you know a good skills matcher tool?'],
    ['Lunch on Friday?', 'Are you free at noon?'],
    ['Invoice 4471', 'Please find attached the invoice for hosting.'],
    ['Partnership', 'I run an agency and would love to collaborate on your idea, the plan is simple.'],
  ];
  for (const [subject, text] of ambiguous) {
    const db = makeDb();
    const r = handle(mail({ subject, text }), { db });
    assert.equal(r.end, 'Out Of Scope', subject);
    assert.match(r.scope.scope_reason, /left in the inbox for manual review/);
    assert.deepEqual([r.modelCalls, r.gmailCalls, r.alerts.length, db.threads.size, db.events.length], [0, 0, 0, 0, 0], subject);
  }
});

// ---- both limits: one send per message, one automated reply per conversation ----
test('limits: after one automated reply, a NEW message id in the same conversation cannot get a second one', () => {
  const db = makeDb();
  const first = handle(mail({ text: 'How much is the IdeaToPlan Starter plan?' }), { db });
  assert.deepEqual([first.end, first.gmailCalls], ['Replied', 1]);
  // A new message, new id, same conversation, and a draft the gate would otherwise approve.
  for (const id of ['m2', 'm3']) {
    const next = handle(mail({ id, messageId: '<' + id + '@mail.example.com>', text: 'And how do I pay?' }), { db });
    assert.equal(next.gmailCalls, 0, id);
    assert.equal(next.end, 'Owner Alert');
    assert.match(next.final.status_reason, /already had 1 automated reply/);
    assert.equal(next.plan.wanted, false);
  }
  assert.equal([...db.threads.values()][0].auto_reply_count, 1);
  assert.equal(db.events.filter((e) => e.event_type === 'reply_sent').length, 1);
  assert.equal(db.events.filter((e) => e.event_type === 'send_claimed').length, 1);
});
test('limits: even if the gate were bypassed, the database claim refuses the second reply in a conversation', () => {
  const db = makeDb();
  handle(mail({ text: 'How much is the IdeaToPlan Starter plan?' }), { db });
  const t = [...db.threads.values()][0];
  Object.assign(t, { status: 'processing', processing_message_id: 'm9' });
  assert.deepEqual(db.claimSend(t.id, 'm9', LIVE.max_auto_replies), { claimed: false, reason: 'the automated reply limit for this conversation is reached' });
  assert.equal(LIVE.max_auto_replies, 1);
  const sql = readFileSync(join(root, '004_reply_send.sql'), 'utf8');
  assert.match(sql, /if t\.auto_reply_count >= p_max then/);
  assert.match(sql, /create unique index email_events_one_send_claim_per_message/);
  assert.match(readFileSync(join(root, '004_selftest_ROLLS_BACK.sql'), 'utf8'), /per-conversation reply limit holds for a later message/);
});

// ---- the whole request is bounded ----
test('budget: the size limit covers the whole request, and an oversized request makes no model call', () => {
  const build = (msg, orders, cfg = LIVE) => run('build-ai-request.js', {}, { 'Mailbox Config': cfg, 'Normalize and Filter': msg, 'Order Lookup': { orders } });
  const tenOrders = Array.from({ length: 10 }, () => ({ package: 'Bank Loan / Investor plan', status: 'awaiting_approval', submitted_at: '2026-10-06T06:47:10.303983+00:00', plan_generated_at: '2026-10-06T06:57:27.752+00:00', delivered_at: '2026-10-06T06:57:27.752+00:00' }));
  const han = String.fromCharCode(0x6f22);
  const N = run('normalize-filter.js', LIVE, { 'Mailbox Config': LIVE, 'One Email': mail({ subject: han.repeat(400), text: han.repeat(9000), from: { value: [{ address: 'pat@example.com', name: han.repeat(300) }] } }) });
  const worst = build(N, tenOrders);
  const sys = worst.request_body.messages[0].content, usr = worst.request_body.messages[1].content;
  assert.equal(worst.request_bytes, Buffer.byteLength(sys, 'utf8') + Buffer.byteLength(usr, 'utf8'));
  for (const part of ['APPROVED INFORMATION', 'ORDER FACTS', 'Order 10:', 'Plain text only']) assert.ok(sys.includes(part), part);
  assert.ok(usr.includes('Subject: ') && usr.includes('From: '));
  assert.ok(worst.request_bytes <= LIVE.max_request_bytes, 'the largest request the caps allow fits: ' + worst.request_bytes);
  assert.equal(worst.too_large, false);
  assert.equal(worst.request_body.max_tokens, 700);
  const tight = build(N, tenOrders, { ...LIVE, max_request_bytes: 5000 });
  assert.equal(tight.too_large, true);
  const none = run('no-model-call.js', {}, { 'Claim Model Call': { allowed: true, calls_used: 1, calls_max: 300 }, 'Build AI Request': tight });
  assert.match(none.no_model_call, /larger than the size limit/);
  assert.match(wf.nodes.find((n) => n.name === 'Call Allowed?').parameters.conditions.conditions[0].leftValue, /too_large !== true/);
});
test('workflow file (prepared): scope is checked before anything is recorded, and Send Reply has one way in', () => {
  const c = wf.connections;
  assert.equal(c['Customer Mail?'].main[0][0].node, 'Fetch Orders');
  assert.equal(c['Order Lookup'].main[0][0].node, 'Known Conversation');
  assert.equal(c['Known Conversation'].main[0][0].node, 'In Scope');
  assert.equal(wf.nodes.find((n) => n.name === 'Known Conversation').parameters.method, 'GET');
  assert.equal(c['In Scope?'].main[0][0].node, 'Thread State');
  assert.equal(c['In Scope?'].main[1][0].node, 'Out Of Scope');
  assert.equal(c['Claimed?'].main[0][0].node, 'Build AI Request');
  const into = (name) => Object.entries(c).filter(([, v]) => v.main.some((o) => (o || []).some((t) => t.node === name))).map(([k]) => k);
  assert.deepEqual(into('Send Reply'), ['Build Reply']);
  assert.deepEqual(into('Build Reply'), ['Send Claimed?']);
  assert.deepEqual(into('Claim Send'), ['Send Planned?']);
  assert.equal(c['Send Claimed?'].main[0][0].node, 'Build Reply');
  assert.deepEqual(into('Finish'), ['Final Status']);
  // Found by the n8n runtime check on 2026-10-06: Thread State no longer follows Normalize, so it must not read its input.
  assert.doesNotMatch(wf.nodes.find((n) => n.name === 'Thread State').parameters.jsonBody, /\$json\./);
  const send = wf.nodes.find((n) => n.name === 'Send Reply');
  assert.deepEqual([send.disabled, send.retryOnFail, send.onError], [undefined, false, 'continueErrorOutput']);
  assert.match(wf.nodes.find((n) => n.name === 'Claim Send').parameters.url, /\/rpc\/email_claim_send$/);
  const names = wf.nodes.map((n) => n.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(wf.nodes.map((n) => n.id)).size, wf.nodes.length);
  for (const [from, v] of Object.entries(c)) { assert.ok(names.includes(from), from); for (const o of v.main) for (const t of o || []) assert.ok(names.includes(t.node), t.node); }
  // Every other node that sends mail still sends only to the owner.
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.gmail')) assert.equal(n.parameters.sendTo, 'liz@ideatoplan.to');
});
