// Replay safety: a frozen financial answer can never stand in for a fresh one by default, and a run that uses one says so.
// No network and no model calls. Inputs are saved node outputs of executions 63222 and 63221 (fixtures/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { runNode, ROOT } from './harness.mjs';

const fx = (run, name) => JSON.parse(readFileSync(path.join(ROOT, 'fixtures', run, name + '.json'), 'utf8'));
const FOUNDER = fx('exec-63222', 'Founder Context');
const V2_TEST = { id: 'mLyKvFeYmJHuwXQ9', name: 'IdeaToPlan - Full Pipeline (Rebuilt) v2 Test' };
const LIVE = { id: 'tZ8blRPhX7UiDxFo', name: 'IdeaToPlan - Full Pipeline v2 (supervised)' };
const FIXTURE = 'replay-fixtures/financial-inputs-63222.historical.js';
const context = (workflow, baseline) => runNode('founder-context.js', { 'Prepare Client Data': { ...FOUNDER, fixed_scenario_price: undefined, fixed_financial_assumptions: undefined }, Webhook: { body: {} }, ...(baseline ? { 'Test Financial Baseline': baseline } : {}) }, undefined, { workflow });
const compute = (ctx) => runNode('compute-financials.js', { 'Founder Context': ctx }, fx('exec-63221', 'Financial Assumptions'));

test('the shipped baseline replays nothing', async () => {
  const b = await runNode('test-financial-baseline.js', {});
  assert.deepEqual(b, { replay_label: null, fixedScenarioPrice: null, fixedFinancialAssumptions: null });
  const ctx = await context(V2_TEST, b);
  assert.equal(ctx.fixed_scenario_price, null);
  assert.equal(ctx.fixed_financial_assumptions, null);
  assert.ok(!('financial_inputs_replayed' in ctx));
  const out = await compute(ctx);
  assert.ok(!('financial_inputs_replayed' in out));
  assert.ok(!/REPLAYED FINANCIAL INPUTS/.test(JSON.stringify(out)));
});

test('fixed inputs without a replay label are ignored, even in v2 Test', async () => {
  const fixture = await runNode(FIXTURE, {});
  const unlabelled = { fixedScenarioPrice: fixture.fixedScenarioPrice, fixedFinancialAssumptions: fixture.fixedFinancialAssumptions };
  const ctx = await context(V2_TEST, unlabelled);
  assert.equal(ctx.fixed_scenario_price, null);
  assert.equal(ctx.fixed_financial_assumptions, null);
  // A blank label is no label.
  const blank = await context(V2_TEST, { ...unlabelled, replay_label: '   ' });
  assert.equal(blank.fixed_financial_assumptions, null);
  // The model's own answer is used: the 63221 answer prices at $297, not the frozen $500.
  assert.equal((await compute(ctx)).price_record.amount, 297);
});

test('an explicitly selected replay is applied only in v2 Test, and the run is labelled as replayed', async () => {
  const fixture = await runNode(FIXTURE, {});
  assert.match(fixture.replay_label, /63222/);
  const ctx = await context(V2_TEST, fixture);
  assert.equal(ctx.fixed_scenario_price, 500);
  assert.equal(ctx.fixed_financial_assumptions.price.value, 500);
  assert.equal(ctx.financial_inputs_replayed, fixture.replay_label);
  const out = await compute(ctx);
  assert.equal(out.price_record.amount, 500);
  assert.equal(out.financial_inputs_replayed, fixture.replay_label);
  assert.ok(out.fin_issues.some((i) => i.startsWith('REPLAYED FINANCIAL INPUTS: ' + fixture.replay_label)));
  assert.match(out.financial_model, /REPLAYED FINANCIAL INPUTS: execution 63222/);
  // Any other workflow, live included, ignores the node even when it carries a labelled replay.
  for (const wf of [LIVE, { id: 'Wn6ATzrXmDvKMwJk', name: 'IdeaToPlan - Full Pipeline (Rebuilt)' }, undefined]) {
    const o = await context(wf, fixture);
    assert.equal(o.fixed_financial_assumptions, null, JSON.stringify(wf));
    assert.ok(!('financial_inputs_replayed' in o), JSON.stringify(wf));
  }
});

test('the historical fixture keeps the 63222 answer unchanged, known defect included', async () => {
  const fixture = await runNode(FIXTURE, {});
  assert.match(readFileSync(path.join(ROOT, FIXTURE), 'utf8'), /HISTORICAL REGRESSION FIXTURE\. NOT A MODEL RESULT\./);
  assert.match(fixture.fixedFinancialAssumptions.traction.reason, /reaching the Base scenario of 3 paying customers per month confirms enough demand/);
});

test('without a replay, Compute Financials returns exactly what the previous committed version returns', async () => {
  // Same inputs through the code before this change (git HEAD) and after it. Only the timing field may differ.
  const before = execSync('git show HEAD:n8n/v2-test/compute-financials.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const ctx = await context(LIVE);
  const input = fx('exec-63221', 'Financial Assumptions');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const $ = (name) => { const items = [{ json: { 'Founder Context': ctx }[name] }]; return { first: () => items[0], all: () => items }; };
  const old = await new AsyncFunction('$', '$input', '$workflow', before)($, { first: () => ({ json: input }), all: () => [{ json: input }] }, undefined);
  const now = await runNode('compute-financials.js', { 'Founder Context': ctx }, input);
  const strip = (o) => { const c = { ...o }; delete c.t_ms; return c; };
  assert.deepEqual(strip(now), strip(old));
});

test('without a replay, Founder Context returns exactly what the previous committed version returns', async () => {
  const before = execSync('git show HEAD:n8n/v2-test/founder-context.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const stubs = { 'Prepare Client Data': { ...FOUNDER, fixed_scenario_price: undefined, fixed_financial_assumptions: undefined }, Webhook: { body: {} } };
  const $ = (name) => { if (!(name in stubs)) throw new Error('Node has not run: ' + name); const items = [{ json: stubs[name] }]; return { first: () => items[0], all: () => items }; };
  for (const wf of [LIVE, V2_TEST]) {
    const old = await new AsyncFunction('$', '$input', '$workflow', before).call({ workflow: wf }, $, { first: () => ({ json: {} }), all: () => [{ json: {} }] }, wf);
    const now = await runNode('founder-context.js', stubs, undefined, { workflow: wf });
    const strip = (o) => { const c = { ...o }; delete c.run_started_ms; return c; };
    assert.deepEqual(strip(now), strip(old), JSON.stringify(wf));
  }
});
