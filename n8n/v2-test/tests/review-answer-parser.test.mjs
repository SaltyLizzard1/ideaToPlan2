// How Combine Claim Review reads a reviewer's answer when the answer is not one clean JSON object.
// Run: node --test n8n/v2-test/tests/review-answer-parser.test.mjs
// No network and no model. The plan and its evidence are the fixture of execution 63237, and the answers are scripted.
//
// WHY. The reviewer sometimes answers, writes "Wait, I need to re-examine", and answers again in the same text. The
// node read from the first "{" to the last "}", which is then not JSON, and discarded the whole batch: about 40 claims
// with no verdict, each holding the plan. Seen in execution 63260 (answer 10) and 63572 (answers 6 and 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNode } from './harness.mjs';
import { FOUNDER, FIN, EV, buildBatches, respond, combine, finish, gateOf, ideal } from './claim-helpers.mjs';

const fence = (o) => '```json\n' + JSON.stringify(o, null, 2) + '\n```';
const WAIT = '\n\nWait - I need to re-examine. I have a placeholder ID that is not in the batch. Let me recount and answer every claim ID exactly once.\n\n';
const flat = (cr) => cr.records.flatMap((r) => (r.parts ? r.parts : [r]));
const lostTo = (cr, re) => (cr.open || []).filter((o) => re.test(JSON.stringify(o)));
// Runs the review with the answer of one batch rewritten. make(body, batch) returns the text the model "wrote".
const withAnswer = async (batchNo, make) => {
  const { cc, items } = await buildBatches();
  const responses = respond(items, {}, (r, b, body) => (b.batch === batchNo ? { ...r, choices: [{ ...r.choices[0], ...make(body, b) }] } : r));
  const combined = await combine(items, responses);
  return { cc, items, combined, cr: combined.claim_review, ids: items.find((b) => b.batch === batchNo).ids };
};
const text = (content, finish_reason = 'stop') => ({ finish_reason, message: { content } });
const statusOf = (cr, id) => { const r = cr.records.find((x) => x.id === id); return r ? r.status : 'absent'; };

test('ordinary answers: one JSON object per answer is read exactly as before', async () => {
  const { items } = await buildBatches();
  const combined = await combine(items, respond(items));
  const cr = combined.claim_review;
  assert.deepEqual(cr.failed_batches, []);
  assert.deepEqual(cr.rejected_responses, []);
  assert.ok(!('reread_answers' in cr), 'nothing was re-read');
  assert.equal(cr.claims, 499);
  assert.equal((cr.missing || []).length, 0);
});

test('self-correction: the second, corrected object is the answer, and the batch is not discarded', async () => {
  // The first attempt calls one claim unsupported. The correction, which is what the reviewer settled on, does not.
  let target;
  const r = await withAnswer(2, (body) => {
    const first = JSON.parse(JSON.stringify(body));
    const c = first.claims.find((x) => x.class === 'ASSUMPTION') || first.claims[0];
    target = c.id;
    const wrong = JSON.parse(JSON.stringify(first));
    wrong.claims = wrong.claims.map((x) => (x.id === target ? { id: x.id, class: 'EXTERNAL', supported: false, missing: 'first attempt' } : x));
    return text(fence(wrong) + WAIT + fence(first));
  });
  assert.deepEqual(r.cr.failed_batches, []);
  assert.equal(lostTo(r.cr, /not readable JSON/).length, 0);
  assert.deepEqual(r.cr.reread_answers.map((x) => [x.batch, x.objects, x.used]), [[2, 2, 'the last complete object that matches this run']]);
  // The verdict that counts is the corrected one, not the first attempt.
  const rec = r.cr.records.find((x) => x.id === target);
  assert.notEqual(rec.check, 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY');
  // Every claim of the batch got its verdict.
  assert.deepEqual(r.ids.filter((id) => (r.cr.missing || []).includes(id)), []);
});

test('braces and quotes: inside strings they are text, and stray quotes in the prose between objects change nothing', async () => {
  const r = await withAnswer(3, (body) => {
    const b = JSON.parse(JSON.stringify(body));
    b.none = (b.none || []).map((x) => (x && typeof x === 'object' ? { ...x, reason: String(x.reason || '') + ' It reads "like {this}" and ends with a brace } and a backslash \\ and a quote \\".' } : x));
    const first = JSON.parse(JSON.stringify(b));
    return text(fence(first) + '\n\nWait - the reviewer said "it\'s fine" and I mistyped an ID. Correcting:\n\n' + fence(b));
  });
  assert.deepEqual(r.cr.failed_batches, []);
  assert.equal(r.cr.reread_answers[0].objects, 2);
  assert.deepEqual(r.ids.filter((id) => (r.cr.missing || []).includes(id)), []);
});

test('truncated: an answer cut off inside its only object is unreadable, as before', async () => {
  const r = await withAnswer(4, (body) => text(fence(body).slice(0, 900), 'length'));
  assert.deepEqual(r.cr.failed_batches.map((x) => x.batch), [4]);
  assert.match(JSON.stringify(r.cr.failed_batches), /cut off at the output limit/);
  assert.ok(r.ids.every((id) => statusOf(r.cr, id) === 'open'));
});

test('truncated correction: a complete first attempt followed by an unfinished correction is not used', async () => {
  const r = await withAnswer(4, (body) => text(fence(body) + WAIT + fence(body).slice(0, 700), 'length'));
  assert.deepEqual(r.cr.failed_batches.map((x) => x.batch), [4]);
  assert.match(JSON.stringify(r.cr.failed_batches), /unfinished correction of itself/);
  assert.ok(r.ids.every((id) => statusOf(r.cr, id) === 'open'), 'no claim of the batch is settled from the attempt that was set aside');
  assert.equal(r.cr.reread_answers, undefined);
});

test('malformed: text that is not JSON, and JSON that is not an answer, leave the batch unreviewed', async () => {
  for (const make of [
    () => text('I could not complete this batch.'),
    (body) => text(fence(body).replace('"review"', 'review')),                                   // broken JSON
    (body) => text(fence({ result: body })),                                                   // the answer nested inside another object
    (body) => text(fence({ review: body.review, batch: body.batch, claims: 'see above' })),    // a list that is not a list
    (body) => text(fence({ review: body.review, batch: body.batch })),                         // no verdict lists at all
    (body) => text(fence(body) + '\n\nNote { this brace is never closed, so the text ends inside an object'),
  ]) {
    const r = await withAnswer(5, make);
    assert.deepEqual(r.cr.failed_batches.map((x) => x.batch), [5]);
    assert.ok(r.ids.every((id) => statusOf(r.cr, id) === 'open'));
  }
});

test('wrong token or batch: an object made for another run or another batch settles nothing here', async () => {
  // One object, wrong token: rejected as stale, as before.
  const stale = await withAnswer(6, (body) => text(fence({ ...body, review: 'Rother1' })));
  assert.deepEqual(stale.cr.failed_batches.map((x) => x.batch), [6]);
  assert.equal(stale.cr.rejected_responses.filter((x) => x.stale).length, 1);
  // One object naming a batch that is not a batch of this run.
  const nobatch = await withAnswer(6, (body) => text(fence({ ...body, batch: 999 })));
  assert.deepEqual(nobatch.cr.failed_batches.map((x) => x.batch), [6]);
  assert.match(JSON.stringify(nobatch.cr.rejected_responses), /batch 999, which is not a batch of this run/);
  // Two objects, and only the first matches this run: the last object that matches is the first.
  const mixed = await withAnswer(6, (body) => text(fence(body) + WAIT + fence({ ...body, review: 'Rother1' })));
  assert.deepEqual(mixed.cr.failed_batches, []);
  assert.deepEqual(mixed.ids.filter((id) => (mixed.cr.missing || []).includes(id)), []);
  // Two objects naming two batches of this run: the last one counts, so its batch is answered and the other is not.
  const moved = await withAnswer(6, (body, b) => text(fence(body) + WAIT + fence({ ...body, batch: 7 })));
  assert.ok(moved.cr.failed_batches.map((x) => x.batch).includes(6));
});

test('recovery is not a pass: the recovered verdicts go through every check, and the plan is still held on its defects', async () => {
  // A self-corrected answer whose final version calls a claim an external fact with no support.
  let target;
  const r = await withAnswer(2, (body) => {
    const fixed = JSON.parse(JSON.stringify(body));
    const c = fixed.claims.find((x) => x.class === 'ASSUMPTION') || fixed.claims[0];
    target = c.id;
    fixed.claims = fixed.claims.map((x) => (x.id === target ? { id: x.id, class: 'EXTERNAL', supported: false, missing: 'no entry states this' } : x));
    return text(fence(body) + WAIT + fence(fixed));
  });
  const rec = r.cr.records.find((x) => x.id === target);
  assert.deepEqual([rec.status, rec.check], ['defect', 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY']);
  const out = await finish(r.cc, r.combined);
  assert.ok(out.findings.some((f) => f.severity === 'BLOCKING' && f.check === 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY' && f.line === rec.line));
  assert.equal((await gateOf(out)).blocked, true);
  // A verdict for an ID outside the batch is still a stray, whichever object it came from.
  const strayRun = await withAnswer(2, (body) => { const fixed = JSON.parse(JSON.stringify(body)); fixed.none = [...(fixed.none || []), { id: 'K0000000', kind: 'other', reason: 'not a claim of this batch' }]; return text(fence(body) + WAIT + fence(fixed)); });
  assert.ok((strayRun.cr.stray || []).some((x) => x.id === 'K0000000'));
});
