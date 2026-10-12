// Approval by a submitted form, not by a link. Published to the approval workflow 7MAQia1N6jV4bNnc on 2026-10-12.
// Run: node --test n8n/v2-test/tests/approval-confirm.test.mjs
// Offline. It reads the repository's record of the approval workflow (supervised/production/approval-and-delivery.json)
// and evaluates the two routing conditions the way n8n does: each is one JavaScript expression over $json, the item
// the approval node resumes with.
//
// WHY. With n8n's built-in Approve button the email carried a plain link to a signed resume address with
// approved=true, and n8n's send-and-wait handler resumed the execution as approved on a GET of that address
// (packages/nodes-base/utils/sendAndWait/utils.ts, read at n8n 2.20.9). Anything that fetched the link could approve.
// With a form, a GET only draws the page and the decision is a POST.
// WHAT A REAL SUBMISSION LOOKS LIKE. Execution 65621 of the test workflow J38QVQaSFRqMJx0n (2026-10-12): the form,
// submitted from the email, resumed the run with data: { "Decision": "Approve: send this version to the client" }.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { applyConfirm, APPROVE, REQUEST_CHANGES, DECISION_FIELD, APPROVED_EXPR, CHANGES_EXPR } from '../supervised/approval-confirm.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const wf = JSON.parse(readFileSync(path.join(ROOT, 'supervised', 'production', 'approval-and-delivery.json'), 'utf8'));
const node = (w, n) => w.nodes.find((x) => x.name === n);
const expr = (w, n) => node(w, n).parameters.conditions.conditions[0].leftValue;
const evalExpr = (e, $json) => new Function('$json', 'return (' + e.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ');')($json);
// Where an item goes after the approval node: the node on the branch it takes.
const route = (w, $json) => {
  const yes = (n) => evalExpr(expr(w, n), $json) === true;
  const out = (n, i) => (w.connections[n].main[i] || []).map((x) => x.node).join(',');
  if (yes('Approved?')) return out('Approved?', 0);
  return yes('Changes Requested?') ? out('Changes Requested?', 0) : out('Changes Requested?', 1);
};
// The workflow as it was before the change: the same record with the three nodes put back.
const OLD_EMAIL = (p) => ({ operation: 'sendAndWait', sendTo: p.sendTo, subject: p.subject, message: p.message, approvalOptions: { values: { approvalType: 'double', disapproveLabel: 'Request changes' } }, options: { limitWaitTime: p.options.limitWaitTime, appendAttribution: false } });
const before = (() => { const w = clone(wf); node(w, 'Approval Email').parameters = OLD_EMAIL(node(w, 'Approval Email').parameters); node(w, 'Approved?').parameters.conditions.conditions[0].leftValue = '={{ $json.data?.approved === true }}'; node(w, 'Changes Requested?').parameters.conditions.conditions[0].leftValue = '={{ $json.data?.approved === false }}'; return w; })();
// What n8n resumes with for a button of the "approval" kind: a GET with approved=true gives { data: { approved } }.
const GET_APPROVE = { data: { approved: true } };
const form = (choice) => ({ data: { [DECISION_FIELD]: choice } });

test('before the change: what a plain GET of the Approve link produced was routed to the send', () => {
  assert.equal(route(before, GET_APPROVE), 'Claim');
  assert.equal(route(before, { data: { approved: false } }), 'Record Changes Requested');
});

test('the record: the approval node asks for a submitted form and offers no approve link', () => {
  const p = node(wf, 'Approval Email').parameters;
  assert.equal(p.operation, 'sendAndWait');
  assert.equal(p.responseType, 'customForm');
  assert.ok(!('approvalOptions' in p), 'no Approve and Disapprove buttons remain');
  assert.equal(p.sendTo, 'liz@ideatoplan.to');
  const f = p.formFields.values;
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].fieldLabel, f[0].fieldType, f[0].requiredField], [DECISION_FIELD, 'dropdown', true]);
  // The option that holds delivery stands first, so a form sent without a choice cannot approve.
  assert.deepEqual(f[0].fieldOptions.values.map((o) => o.option), [REQUEST_CHANGES, APPROVE]);
  // The wait limit is kept: no response still means no delivery.
  assert.equal(p.options.limitWaitTime.values.resumeAmount, '={{ $json.wait_minutes }}');
  assert.equal(expr(wf, 'Approved?'), APPROVED_EXPR);
  assert.equal(expr(wf, 'Changes Requested?'), CHANGES_EXPR);
});

test('only a submitted form that says Approve reaches the send, as the real submission of execution 65621 did', () => {
  assert.equal(route(wf, { data: { Decision: 'Approve: send this version to the client' } }), 'Claim');
  assert.equal(route(wf, form(APPROVE)), 'Claim');
  assert.equal(route(wf, form(REQUEST_CHANGES)), 'Record Changes Requested');
});

test('what a GET of an approve link would produce no longer approves', () => {
  assert.equal(route(wf, GET_APPROVE), 'Record Timeout');
  assert.equal(route(wf, { data: { approved: 'true' } }), 'Record Timeout');
  assert.equal(route(wf, { data: { approved: true, [DECISION_FIELD]: REQUEST_CHANGES } }), 'Record Changes Requested');
});

test('anything else fails closed, to the branch that records no delivery', () => {
  for (const item of [{}, { data: {} }, { data: null }, form(''), form('approve'), form(APPROVE + ' '), form([APPROVE]), form(true), { data: { decision: APPROVE } }, form('Yes')]) {
    assert.equal(route(wf, item), 'Record Timeout', JSON.stringify(item));
  }
});

test('the change is three nodes, and applying it to the earlier workflow gives exactly this record', () => {
  const again = applyConfirm(before);
  assert.deepEqual(again, wf);
  const changed = wf.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(node(before, n.name))).map((n) => n.name).sort();
  assert.deepEqual(changed, ['Approval Email', 'Approved?', 'Changes Requested?']);
  // It is not applied twice: the conditions it expects are no longer there.
  assert.throws(() => applyConfirm(wf), /is not the condition this patch expects/);
});

test('the claim, the fingerprint check and the customer send are what they were', () => {
  const claim = node(wf, 'Claim').parameters;
  assert.deepEqual(claim.filters.conditions.map((c) => [c.keyName, c.keyValue]).slice(1), [['status', 'awaiting_approval']]);
  assert.equal(claim.fieldsUi.fieldValues.find((x) => x.fieldId === 'status').fieldValue, 'sending');
  assert.equal(expr(wf, 'Claimed?'), '={{ !!$json.id }}');
  assert.equal(expr(wf, 'Attachment Matches?'), '={{ $json.attachment_ok === true }}');
  assert.equal(node(wf, 'Send to Customer').parameters.sendTo, "={{ $('Prepare Approval').first().json.client_email }}");
  // Approved? is the only way into the claim, and the attachment check the only way into the send.
  const into = (target) => Object.entries(wf.connections).flatMap(([from, o]) => o.main.flatMap((b, i) => b.filter((x) => x.node === target).map(() => from + ':' + i)));
  assert.deepEqual(into('Claim'), ['Approved?:0']);
  assert.deepEqual(into('Send to Customer'), ['Attachment Matches?:0']);
  // Every other email in the workflow goes to the owner.
  for (const n of wf.nodes.filter((x) => x.type.endsWith('gmail') && x.name !== 'Send to Customer')) assert.equal(n.parameters.sendTo, 'liz@ideatoplan.to', n.name);
});
