// Regression checks for unresolved costs, cost headroom and the conditional conclusion.
// Run: node --test n8n/v2-test/tests/financial-conditions.test.mjs
// No network and no model calls. The base case is the financial-assumptions answer of execution 63220, unchanged.
// Every other case changes that answer or the founder's answers and runs the real Compute Financials code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, fixture, clone, ROOT } from './harness.mjs';
import { pipeline } from './pipeline.mjs';

const RAW = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'exec-63220', 'Financial Assumptions.json'), 'utf8'));
const BASE = (() => { const c = RAW.choices[0].message.content; return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); })();
const compute = (change = () => {}, founder = {}) => { const a = clone(BASE); change(a); return runNode('compute-financials.js', { 'Founder Context': { ...fixture('Founder Context'), ...founder } }, { choices: [{ message: { content: JSON.stringify(a) } }] }); };
const review = (a, key) => a.cost_review.find((r) => r.key === key);
const item = (a, name) => a.budget_items.find((b) => b.item === name);
const status = (out, key) => out.cost_status.find((c) => c.key === key);
// Resolve everything except what a test wants open.
const settle = (a) => { item(a, 'Payment processing fee').cost = 10; review(a, 'ai_api').applies = 'no'; review(a, 'professional').applies = 'no'; };
const forecast = (a, cpms) => a.forecast.quarters.forEach((q, i) => { q.customers_per_month = cpms[i]; });

// ---------------- The verified example: execution 63220 ----------------

test('63220: the reported thresholds are reproduced, with the formula', async () => {
  const out = await compute();
  // Outcome tested, and the model it is taken from. Nothing in the model changed.
  assert.deepEqual(out.model.year, { revenue: 9450, expenses: 270, profit: 9180, one_time: 500, net: 8680 });
  assert.equal(out.model.scenarios.base.profit, 1020);
  const h = out.cost_headroom;
  assert.equal(h.outcome, 'year-one net cash after one-time costs');
  assert.equal(h.baseline_usd, 8680);
  assert.equal(h.available_usd, 8680);
  assert.equal(h.year_one_sales, 27);                                  // (1 + 2 + 3 + 3) customers a month x 3 months
  assert.equal(h.per_month_over_12_months_usd, Math.floor(8680 / 12)); // 723.33 -> 723. Reported earlier as "about $720".
  assert.equal(h.per_month_over_12_months_usd, 723);
  assert.equal(h.per_sale_usd, Math.floor(8680 / 27));                 // 321.48 -> 321
  assert.equal(h.per_sale_usd, 321);
  assert.equal(h.one_time_usd, 8680);
  // The $340 reported earlier is the Base-month figure, not the year-one threshold: $1,020 / 3 sales.
  assert.deepEqual(h.base_month, { operating_profit_usd: 1020, sales: 3, per_sale_usd: 340 });
  assert.match(h.formula, /per month = available \/ 12; per sale = available \/ year-one sales; one-time = available/);
  // The three thresholds are the same money, not three allowances.
  assert.ok(h.per_month_over_12_months_usd * 12 <= h.available_usd && h.per_sale_usd * 27 <= h.available_usd);
  assert.deepEqual(h.shared_by, ['Payment processing and transaction fees', 'AI, model, API, research and data services used in delivery', 'Professional services']);
});

test('63220: each cost is reported once, with one status, and unknown is never zero', async () => {
  const out = await compute();
  assert.equal(new Set(out.cost_status.map((c) => c.key)).size, out.cost_status.length);
  assert.equal(status(out, 'payment').status, 'applicable_amount_unknown');
  assert.equal(status(out, 'ai_api').status, 'applicability_unknown');
  assert.equal(status(out, 'professional').status, 'applicability_unknown');
  assert.equal(status(out, 'ads').status, 'not_applicable');
  assert.equal(status(out, 'software').status, 'applicable_amount_known');
  // Professional services was reported twice before: once as "not established whether it applies" and once as "applies".
  assert.equal(out.fin_issues.length, 0);
  assert.equal(out.fin_reviews.length, 1);
  assert.equal((out.fin_reviews[0].match(/Professional services/g) || []).length, 1);
  assert.ok(!out.fin_reviews.some((x) => /"Professional advice \(accounting or legal\)" applies/.test(x)));
  assert.ok(!/These costs apply and are in none of the totals/.test(out.budget_block));
  // No unresolved cost entered a total: the forecast is the same as with those items absent.
  assert.equal(out.reconciliation.find((r) => r.check === 'Unknown amounts are outside every total').ok, true);
  assert.ok(!out.budget_block.includes('Payment processing fee | Before validation | $0'));
});

// ---------------- The four statuses ----------------

test('status: known costs leave nothing unresolved and no condition', async () => {
  const out = await compute(settle);
  assert.deepEqual(out.unresolved_costs, []);
  assert.equal(out.cost_headroom, null);
  assert.equal(out.cost_condition, '');
  assert.equal(status(out, 'payment').status, 'applicable_amount_known');
  assert.equal(status(out, 'payment').in_totals, true);
  // The known per-sale cost is in the figures: 27 sales x $10.
  assert.equal(out.model.year.net, 8680 - 270);
  assert.ok(!/Costs that are not resolved/.test(out.forecast_block));
  assert.ok(!/COST CONDITION/.test(out.financial_model));
});

test('status: applicable with an unknown amount, and unknown applicability, are different and both stay unresolved', async () => {
  const amount = await compute((a) => { settle(a); review(a, 'professional').applies = 'yes'; });
  assert.equal(status(amount, 'professional').status, 'applicable_amount_unknown');
  assert.deepEqual(amount.unresolved_costs, ['Professional services']);
  assert.match(amount.cost_condition, /Professional services \(applies, amount not established\)/);
  const applies = await compute((a) => { settle(a); review(a, 'professional').applies = 'unknown'; });
  assert.equal(status(applies, 'professional').status, 'applicability_unknown');
  assert.match(applies.cost_condition, /Professional services \(not established whether it applies\)/);
  // A single unresolved cost is not told it "shares" anything.
  assert.ok(!/share that one amount/.test(applies.cost_condition));
  // An unknown-applicability cost whose amount is already in the totals is not counted against headroom again.
  const counted = await compute((a) => { settle(a); review(a, 'software').applies = 'unknown'; });
  assert.equal(status(counted, 'software').status, 'applicability_unknown');
  assert.equal(status(counted, 'software').in_totals, true);
  assert.deepEqual(counted.unresolved_costs, []);
});

test('status: founder answers are used, and an answer alone does not resolve a cost', async () => {
  const withAnswers = (cost_answers, change = () => {}) => compute(change, { cost_answers });
  // No answers at all: an existing submission. Same result as before the questions existed.
  const none = await compute();
  assert.equal(status(none, 'ai_api').source, 'financial step');
  // Confirmed not applicable.
  const no = await withAnswers({ ai_services: { applies: 'Not applicable' }, professional_advice: { applies: 'no' } });
  assert.equal(status(no, 'ai_api').status, 'not_applicable');
  assert.equal(status(no, 'ai_api').source, 'founder answer');
  assert.equal(status(no, 'professional').status, 'not_applicable');
  assert.deepEqual(no.unresolved_costs, ['Payment processing and transaction fees']);
  // Unknown stays unknown.
  const unk = await withAnswers({ ai_services: { applies: 'Unknown' } });
  assert.equal(status(unk, 'ai_api').status, 'applicability_unknown');
  // Yes with a usable amount: known, taken off the outcome, never double counted.
  const yes = await withAnswers({ ai_services: { applies: 'yes', amount: 50, currency: 'USD', unit: 'per month' } });
  assert.equal(status(yes, 'ai_api').status, 'applicable_amount_known');
  assert.equal(yes.cost_headroom.founder_costs_not_in_totals_usd, 600);
  assert.equal(yes.cost_headroom.available_usd, 8680 - 600);
  assert.equal(yes.cost_headroom.per_month_over_12_months_usd, Math.floor(8080 / 12));
  assert.equal(yes.model.year.net, 8680, 'the computed tables are not altered by a founder answer');
  assert.match(yes.forecast_block, /Founder-stated cost not in the tables above: AI, model, API, research and data services used in delivery, \$50 per month, \$600 in year one/);
  const perSale = await withAnswers({ ai_services: { applies: 'yes', amount: 2, currency: 'USD', unit: 'per sale' } });
  assert.equal(perSale.cost_headroom.available_usd, 8680 - 54);
  const once = await withAnswers({ professional_advice: { applies: 'yes', amount: 400, currency: 'USD', unit: 'one-time' } });
  assert.equal(once.cost_headroom.available_usd, 8680 - 400);
  // Yes with nothing usable: still unresolved, with the reason kept.
  for (const [answer, why] of [
    [{ applies: 'yes' }, /gave no amount/],
    [{ applies: 'yes', amount: 50, currency: 'EUR', unit: 'per month' }, /given in EUR and is not converted/],
    [{ applies: 'yes', amount: 0.02, currency: 'USD', unit: 'per use' }, /per use, and the number of uses per sale is not known/],
    [{ applies: 'yes', amount: 50, currency: 'USD' }, /has no unit/],
    [{ applies: 'yes', amount: '', currency: 'USD', unit: 'per month' }, /gave no amount/],
  ]) {
    const out = await withAnswers({ ai_services: answer });
    assert.equal(status(out, 'ai_api').status, 'applicable_amount_unknown', JSON.stringify(answer));
    assert.match(status(out, 'ai_api').founder_answer.not_used_because, why);
    assert.equal(out.cost_headroom.available_usd, 8680, 'nothing was assumed for it');
    assert.ok(out.unresolved_costs.includes('AI, model, API, research and data services used in delivery'));
  }
  // A founder amount is not added on top of an amount the model already carries.
  const both = await withAnswers({ ai_services: { applies: 'yes', amount: 50, currency: 'USD', unit: 'per month' } }, (a) => { a.budget_items.push({ item: 'AI service', category: 'Before validation', cost: 40, recurrence: 'monthly', basis: 'Founder', reason: 'x', material: false }); review(a, 'ai_api').applies = 'yes'; review(a, 'ai_api').budget_items = ['AI service']; });
  assert.equal(both.cost_headroom.founder_costs_not_in_totals_usd, 0);
  assert.equal(status(both, 'ai_api').in_totals, true);
});

// ---------------- Headroom under different models ----------------

test('headroom: several unknown costs share one amount, and it does not grow with their number', async () => {
  const three = await compute();
  const one = await compute((a) => { review(a, 'ai_api').applies = 'no'; review(a, 'professional').applies = 'no'; });
  assert.equal(one.unresolved_costs.length, 1);
  assert.equal(three.unresolved_costs.length, 3);
  ['available_usd', 'per_month_over_12_months_usd', 'per_sale_usd', 'one_time_usd'].forEach((k) => assert.equal(three.cost_headroom[k], one.cost_headroom[k], k));
  assert.match(three.cost_condition, /They share that one amount; it is not a separate allowance for each\./);
  assert.match(three.forecast_block, /The 3 unresolved costs share that one amount\. It is not a separate allowance for each\./);
  assert.match(three.forecast_block, /These are three ways of spending the same amount, rounded down\./);
  assert.match(three.cost_condition, /break-even threshold, not an estimate of these costs and not evidence that the business works/);
});

test('headroom: zero sales', async () => {
  const out = await compute((a) => { forecast(a, [0, 0, 0, 0]); ['base', 'target', 'stretch'].forEach((k) => { a.scenarios[k].customers_per_month = 0; }); });
  assert.equal(out.cost_headroom.year_one_sales, 0);
  assert.equal(out.cost_headroom.per_sale_usd, null);
  assert.equal(out.cost_headroom.has_room, false);
  assert.equal(out.cost_headroom.per_month_over_12_months_usd, null);
  assert.match(out.cost_condition, /there is no room for them: any amount they cost adds to that shortfall/);
  assert.ok(!/per sale across/.test(out.cost_condition));
  assert.equal(out.cost_headroom.base_month.per_sale_usd, null);
});

test('headroom: a negative baseline has no room, and says so', async () => {
  const out = await compute((a) => { a.budget_items.push({ item: 'Office lease', category: 'Before validation', cost: 1000, recurrence: 'monthly', basis: 'Founder', reason: 'x', material: true }); a.cost_review.push({ key: 'other', label: 'Office', applies: 'yes', material: true, reason: 'x', budget_items: ['Office lease'], note_in_plan: false }); });
  assert.equal(out.model.year.net, 8680 - 12000);
  const h = out.cost_headroom;
  assert.equal(h.available_usd, -3320);
  assert.equal(h.has_room, false);
  assert.equal(h.per_month_over_12_months_usd, null);
  assert.equal(h.per_sale_usd, null);
  assert.equal(h.one_time_usd, null);
  assert.match(out.cost_condition, /Year-one net cash after one-time costs is -\$3,320 before them, so there is no room for them/);
  assert.match(out.fin_reviews.join(' '), /year-one net cash is already -\$3,320 before them/);
});

test('headroom: different operating periods change what a cost is charged for', async () => {
  // First sale in Months 7-9, and the traction level of 3 customers a month is never reached.
  const out = await compute((a) => { forecast(a, [0, 0, 1, 2]); item(a, 'Professional advice (accounting or legal)').recurrence = 'monthly'; item(a, 'Domain and hosting').cost = null; item(a, 'Domain and hosting').unknown_reason = 'Provider not chosen.'; });
  assert.equal(out.cost_headroom.year_one_sales, 9);                      // (1 + 2) x 3
  const net = out.model.year.net;
  assert.equal(out.cost_headroom.per_sale_usd, Math.floor(net / 9));
  assert.equal(out.cost_headroom.per_month_over_12_months_usd, Math.floor(net / 12));
  const prof = status(out, 'professional').exposure[0];
  assert.deepEqual({ kind: prof.kind, stage: prof.stage, months: prof.months, starts: prof.starts_in_year_one }, { kind: 'monthly', stage: 'After first sale', months: 6, starts: true });
  assert.match(out.forecast_block, /Professional advice \(accounting or legal\): monthly, for the 6 months from Months 7-9/);
  assert.match(out.forecast_block, /Payment processing fee: per sale, on the 9 sales from Months 1-3/);
  // A cost in a stage that never starts is not charged in year one, and the plan says so instead of counting it.
  const host = status(out, 'hosting');
  assert.equal(host.status, 'applicable_amount_unknown');
  assert.equal(host.exposure.find((e) => e.item === 'Domain and hosting').starts_in_year_one, false);
  assert.match(out.forecast_block, /Website, hosting, database and storage would not be charged in year one, because the stage it belongs to does not start/);
  // Cash accumulates over the year; the timing line shows when it exists.
  assert.match(out.forecast_block, /Cumulative net cash by period, before the unresolved costs: Months 1-3 \$0, Months 4-6 \$0, Months 7-9 /);
});

// ---------------- Regulatory checks stay separate ----------------

test('regulatory: a legal or regulatory check is never settled by headroom', async () => {
  const out = await compute();
  const legal = status(out, 'legal');
  assert.equal(legal.regulatory, true);
  assert.equal(legal.status, 'applicability_unknown');
  assert.ok(!out.unresolved_costs.includes(legal.label));
  assert.ok(!out.cost_headroom.shared_by.includes(legal.label));
  assert.ok(!out.cost_condition.includes('Registration'));
  assert.deepEqual(out.regulatory_checks, ['Registration, licensing, insurance and taxes']);
  assert.match(out.forecast_block, /Regulatory checks, not judged by the threshold above: Registration, licensing, insurance and taxes \(not established whether it applies\)\. Whether these are required is a legal question\. A financial threshold cannot show that an obligation does not apply\./);
  // It is listed even when nothing else is unresolved, and a founder answer about costs does not close it.
  const settled = await compute(settle, { cost_answers: { ai_services: { applies: 'no' }, professional_advice: { applies: 'no' } } });
  assert.deepEqual(settled.unresolved_costs, []);
  assert.deepEqual(settled.regulatory_checks, ['Registration, licensing, insurance and taxes']);
  assert.match(settled.forecast_block, /Regulatory checks, not judged by the threshold above/);
  // Regulatory items stay outside every total.
  assert.equal(out.reconciliation.find((r) => r.check === 'Conditional costs are outside every total').ok, true);
});

// ---------------- The gate: REVIEW only with the stated condition ----------------

const planWith = (insert) => { const lines = fixture('Apply Revisions').text.split('\n'); const at = lines.findIndex((l) => /^##\s.*Viability/i.test(l)); assert.ok(at >= 0, 'the preserved plan has a Viability Assessment'); lines.splice(at + 1, 0, '', ...insert, ''); return lines.join('\n'); };
const check = async (fin, text) => { const r = await pipeline(); const rev = clone(fixture('Apply Revisions')); rev.text = text; return runNode('citation-check.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fin, 'Assemble Plan': fixture('Assemble Plan'), 'Apply Revisions': rev, 'Build Evidence': r.ev, 'Growth Plan Generator1': fixture('Growth Plan Generator1') }); };
const COST = /COST CONDITION|UNCONDITIONAL VIABILITY/;
const costIssues = (out) => out.det_issues.filter((i) => COST.test(i.type));
const gate = (out) => { const f = out.det_issues.map((i, n) => ({ id: 'A' + n, severity: i.severity, check: i.type, problem: i.detail })); return runNode('delivery-gate.js', { 'Finalize Plan': { status: f.some((x) => x.severity === 'BLOCKING') ? 'HOLD' : f.some((x) => x.severity === 'MAJOR') ? 'REVIEW' : 'SEND' }, 'Plan Revision Request': { findings: f } }); };

test('gate: unresolved costs hold the plan unless the Viability Assessment carries the computed condition', async () => {
  const fin = await compute();
  // No condition in the plan: held.
  const without = await check(fin, fixture('Apply Revisions').text);
  const miss = costIssues(without);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].type, 'VIABILITY STATED WITHOUT THE COST CONDITION');
  assert.equal(miss[0].severity, 'BLOCKING');
  assert.ok(miss[0].detail.includes(fin.cost_condition), 'the finding gives the reviser the exact paragraph');
  assert.ok(miss[0].line > 0);
  assert.equal((await gate(without)).blocked, true);
  // The condition, copied exactly: no cost blocker. The unresolved costs remain a review item for the approver.
  const withIt = await check(fin, planWith([fin.cost_condition]));
  assert.deepEqual(costIssues(withIt), []);
  const reviewItem = withIt.det_issues.filter((i) => i.type === 'FINANCIAL MODEL' && /Unresolved costs:/.test(i.detail));
  assert.equal(reviewItem.length, 1);
  assert.equal(reviewItem[0].severity, 'MAJOR');
  assert.ok(!withIt.det_issues.some((i) => i.type === 'FINANCIAL MODEL' && i.severity === 'BLOCKING'));
  // Markdown emphasis around it is accepted. Changed figures, a missing clause, or the wrong section are not.
  assert.deepEqual(costIssues(await check(fin, planWith(['**' + fin.cost_condition + '**']))), []);
  for (const altered of [fin.cost_condition.replace('$723', '$900'), fin.cost_condition.replace('$8,680', '$9,000'), fin.cost_condition.replace(' They share that one amount; it is not a separate allowance for each.', ''), fin.cost_condition.replace('This is a break-even threshold, not an estimate of these costs and not evidence that the business works.', 'This leaves comfortable room.'), 'Some costs are still being confirmed.']) {
    const out = await check(fin, planWith([altered]));
    assert.equal(costIssues(out).filter((i) => i.type === 'VIABILITY STATED WITHOUT THE COST CONDITION').length, 1, altered.slice(0, 60));
    assert.equal((await gate(out)).blocked, true);
  }
  const elsewhere = fixture('Apply Revisions').text.replace(/^(##\s.*Executive Summary.*)$/m, '$1\n\n' + fin.cost_condition);
  assert.equal(costIssues(await check(fin, elsewhere)).filter((i) => i.type === 'VIABILITY STATED WITHOUT THE COST CONDITION').length, 1);
});

test('gate: an unconditional viability claim stays blocked even when the condition is present', async () => {
  const fin = await compute();
  for (const claim of ['The business is viable.', 'On these numbers the model works.', 'QYLAT will be profitable in year one.', 'The offer is financially sound and worth pursuing.']) {
    const out = await check(fin, planWith([fin.cost_condition, '', claim]));
    const hit = costIssues(out).filter((i) => i.type === 'UNCONDITIONAL VIABILITY CLAIM WITH UNRESOLVED COSTS');
    assert.equal(hit.length, 1, claim);
    assert.equal(hit[0].severity, 'BLOCKING');
    assert.equal((await gate(out)).blocked, true);
  }
  for (const ok of ['The offer could be profitable if these costs stay below the threshold.', 'Whether the business is viable depends on the unresolved costs above.', 'Year-one net cash is positive only if those costs stay under the threshold.']) {
    assert.deepEqual(costIssues(await check(fin, planWith([fin.cost_condition, '', ok]))), [], ok);
  }
  // With nothing unresolved, the cost gate is silent.
  const settled = await compute(settle);
  assert.deepEqual(costIssues(await check(settled, planWith(['The business is viable.']))), []);
});

// ---------------- Writing and revision keep the computed condition ----------------

test('writer and reviser are given the computed condition and told to keep it', async () => {
  const fin = await compute();
  assert.match(fin.financial_model, /COST CONDITION \(required\)\. The Viability Assessment must contain the paragraph below, copied exactly/);
  assert.ok(fin.financial_model.includes(fin.cost_condition));
  assert.ok(fin.starter_user_prompt.includes(fin.cost_condition), 'the Starter writer gets it as well');
  // Every figure in the paragraph is one the plan is allowed to print.
  (fin.cost_condition.match(/\$[\d,]+/g) || []).forEach((m) => assert.ok(fin.allowed_money.includes(m) || m === '$0', m));
  const r = await pipeline();
  const writer = JSON.parse((await runNode('build-growth-payload.js', { 'Founder Context': fixture('Founder Context'), 'Build Evidence': r.ev, 'Compute Financials': fin })).payload).messages[1].content;
  assert.ok(writer.includes(fin.cost_condition));
  // The computed block is part of the forecast table, which code inserts and the reviser cannot edit.
  assert.match(fin.forecast_block, /\*\*Costs that are not resolved, and the room the forecast has for them\*\*/);
  // When the condition is missing, the reviser is handed the exact paragraph and the rule to keep it.
  const cc = await runNode('citation-check.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fin, 'Assemble Plan': fixture('Assemble Plan'), 'Build Evidence': r.ev, 'Growth Plan Generator1': fixture('Growth Plan Generator1') });
  assert.equal(cc.attempt, 0);
  assert.match(JSON.parse(cc.qa_payload).messages[0].content, /27\. Cost condition\./);
  const prr = await runNode('plan-revision-request.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fin, 'Citation Check': cc, 'Assemble Plan': fixture('Assemble Plan'), 'Build Evidence': r.ev }, { choices: [{ message: { content: JSON.stringify({ findings: [], summary: '' }) } }], usage: {} });
  const revise = JSON.parse(prr.revise_payload);
  assert.match(revise.messages[0].content, /Cost condition: the paragraph in the Viability Assessment that begins "This assessment is conditional\." is computed\. Never remove it, reword it, or change its figures/);
  assert.ok(revise.messages[1].content.includes(fin.cost_condition), 'the edit unit carries the paragraph to insert');
  assert.ok(prr.findings.some((f) => f.check === 'VIABILITY STATED WITHOUT THE COST CONDITION' && f.severity === 'BLOCKING'));
});
