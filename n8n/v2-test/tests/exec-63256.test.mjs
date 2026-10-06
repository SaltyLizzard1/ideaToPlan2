// Regression checks on the answers a model gave in execution 63256 (stage one, 36 claims, two requests).
// Run: node --test n8n/v2-test/tests/exec-63256.test.mjs
// No network and no model calls. fixtures/exec-63256 holds the two responses as OpenRouter returned them, the requests
// as they were sent, and the score computed at the time against the key as it then stood. That score is not recomputed
// here and not replaced: the recheck below is a second result, beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { buildBatches, combine, clone } from './claim-helpers.mjs';
import { stageOne, scoreStageOne, KEY_CLARIFICATIONS, STAGE_ONE } from '../replay/plan.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63256');
const read = (f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
const digest = () => readdirSync(DIR).sort().map((f) => f + ' ' + createHash('sha256').update(readFileSync(path.join(DIR, f))).digest('hex')).join('\n');
const BEFORE = digest();
const RESPONSES = read('Review Claims (OpenRouter).json');
// The model wraps its JSON in a code fence. The answer is read the way the node reads it.
const bodyOf = (r) => { const raw = r.choices[0].message.content; return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); };
const ORIGINAL = read('original-score.json');

let cached;
const recheck = async (responses = RESPONSES) => {
  if (responses === RESPONSES && cached) return cached;
  const key = await stageOne();
  const { items } = await buildBatches(undefined, null, { 'Claim Selection': { ids: key.map((k) => k.id) } });
  const cr = (await combine(items, responses)).claim_review;
  const out = { key, items, cr, score: scoreStageOne(key, cr.records), at: (line, re) => cr.records.find((r) => r.line === line && re.test(r.text)) };
  if (responses === RESPONSES) cached = out;
  return out;
};

test('63256: the answers are the ones the model gave, for the same claims and the same review', async () => {
  const { items } = await recheck();
  assert.deepEqual(RESPONSES.map((r) => [r.id, r.model, r.usage.prompt_tokens, r.usage.completion_tokens, r.usage.cost]), [
    ['gen-1791258405-qYq0q7Kyt5MymNzSc3g9', 'anthropic/claude-sonnet-4.6', 8548, 2635, 0.065169],
    ['gen-1791258446-lpAvW6egfolaCMaLPcBF', 'anthropic/claude-sonnet-4.6', 5147, 829, 0.027876],
  ]);
  const sent = read('requests-as-sent.json');
  // The instructions have gained three sentences since, so the request text differs. The claims asked, their IDs, and
  // the review token are the same, which is what lets the saved answers be read again.
  assert.deepEqual(items.map((b) => b.ids), sent.map((b) => b.ids));
  assert.ok(RESPONSES.every((r) => bodyOf(r).review === items[0].review));
});

test('63256: the score of the run stands as it was computed, and the key has not been edited', () => {
  const s = ORIGINAL.score;
  assert.deepEqual([s.completeness.usable, s.completeness.sent, s.detection.found, s.detection.targets, s.false_positives.wrongly_defect.length, s.false_positives.controls], [29, 36, 9, 13, 0, 20]);
  assert.deepEqual(s.detection.missed_as_settled, ['L251 K1wzn0zb']);
  assert.equal(s.detection.left_unreviewed.length, 3);
  assert.equal(s.false_positives.left_unreviewed.length, 3);
  // L287 is still in the key as an expected defect with the basis that was written before the run.
  const k = STAGE_ONE.find((x) => x.line === 287);
  assert.equal(k.expect, 'defect');
  assert.match(k.basis, /does not say the business operates globally/);
  // The clarification is recorded beside the key, not in it.
  assert.equal(KEY_CLARIFICATIONS.length, 1);
  assert.match(KEY_CLARIFICATIONS[0].text, /operates globally is supported by the intake \("Where the business will operate: everywhere"\)/);
  assert.match(KEY_CLARIFICATIONS[0].text, /planning sessions alone do not establish that service/);
});

test('fix 1: the same verdict given twice is counted once, and a real contradiction is still unresolved', async () => {
  const { cr, at } = await recheck();
  // The model listed three claims twice: once in "claims" and once in a list. Each time it gave the same class.
  const advice = at(37, /^Customer conversations should test this hypothesis directly\./);
  assert.deepEqual([advice.status, advice.cls], ['settled', 'RECOMMENDATION']);
  assert.deepEqual(cr.duplicates.sort(), [advice.id, at(304, /^Low$/).id, at(382, /^Done when/).id].sort());
  assert.deepEqual(cr.contradictory, []);
  // The same claim given two different verdicts is not settled by either.
  const twice = clone(RESPONSES);
  const body = bodyOf(twice[0]);
  body.claims.push({ id: advice.id, class: 'EXTERNAL', supported: false, missing: 'a second verdict that disagrees' });
  twice[0].choices[0].message.content = JSON.stringify(body);
  const again = await recheck(twice);
  assert.deepEqual(again.cr.contradictory, [advice.id]);
  assert.equal(again.at(37, /^Customer conversations should/).status, 'open');
  // Supported true against supported false for one founder claim is a contradiction too.
  const flip = clone(RESPONSES);
  const b2 = bodyOf(flip[0]);
  const f = b2.claims.find((x) => x.class === 'FOUNDER' && x.supported === true);
  b2.claims.push({ ...f, supported: false, missing: 'not in the intake' });
  flip[0].choices[0].message.content = JSON.stringify(b2);
  assert.ok((await recheck(flip)).cr.contradictory.includes(f.id));
});

test('fix 2: "not established" in a company profile is a qualification, and it is tested where code can test it', async () => {
  const { at, items } = await recheck();
  const price = at(75, /^Not established from the sources reviewed/);
  assert.deepEqual([price.status, price.cls, price.company, price.row], ['settled', 'NONE', 'Expat US', 'Price']);
  // A profile sentence that does state something is still not "nothing".
  const other = clone(RESPONSES);
  const b = bodyOf(other[0]);
  const strength = items[0].claim_map.claims.find((c) => c.line === 113 && /^Established legal/.test(c.text));
  b.claims = b.claims.filter((x) => x.id !== strength.id);
  (b.none = b.none || []).push({ id: strength.id, kind: 'label', reason: 'a short descriptive phrase' });
  other[0].choices[0].message.content = JSON.stringify(b);
  assert.match((await recheck(other)).at(113, /^Established legal/).why, /classed NONE and it is in the profile of Fragomen/);
});

test('fix 3: a figure the sentence gives as the plan\'s own needs no entry, and a figure attributed to evidence does', async () => {
  const { at } = await recheck();
  // "... rather than your specific 40-60 age group": the range is the founder's, and the sentence says so.
  const limits = at(43, /^This is a survey of 600 travelers, not a population figure/);
  assert.deepEqual([limits.status, limits.cls, limits.links.entries], ['settled', 'EXTERNAL', ['E43']]);
  // The survey's own figure changed to one that is not in the entry is still caught.
  const wrong = clone(RESPONSES);
  const key = await stageOne();
  const l = (await import('./claim-helpers.mjs')).TEXT.slice();
  l[42] = l[42].replace('This is a survey of 600 travelers', 'This is a survey of 6,000 travelers');
  const { REV } = await import('./claim-helpers.mjs');
  const changed = await buildBatches({ ...REV, text: l.join('\n') }, null, {});
  const c = changed.items[0].claim_map.claims.find((x) => x.line === 43 && /^This is a survey of 6,000 travelers/.test(x.text));
  const batch = changed.items.find((b) => b.ids.includes(c.id));
  const answer = { review: batch.review, batch: batch.batch, claims: [{ id: c.id, class: 'EXTERNAL', supported: true, entries: ['E43'], entry_quote: 'Nearly two-thirds of 600 surveyed travelers', aspects: { subject: 'yes', meaning: 'yes', qualifiers: 'yes', numbers: 'yes', dates: 'na', population: 'yes', scope: 'yes' } }] };
  const cr = (await combine(changed.items, [{ ...wrong[0], choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] }])).claim_review;
  const r = cr.records.find((x) => x.id === c.id);
  assert.deepEqual([r.status, r.why], ['open', 'the number or date 6000 is not in the text of E43 or its source record']);
  assert.ok(key.length);
});

test('fix 4: a label qualifies its own clause, so L251 no longer passes on "not yet estimable"', async () => {
  const { at } = await recheck();
  const l251 = at(251, /^None of these is modeled here/);
  assert.equal(l251.status, 'open');
  assert.equal(l251.why, 'the label "not yet estimable" qualifies its own clause, and the clause "they depend on an audience that does not yet exist" carries no label and states "does not yet exist": it has to be split off and judged');
  // L129 is held as before: "If" covers the clause it governs.
  assert.match(at(129, /^If customer interviews confirm/).why, /its only label is "If"/);
  // Labelled sentences with one clause, or with a label in each, settle as they did.
  for (const [line, re] of [[127, /^Whether any of these providers charges a fee/], [127, /^Whether a gap exists/], [79, /^This is a hypothesis to test\./]]) assert.equal(at(line, re).status, 'settled', String(re));
});

test('fix 5: a split of one part counts only when the part is the whole claim', async () => {
  const { at } = await recheck();
  // L483: the model said the sentence is unsupported and wrapped that verdict in a split of one part, the whole sentence.
  const l483 = at(483, /^The problem you are addressing/);
  assert.deepEqual([l483.status, l483.check, l483.parts.length], ['defect', 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY', 1]);
  // The same wrapper around half the sentence leaves the other half with no verdict.
  const half = clone(RESPONSES);
  for (const r of half) { const b = bodyOf(r); const x = (b.claims || []).find((a) => a.id === l483.id); if (x) { x.split[0].text = 'The problem you are addressing'; r.choices[0].message.content = JSON.stringify(b); } }
  const again = (await recheck(half)).at(483, /^The problem you are addressing/);
  assert.deepEqual([again.status, again.why], ['open', 'the split has one part and it is not the whole sentence: the rest has no verdict']);
});

test('L287: held, with the two statements still to be judged apart', async () => {
  const { at } = await recheck();
  const l287 = at(287, /^These are not optional checks/);
  // The model called the whole sentence a founder fact and joined two passages with an ellipsis. No such passage is in
  // the intake, so the answer is not usable. It is neither a pass nor a detection.
  assert.deepEqual([l287.status, l287.why], ['open', 'it is classed FOUNDER and the words it quotes are not in the founder context']);
});

test('63256 recheck: what the same answers come to under the fixed code, beside the original score', async () => {
  const { score, cr, key } = await recheck();
  assert.deepEqual([score.completeness.usable, score.completeness.sent], [32, 36]);
  assert.deepEqual(score.completeness.unreviewed.map((x) => x.split(' ')[0]).sort(), ['L102', 'L129', 'L251', 'L287']);
  assert.deepEqual([score.detection.found, score.detection.targets], [10, 13]);
  assert.deepEqual(score.detection.missed_as_settled, []);
  assert.deepEqual(score.detection.left_unreviewed.map((x) => x.split(' ')[0]), ['L251', 'L287', 'L129']);
  assert.deepEqual([score.false_positives.wrongly_defect, score.false_positives.left_unreviewed], [[], []]);
  assert.deepEqual([cr.missing.filter((id) => key.some((k) => k.id === id)), cr.contradictory, cr.stray, cr.rejected_responses], [[], [], [], []]);
});

test('fixture: nothing in fixtures/exec-63256 was changed by these tests', () => {
  assert.equal(digest(), BEFORE);
});
