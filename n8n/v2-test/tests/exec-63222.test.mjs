// Regression checks for the defects found in execution 63222.
// Run: node --test n8n/v2-test/tests/exec-63222.test.mjs
// No network and no model calls. Every input is a saved node output of execution 63222 (fixtures/exec-63222):
// the evidence, the financial answer, the reviser's edits, the verifier's real response and the held plan.
// The held plan is read, never rewritten. Sentences under test are added to a copy in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, clone, ROOT } from './harness.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63222');
const fx = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const fx21 = (name) => JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'exec-63221', name + '.json'), 'utf8'));
const HELD_PLAN = readFileSync(path.join(DIR, 'final-plan.md'), 'utf8');
const FOUNDER = fx('Founder Context');
const FIN = fx('Compute Financials');
const EV = fx('Build Evidence');
const lineOf = (n) => HELD_PLAN.split('\n')[n - 1];
const assumptions = (file) => { const c = file.choices[0].message.content; return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); };

const check = async (text = HELD_PLAN, { fin = FIN, founder = FOUNDER, firstPass = false, rev } = {}) => {
  const stubs = { 'Founder Context': founder, 'Compute Financials': fin, 'Assemble Plan': firstPass ? { ...fx('Assemble Plan'), text } : fx('Assemble Plan'), 'Build Evidence': EV, 'Growth Plan Generator1': fx('Growth Plan Generator1') };
  if (!firstPass) stubs['Apply Revisions'] = rev || { ...fx('Apply Revisions'), text };
  return runNode('citation-check.js', stubs);
};
const at = (out, line) => out.det_issues.filter((i) => i.line === line).map((i) => i.severity + ' ' + i.type);
const onLast = async (line, opts) => { const text = HELD_PLAN.replace(/\n+$/, '') + '\n\n' + line + '\n'; return at(await check(text, opts), text.replace(/\n+$/, '').split('\n').length); };
const only = (list, re) => list.filter((x) => re.test(x));

// ---------------- 1. Citation scope ----------------

const WRONG = 'BLOCKING CITATION ATTACHED TO THE WRONG COMPANY';
const NOT_TIED = 'BLOCKING CITATION NOT TIED TO THIS COMPANY';

test('scope: the row blocked in 63222 names Fullstory in item 1 and cites S24 in item 2, and now passes', async () => {
  const row = lineOf(127);
  assert.match(row, /^\| Opportunities \| 1\. .*Fullstory survey.*\[S16\]\..* 2\. A vendor page .*\[S24\]/);
  const out = await check();
  assert.deepEqual(only(at(out, 127), /CITATION/), []);
  assert.deepEqual(only(await onLast(row), /CITATION/), []);
  assert.ok(!out.det_issues.some((i) => /CITATION/.test(i.type)));
});

test('scope: a genuinely wrong citation in the same layout still blocks', async () => {
  // Item 2 is about Traveling with Kristin and cites the Fullstory page.
  assert.deepEqual(only(await onLast('| Opportunities | 1. High earners rely on digital channels, from a Fullstory survey [S16]. 2. Traveling with Kristin says it has planned relocations for more than 1,500 people [S16]. |'), /CITATION/), [WRONG]);
  // Item 2 is about Fullstory and cites a page no ledger entry ties to it.
  assert.deepEqual(only(await onLast('| Opportunities | 1. A vendor page states a typical range [S24]. 2. Fullstory reports that packages typically range from $2,000 to $8,000 [S24]. |'), /CITATION/), [NOT_TIED]);
  // Item 1 is wrong and item 2 is right: the right one does not excuse the wrong one.
  assert.deepEqual(only(await onLast('| Threats | 1. Traveling with Kristin claims 1,500 relocations [S16]. 2. A Fullstory survey found heavy use of digital channels [S16]. |'), /CITATION/), [WRONG]);
});

test('scope: sentences and clauses outside tables are judged separately too', async () => {
  assert.deepEqual(only(await onLast('A Fullstory survey found heavy use of digital channels [S16]. A vendor page states a typical range of $2,000 to $8,000 [S24].'), /CITATION/), []);
  assert.deepEqual(only(await onLast('A Fullstory survey found heavy use of digital channels [S16]; Traveling with Kristin says it planned 1,500 relocations [S16].'), /CITATION/), [WRONG]);
  assert.deepEqual(only(await onLast('Traveling with Kristin [S2] and Sterling Lexicon [S12] both describe relocation services.'), /CITATION/), []);
});

test('scope: a row label and a profile table still apply to the whole row', async () => {
  assert.deepEqual(only(await onLast('| Traveling with Kristin | Personalized relocation consulting [S16] | Relevant to people planning a move |'), /CITATION/), [WRONG]);
  assert.deepEqual(only(await onLast('| Traveling with Kristin | Personalized relocation consulting [S2] | Relevant to people planning a move [S2] |'), /CITATION/), []);
  const out = await check();
  assert.ok(out.det_issues.every((i) => !/CITATION/.test(i.type)), 'the competitor profile tables of the held plan pass');
});

// ---------------- 2. The revision verifier's result ----------------

const REAL = () => { const c = fx('Final QA')[1].choices[0].message.content; return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); };
const secondPass = async (qa) => {
  const rev = fx('Apply Revisions');
  const cc = await check(rev.text, { rev });
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, { choices: [{ message: { content: JSON.stringify(qa) } }] });
  return { out, cc, rev, unv: out.findings.filter((f) => f.check === 'REVISION CHECK UNRESOLVED'), revs: out.findings.filter((f) => /^REV-/.test(f.id)) };
};
const shown = () => [...new Set(fx('Apply Revisions').edit_log.map((e) => e.unit))];
const clean = (over = {}) => ({ ...REAL(), new_defects: undefined, edit_checks: shown().map((unit) => over[unit] || { unit, verdict: 'NO_NEW_DEFECT', severity: '', check: '', quote: '', problem: '', fix: '' }) });

test('verifier: the real 63222 response listed two "new defects" that say no defect was introduced', () => {
  const nd = REAL().new_defects;
  assert.equal(nd.length, 2);
  assert.equal(nd[0].unit, 'U3');
  assert.equal(nd[0].severity, 'BLOCKING');
  assert.match(nd[0].problem, /so no new defect is introduced here\.$/);
  assert.match(nd[1].problem, /so no new defect is introduced by this edit\.$/);
});

test('verifier: that response is neither a confirmed defect nor a clean result', async () => {
  const r = await secondPass(REAL());
  assert.equal(r.out.new_defects.length, 0);
  assert.equal(r.revs.length, 0);
  assert.ok(!r.out.findings.some((f) => f.severity === 'BLOCKING' && f.source !== 'Automated check'));
  const u3 = r.unv.find((f) => f.unit === 'U3');
  assert.equal(u3.severity, 'MAJOR');
  assert.equal(u3.line, 39);
  assert.match(u3.problem, /listed as a new defect, but its own explanation says no new defect was introduced/);
  assert.match(u3.problem, /The verifier wrote: "The Before text attributed the 83% finding/);
  assert.match(u3.problem, /not a confirmed defect and not a clean result/);
  assert.ok(r.unv.some((f) => f.unit === 'U8'));
  // The response has no per-edit verdicts at all, which the contract now requires.
  assert.ok(r.unv.some((f) => /returned no per-edit verdicts/.test(f.problem)));
  assert.equal(r.out.unresolved_checks.length, 3);
});

test('verifier: an explicit NO_NEW_DEFECT for every edit is a clean result', async () => {
  const r = await secondPass(clean());
  assert.equal(r.unv.length, 0);
  assert.equal(r.out.new_defects.length, 0);
});

test('verifier: an explicit NEW_DEFECT that describes a defect is counted', async () => {
  const r = await secondPass(clean({ U3: { unit: 'U3', verdict: 'NEW_DEFECT', severity: 'BLOCKING', check: 'Unsupported figure', quote: '91% of high earners', problem: 'The After text states 91%, and the ledger entry states 83%.', fix: 'Restore 83%.' } }));
  assert.equal(r.unv.length, 0);
  assert.equal(r.revs.length, 1);
  assert.equal(r.revs[0].severity, 'BLOCKING');
  assert.equal(r.revs[0].unit, 'U3');
});

test('verifier: contradictory or malformed entries stay unresolved', async () => {
  const cases = {
    'NEW_DEFECT that explains there is none': [{ unit: 'U3', verdict: 'NEW_DEFECT', severity: 'BLOCKING', check: 'Citation on wrong claim', quote: '', problem: 'This is now internally consistent with the ledger, so no new defect is introduced here.', fix: '' }, /its own explanation says no new defect was introduced/],
    'NO_NEW_DEFECT that describes a blocking defect': [{ unit: 'U3', verdict: 'NO_NEW_DEFECT', severity: 'BLOCKING', check: 'Unsupported figure', quote: '', problem: 'The After text adds a figure the ledger does not state.', fix: '' }, /the verdict is NO_NEW_DEFECT, but the entry describes a BLOCKING defect/],
    'a verdict that is neither': [{ unit: 'U3', verdict: 'MAYBE', severity: '', check: '', quote: '', problem: '', fix: '' }, /the verdict is not NEW_DEFECT or NO_NEW_DEFECT/],
    'NEW_DEFECT with nothing described': [{ unit: 'U3', verdict: 'NEW_DEFECT', severity: 'MAJOR', check: '', quote: '', problem: '', fix: '' }, /no problem is described/],
  };
  for (const [name, [entry, why]] of Object.entries(cases)) {
    const r = await secondPass(clean({ U3: entry }));
    assert.equal(r.revs.length, 0, name);
    assert.equal(r.unv.length, 1, name);
    assert.equal(r.unv[0].severity, 'MAJOR', name);
    assert.match(r.unv[0].problem, why, name);
  }
  // An edit with no entry, and an edit answered twice.
  const missing = clean(); missing.edit_checks = missing.edit_checks.filter((c) => c.unit !== 'U3');
  assert.match((await secondPass(missing)).unv[0].problem, /gave no verdict for this edit/);
  const twice = clean(); twice.edit_checks.push({ unit: 'U3', verdict: 'NO_NEW_DEFECT' });
  assert.match((await secondPass(twice)).unv[0].problem, /more than one verdict/);
});

test('verifier: the prompt asks for one explicit verdict per edit', async () => {
  const { cc } = await secondPass(clean());
  const system = JSON.parse(cc.qa_payload).messages[0].content;
  assert.match(system, /"edit_checks":\[\{"unit":"the unit ID of the edit, for example U3","verdict":"NEW_DEFECT or NO_NEW_DEFECT"/);
  assert.match(system, /Never give NEW_DEFECT with an explanation that concludes there is no defect/);
  assert.ok(!/"new_defects"/.test(system));
});

// ---------------- 3. What a verified price establishes ----------------

const STRETCH = 'BLOCKING PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE';

test('price evidence: the page states a typical range, and nothing about who charges it', () => {
  const e27 = JSON.parse(EV.research_ledger).find((c) => c.claim_id === 'E27');
  assert.equal(e27.page_excerpt, 'Individual consulting packages typically range from $2,000-$8,000.');
  assert.deepEqual(e27.source_ids, ['S24']);
  assert.ok(!/\bour\b|\bwe\b|established/i.test(e27.claim + ' ' + e27.page_excerpt));
});

test('price evidence: every occurrence in the held plan blocks, including lines 40, 55 and 297', async () => {
  const out = await check();
  assert.match(lineOf(40), /describing its own multi-deliverable packages/);
  assert.match(lineOf(40), /it suggests that the broader category of personalized relocation consulting does carry price points well above \$500/);
  assert.match(lineOf(55), /The adjacent pricing data suggests the broader category supports meaningful price points/);
  assert.match(lineOf(297), /packages from established firms are stated to range from \$2,000 to \$8,000 \[S24\]/);
  assert.deepEqual(out.det_issues.filter((i) => /PRICE EVIDENCE/.test(i.type)).map((i) => i.line), [40, 51, 55, 127, 297, 511]);
  [51, 127, 511].forEach((n) => assert.match(lineOf(n), /this is a single provider's stated pricing/, 'L' + n));
});

test('price evidence: repeated and paraphrased versions block', async () => {
  for (const s of [
    'Adjacent pricing data suggests that the broader category of personalized relocation consulting supports price points well above $500 [S24].',
    'The pricing data indicates that customers in this category accept prices in the thousands.',
    'Relocation consulting packages run from $2,000 to $8,000 [S24], which shows there is room for an entry-level session.',
    'Established firms charge $2,000 to $8,000 for relocation consulting packages [S24].',
    'One vendor lists its own packages at $2,000 to $8,000 [S24].',
    'The vendor\'s stated pricing of $2,000 to $8,000 [S24] is a useful anchor.',
    'A range of $2,000 to $8,000 for packages confirms that this market supports premium pricing.',
  ]) assert.ok((await onLast(s)).includes(STRETCH), s);
});

test('price evidence: the evidence is kept when it is stated with its real scope', async () => {
  for (const s of [
    'A page on internationalmoving.services states that individual consulting packages typically range from $2,000 to $8,000 [S24].',
    'A relocation services page states that individual consulting packages typically range from $2,000 to $8,000 [S24]. The page gives no basis for the figure. It is not evidence of market prices, of who charges them, or of what customers will pay for this offer.',
    'The $500 price for this offer is an untested scenario assumption.',
  ]) assert.deepEqual(only(await onLast(s), /PRICE/), [], s);
});

test('price evidence: an income figure is not a price, so the Fullstory lines are not caught by this check', async () => {
  const out = await check();
  assert.match(lineOf(469), /\[S16\] supports the hypothesis that the target customer is reachable online/);
  assert.deepEqual(only(at(out, 469), /PRICE/), []);
  assert.deepEqual(only(at(out, 39), /PRICE/), []);
});

test('price evidence: the reviewer and the reviser are given the same rule', async () => {
  const system = JSON.parse((await check(fx('Assemble Plan').text, { firstPass: true })).qa_payload).messages[0].content;
  assert.match(system, /A page that reports a typical range does not establish that the page's owner charges it, that established firms charge it, that a market or category supports it, that customers will pay it, or that there is room for this offer/);
  assert.match(system, /EVERY PLACE\. Before you report a defect, search the whole plan for the same proposition in any wording/);
  const pr = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': fx('Citation Check')[0], 'Assemble Plan': fx('Assemble Plan'), 'Build Evidence': EV }, fx('Final QA')[0]);
  assert.match(JSON.parse(pr.revise_payload).messages[0].content, /Price evidence: a ledger price is one page's own words/);
});

// ---------------- 4. The same claim elsewhere ----------------

test('elsewhere: the inference removed at line 511 is found again at line 40', async () => {
  const r = await secondPass(clean());
  const dup = r.out.findings.filter((f) => f.check === 'SAME CLAIM STILL PRESENT ELSEWHERE');
  assert.equal(dup.length, 1);
  assert.equal(dup[0].line, 40);
  assert.equal(dup[0].severity, 'MAJOR');
  assert.equal(dup[0].unit, 'U25');
  assert.match(dup[0].problem, /corrected QA-003, QA-008 by removing or rewording this statement: "Adjacent pricing data suggests that the broader category/);
  assert.match(dup[0].quote, /^it suggests that the broader category of personalized relocation consulting does carry price points well above \$500/);
  // The code check blocks the same line independently, after revision.
  assert.ok(at(r.cc, 40).includes(STRETCH));
});

test('elsewhere: a claim removed by an edit and repeated in another section is reported', async () => {
  const rev = clone(fx('Apply Revisions'));
  const e = rev.edit_log.find((x) => x.unit === 'U25');
  const removed = 'Referral partnerships with immigration lawyers will supply most early customers for this consulting business within the first quarter.';
  e.before = e.before + ' ' + removed;
  rev.text = rev.text + '\n\nImmigration lawyers will supply most early customers for this consulting business through referral partnerships within the first quarter.\n';
  const cc = await check(rev.text, { rev });
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, { choices: [{ message: { content: JSON.stringify(clean()) } }] });
  const dup = out.findings.filter((f) => f.check === 'SAME CLAIM STILL PRESENT ELSEWHERE');
  assert.deepEqual(dup.map((f) => f.line), [40, rev.text.replace(/\n+$/, '').split('\n').length]);
});

// ---------------- 5. Profit wording, and the duplicated computed sentence ----------------

const PROFIT = 'BLOCKING UNCONDITIONAL PROFIT CLAIM WITH UNRESOLVED COSTS';

test('profit: lines 125 and 511 of the held plan block', async () => {
  const out = await check();
  assert.match(lineOf(125), /means the business reaches operating profit quickly once paying customers arrive/);
  assert.match(lineOf(511), /which means the business reaches operating profit quickly once paying customers arrive/);
  assert.deepEqual(out.det_issues.filter((i) => /PROFIT CLAIM/.test(i.type)).map((i) => i.line), [125, 511]);
  assert.ok(FIN.cost_status.some((c) => c.status === 'applicable_amount_unknown'), 'an applicable cost has no amount');
});

test('profit: equivalent wording blocks, and wording tied to the included costs passes', async () => {
  for (const s of [
    'The business reaches operating profit quickly once paying customers arrive.',
    'On the model\'s assumptions, the business reaches operating profit from the first paid session.',
    'The business is profitable from the first month.',
    'This model breaks even early and turns a profit in the first quarter.',
  ]) assert.ok((await onLast(s)).includes(PROFIT), s);
  for (const s of [
    'On the costs included in the model, the Base scenario shows $1,430 operating profit a month; actual profitability depends on the unresolved costs.',
    'The model reaches operating profit on its included costs once paying customers arrive, and whether the business is profitable depends on the unresolved costs.',
    'The Base scenario of 3 customers per month at $500 each produces $1,430 operating profit per month before unresolved costs.',
  ]) assert.deepEqual(only(await onLast(s), /PROFIT/), [], s);
});

test('profit: Finalize Plan blocks the same two lines', async () => {
  const cc = await check();
  const out = await runNode('finalize-plan.js', { 'Plan Revision Request': fx('Plan Revision Request')[1], 'Apply Revisions': fx('Apply Revisions'), 'Assemble Plan': fx('Assemble Plan'), 'Compute Financials': FIN, 'Citation Check': cc, 'Founder Context': FOUNDER, 'Build Evidence': EV, 'Verify Claims': fx('Verify Claims'), 'Verify Corrections': fx('Verify Corrections') });
  assert.deepEqual(out.cost_condition_check.problems.filter((p) => /reaches profit/.test(p)).map((p) => p.match(/^L(\d+)/)[1]), ['125', '511']);
  assert.equal(out.status, 'HOLD');
  assert.equal(out.text, fx('Apply Revisions').text);
});

const compute = (founder = {}, file = fx('Financial Assumptions')) => runNode('compute-financials.js', { 'Founder Context': { ...FOUNDER, ...founder } }, file);

test('computed text: the "figures leave out" sentence is written once, not three times', async () => {
  const was = [FIN.scenario_block, FIN.forecast_block, FIN.budget_block].join('\n').split('These figures leave out Payment processing fee').length - 1;
  assert.equal(was, 3);
  const out = await compute();
  assert.equal([out.scenario_block, out.forecast_block, out.budget_block].join('\n').split('These figures leave out Payment processing fee').length - 1, 1);
  assert.match(out.scenario_block, /These figures leave out Payment processing fee/);
  // Nothing else in the figures moved.
  assert.deepEqual(out.model.year, FIN.model.year);
  assert.equal(out.cost_headroom.available_usd, 12100);
});

// ---------------- Pricing policy ----------------

test('price: where the price comes from today', () => {
  // The form has no price question, so the founder context carries none; the financial-assumptions model chose it.
  assert.equal(FOUNDER.founder_price, undefined);
  assert.deepEqual([assumptions(fx('Financial Assumptions')).price.value, assumptions(fx21('Financial Assumptions')).price.value], [500, 297]);
  assert.match(assumptions(fx('Financial Assumptions')).price.reason, /sold by established firms/);   // the source of that wording in the plan
});

test('price: with no founder price it is recorded once as an untested scenario assumption', async () => {
  const out = await compute();
  assert.deepEqual(out.price_record, { amount: 500, unit: 'session', source: 'scenario assumption', founder_supplied: false, label: 'untested scenario assumption', decided_by: 'Compute Financials', run_date: out.price_record.run_date });
  assert.match(out.scenario_block + out.financial_model, /- Price \(untested scenario assumption\): \$500 per session\. It was not supplied by the founder\./);
  assert.match(out.financial_model, /never write that it validates, confirms or supports the price/);
});

test('price: a founder-supplied price is used, whatever the model answered', async () => {
  const out = await compute({ founder_price: 350 });
  assert.equal(out.price_record.amount, 350);
  assert.equal(out.price_record.source, 'founder');
  assert.equal(out.price_record.founder_supplied, true);
  assert.equal(out.model.scenarios.base.revenue, 350 * 3);
  assert.match(out.financial_model, /- Price \(founder-provided\): \$350 per session/);
  assert.ok(!/untested scenario assumption\): \$/.test(out.financial_model));
});

test('price: fixed inputs keep a regression comparison on the same figures', async () => {
  // The price alone.
  const a = await compute({ fixed_scenario_price: 297 });
  assert.equal(a.price_record.amount, 297);
  assert.equal(a.price_record.source, 'scenario assumption, fixed for this submission');
  assert.equal(a.model.scenarios.base.revenue, 297 * 3);
  // Every financial input: the 63221 answer, replayed against the 63222 run. The model's own answer is ignored.
  const b = await compute({ fixed_financial_assumptions: assumptions(fx21('Financial Assumptions')) });
  assert.equal(b.price_record.amount, 297);
  assert.equal(b.price_record.source, 'scenario assumption, fixed inputs');
  assert.deepEqual(b.model.year, fx21('Compute Financials').model.year);
  assert.equal(b.cost_headroom.available_usd, 6676);
});

test('price: the request to the model carries a founder or fixed price, and no longer ties the price to adjacent prices', async () => {
  const req = async (founder) => JSON.parse((await runNode('build-financial-request.js', { 'Founder Context': { ...FOUNDER, ...founder }, 'Build Evidence': EV })).payload);
  const plain = await req({});
  assert.equal(plain.temperature, 0);
  assert.ok(!/informed by adjacent pricing/.test(plain.messages[0].content));
  assert.match(plain.messages[0].content, /A ledger price for a different or adjacent kind of service is not a basis for this offer's price/);
  assert.ok(!/FOUNDER PRICE|FIXED SCENARIO PRICE/.test(plain.messages[1].content));
  assert.match((await req({ founder_price: 350 })).messages[1].content, /FOUNDER PRICE: 350 per sale, stated by the founder\. Use exactly this value/);
  assert.match((await req({ fixed_scenario_price: 297 })).messages[1].content, /FIXED SCENARIO PRICE: 297 per sale/);
});

test('price: test-only fixed inputs are read in a test workflow and ignored in any other', async () => {
  const body = { fixedScenarioPrice: 297, fixedFinancialAssumptions: { price: { value: 297 } } };
  const run = (name, d = {}) => runNode('founder-context.js', { 'Prepare Client Data': { ...FOUNDER, ...d }, Webhook: { body } }, undefined, { workflow: { name } });
  const t = await run('IdeaToPlan - Full Pipeline (Rebuilt) v2 Test');
  assert.equal(t.fixed_scenario_price, 297);
  assert.deepEqual(t.fixed_financial_assumptions, { price: { value: 297 } });
  const live = await run('IdeaToPlan - Full Pipeline (Rebuilt)');
  assert.equal(live.fixed_scenario_price, null);
  assert.equal(live.fixed_financial_assumptions, null);
  assert.equal((await run('IdeaToPlan - Full Pipeline (Rebuilt)', { founder_price: '$350' })).founder_price, 350);
  assert.equal(live.founder_price, null);
});

test('price: the plan must carry the recorded price, and a result is not validation of it', async () => {
  const fin = { ...clone(FIN), price_record: { amount: 500, unit: 'session', label: 'untested scenario assumption', founder_supplied: false } };
  const ok = await check(HELD_PLAN, { fin });
  assert.ok(!ok.det_issues.some((i) => /RECORDED PRICE|VALIDATING THE PRICE/.test(i.type)));
  const other = HELD_PLAN.replace('| Launch price | $500 per session', '| Launch price | $450 per session');
  assert.notEqual(other, HELD_PLAN);
  assert.ok((await check(other, { fin })).det_issues.some((i) => i.severity + ' ' + i.type === 'BLOCKING PRICE DIFFERS FROM THE RECORDED PRICE'));
  const RESULT = 'BLOCKING SCENARIO RESULT PRESENTED AS VALIDATING THE PRICE';
  assert.ok((await onLast('The forecast of $12,100 net cash confirms that the $500 price works.', { fin })).includes(RESULT));
  assert.ok((await onLast('The Base scenario result validates the price.', { fin })).includes(RESULT));
  assert.deepEqual(only(await onLast('The forecast is calculated from the $500 price and does not validate it.', { fin }), /VALIDATING/), []);
});

// ---------------- The held plan, rechecked as a whole ----------------

test('63222 recheck: the two original blockers are gone, and the genuine defects block', async () => {
  const r = await secondPass(REAL());
  const blocking = r.out.findings.filter((f) => f.severity === 'BLOCKING').map((f) => 'L' + f.line + ' ' + f.check);
  assert.deepEqual(blocking, [
    'L125 UNCONDITIONAL PROFIT CLAIM WITH UNRESOLVED COSTS',
    'L511 UNCONDITIONAL PROFIT CLAIM WITH UNRESOLVED COSTS',
    'L40 PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE',
    'L51 PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE',
    'L55 PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE',
    'L127 PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE',
    'L297 PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE',
    'L511 PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE',
  ]);
  // In the run, the gate held on these two. Neither is a finding now.
  assert.ok(!r.out.findings.some((f) => /CITATION NOT TIED|Citation on wrong claim/.test(f.check)));
});
