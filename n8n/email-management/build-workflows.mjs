// Builds the importable n8n workflow files from the node code in ./nodes.
// Run: node n8n/email-management/build-workflows.mjs
// Output: ./workflows/*.workflow.json. This script only writes files. It does not talk to n8n.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const code = (f) => readFileSync(join(here, 'nodes', f), 'utf8');
const SUPA = 'https://yglmlnfsyzsvozxirlpo.supabase.co/rest/v1';
const supaCred = { supabaseApi: { id: 'oxQOdBDbGP7WmsX1', name: 'Supabase account' } };
const gmailCred = { gmailOAuth2: { id: 'eKUvaAAgyww27rSu', name: 'Gmail account' } };
// The bearer credential the live pipeline already uses for its OpenRouter HTTP calls.
const openRouterCred = { httpBearerAuth: { id: 'zeH7yl8iNbDhIjLz', name: 'Bearer Auth account' } };
const OWNER = 'liz@ideatoplan.to';
const N = "$('Normalize and Filter').first().json";
const T = "$('Thread State').first().json";
const G = "$('Decision Gate').first().json";

let seq = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: 'e' + String(++seq).padStart(2, '0'), name, type, typeVersion, position, parameters, ...extra });
const supa = (name, position, method, path, body, extra = {}) => node(name, 'n8n-nodes-base.httpRequest', 4.2, position, {
  method, url: '=' + SUPA + path, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
  ...(body ? { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: body } : {}), options: {},
}, { credentials: supaCred, retryOnFail: false, ...extra });
const codeNode = (name, position, file) => node(name, 'n8n-nodes-base.code', 2, position, { jsCode: code(file) });
const ifNode = (name, position, expr) => node(name, 'n8n-nodes-base.if', 2.2, position, {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: 'c1', leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} });
const stop = (name, position, notes) => node(name, 'n8n-nodes-base.noOp', 1, position, {}, { notes });
// Owner alerts leave by their error output when the send fails, so the failure is written to the database too.
const ownerMail = (name, position, subject, message) => node(name, 'n8n-nodes-base.gmail', 2.2, position,
  { sendTo: OWNER, subject, emailType: 'text', message, options: { appendAttribution: false } },
  { credentials: gmailCred, retryOnFail: false, onError: 'continueErrorOutput',
    notes: 'OWNER ALERT ONLY. The recipient is fixed to ' + OWNER + '. This workflow has no node that emails a customer.' });
const event = (name, position, threadExpr, type, summaryExpr, detailExpr = '{}') => supa(name, position, 'POST', '/email_events',
  `={{ { thread_id: ${threadExpr}, event_type: '${type}', direction: 'internal', actor: 'system', summary: ${summaryExpr}, detail: ${detailExpr} } }}`);
const link = (c, from, to, output = 0) => {
  c[from] = c[from] || { main: [] };
  while (c[from].main.length <= output) c[from].main.push([]);
  c[from].main[output].push({ node: to, type: 'main', index: 0 });
};
const errText = "String(($json.error && ($json.error.message || $json.error)) || 'unknown').slice(0, 500)";

// ---------------------------------------------------------------------------------------------------------
// 1. I2P inbound email, SHADOW MODE
// ---------------------------------------------------------------------------------------------------------
const mailboxConfig = {
  brand: 'i2p', brand_name: 'IdeaToPlan', mailbox: OWNER,
  own_addresses: ['noreply@send.quityourlifeandtravel.com'],
  public_addresses: ['ideatoplanincome@gmail.com'],
  system_subject_prefixes: ['[I2P inbox]', 'ALERT: n8n failure', 'Approve:', 'TEST COPY', 'Sent but not recorded', 'Not sent:',
    'Delivery failed', 'Check Sent folder', 'HELD,', 'New plan submission', 'FAILED submission', 'New Visa waitlist', 'New Skills Matcher lead'],
  shadow: true,
  // Launch guards for the acceptance checks (2026-10-06): nothing dated before the cutoff, only the test
  // sender, at most six model calls. The count is kept in the database (email_claim_model_call), and the
  // stored limit for a scope can be lowered here but not raised.
  launch_cutoff: '2026-10-06T06:50:00Z', acceptance_senders: ['lizalfond@gmail.com'],
  budget_scope: 'i2p-acceptance-2026-10-06', max_model_calls: 6,
  min_confidence: 0.8, max_auto_replies: 1,
  approved_money: ['$25', '$50'], approved_durations: ['72 hours', '90-day'],
  model: 'anthropic/claude-sonnet-4.6',
  // Signed off by Liz on 2026-10-06. The text lives in approved-info-i2p.APPROVED.txt; change it there, then rebuild.
  approved_info: readFileSync(join(here, 'approved-info-i2p.APPROVED.txt'), 'utf8').trim(),
};
seq = 0;
const y = 0, yf = 280;
const a = [
  node('One Email', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, [0, y], { inputSource: 'passthrough' },
    { notes: 'Started once per email by the inbox poller, so each email has its own execution. One ignored, duplicate or failed email cannot affect another.' }),
  node('Mailbox Config', 'n8n-nodes-base.set', 3.4, [220, y], { mode: 'raw', jsonOutput: JSON.stringify(mailboxConfig, null, 2), options: {} },
    { notes: 'shadow: true means nothing is ever sent to a customer. approved_info must be pasted after sign-off, or no model call is made.' }),
  codeNode('Normalize and Filter', [440, y], 'normalize-filter.js'),
  ifNode('Customer Mail?', [660, y], "={{ $json.action === 'handle' }}"),
  supa('Thread State', [880, y], 'POST', '/rpc/email_claim_message',
    "={{ { p_brand: $json.brand, p_mailbox: $json.mailbox, p_provider: $json.provider, p_provider_thread_id: $json.provider_thread_id, p_provider_message_id: $json.provider_message_id, p_customer_email: $json.customer_email, p_customer_name: $json.customer_name || null, p_subject: $json.subject, p_body: $json.text } }}",
    { notes: 'ATOMIC CLAIM. One database transaction records the message and claims the conversation. A duplicate message, or a conversation another execution is handling, comes back with claimed = false.' }),
  ifNode('Claimed?', [1100, y], '={{ $json.claimed === true }}'),
  supa('Fetch Orders', [1320, y], 'GET', `/idea_submissions?email=ilike.{{ encodeURIComponent(${N}.customer_email) }}&select=id,email,status,package,submitted_at,plan_generated_at,delivered_at&order=submitted_at.desc&limit=10`, null, { alwaysOutputData: true }),
  codeNode('Order Lookup', [1540, y], 'order-lookup.js'),
  codeNode('Build AI Request', [1760, y], 'build-ai-request.js'),
  node('AI Draft', 'n8n-nodes-base.httpRequest', 4.2, [1980, y],
    { method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: "={{ $('Build AI Request').first().json.request_body }}", options: { timeout: 60000 } },
    { credentials: openRouterCred, retryOnFail: false, onError: 'continueErrorOutput', notes: 'PAID CALL, one per handled email, capped at 700 output tokens. Failure leaves by the error output and is recorded as failed.' }),
  codeNode('Parse AI Answer', [2200, y], 'parse-ai-answer.js'),
  codeNode('Decision Gate', [2420, y], 'decision-gate.js'),
  supa('Record Decision', [2640, y], 'POST', '/email_events',
    `={{ { thread_id: ${T}.thread_id, event_type: $json.outcome === 'escalate' ? 'escalated' : 'draft', direction: 'internal', actor: 'ai', summary: $json.status_reason, body: $json.reply_text, detail: { category: $json.category, confidence: $json.confidence, reasons: $json.reasons, shadow: $json.shadow, in_reply_to: ${N}.provider_message_id } } }}`),
  supa('Finish', [2860, y], 'POST', '/rpc/email_finish_message',
    `={{ { p_thread_id: ${T}.thread_id, p_provider_message_id: ${N}.provider_message_id, p_status: ${G}.thread_status, p_reason: ${G}.status_reason, p_category: ${G}.category, p_submission_id: ${G}.matched_order_id } }}`,
    { notes: 'Applies only while this execution still holds the claim. If the watchdog already failed the conversation, applied is false and no second alert is sent.' }),
  ifNode('Still Ours?', [3080, y], '={{ $json.applied === true }}'),
  ownerMail('Owner Alert', [3300, y],
    `={{ '[I2P inbox] ' + (${G}.outcome === 'escalate' ? 'Needs you: ' : 'Draft to review: ') + ${N}.subject }}`,
    `={{ 'From: ' + ${N}.customer_email + '\\nStatus: ' + $('Finish').first().json.final_status + '\\nWhy: ' + ${G}.status_reason + '\\n\\nTheir email:\\n' + ${N}.text + '\\n\\nSuggested reply (NOT SENT):\\n' + ${G}.reply_text + '\\n\\nConversation ID: ' + ${T}.thread_id }}`),
  event('Record Alert Sent', [3520, y], `${T}.thread_id`, 'owner_alert', "'Alert emailed to " + OWNER + "'", '{ gmail_message_id: $json.id }'),
  // Side branches
  stop('Not Customer Mail', [880, yf], 'Automated mail, newsletters and the automation\'s own messages end here. Nothing is recorded or answered.'),
  stop('Not Claimed', [1320, yf], 'Duplicate message, or the conversation is being handled by another execution. This execution does nothing more and alerts nobody.'),
  stop('Late Result', [3300, yf], 'The conversation was already closed by the watchdog. The decision is in the history; no second alert.'),
  supa('Record Failure', [2200, yf], 'POST', '/email_events',
    `={{ { thread_id: ${T}.thread_id, event_type: 'failed', direction: 'internal', actor: 'system', summary: 'The model call failed. No reply was drafted or sent.', detail: { error: ${errText} } } }}`),
  supa('Finish As Failed', [2420, yf], 'POST', '/rpc/email_finish_message',
    `={{ { p_thread_id: ${T}.thread_id, p_provider_message_id: ${N}.provider_message_id, p_status: 'failed', p_reason: 'The model call failed. No reply was drafted or sent.' } }}`),
  ownerMail('Failure Alert', [2640, yf], `={{ '[I2P inbox] FAILED: ' + ${N}.subject }}`,
    `={{ 'An inbound email could not be handled. Nothing was sent to the customer.\\n\\nFrom: ' + ${N}.customer_email + '\\nConversation ID: ' + ${T}.thread_id + '\\n\\nRead and answer it by hand.' }}`),
  event('Record Alert Failure', [3520, yf], `${T}.thread_id`, 'alert_failed', "'The owner alert email could not be sent. This conversation still needs you.'", `{ error: ${errText} }`),
  // Model call limit. Added last so the ids of the nodes above stay as they were imported.
  supa('Claim Model Call', [1760, -240], 'POST', '/rpc/email_claim_model_call', `={{ { p_scope: ${N}.budget_scope, p_max: ${N}.budget_max } }}`,
    { notes: 'ATOMIC. One database statement counts the call against the limit. Two executions asking at the same moment cannot both get the last call.' }),
  ifNode('Call Allowed?', [1980, -240], `={{ $json.allowed === true && ${N}.dry_run !== true }}`),
  codeNode('No Model Call', [2200, -240], 'no-model-call.js'),
];
const ac = {};
['One Email', 'Mailbox Config', 'Normalize and Filter', 'Customer Mail?'].reduce((p, n) => (p && link(ac, p, n), n), null);
link(ac, 'Customer Mail?', 'Thread State', 0); link(ac, 'Customer Mail?', 'Not Customer Mail', 1);
link(ac, 'Thread State', 'Claimed?');
link(ac, 'Claimed?', 'Fetch Orders', 0); link(ac, 'Claimed?', 'Not Claimed', 1);
['Fetch Orders', 'Order Lookup', 'Build AI Request', 'Claim Model Call', 'Call Allowed?'].reduce((p, n) => (p && link(ac, p, n), n), null);
link(ac, 'Call Allowed?', 'AI Draft', 0); link(ac, 'Call Allowed?', 'No Model Call', 1);
link(ac, 'No Model Call', 'Parse AI Answer');
link(ac, 'AI Draft', 'Parse AI Answer', 0); link(ac, 'AI Draft', 'Record Failure', 1);
['Parse AI Answer', 'Decision Gate', 'Record Decision', 'Finish', 'Still Ours?'].reduce((p, n) => (p && link(ac, p, n), n), null);
link(ac, 'Still Ours?', 'Owner Alert', 0); link(ac, 'Still Ours?', 'Late Result', 1);
link(ac, 'Owner Alert', 'Record Alert Sent', 0); link(ac, 'Owner Alert', 'Record Alert Failure', 1);
['Record Failure', 'Finish As Failed', 'Failure Alert'].reduce((p, n) => (p && link(ac, p, n), n), null);
link(ac, 'Failure Alert', 'Record Alert Failure', 1);

const inboundWorkflow = {
  name: 'I2P Email - Inbound handler (SHADOW, never emails customers)',
  nodes: a, connections: ac,
  settings: { executionOrder: 'v1', timezone: 'Asia/Bangkok', errorWorkflow: 'BFirlikXaAuti0bh' },
};

// ---------------------------------------------------------------------------------------------------------
// 1b. PREPARED next version of the handler: narrow I2P scope filter and the customer reply path.
//     Not applied to n8n. Three locks keep it from sending: shadow is true, sending_enabled is false, and
//     the Send Reply node is disabled. It also needs 004_reply_send.sql, which has not been run.
// ---------------------------------------------------------------------------------------------------------
const FS = "$('Final Status').first().json";
const preparedConfig = {
  ...mailboxConfig,
  // As live in n8n (workflow Cjn4k0oOCYmRHHLV) since 2026-10-06: real mail, I2P scope, 300 calls a month.
  launch_cutoff: '2026-10-06T09:57:00Z', acceptance_senders: [], budget_scope: 'i2p-{month}', max_model_calls: 300,
  // LIVE since 2026-10-06 10:54 UTC, authorized by Liz: shadow is off and there is no address limit.
  // To stop every customer send at once, set shadow back to true.
  shadow: false, sending_enabled: true, send_only_to: [],
  // Answered automatically once shadow is off. order_status and delivery_timing are routine for the gate but
  // are held as drafts for Liz (her decision of 2026-10-06).
  auto_send_categories: ['how_it_works', 'pricing', 'thanks'],
  // Forwarding from the public Gmail address was verified on 2026-10-06 (run 63423) and Liz lifted the hold:
  // forwarded mail is treated like direct mail. Set this to true to hold forwarded replies again.
  hold_forwarded: false,
  // In scope: an existing customer or conversation, mail to a public I2P address, or IdeaToPlan named outright.
  scope: { enabled: true },
  // The whole model request (instructions, approved text, order context, subject and body) may not exceed this.
  max_request_bytes: 14000,
};
const p = JSON.parse(JSON.stringify(a));
const pn = (name) => p.find((n) => n.name === name);
pn('Mailbox Config').parameters.jsonOutput = JSON.stringify(preparedConfig, null, 2);
// Thread State no longer follows Normalize directly, so it reads the message by name, not from its input.
pn('Thread State').parameters.jsonBody = pn('Thread State').parameters.jsonBody.replaceAll('$json.', N + '.');
pn('Finish').parameters.jsonBody = `={{ { p_thread_id: ${T}.thread_id, p_provider_message_id: ${N}.provider_message_id, p_status: ${FS}.thread_status, p_reason: ${FS}.status_reason, p_category: ${G}.category, p_submission_id: ${G}.matched_order_id } }}`;
pn('Owner Alert').parameters.subject = `={{ '[I2P inbox] ' + (${G}.outcome === 'escalate' || ${G}.shadow !== true ? 'Needs you: ' : 'Draft to review: ') + ${N}.subject }}`;
pn('Owner Alert').parameters.message = `={{ 'From: ' + ${N}.customer_email + '\\nStatus: ' + $('Finish').first().json.final_status + '\\nWhy: ' + ${FS}.status_reason + '\\n\\nTheir email:\\n' + ${N}.text + '\\n\\nReply text:\\n' + ${G}.reply_text + '\\n\\nConversation ID: ' + ${T}.thread_id }}`;
seq = 100;
p.push(
  supa('Known Conversation', [880, -480], 'GET', `/email_threads?mailbox=eq.{{ encodeURIComponent(${N}.mailbox) }}&provider_thread_id=eq.{{ encodeURIComponent(${N}.provider_thread_id) }}&select=id&limit=1`, null,
    { alwaysOutputData: true, notes: 'Read only. Is this message part of a conversation that is already on record?' }),
  codeNode('In Scope', [1100, -480], 'scope.js'),
  ifNode('In Scope?', [1320, -480], '={{ $json.in_scope === true }}'),
  stop('Out Of Scope', [1540, -480], 'Not a known customer and not clearly about IdeaToPlan. The email stays in the inbox for manual review: no record, no model call, no alert.'),
  codeNode('Send Plan', [2640, -480], 'send-plan.js'),
  ifNode('Send Planned?', [2860, -480], '={{ $json.send === true }}'),
  supa('Claim Send', [3080, -480], 'POST', '/rpc/email_claim_send',
    `={{ { p_thread_id: ${T}.thread_id, p_in_reply_to: ${N}.provider_message_id, p_max: $('Mailbox Config').first().json.max_auto_replies } }}`,
    { notes: 'ATOMIC. One send claim per customer message, for ever. A rerun or a second execution is refused, so nothing is sent twice.' }),
  ifNode('Send Claimed?', [3300, -480], '={{ $json.claimed === true }}'),
  codeNode('Build Reply', [3520, -480], 'build-reply.js'),
  node('Send Reply', 'n8n-nodes-base.httpRequest', 4.2, [3740, -480],
    { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', authentication: 'predefinedCredentialType', nodeCredentialType: 'gmailOAuth2',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ $json.request_body }}', options: { timeout: 30000 } },
    { credentials: gmailCred, retryOnFail: false, onError: 'continueErrorOutput',
      notes: 'THE ONLY NODE THAT EMAILS A CUSTOMER. Reached only when shadow is off, sending is on, the address is allowed and the send claim is won. Never retried: a timeout is treated as "may have been sent", not as a reason to send again.' }),
  codeNode('Send Outcome', [3960, -480], 'send-outcome.js'),
  supa('Record Send Event', [4180, -480], 'POST', '/email_events',
    `={{ { thread_id: ${T}.thread_id, event_type: $json.event_type, direction: 'outbound', actor: 'system', provider_message_id: $json.gmail_message_id, summary: $json.status_reason, body: $json.state === 'sent' ? ${G}.reply_text : null, detail: { in_reply_to: $json.in_reply_to, to: $json.to, state: $json.state, gmail_thread_id: $json.gmail_thread_id, error: $json.error } } }}`,
    { onError: 'continueErrorOutput', notes: 'Writes the outcome, including the Gmail message id of a sent reply. If this fails, the owner is told the reply WAS sent but not recorded.' }),
  codeNode('Final Status', [4400, -240], 'final-status.js'),
  ifNode('Owner Needed?', [3190, 140], `={{ ${FS}.notify_owner === true }}`),
  stop('Replied', [3300, 420], 'A routine reply was sent and recorded. No alert is needed.'),
);
const pc = JSON.parse(JSON.stringify(ac));
const relink = (from, output, to) => { pc[from].main[output] = [{ node: to, type: 'main', index: 0 }]; };
relink('Customer Mail?', 0, 'Fetch Orders');
relink('Order Lookup', 0, 'Known Conversation');
link(pc, 'Known Conversation', 'In Scope'); link(pc, 'In Scope', 'In Scope?');
pn('Call Allowed?').parameters.conditions.conditions[0].leftValue = `={{ $json.allowed === true && ${N}.dry_run !== true && $('Build AI Request').first().json.too_large !== true }}`; link(pc, 'In Scope?', 'Thread State', 0); link(pc, 'In Scope?', 'Out Of Scope', 1);
relink('Claimed?', 0, 'Build AI Request');
relink('Record Decision', 0, 'Send Plan');
link(pc, 'Send Plan', 'Send Planned?'); link(pc, 'Send Planned?', 'Claim Send', 0); link(pc, 'Send Planned?', 'Final Status', 1);
link(pc, 'Claim Send', 'Send Claimed?'); link(pc, 'Send Claimed?', 'Build Reply', 0); link(pc, 'Send Claimed?', 'Final Status', 1);
link(pc, 'Build Reply', 'Send Reply'); link(pc, 'Send Reply', 'Send Outcome', 0); link(pc, 'Send Reply', 'Send Outcome', 1);
link(pc, 'Send Outcome', 'Record Send Event'); link(pc, 'Record Send Event', 'Final Status', 0); link(pc, 'Record Send Event', 'Final Status', 1);
link(pc, 'Final Status', 'Finish');
relink('Still Ours?', 0, 'Owner Needed?');
link(pc, 'Owner Needed?', 'Owner Alert', 0); link(pc, 'Owner Needed?', 'Replied', 1);
const preparedWorkflow = {
  name: 'I2P Email - Inbound handler v2 (SHADOW, I2P mail only, reply path locked)',
  nodes: p, connections: pc,
  settings: { executionOrder: 'v1', timezone: 'Asia/Bangkok', errorWorkflow: 'BFirlikXaAuti0bh' },
};

// ---------------------------------------------------------------------------------------------------------
// 2. Watchdog: nothing may sit in received or processing unnoticed
// ---------------------------------------------------------------------------------------------------------
seq = 0;
const w = [
  node('Every 15 Minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 0], { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }),
  supa('Fail Stuck', [220, 0], 'POST', '/rpc/email_fail_stuck', '={{ { p_minutes: 20 } }}',
    { alwaysOutputData: true, notes: 'One database statement marks stuck conversations failed, records it, and returns them. Two sweeps cannot both return the same conversation.' }),
  ifNode('Any Stuck?', [440, 0], '={{ !!$json.thread_id }}'),
  ownerMail('Stuck Alert', [660, 0], "={{ '[I2P inbox] FAILED: an email was stuck and was not answered' }}",
    "={{ 'A conversation sat unhandled for more than 20 minutes and is now marked failed. Nothing was sent to the customer.\\n\\nFrom: ' + $json.customer_email + '\\nSubject: ' + $json.subject + '\\nConversation ID: ' + $json.thread_id + '\\n\\nRead and answer it by hand.' }}"),
  event('Record Alert Sent', [880, 0], "$('Any Stuck?').item.json.thread_id", 'owner_alert', "'Stuck alert emailed to " + OWNER + "'", '{ gmail_message_id: $json.id }'),
  event('Record Alert Failure', [880, 260], "$('Any Stuck?').item.json.thread_id", 'alert_failed', "'The stuck alert email could not be sent. This conversation still needs you.'", `{ error: ${errText} }`),
  stop('Nothing Stuck', [660, 260], 'No conversation is stuck.'),
];
const wc = {};
['Every 15 Minutes', 'Fail Stuck', 'Any Stuck?'].reduce((p, n) => (p && link(wc, p, n), n), null);
link(wc, 'Any Stuck?', 'Stuck Alert', 0); link(wc, 'Any Stuck?', 'Nothing Stuck', 1);
link(wc, 'Stuck Alert', 'Record Alert Sent', 0); link(wc, 'Stuck Alert', 'Record Alert Failure', 1);
const watchdogWorkflow = {
  name: 'Email - Watchdog (marks stuck conversations failed and alerts the owner)',
  nodes: w, connections: wc,
  settings: { executionOrder: 'v1', timezone: 'Asia/Bangkok', errorWorkflow: 'BFirlikXaAuti0bh' },
};

// ---------------------------------------------------------------------------------------------------------
// 3. Inbox poller, and the zero-cost batch test. Both start the handler once per email without waiting,
//    so every email runs in its own execution.
// ---------------------------------------------------------------------------------------------------------
const HANDLER_ID = 'NyrlhbzF91PuUiT1';
const handEach = (position) => node('Handle Each Email', 'n8n-nodes-base.executeWorkflow', 1.2, position, {
  source: 'database', workflowId: { __rl: true, value: HANDLER_ID, mode: 'id' },
  workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
  mode: 'each', options: { waitForSubWorkflow: false },
}, { onError: 'continueRegularOutput', notes: 'Runs the handler once for each email and does not wait for it. A failure in one email cannot stop the others.' });
seq = 0;
const pollerWorkflow = {
  name: 'I2P Email - Inbox poller (starts the shadow handler once per email)',
  nodes: [
    node('New Email', 'n8n-nodes-base.gmailTrigger', 1.2, [0, 0],
      { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: false, filters: { labelIds: ['INBOX'] }, options: {} },
      { credentials: gmailCred, notes: 'Reads the ' + OWNER + ' inbox. This workflow sends nothing and decides nothing.' }),
    handEach([220, 0]),
  ],
  connections: { 'New Email': { main: [[{ node: 'Handle Each Email', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1', timezone: 'Asia/Bangkok', errorWorkflow: 'BFirlikXaAuti0bh' },
};
seq = 0;
const batchTestWorkflow = {
  name: 'TEST - I2P Email batch (zero cost: two eligible emails, one ignored, call limit of one)',
  nodes: [
    node('Run Batch Test', 'n8n-nodes-base.manualTrigger', 1, [0, 0], {}),
    node('Three Emails', 'n8n-nodes-base.code', 2, [220, 0], { jsCode: code('batch-test-emails.js') },
      { notes: 'Made-up emails marked as a dry run. A dry run never calls the model and counts against its own limit of one.' }),
    handEach([440, 0]),
  ],
  connections: {
    'Run Batch Test': { main: [[{ node: 'Three Emails', type: 'main', index: 0 }]] },
    'Three Emails': { main: [[{ node: 'Handle Each Email', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Bangkok' },
};

mkdirSync(join(here, 'workflows'), { recursive: true });
for (const [file, wf] of [['i2p-inbound-shadow.workflow.json', inboundWorkflow], ['email-watchdog.workflow.json', watchdogWorkflow],
  ['i2p-inbox-poller.workflow.json', pollerWorkflow], ['i2p-batch-test.workflow.json', batchTestWorkflow],
  ['i2p-inbound-reply-path.PREPARED.workflow.json', preparedWorkflow]]) {
  writeFileSync(join(here, 'workflows', file), JSON.stringify(wf, null, 2) + '\n');
  writeFileSync(join(here, 'workflows', file.replace('.json', '.min.json')), JSON.stringify(wf));
  console.log('wrote', file, '|', wf.nodes.length, 'nodes');
}
