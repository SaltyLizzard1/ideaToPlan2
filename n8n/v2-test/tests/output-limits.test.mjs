// Answers cut off at the output limit. Run: node --test n8n/v2-test/tests/output-limits.test.mjs
// Offline. Two separate defects seen in execution 65701 (2026-10-12, a Growth plan):
// A. The financial-assumptions answer stopped at 4,000 tokens. The plan was written with no financial model.
// B. One claim-review answer stopped at 8,000 tokens after long reasoning. 40 claims got no verdict.
// The rule in both: a cut-off answer is never used in part, and the plan stays held.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runNode } from './harness.mjs';

const FOUNDER = { run_started_ms: Date.UTC(2026, 9, 12), tier: 'Growth', goal: 'personal-roadmap', founder_context: 'FOUNDER CONTEXT: test.' };
const one = (r) => (Array.isArray(r) ? r[0].json : (r.json || r));
const COMPLETE = JSON.stringify({ offer: 'A monthly subscription', unit_label: 'month', price: { value: 39, basis: 'Founder', reason: 'stated' } });
const answer = (content, finish_reason, completion_tokens) => ({ choices: [{ finish_reason, message: { content } }], usage: { prompt_tokens: 100, completion_tokens } });
const compute = async (input) => one(await runNode('compute-financials.js', { 'Founder Context': FOUNDER }, input));
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('A. the financial request allows 8,000 output tokens', () => {
  assert.match(src('build-financial-request.js'), /max_tokens: 8000, temperature: 0/);
  assert.ok(!/max_tokens: 4000/.test(src('build-financial-request.js')));
});

test('A. a financial answer cut off mid-way is not used, and the report says it was cut off', async () => {
  const out = await compute(answer(COMPLETE.slice(0, 60), 'length', 8000));
  assert.ok(out.fin_issues.some((x) => /cut off at its output limit \(8000 tokens\)/.test(x)), JSON.stringify(out.fin_issues));
  assert.ok(out.fin_issues.some((x) => /technical failure of the run/.test(x)));
  // The older, vaguer message is not given as well: one cause, one message.
  assert.ok(!out.fin_issues.some((x) => /could not be read/.test(x)));
  assert.equal(out.price_record.amount, null);
});

test('A. a cut-off answer that happens to parse is still not used', async () => {
  // The text is complete JSON, but the model was stopped by the limit: more was coming, so the answer is partial.
  const out = await compute(answer(COMPLETE, 'length', 8000));
  assert.ok(out.fin_issues.some((x) => /cut off at its output limit/.test(x)));
  assert.equal(out.price_record.amount, null, 'a price from a cut-off answer was used');
  assert.ok(out.fin_issues.some((x) => /No price was set/.test(x)));
});

test('A. a complete answer is read as before, and an unreadable complete answer keeps its own message', async () => {
  const bad = await compute(answer('not json at all', 'stop', 20));
  assert.ok(bad.fin_issues.some((x) => /could not be read/.test(x)));
  assert.ok(!bad.fin_issues.some((x) => /cut off/.test(x)));
  const empty = await compute({ choices: [{ message: { content: '' } }] });
  assert.ok(empty.fin_issues.some((x) => /could not be read/.test(x)));
});

test('B. a claim-review request allows 16,000 output tokens, and the batch size is unchanged', () => {
  const s = src('build-claim-review.js');
  assert.match(s, /model: MODEL, max_tokens: 16000, temperature: 0/);
  assert.ok(!/max_tokens: 8000/.test(s));
  assert.match(s, /const BATCH_MAX = 40;/);
  assert.match(s, /const BATCH_SOFT = 28;/);
});

test('B. the combiner still refuses a cut-off review answer', () => {
  // Raising the limit does not change what happens when it is reached: the batch has no usable answer.
  const s = src('combine-claim-review.js');
  assert.match(s, /const cut = choice\.finish_reason === 'length';/);
  assert.match(s, /the answer was cut off at the output limit and cannot be read/);
});
