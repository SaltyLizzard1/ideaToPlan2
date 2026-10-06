// Supervised launch: the Code nodes of the three workflows, run offline. No network, no database, no model.
// Run: node --test n8n/v2-test/tests/supervised.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nodeCode, writeNodes, buildCodeTest } from '../supervised/build.mjs';
import { NODES } from '../supervised/src/nodes.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// stubs: { 'Node Name': item | [items] }, where an item is { json, binary }. Files are { bytes: Buffer }.
async function run(file, stubs, input) {
  const items = (v) => (Array.isArray(v) ? v : [v]).map((x) => (x && (x.json || x.binary) ? x : { json: x || {} }));
  const $ = (name) => { if (!(name in stubs)) throw new Error('Node has not run: ' + name); const it = items(stubs[name]); return { first: () => it[0], all: () => it }; };
  const ins = items(input === undefined ? {} : input);
  const ctx = { helpers: { getBinaryDataBuffer: async (i, prop) => ins[i].binary[prop].bytes } };
  return await new AsyncFunction('$', '$input', nodeCode(file)).call(ctx, $, { first: () => ins[0], all: () => ins });
}
const refuses = async (file, stubs, input, re) => assert.rejects(() => run(file, stubs, input), re);

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5000, 9)]);
const TEXT = 'Plan text with a café and a € sign.\nSecond line.';
const V = '33333333-3333-3333-3333-333333333333', SUB = '11111111-1111-1111-1111-111111111111', PARENT = '22222222-2222-2222-2222-222222222222';
const version = (o = {}) => ({ id: V, submission_id: SUB, version: 2, status: 'awaiting_approval', pdf_path: SUB + '/v2.pdf', review_status: 'HOLD', review_notes: 'automated report', plan_sha256: sha(Buffer.from(TEXT)), pdf_sha256: sha(PDF), origin: 'hand_corrected', ...o });
const order = { id: SUB, client_name: 'elizabeth alfond', email: 'liz@example.test', package: 'Growth', plan_goal: 'personal-roadmap' };
const release = (o = {}) => ({ id: 'r1', plan_version_id: V, decision: 'release_for_approval', reviewer: 'Liz Alfond', created_at: '2026-10-07T01:00:00Z', recorded_by: 'postgres', incomplete_checks_disposition: 'Reviewed by hand.', plan_sha256: sha(Buffer.from(TEXT)), pdf_sha256: sha(PDF), ai_prepared_by: 'Claude', ...o });
const prep = (v, all, reviews) => run('prepare-approval.js', { Start: { plan_version_id: V }, 'Load Version': v, 'Load Submission': order, 'Load All Versions': all || [v] }, reviews || [{}]);

test('node files on disk are the built code, and every copy of the shared parts is the same', () => {
  writeNodes();
  for (const f of Object.keys(NODES)) assert.equal(readFileSync(new URL('../supervised/nodes/' + f, import.meta.url), 'utf8'), nodeCode(f) + '\n');
  for (const f of ['fingerprint-pdf.js', 'prepare-version.js', 'verify-stored-pdf.js', 'verify-attachment.js']) assert.ok(nodeCode(f).includes('const sha256js = (u8) =>'), f);
  for (const f of ['prepare-approval.js', 'request-check.js']) assert.ok(nodeCode(f).includes('const approvalChecks = (requested, v, s, all, reviews, allowed) =>'), f);
  for (const f of Object.keys(NODES)) assert.ok(!/require\(|fetch\(|httpRequest|\\u[0-9a-f]{4}/i.test(nodeCode(f)), f + ' uses nothing the instance blocks, calls nothing, and has no escape the editor would rewrite');
});

test('fingerprints: the PDF as stored and the text as stored, equal to an independent SHA-256', async () => {
  const fp = await run('fingerprint-pdf.js', {}, { json: {}, binary: { pdf_data: { bytes: PDF, fileName: 'document.pdf' } } });
  assert.deepEqual(fp[0].json, { pdf_sha256: sha(PDF), pdf_bytes: PDF.length });
  assert.equal(fp[0].binary.pdf_data.bytes, PDF, 'the file is passed on untouched');
  await refuses('fingerprint-pdf.js', {}, { json: {}, binary: { pdf_data: { bytes: Buffer.from('<html>error</html>') } } }, /not a PDF/);
  await refuses('fingerprint-pdf.js', {}, { json: {} }, /returned no file/);
  const stubs = { 'Resolve Submission': { submission_id: SUB }, 'Fingerprint PDF': fp[0], 'Finalize Plan': { text: TEXT, status: 'HOLD', report: 'r', sources_cited: [{ id: 'S1' }], origin: 'hand_corrected', parent_version_id: PARENT } };
  const pv = (await run('prepare-version.js', stubs, [{ id: PARENT, version: 1 }, { id: 'x', version: 4 }]))[0];
  assert.deepEqual({ ...pv.json }, { submission_id: SUB, version: 5, pdf_path: SUB + '/v5.pdf', review_status: 'HOLD', review_notes: 'r', plan_text: TEXT, sources_cited: [{ id: 'S1' }], plan_sha256: sha(Buffer.from(TEXT, 'utf8')), pdf_sha256: sha(PDF), origin: 'hand_corrected', parent_version_id: PARENT });
  assert.equal(pv.binary.pdf_data.mimeType, 'application/pdf');
  // A generated version: no parent, origin generated, and the first version of an order is 1.
  const gen = (await run('prepare-version.js', { ...stubs, 'Finalize Plan': { text: TEXT, status: 'REVIEW', report: 'r', sources_cited: [] } }, {}))[0].json;
  assert.deepEqual([gen.version, gen.origin, gen.parent_version_id, gen.review_status], [1, 'generated', null, 'REVIEW']);
  await refuses('prepare-version.js', { ...stubs, 'Finalize Plan': { text: '  ', status: 'HOLD' } }, {}, /plan text is empty/);
  await refuses('prepare-version.js', { ...stubs, 'Finalize Plan': { text: TEXT, origin: 'hand_corrected' } }, {}, /needs its parent/);
  await refuses('prepare-version.js', { ...stubs, 'Fingerprint PDF': { json: {} } }, {}, /not fingerprinted/);
});

test('approval is refused without a matching human release record, for held and for passing versions', async () => {
  for (const status of ['HOLD', 'SEND', 'REVIEW']) await assert.rejects(() => prep(version({ review_status: status })), new RegExp('no human release record \\(automated status ' + status + '\\).*No approval email sent'));
  await assert.rejects(() => prep(version(), null, [release({ decision: 'keep_on_hold' }), release({ decision: 'note' })]), /no human release record/);
  await assert.rejects(() => prep(version(), null, [release({ plan_version_id: 'another' })]), /no human release record/);
  await assert.rejects(() => prep(version(), null, [release({ pdf_sha256: 'f'.repeat(64) })]), /describes different content/);
  await assert.rejects(() => prep(version(), null, [release({ plan_sha256: 'f'.repeat(64) })]), /describes different content/);
  await assert.rejects(() => prep(version({ plan_sha256: null, pdf_sha256: null }), null, [release()]), /has no fingerprints/);
  await assert.rejects(() => prep(version({ status: 'changes_requested' }), null, [release()]), /is changes_requested, expected awaiting_approval/);
  await assert.rejects(() => prep({}, null, [release()]), /Plan version not found/);
});

test('approval of a reviewed version: the automated result is kept and shown beside the review', async () => {
  const v = version();
  const p = (await prep(v, [version({ id: PARENT, version: 1, status: 'changes_requested' }), v], [release()]))[0].json;
  assert.deepEqual([p.plan_version_id, p.version, p.review_status, p.review_notes, p.plan_sha256, p.pdf_sha256, p.client_name, p.wait_minutes], [V, 2, 'HOLD', 'automated report', v.plan_sha256, v.pdf_sha256, 'Elizabeth Alfond', 2880]);
  assert.deepEqual([p.human_review.reviewer, p.human_review.ai_prepared_by, p.already_sent_version, p.redelivery_reason], ['Liz Alfond', 'Claude', null, '']);
  const mail = (await run('build-approval-email.js', { 'Prepare Approval': p }, { signedURL: '/object/sign/plans/x?token=t' }))[0].json;
  assert.match(mail.approval_subject, /^Approve: Growth plan for Elizabeth Alfond v2 \(automated HOLD, reviewed by Liz Alfond\)$/);
  for (const re of [/Automated review, unchanged/, /Status: HOLD/, /automated report/, /Your recorded review/, /Reviewer: Liz Alfond/, /text prepared by Claude/, /Incomplete checks: Reviewed by hand\./, /hand-corrected/, new RegExp('PDF ' + v.pdf_sha256.slice(0, 16)), /Send exactly this version and this PDF/]) assert.match(mail.approval_html, re);
  assert.ok(!/already received/.test(mail.approval_html));
  await refuses('build-approval-email.js', { 'Prepare Approval': p }, {}, /no signed URL/);
});

test('an order that already received a plan: stopped without a reason, allowed and announced with one', async () => {
  const v = version({ version: 3 });
  const all = [version({ id: 'a', version: 1, status: 'sent', sent_at: '2026-10-01T10:00:00Z' }), version({ id: 'b', version: 2, status: 'changes_requested' }), v];
  await assert.rejects(() => prep(v, all, [release()]), /already received version 1 \(sent 2026-10-01T10:00:00Z\).*gives no redelivery reason\. No approval email sent/);
  const p = (await prep(v, all, [release({ redelivery_reason: 'Corrected provider count; client asked for the revision.' })]))[0].json;
  assert.deepEqual([p.already_sent_version, p.already_sent_at, p.redelivery_reason], [1, '2026-10-01T10:00:00Z', 'Corrected provider count; client asked for the revision.']);
  const mail = (await run('build-approval-email.js', { 'Prepare Approval': p }, { signedURL: '/s' }))[0].json;
  assert.match(mail.approval_subject, /REVISED PLAN$/);
  assert.match(mail.approval_html, /This order already received version 1 on 2026-10-01T10:00:00Z\.<\/strong> Approving sends a revised plan to the client\. Reason recorded: Corrected provider count/);
  // The other duplicate protections, checked before any email.
  await assert.rejects(() => prep(version({ version: 2 }), [version({ id: 'c', version: 3, status: 'changes_requested' }), version({ version: 2 })], [release()]), /not the current version/);
  await assert.rejects(() => prep(v, [version({ id: 'd', version: 2, status: 'send_unknown' }), v], [release()]), /in flight \(v2 send_unknown\)/);
  await assert.rejects(() => prep(v, [version({ id: 'd', version: 2, status: 'sending' }), v], [release()]), /in flight/);
});

test('request approval: everything is checked before anything is changed', async () => {
  const req = (v, all, reviews, id = V) => run('request-check.js', { 'Plan Version ID': { plan_version_id: id }, 'Load Version': v, 'Load Submission': order, 'Load All Versions': all || [v] }, reviews || [{}]);
  for (const status of ['changes_requested', 'approval_timeout', 'send_failed']) {
    const out = (await req(version({ status }), null, [release()]))[0].json;
    assert.deepEqual([out.plan_version_id, out.status, out.needs_reopen, out.pdf_sha256], [V, status, true, sha(PDF)]);
  }
  assert.equal((await req(version(), null, [release()]))[0].json.needs_reopen, false, 'a version the gate passed is already awaiting approval');
  for (const status of ['sent', 'sending', 'send_unknown']) await assert.rejects(() => req(version({ status }), null, [release()]), new RegExp('is ' + status + ', expected'));
  await assert.rejects(() => req(version({ status: 'changes_requested' })), /no human release record/);
  await assert.rejects(() => req(version(), null, [release()], 'PASTE-PLAN-VERSION-ID-HERE'), /not an ID\. Nothing was changed/);
  const c = { plan_version_id: V, pdf_path: 'p/v2.pdf', pdf_sha256: sha(PDF), status: 'changes_requested', needs_reopen: true };
  const ok = (await run('verify-stored-pdf.js', { 'Check Version': c }, { json: {}, binary: { data: { bytes: PDF } } }))[0].json;
  assert.equal(ok.stored_pdf_sha256, sha(PDF));
  await refuses('verify-stored-pdf.js', { 'Check Version': c }, { json: {}, binary: { data: { bytes: Buffer.concat([PDF, Buffer.from('x')]) } } }, /does not match the fingerprint.*Nothing was changed/);
  await refuses('verify-stored-pdf.js', { 'Check Version': c }, { json: {} }, /could not be downloaded/);
  await refuses('already-requested.js', { 'Check Version': c }, {}, /No row changed/);
});

test('delivery: the file that is attached is the file that was approved, or nothing is sent', async () => {
  const item = { json: { pdf_sha256: sha(PDF), plan_version_id: V, submission_id: SUB, version: 2, client_name: 'Elizabeth Alfond' }, binary: { data: { bytes: PDF, fileName: 'IdeaToPlan - Elizabeth Alfond.pdf' } } };
  const good = (await run('verify-attachment.js', {}, item))[0];
  assert.deepEqual([good.json.attachment_ok, good.json.attachment_sha256], [true, sha(PDF)]);
  assert.equal(good.binary.data.bytes, PDF, 'the attachment is passed to the send untouched');
  const swapped = (await run('verify-attachment.js', {}, { ...item, binary: { data: { bytes: Buffer.concat([PDF, Buffer.from('!')]) } } }))[0].json;
  assert.equal(swapped.attachment_ok, false);
  assert.equal((await run('verify-attachment.js', {}, { json: item.json }))[0].json.attachment_ok, false, 'no file');
  assert.equal((await run('verify-attachment.js', {}, { json: { ...item.json, pdf_sha256: '' }, binary: item.binary }))[0].json.attachment_ok, false, 'no approved fingerprint');
  // The mismatch goes down the existing send-error path as a verified non-send.
  const cls = (await run('classify-send-error.js', { 'Build Customer Email': item.json }, swapped))[0].json;
  assert.deepEqual([cls.send_status, cls.error_source], ['send_failed', 'fingerprint_mismatch']);
  assert.match(cls.error_message, /approved fingerprint is /);
  // The existing classifications are unchanged.
  const c = async (e) => (await run('classify-send-error.js', { 'Build Customer Email': item.json }, e))[0].json;
  assert.deepEqual([(await c({ error: { message: 'Invalid email address (item 0)' } })).send_status, (await c({ error: 'Bad request - please check your parameters' })).send_status, (await c({ error: { message: 'socket hang up' } })).send_status, (await c({})).send_status], ['send_failed', 'send_failed', 'send_unknown', 'send_unknown']);
});

test('saving a hand-corrected version: next version of the same order, always HOLD, parent report kept', async () => {
  const text = 'A corrected plan. '.repeat(40) + 'It cites [S1] and W1.';
  const parent = { id: PARENT, submission_id: SUB, version: 2, status: 'changes_requested', review_status: 'HOLD', review_notes: 'parent automated report', sources_cited: [{ id: 'S1' }, { id: 'W1' }] };
  const chk = (input, p = parent, all) => run('check-parent.js', { 'Review Input': { parent_version_id: PARENT, corrected_text: text, note: 'Reviewed 2026-10-07.', ...input }, 'Load Parent': p, 'Load Submission': order }, all || [{ id: 'a', version: 1, status: 'changes_requested' }, p]);
  const c = (await chk({}))[0].json;
  assert.deepEqual([c.parent_version_id, c.submission_id, c.sources_from, c.client_name, c.package, c.plan_goal_clean], [PARENT, SUB, 'the parent version', 'elizabeth alfond', 'Growth', 'Personal Roadmap']);
  assert.equal((await chk({}, { ...parent, sources_cited: JSON.stringify(parent.sources_cited) }))[0].json.sources_cited.length, 2, 'sources stored as text are read too');
  const legacy = { ...parent, sources_cited: null };
  await assert.rejects(() => chk({}, legacy), /stores no sources and none were given/);
  assert.match((await chk({ sources_cited: [{ id: 'S1' }, { id: 'W1' }] }, legacy))[0].json.sources_from, /review input, because the parent version stores none/);
  await assert.rejects(() => chk({ corrected_text: text + ' And [S9].' }), /cites S9, which the sources do not contain/);
  await assert.rejects(() => chk({ corrected_text: 'too short' }), /too short to be a plan/);
  await assert.rejects(() => chk({ parent_version_id: 'PASTE-PARENT-PLAN-VERSION-ID-HERE' }), /not an ID/);
  await assert.rejects(() => chk({}, {}), /Parent plan version not found/);
  await assert.rejects(() => chk({}, parent, [parent, { id: 'n', version: 3, status: 'changes_requested' }]), /not the current version/);
  await assert.rejects(() => chk({}, parent, [{ id: 'f', version: 1, status: 'awaiting_approval' }, parent]), /in flight \(v1 awaiting_approval\)\. Request changes on it first/);
  const fin = (await run('reviewed-finalize.js', { 'Check Parent': c }))[0].json;
  assert.deepEqual([fin.status, fin.origin, fin.parent_version_id, fin.text], ['HOLD', 'hand_corrected', PARENT, text]);
  assert.match(fin.report, /^HAND-CORRECTED VERSION\. NOT APPROVED\. The automated checks were not run on this text/);
  assert.match(fin.report, /AUTOMATED REPORT OF THE PARENT VERSION, UNCHANGED ---\n\nparent automated report$/);
  const gate = (await run('reviewed-gate.js', { 'Finalize Plan': fin }))[0].json;
  assert.deepEqual([gate.blocked, gate.version_status, gate.review_status], [true, 'changes_requested', 'HOLD']);
  await refuses('reviewed-gate.js', { 'Finalize Plan': { ...fin, status: 'SEND' } }, {}, /only saves hand-corrected versions on HOLD/);
  assert.deepEqual((await run('reviewed-submission.js', { 'Check Parent': c }))[0].json, { submission_id: SUB });
  assert.deepEqual((await run('reviewed-client-data.js', { 'Check Parent': c }))[0].json, { client_name: 'elizabeth alfond', email: 'liz@example.test', package: 'Growth', plan_goal_clean: 'Personal Roadmap' });
});

test('the code-test workflow carries the expected fingerprints for its fixed file and text', () => {
  const t = buildCodeTest();
  assert.equal(t.expected.plan_sha256, sha(Buffer.from(TEXT, 'utf8')));
  assert.ok(t.wf.nodes.every((k) => !k.credentials && /manualTrigger|code$/.test(k.type)), 'no credentials and no network nodes');
});
