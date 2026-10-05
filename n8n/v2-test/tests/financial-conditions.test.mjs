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
const LEGAL = 'Registration, licensing, insurance and taxes';
// Resolve everything except what a test wants open. The regulatory items are given amounts, so only their applicability stays open.
const settle = (a) => { item(a, 'Payment processing fee').cost = 10; review(a, 'ai_api').applies = 'no'; review(a, 'professional').applies = 'no'; item(a, 'Business registration').cost = 300; item(a, 'Professional liability insurance').cost = 40; };
const forecast = (a, cpms) => a.forecast.quarters.forEach((q, i) => { q.customers_per_month = cpms[i]; });

// ---------------- The verified example: execution 63220 ----------------

test('63220: the reported thresholds are reproduced, with the formula', async () => {
  const out = await compute();
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
  assert.ok(h.per_month_over_12_months_usd * 12 <= h.available_usd && h.per_sale_usd * 27 <= h.available_usd);
  assert.deepEqual(h.shared_by, ['Payment processing and transaction fees', 'AI, model, API, research and data services used in delivery', 'Professional services', LEGAL]);
});

test('63220: each cost is reported once, with one status, and unknown is never zero', async () => {
  const out = await compute();
  assert.equal(new Set(out.cost_status.map((c) => c.key)).size, out.cost_status.length);
  assert.equal(status(out, 'payment').status, 'applicable_amount_unknown');
  assert.equal(status(out, 'ai_api').status, 'applicability_unknown');
  assert.equal(status(out, 'professional').status, 'applicability_unknown');
  assert.equal(status(out, 'ads').status, 'not_applicable');
  assert.equal(status(out, 'software').status, 'applicable_amount_known');
  assert.equal(out.fin_issues.length, 0);
  assert.equal(out.fin_reviews.length, 1);
  assert.equal((out.fin_reviews[0].match(/Professional services/g) || []).length, 1);
  assert.ok(!out.fin_reviews.some((x) => /"Professional advice \(accounting or legal\)" applies/.test(x)));
  assert.ok(!/These costs apply and are in none of the totals/.test(out.budget_block));
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
  assert.equal(out.model.year.net, 8680 - 270);   // the known per-sale cost is in the figures once: 27 sales x $10
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
  assert.ok(!/share that one amount/.test(applies.cost_condition));
  // An unknown-applicability cost whose amount is already in the totals is not counted against headroom again.
  const counted = await compute((a) => { settle(a); review(a, 'software').applies = 'unknown'; });
  assert.equal(status(counted, 'software').status, 'applicability_unknown');
  assert.equal(status(counted, 'software').in_totals, true);
  assert.deepEqual(counted.unresolved_costs, []);
});

test('status: founder answers are used, an answer alone does not resolve a cost, and nothing is converted', async () => {
  const withAnswers = (cost_answers, change = () => {}) => compute(change, { cost_answers });
  const none = await compute();
  assert.equal(status(none, 'ai_api').source, 'financial step');   // an existing submission: no answers
  const no = await withAnswers({ ai_services: { applies: 'Not applicable' }, professional_advice: { applies: 'no' } });
  assert.equal(status(no, 'ai_api').status, 'not_applicable');
  assert.equal(status(no, 'ai_api').source, 'founder answer');
  assert.equal(status(no, 'professional').status, 'not_applicable');
  assert.deepEqual(no.unresolved_costs, ['Payment processing and transaction fees', LEGAL]);
  const unk = await withAnswers({ ai_services: { applies: 'Unknown' } });
  assert.equal(status(unk, 'ai_api').status, 'applicability_unknown');
  const yes = await withAnswers({ ai_services: { applies: 'yes', amount: 50, currency: 'USD', unit: 'per month' } });
  assert.equal(status(yes, 'ai_api').status, 'applicable_amount_known');
  assert.equal(yes.cost_headroom.founder_costs_not_in_totals_usd, 600);
  assert.equal(yes.cost_headroom.available_usd, 8680 - 600);
  assert.equal(yes.cost_headroom.per_month_over_12_months_usd, Math.floor(8080 / 12));
  assert.equal(yes.model.year.net, 8680, 'the computed tables are not altered by a founder answer');
  assert.match(yes.forecast_block, /Founder-stated cost not in the tables above: AI, model, API, research and data services used in delivery, \$50 per month, \$600 in year one/);
  assert.equal((await withAnswers({ ai_services: { applies: 'yes', amount: 2, currency: 'USD', unit: 'per sale' } })).cost_headroom.available_usd, 8680 - 54);
  assert.equal((await withAnswers({ professional_advice: { applies: 'yes', amount: 400, currency: 'USD', unit: 'one-time' } })).cost_headroom.available_usd, 8680 - 400);
  // Not resolved, and never converted: no amount, another currency, per use with no usage volume, no unit.
  for (const [answer, why] of [
    [{ applies: 'yes' }, /gave no amount/],
    [{ applies: 'yes', amount: 50, currency: 'EUR', unit: 'per month' }, /given in EUR and is not converted/],
    [{ applies: 'yes', amount: 1800, currency: 'THB', unit: 'per month' }, /given in THB and is not converted/],
    [{ applies: 'yes', amount: 0.02, currency: 'USD', unit: 'per use' }, /per use, and the number of uses per sale is not known/],
    [{ applies: 'yes', amount: 50, currency: 'USD' }, /has no unit/],
    [{ applies: 'yes', amount: '', currency: 'USD', unit: 'per month' }, /gave no amount/],
  ]) {
    const out = await withAnswers({ ai_services: answer });
    assert.equal(status(out, 'ai_api').status, 'applicable_amount_unknown', JSON.stringify(answer));
    assert.match(status(out, 'ai_api').founder_answer.not_used_because, why);
    assert.equal(status(out, 'ai_api').founder_answer.currency, answer.currency || 'USD', 'the currency is kept as given');
    assert.equal(out.cost_headroom.available_usd, 8680, 'nothing was assumed or converted');
    assert.ok(out.unresolved_costs.includes('AI, model, API, research and data services used in delivery'));
  }
  // A founder amount is not added on top of an amount the model already carries.
  const both = await withAnswers({ ai_services: { applies: 'yes', amount: 50, currency: 'USD', unit: 'per month' } }, (a) => { a.budget_items.push({ item: 'AI service', category: 'Before validation', cost: 40, recurrence: 'monthly', basis: 'Founder', reason: 'x', material: false }); review(a, 'ai_api').applies = 'yes'; review(a, 'ai_api').budget_items = ['AI service']; });
  assert.equal(both.cost_headroom.founder_costs_not_in_totals_usd, 0);
  assert.equal(status(both, 'ai_api').in_totals, true);
});

// ---------------- Regulatory: applicability check and financial treatment are separate ----------------

test('regulatory: an unknown obligation stays explicit, and its unknown amount stays in the financial conditions', async () => {
  const out = await compute();
  const legal = status(out, 'legal');
  assert.equal(legal.regulatory, true);
  assert.equal(legal.status, 'applicability_unknown');
  assert.equal(legal.amount_open, true);
  // Explicit as an obligation to check ...
  assert.deepEqual(out.regulatory_checks, [LEGAL]);
  assert.match(out.forecast_block, /Regulatory checks: Registration, licensing, insurance and taxes \(regulatory: not established whether it is required, and no amount is established\)\. Whether these are required is a legal question\. A financial threshold cannot show that an obligation does not apply\./);
  // ... and, because no amount is established, also one of the unresolved costs. It does not vanish for being regulatory.
  assert.ok(out.unresolved_costs.includes(LEGAL));
  assert.ok(out.cost_headroom.shared_by.includes(LEGAL));
  assert.match(out.cost_condition, /Registration, licensing, insurance and taxes \(regulatory: not established whether it is required, and no amount is established\)/);
  assert.match(out.cost_condition, /Whether Registration, licensing, insurance and taxes is required is a legal question that this threshold does not answer\./);
  // Nothing was put into a total for it.
  assert.equal(out.model.year.net, 8680);
  assert.equal(out.reconciliation.find((r) => r.check === 'Conditional costs are outside every total').ok, true);
});

test('regulatory: an unknown obligation with a known amount is stated as "if required", not hidden and not charged', async () => {
  const out = await compute(settle);
  const legal = status(out, 'legal');
  assert.equal(legal.status, 'applicability_unknown');
  assert.equal(legal.amount_open, false);
  assert.deepEqual(out.unresolved_costs, []);
  assert.deepEqual(out.regulatory_checks, [LEGAL]);
  assert.equal(out.model.year.net, 8680 - 270, 'not charged while the obligation is unknown');
  // Its effect if required is computed: $300 once + $40 a month for the 12 months after the first sale.
  assert.match(out.forecast_block, /If they are required, year-one net cash after one-time costs would be \$780 lower: \$7,630 instead of \$8,410\./);
  assert.match(out.forecast_block, /\*\*Regulatory checks still to make\*\*/);
  assert.match(out.forecast_block, /Where an amount is known, its effect if required is given with the conditional costs above\./);
});

test('regulatory: a known applicable cost goes into the cash figures at its stage, once', async () => {
  const base = await compute(settle);
  const required = await compute((a) => { settle(a); review(a, 'legal').applies = 'yes'; });
  const legal = status(required, 'legal');
  assert.equal(legal.status, 'applicable_amount_known');
  assert.equal(legal.in_totals, true);
  assert.deepEqual(required.regulatory_checks, []);
  // $300 one-time in the first-sale period and $40 a month for 12 months: $780 in year one, the same figure the "if required" line gave.
  assert.equal(required.model.year.one_time, base.model.year.one_time + 300);
  assert.equal(required.model.year.expenses, base.model.year.expenses + 480);
  assert.equal(required.model.year.net, base.model.year.net - 780);
  assert.equal(required.model.periods[0].one_time, 300);
  assert.ok(!/if required/.test(required.budget_block.split('\n').find((l) => l.startsWith('| Business registration'))));
  assert.equal(required.reconciliation.filter((r) => !r.ok).length, 0);
  // Required, but with no amount: unresolved, labeled as required.
  const noAmount = await compute((a) => { settle(a); review(a, 'legal').applies = 'yes'; item(a, 'Business registration').cost = null; item(a, 'Business registration').unknown_reason = 'Depends on the jurisdiction.'; });
  assert.equal(status(noAmount, 'legal').status, 'applicable_amount_unknown');
  assert.deepEqual(noAmount.unresolved_costs, [LEGAL]);
  assert.match(noAmount.cost_condition, /regulatory: required, amount not established/);
  assert.equal(noAmount.model.year.net, base.model.year.net - 480, 'the insurance with an amount is charged; the registration with none is not set to zero');
});

// ---------------- Headroom under different models ----------------

test('headroom: several unknown costs share one amount, and it does not grow with their number', async () => {
  const four = await compute();
  const one = await compute((a) => { settle(a); item(a, 'Payment processing fee').cost = null; item(a, 'Payment processing fee').unknown_reason = 'Processor not chosen.'; });
  assert.equal(one.unresolved_costs.length, 1);
  assert.equal(four.unresolved_costs.length, 4);
  // The same rule gives the threshold in both cases: it depends on the cash available, never on how many costs are open.
  for (const out of [four, one]) {
    const h = out.cost_headroom;
    assert.equal(h.per_month_over_12_months_usd, Math.floor(h.available_usd / 12));
    assert.equal(h.per_sale_usd, Math.floor(h.available_usd / h.year_one_sales));
    assert.equal(h.one_time_usd, h.available_usd);
  }
  assert.match(four.cost_condition, /They share that one amount; it is not a separate allowance for each\./);
  assert.match(four.forecast_block, /The 4 unresolved costs share that one amount\. It is not a separate allowance for each\./);
  assert.match(four.forecast_block, /These are three ways of spending the same amount, rounded down\./);
  assert.match(four.cost_condition, /break-even threshold for the year as a whole, not an estimate of these costs and not evidence that the business works/);
  assert.ok(!/share that one amount/.test(one.cost_condition));
});

test('headroom: zero forecast sales means no per-sale threshold', async () => {
  const out = await compute((a) => { forecast(a, [0, 0, 0, 0]); });
  assert.equal(out.cost_headroom.year_one_sales, 0);
  assert.equal(out.cost_headroom.per_sale_usd, null);
  assert.ok(!/per sale across/.test(out.cost_condition));
  assert.ok(!/per sale across/.test(out.forecast_block));
  // The Base scenario is a separate, monthly figure and is still shown as such when it has sales.
  assert.equal(out.cost_headroom.base_month.per_sale_usd, 340);
});

test('headroom: monthly and one-time thresholds exist only when the available cash is positive', async () => {
  // Positive: all three.
  const positive = (await compute()).cost_headroom;
  assert.ok(positive.available_usd > 0 && positive.per_month_over_12_months_usd > 0 && positive.one_time_usd > 0 && positive.per_sale_usd > 0);
  // Negative, with sales: none of the three, although sales exist.
  const negative = await compute((a) => { a.budget_items.push({ item: 'Office lease', category: 'Before validation', cost: 1000, recurrence: 'monthly', basis: 'Founder', reason: 'x', material: true }); a.cost_review.push({ key: 'other', label: 'Office', applies: 'yes', material: true, reason: 'x', budget_items: ['Office lease'], note_in_plan: false }); });
  assert.equal(negative.model.year.net, 8680 - 12000);
  const n = negative.cost_headroom;
  assert.equal(n.year_one_sales, 27);
  assert.deepEqual([n.available_usd, n.has_room, n.per_month_over_12_months_usd, n.per_sale_usd, n.one_time_usd], [-3320, false, null, null, null]);
  assert.match(negative.cost_condition, /Year-one net cash after one-time costs is -\$3,320 before them, so there is no room for them/);
  assert.match(negative.fin_reviews.join(' '), /year-one net cash is already -\$3,320 before them/);
  // Exactly zero, with no sales: none.
  const zero = (await compute((a) => { forecast(a, [0, 0, 0, 0]); })).cost_headroom;
  assert.deepEqual([zero.available_usd, zero.has_room, zero.per_month_over_12_months_usd, zero.per_sale_usd, zero.one_time_usd], [0, false, null, null, null]);
});

// ---------------- Timing ----------------

test('timing: charged months are named, and annual headroom is kept apart from earlier cash', async () => {
  // First sale in Months 7-9; the traction level of 3 customers a month is never reached.
  const out = await compute((a) => { forecast(a, [0, 0, 1, 2]); item(a, 'Professional advice (accounting or legal)').recurrence = 'monthly'; item(a, 'Domain and hosting').cost = null; item(a, 'Domain and hosting').unknown_reason = 'Provider not chosen.'; });
  assert.equal(out.cost_headroom.year_one_sales, 9);
  const prof = status(out, 'professional').exposure[0];
  assert.deepEqual({ kind: prof.kind, stage: prof.stage, months: prof.months, starts: prof.starts_in_year_one }, { kind: 'monthly', stage: 'After first sale', months: 6, starts: true });
  // The months are named. "For the 6 months from Months 7-9" is gone.
  assert.match(out.forecast_block, /Professional advice \(accounting or legal\): monthly, in Months 7-12 \(6 months\)/);
  assert.match(out.forecast_block, /Payment processing fee: per sale, on the 9 sales in Months 1-12/);
  assert.match(out.forecast_block, /Business registration: once, in the period Months 7-9/);
  assert.ok(!/months from Months/.test(out.forecast_block));
  // A cost in a stage that never starts is not charged in year one.
  assert.equal(status(out, 'hosting').exposure.find((e) => e.item === 'Domain and hosting').starts_in_year_one, false);
  assert.match(out.forecast_block, /Website, hosting, database and storage would not be charged in year one, because the stage it belongs to does not start/);
  assert.match(out.forecast_block, /Annual headroom and earlier cash are different things\. Cumulative net cash at the end of each period, before the unresolved costs: Months 1-3 \$0, Months 4-6 \$0, Months 7-9 /);
});

test('timing: an early shortfall is reported as a funding need even when the year ends positive', async () => {
  const out = await compute((a) => { a.budget_items.push({ item: 'Course build', category: 'Before validation', cost: 3000, recurrence: 'one-time', basis: 'Founder', reason: 'x', material: true }); a.cost_review.push({ key: 'other', label: 'Course', applies: 'yes', material: true, reason: 'x', budget_items: ['Course build'], note_in_plan: false }); });
  const h = out.cost_headroom;
  assert.equal(out.model.year.net, 8680 - 3000);
  assert.equal(h.has_room, true);                       // the year as a whole is positive ...
  assert.equal(h.available_usd, 5680);
  assert.deepEqual(h.cumulative_net_by_period.map((x) => x.usd), [1005 - 3000, 3060 - 3000, 5620 - 3000, 8680 - 3000]);
  assert.equal(h.lowest_cumulative_usd, -1995);         // ... but cash is short at the end of Months 1-3
  assert.equal(h.lowest_cumulative_period, 'Months 1-3');
  assert.equal(h.startup_funding_needed_before_unresolved_costs_usd, 1995);
  assert.match(out.forecast_block, /The forecast is already short by \$1,995 at the end of Months 1-3, before any unresolved cost\. That shortfall has to be funded from the startup budget \(ceiling \$5,000\)/);
  assert.match(out.cost_condition, /Separately, the forecast is short by \$1,995 at the end of Months 1-3 before these costs, which the startup budget has to cover\./);
  // With no early shortfall the plan still says that annual room is not early cash.
  const base = await compute();
  assert.equal(base.cost_headroom.startup_funding_needed_before_unresolved_costs_usd, 0);
  assert.match(base.forecast_block, /Cash is not negative at the end of any period, but an unresolved cost paid early can be larger than the cash built up by then even when it is within the annual threshold/);
  assert.ok(!/Separately, the forecast is short/.test(base.cost_condition));
});

// ---------------- The condition in the final plan ----------------

const ev = (async () => (await pipeline()).ev)();
const planWith = (insert, text = fixture('Apply Revisions').text) => { const lines = text.split('\n'); const at = lines.findIndex((l) => /^##\s.*Viability/i.test(l)); assert.ok(at >= 0); lines.splice(at + 1, 0, '', ...insert, ''); return lines.join('\n'); };
const finalize = async (fin, text, findings = []) => { const rev = clone(fixture('Apply Revisions')); rev.text = text; const cc = { det_issues: [], attempt: 1 }; return runNode('finalize-plan.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fin, 'Assemble Plan': fixture('Assemble Plan'), 'Apply Revisions': rev, 'Build Evidence': await ev, 'Citation Check': cc, 'Plan Revision Request': { findings, verification: [], new_defects: [] }, 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Growth Plan Generator1': fixture('Growth Plan Generator1'), 'Brave Search': fixture('Brave Search') }); };
const gate = (fp, findings = []) => runNode('delivery-gate.js', { 'Finalize Plan': fp, 'Plan Revision Request': { findings } });
const viabilityOf = (text) => { const L = text.split('\n'); const a = L.findIndex((l) => /^##\s.*Viability/i.test(l)); const b = L.findIndex((l, i) => i > a && /^##\s/.test(l)); return L.slice(a + 1, b < 0 ? L.length : b); };
const count = (text, needle) => text.split(needle).length - 1;

test('final plan: the condition is inserted by code after revision, once, at the start of the Viability Assessment', async () => {
  const fin = await compute();
  const original = fixture('Apply Revisions').text;
  assert.equal(count(original, fin.cost_condition), 0, 'the revised plan does not contain it');
  const fp = await finalize(fin, original);
  assert.deepEqual({ required: fp.cost_condition_check.required, inserted: fp.cost_condition_check.inserted, present: fp.cost_condition_check.present }, { required: true, inserted: true, present: true });
  assert.equal(count(fp.text, fin.cost_condition), 1);
  assert.equal(viabilityOf(fp.text).filter((l) => l.trim())[0], fin.cost_condition, 'it is the first paragraph of the section');
  // Nothing else in the plan was changed by the insertion.
  assert.equal(fp.text.replace('\n\n' + fin.cost_condition, ''), original);
  // Already there, exactly: not duplicated.
  const twice = await finalize(fin, planWith([fin.cost_condition]));
  assert.equal(twice.cost_condition_check.inserted, false);
  assert.equal(count(twice.text, fin.cost_condition), 1);
  // A paraphrase written by the model does not stand in for it: the computed paragraph is still placed.
  const paraphrase = await finalize(fin, planWith(['This assessment is conditional on a few costs still being confirmed, roughly $700 a month.']));
  assert.equal(paraphrase.cost_condition_check.inserted, true);
  assert.equal(count(paraphrase.text, fin.cost_condition), 1);
  // With nothing unresolved, nothing is inserted.
  const settled = await finalize(await compute(settle), original);
  assert.deepEqual({ required: settled.cost_condition_check.required, inserted: settled.cost_condition_check.inserted }, { required: false, inserted: false });
  assert.equal(settled.text, original);
});

test('final plan: validated before the PDF, and unresolved costs always reach a person', async () => {
  const fin = await compute();
  const clean = await finalize(fin, fixture('Apply Revisions').text);
  assert.deepEqual(clean.cost_condition_check.problems, []);
  assert.equal(clean.status, 'REVIEW', 'never SEND while costs are unresolved');
  assert.match(clean.report, /COST CONDITION: inserted by code at the start of the Viability Assessment\. Surrounding text: no contradicting statement found\./);
  const g = await gate(clean);
  assert.equal(g.blocked, false);
  assert.equal(g.version_status, 'awaiting_approval');
  assert.equal(g.review_status, 'REVIEW');
  // No Viability Assessment to place it in: held.
  const none = await finalize(fin, fixture('Apply Revisions').text.replace(/^(##\s.*)Viability Assessment(.*)$/m, '$1Outlook$2'));
  assert.equal(none.status, 'HOLD');
  assert.match(none.cost_condition_check.problems[0], /no Viability Assessment section/);
  assert.equal((await gate(none)).blocked, true);
});

test('final plan: inserting the condition does not hide a contradicting statement', async () => {
  const fin = await compute();
  for (const claim of ['The business is viable.', 'On these numbers the model works.', 'QYLAT will be profitable in year one.', 'All costs are included in these figures.', 'There are no other costs to plan for.', 'The $723 a month is the budget for each cost.']) {
    const fp = await finalize(fin, planWith([claim]));
    assert.equal(fp.cost_condition_check.present, true, 'the paragraph is there');
    assert.equal(fp.cost_condition_check.problems.length, 1, claim);
    assert.equal(fp.status, 'HOLD', claim);
    const g = await gate(fp);
    assert.equal(g.blocked, true, claim);
    assert.equal(g.version_status, 'changes_requested');
    assert.ok(g.blockers_text.includes('COST CONDITION'), 'the held notice names the reason');
  }
  // In the Executive Summary as well.
  const summary = await finalize(fin, fixture('Apply Revisions').text.replace(/^(##\s.*Executive Summary.*)$/m, '$1\n\nThe business is clearly viable.'));
  assert.equal(summary.status, 'HOLD');
  // Conditional wording is accepted.
  for (const ok of ['The offer could be profitable if these costs stay below the threshold.', 'Whether the business is viable depends on the unresolved costs above.', 'Not all costs are known yet.']) {
    const fp = await finalize(fin, planWith([ok]));
    assert.deepEqual(fp.cost_condition_check.problems, [], ok);
    assert.equal(fp.status, 'REVIEW');
  }
  // Another blocking finding still holds the plan; the insertion does not clear it.
  const other = await finalize(fin, fixture('Apply Revisions').text, [{ id: 'AUTO-001', severity: 'BLOCKING', check: 'UNVERIFIED FIGURE', problem: 'x' }]);
  assert.equal(other.status, 'HOLD');
  assert.equal(other.cost_condition_check.present, true);
});

test('before revision: contradicting statements are raised so the reviser can correct them; the missing paragraph is not a finding', async () => {
  const fin = await compute();
  const check = async (text) => { const rev = clone(fixture('Apply Revisions')); rev.text = text; return runNode('citation-check.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fin, 'Assemble Plan': fixture('Assemble Plan'), 'Apply Revisions': rev, 'Build Evidence': await ev, 'Growth Plan Generator1': fixture('Growth Plan Generator1') }); };
  const COST = /COST CONDITION|UNCONDITIONAL VIABILITY/;
  const plain = await check(fixture('Apply Revisions').text);
  assert.deepEqual(plain.det_issues.filter((i) => COST.test(i.type)), []);
  assert.ok(plain.det_issues.some((i) => i.type === 'FINANCIAL MODEL' && i.severity === 'MAJOR' && /Unresolved costs:/.test(i.detail)));
  const viable = (await check(planWith(['The business is viable.']))).det_issues.filter((i) => COST.test(i.type));
  assert.deepEqual(viable.map((i) => i.severity + ' ' + i.type), ['BLOCKING UNCONDITIONAL VIABILITY CLAIM WITH UNRESOLVED COSTS']);
  const denies = (await check(planWith(['All costs are included in these figures.']))).det_issues.filter((i) => COST.test(i.type));
  assert.deepEqual(denies.map((i) => i.severity + ' ' + i.type), ['BLOCKING COST CONDITION CONTRADICTED']);
});

test('writer and reviser are told the paragraph is placed by code and what must agree with it', async () => {
  const fin = await compute();
  assert.match(fin.financial_model, /COST CONDITION \(inserted by code\)\. The paragraph below is placed at the start of the Viability Assessment by code after revision\. Do not write it yourself/);
  assert.ok(fin.financial_model.includes(fin.cost_condition));
  assert.ok(fin.starter_user_prompt.includes(fin.cost_condition), 'the Starter writer sees it as well');
  (fin.cost_condition.match(/\$[\d,]+/g) || []).forEach((m) => assert.ok(fin.allowed_money.includes(m) || m === '$0', m));
  assert.match(fin.forecast_block, /\*\*Costs that are not resolved, and the room the forecast has for them\*\*/);
  const cc = await runNode('citation-check.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fin, 'Assemble Plan': fixture('Assemble Plan'), 'Build Evidence': await ev, 'Growth Plan Generator1': fixture('Growth Plan Generator1') });
  assert.match(JSON.parse(cc.qa_payload).messages[0].content, /27\. Cost condition\..*Code places that paragraph at the start of the Viability Assessment after revision, so do not report it as missing\./s);
  const prr = await runNode('plan-revision-request.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fin, 'Citation Check': cc, 'Assemble Plan': fixture('Assemble Plan'), 'Build Evidence': await ev }, { choices: [{ message: { content: JSON.stringify({ findings: [], summary: '' }) } }], usage: {} });
  assert.match(JSON.parse(prr.revise_payload).messages[0].content, /Cost condition: when costs are unresolved, code places a paragraph beginning "This assessment is conditional\." at the start of the Viability Assessment after your edits\. Do not write that paragraph/);
});
