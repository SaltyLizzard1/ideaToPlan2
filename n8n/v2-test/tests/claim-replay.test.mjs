// The isolated claim-review replay, run offline: the scenarios of replay/plan.mjs through the same node code the
// replay workflow holds. Run: node --test n8n/v2-test/tests/claim-replay.test.mjs
// No network and no model. The answers are scripted (replay/scripted-responses.js) and stand for no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../replay/simulate.mjs';
import { stageOne, scoreStageOne, STAGE_ONE, scenarioList, CONFIG } from '../replay/plan.mjs';
import { buildBatches, respond, combine } from './claim-helpers.mjs';
import { budgetGate, scenarios } from '../replay/nodes.mjs';

const beyond = (run, base) => run.unreviewed.filter((id) => !base.unreviewed.includes(id));
let cached;
const scenarioRuns = async () => { if (!cached) cached = (await simulate('scenarios')).runs; return cached; };
const batchIds = async (n) => (await buildBatches()).items[n - 1].ids;

test('replay: a failed middle request, a missing output and cut-off answers leave exactly their own claims unreviewed', async () => {
  const runs = await scenarioRuns();
  const [a1, a2, a3, a4] = runs;
  assert.deepEqual([a1.claims, a1.batches, a1.failed_batches, a1.rejected, a1.stray], [499, 13, [], [], []]);
  assert.deepEqual(beyond(a2, a1).sort(), (await batchIds(7)).filter((id) => !a1.unreviewed.includes(id)).sort());
  assert.deepEqual(beyond(a3, a1).sort(), (await batchIds(5)).filter((id) => !a1.unreviewed.includes(id)).sort());
  assert.deepEqual(a3.failed_batches, ['5: no usable answer came back for this batch']);
  const cut = beyond(a4, a1);
  const b3 = await batchIds(3), b9 = await batchIds(9);
  assert.ok(cut.every((id) => b3.includes(id) || b9.includes(id)));
  assert.equal(cut.filter((id) => b3.includes(id)).length, b3.filter((id) => !a1.unreviewed.includes(id)).length, 'all of the unreadable batch');
  assert.ok(cut.filter((id) => b9.includes(id)).length < b9.length, 'the part of the cut-off batch that was not reached');
  for (const r of [a2, a3, a4]) { assert.equal(r.held, true); assert.ok(r.claim_findings.includes('CL-OPEN unresolved CLAIM REVIEW IS INCOMPLETE')); }
});

test('replay: the order of the responses changes nothing, alone or together with a failure and a missing output', async () => {
  const runs = await scenarioRuns();
  const [a1, a2, a3, , a5, a6] = runs;
  assert.deepEqual(a5.unreviewed, a1.unreviewed);
  assert.deepEqual([a5.settled, a5.defects, a5.failed_batches], [a1.settled, a1.defects, []]);
  assert.deepEqual(beyond(a6, a1).sort(), beyond(a2, a1).concat(beyond(a3, a1)).sort());
});

test('replay: missing, contradictory and wrong-batch verdicts are each held as incomplete checks', async () => {
  const runs = await scenarioRuns();
  const a1 = runs[0], a7 = runs[6];
  const b2 = await batchIds(2), b4 = await batchIds(4), b11 = await batchIds(11);
  // One claim left out, one answered twice with different verdicts, one answered in another batch's response, and one
  // whole response that names the wrong batch.
  assert.deepEqual(a7.contradictory, [b2[2]]);
  assert.ok(a7.unreviewed.includes(b2[0]) && a7.unreviewed.includes(b2[2]) && a7.unreviewed.includes(b4[0]));
  assert.ok(a7.stray.includes(b4[0] + ':1>4'));
  assert.equal(a7.stray.length, 1 + b11.length);
  assert.deepEqual(a7.repeated_batches, [12]);
  assert.deepEqual(a7.failed_batches.map((f) => f.split(':')[0]), ['11']);
  assert.deepEqual(beyond(a7, a1).sort(), [b2[0], b2[2], b4[0]].concat(b11).filter((id) => !a1.unreviewed.includes(id)).sort());
  assert.ok(a7.claim_findings.includes('CL-OPEN unresolved CLAIM REVIEW IS INCOMPLETE'));
});

test('replay: each pass uses its own claims and evidence, and answers of the earlier pass settle nothing', async () => {
  const runs = await scenarioRuns();
  const [a1, , , , , , , b1, b2, a8] = runs;
  assert.notEqual(b1.review_built, a1.review_built);
  assert.equal(b1.plan_is_variant_b, true);
  assert.deepEqual([b1.settled, b1.defects, b1.open], [0, 0, 499]);
  assert.equal(b1.rejected.length, 13);
  assert.ok(b1.rejected.every((x) => x.includes('the answer carries the review token ' + a1.review_built)));
  // Its own answers settle it, and five old ones mixed in are set aside.
  assert.deepEqual([b2.settled, b2.rejected.length, b2.review_combined], [a1.settled, 5, b1.review_built]);
  // Back on the first text, the first token and the first result return: nothing carried over from the second pass.
  assert.deepEqual([a8.review_built, a8.plan_is_variant_b, a8.unreviewed], [a1.review_built, false, a1.unreviewed]);
});

test('replay: requests go one at a time, and a stop is final', async () => {
  const s1 = (await simulate('sequential_dry', 'S1 sequential, every request')).runs[0];
  assert.equal(s1.budget_log.length, 13);
  assert.ok(s1.budget_log.every((l) => l.go));
  s1.budget_log.forEach((l, k) => { if (k) assert.ok(l.spent_before > s1.budget_log[k - 1].spent_before, 'what was spent is read before each request'); });
  assert.ok(Math.abs(s1.spent_recorded - s1.usage.cost) < 1e-6);
  const s2 = (await simulate('sequential_dry', 'S2 sequential, ceiling reached')).runs[0];
  assert.deepEqual(s2.budget_log.map((l) => l.go), Array(11).fill(true).concat([false, false]));
  assert.match(s2.budget_log[11].stop_reason, /over the ceiling of USD 0\.60/);
  assert.match(s2.budget_log[12].stop_reason, /^stopped earlier, and nothing is sent after a stop \(spent USD 0\.\d{4} and the next request could cost up to/);
  assert.ok(s2.spent_recorded <= 0.6);
  const s3 = (await simulate('sequential_dry', 'S3 sequential, a response without its cost')).runs[0];
  assert.deepEqual(s3.budget_log.map((l) => l.go), [true, true, true].concat(Array(10).fill(false)));
  assert.match(s3.budget_log[3].stop_reason, /the cost of an earlier request was not reported/);
  const s4 = (await simulate('sequential_dry', 'S4 sequential, a failed request')).runs[0];
  assert.deepEqual(s4.budget_log.map((l) => l.go), [true, true].concat(Array(11).fill(false)));
  for (const r of [s2, s3, s4]) { assert.equal(r.held, true); assert.ok(r.claim_findings.includes('CL-OPEN unresolved CLAIM REVIEW IS INCOMPLETE')); }
  // The response is inspected before the next request: a cut-off answer, or one for another review, ends the run.
  const s5 = (await simulate('sequential_dry', 'S5 sequential, a cut-off answer')).runs[0];
  assert.deepEqual(s5.budget_log.map((l) => l.go), [true].concat(Array(12).fill(false)));
  assert.match(s5.budget_log[1].stop_reason, /the response to request 1 failed inspection: the answer was cut off at the output limit/);
  const s6 = (await simulate('sequential_dry', 'S6 sequential, an answer for another review')).runs[0];
  assert.deepEqual(s6.budget_log.map((l) => l.go), [true].concat(Array(12).fill(false)));
  assert.match(s6.budget_log[1].stop_reason, /the answer does not give back the review token of this run/);
  assert.deepEqual(s1.response_log.map((x) => x.inspection), Array(13).fill('whole, readable, right token, right batch'));
  assert.match(s4.response_log[1].inspection, /the request failed or returned no answer/);
  // The worst case the gate reckons with is the full output limit, at the production setting.
  assert.match(budgetGate, /p\.max_tokens \* cfg\.usd_per_m_out/);
  assert.deepEqual([CONFIG.dry_run, CONFIG.usd_per_m_in, CONFIG.usd_per_m_out], [true, 3, 15]);
});

test('replay: scripted answers cannot stand in for a model outside a dry run', () => {
  const code = scenarios(scenarioList('R0', []));
  assert.match(code, /if \(cfg\.dry_run !== true && mine\.some\(\(s\) => !s\.sequential\)\) throw new Error/);
});

test('stage one: targets and controls in every category, in one selection the request does not label', async () => {
  const key = await stageOne();
  assert.equal(key.length, STAGE_ONE.length);
  assert.equal(new Set(key.map((k) => k.id)).size, key.length);
  const cats = ['intake attribution', 'payment', 'company focus', 'survey scope', 'substitute limitations', 'uncited assertions'];
  cats.forEach((c) => { assert.ok(key.some((k) => k.cat === c && k.expect === 'defect'), c + ' has a known defect'); assert.ok(key.some((k) => k.cat === c && k.expect === 'settle'), c + ' has a valid control'); });
  assert.deepEqual([key.filter((k) => k.expect === 'defect').length, key.filter((k) => k.expect === 'settle').length, key.filter((k) => k.expect === 'either').length], [13, 20, 3]);
  const { items } = await buildBatches(undefined, null, { 'Claim Selection': { ids: key.map((k) => k.id) } });
  assert.equal(items.length, 2);
  assert.deepEqual(items.flatMap((b) => b.ids).sort(), key.map((k) => k.id).sort());
  // Nothing of the key is in the requests: no expectation, no category, no basis.
  items.forEach((b) => { for (const word of ['UNKNOWN STATED AS NONE', 'PROBLEM STATED AS CONFIRMED', 'PAYMENT STATED WITHOUT EVIDENCE', 'my reading', 'stage one', 'not scored', '"expect"', '"basis"']) assert.ok(!b.payload.includes(word), word); });
  // Targets and controls stand in plan order, mixed.
  const order = items.flatMap((b) => b.ids).map((id) => key.find((k) => k.id === id).expect);
  assert.ok(order.join(' ').includes('defect settle') && order.join(' ').includes('settle defect'));
});

test('stage one: completeness, detection and false positives are scored apart', async () => {
  const key = await stageOne();
  const { items } = await buildBatches(undefined, null, { 'Claim Selection': { ids: key.map((k) => k.id) } });
  // A reviewer that answers everything in good form and finds almost nothing: complete, and poor.
  const lazy = scoreStageOne(key, (await combine(items, respond(items))).claim_review.records);
  assert.ok(lazy.completeness.usable >= 0.9 * lazy.completeness.sent, 'over 90% usable');
  assert.ok(lazy.detection.found <= 4, 'and few of the 13 known defects found');
  assert.equal(lazy.detection.targets, 13);
  // A reviewer that gives the expected answer to every scored claim.
  const right = Object.fromEntries(key.filter((k) => k.expect === 'defect').map((k) => [k.id, { class: 'EXTERNAL', supported: false, missing: 'scripted' }]));
  right[key.find((k) => k.expect === 'settle' && /^Your target customer/.test(k.text)).id] = { class: 'FOUNDER', supported: true, intake_quote: 'adult, typically age 40 to 60, who is financially stable' };
  const good = scoreStageOne(key, (await combine(items, respond(items, right))).claim_review.records);
  assert.deepEqual([good.detection.found, good.detection.missed_as_settled, good.false_positives.wrongly_defect], [13, [], []]);
  // A reviewer that calls everything a defect: every target found, and every control wrongly failed.
  const harsh = scoreStageOne(key, (await combine(items, respond(items, Object.fromEntries(key.map((k) => [k.id, { class: 'EXTERNAL', supported: false, missing: 'scripted' }]))))).claim_review.records);
  assert.deepEqual([harsh.detection.found, harsh.false_positives.wrongly_defect.length, harsh.completeness.usable], [13, 20, 36]);
});
