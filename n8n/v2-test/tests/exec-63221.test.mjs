// Regression checks for the defects found in execution 63221.
// Run: node --test n8n/v2-test/tests/exec-63221.test.mjs
// No network and no model calls. Every input is a saved node output of execution 63221 (fixtures/exec-63221):
// the research answers, the fetched pages, the verifier's answers, the reviewer's answers and the held plan.
// The held plan is read, never rewritten. Sentences under test are added to a copy in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, clone, ROOT } from './harness.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63221');
const fx = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const HELD_PLAN = readFileSync(path.join(DIR, 'final-plan.md'), 'utf8');
const FOUNDER = fx('Founder Context');
const FIN = fx('Compute Financials');
const lineOf = (n) => HELD_PLAN.split('\n')[n - 1];

// The evidence nodes, rerun on the saved research, pages and verifier answers.
const evidence = async () => {
  const ce = await runNode('collect-evidence.js', { 'Growth Research': fx('Growth Research'), 'Market Research': fx('Market Research'), 'Brave Search': fx('Brave Search'), 'Founder Context': FOUNDER });
  const ev = await runNode('build-evidence.js', { 'Collect Evidence': ce, 'Fetch Source Pages': fx('Fetch Source Pages'), 'Build Verification Request': fx('Build Verification Request'), 'Verify Claims': fx('Verify Claims'), 'Build Recheck Request': fx('Build Recheck Request'), 'Verify Corrections': fx('Verify Corrections'), 'Founder Context': FOUNDER });
  return { ce, ev, candidates: JSON.parse(ce.candidates), ledger: JSON.parse(ev.research_ledger), entities: JSON.parse(ev.entities), excluded: JSON.parse(ev.excluded_claims) };
};
// The Citation Check on a plan text, as the second pass (after revision) runs it.
const check = async (ev, text = HELD_PLAN, { fin = FIN, firstPass = false, rev } = {}) => {
  const stubs = { 'Founder Context': FOUNDER, 'Compute Financials': fin, 'Assemble Plan': firstPass ? { ...fx('Assemble Plan'), text } : fx('Assemble Plan'), 'Build Evidence': ev, 'Growth Plan Generator1': fx('Growth Plan Generator1') };
  if (!firstPass) stubs['Apply Revisions'] = rev || { ...fx('Apply Revisions'), text };
  return runNode('citation-check.js', stubs);
};
const at = (out, line) => out.det_issues.filter((i) => i.line === line).map((i) => i.severity + ' ' + i.type);
const withLast = (line) => HELD_PLAN.replace(/\n+$/, '') + '\n\n' + line + '\n';
const onLast = async (ev, line, opts) => { const text = withLast(line); const out = await check(ev, text, opts); return at(out, text.replace(/\n+$/, '').split('\n').length); };

// ---------------- 1. Entities ----------------

test('entity: the Reelo claim keeps its company from collection to the ledger', async () => {
  const r = await evidence();
  const e5 = r.candidates.find((c) => c.claim_id === 'E5');
  assert.match(e5.claim, /^Reelo says/);
  assert.deepEqual(e5.entity, { key: 'reelo', name: 'Reelo', name_words: 'reelo' });
  assert.equal(e5.candidate_source_ids[0], 'S6');
  assert.equal(r.ledger.find((c) => c.claim_id === 'E5').entity, 'Reelo');
  const reelo = r.entities.find((e) => e.name === 'Reelo');
  assert.deepEqual(reelo.source_ids, ['S6']);
  assert.equal(reelo.verified_claims, 1);
});

test('entity: the recovered claim E21 names Move One, not the company of the claim it replaced', async () => {
  const r = await evidence();
  // E7 named Intermark on a Move One page, and was contradicted for that reason.
  const e7 = r.candidates.find((c) => c.claim_id === 'E7');
  assert.equal(e7.entity.name, 'Intermark');
  assert.equal(r.excluded.find((x) => x.claim_id === 'E7').status, 'contradicted');
  const e21 = r.ledger.find((c) => c.claim_id === 'E21');
  assert.equal(e21.derived_from, 'E7');
  assert.equal(e21.entity, 'Move One Relocations');
  assert.deepEqual(e21.source_ids, ['S14']);
  const moveOne = r.entities.find((e) => e.name === 'Move One Relocations');
  assert.deepEqual(moveOne.source_ids.slice().sort(), ['S14', 'S5']);
  assert.equal(moveOne.verified_claims, 2);                              // E10 on S5 and E21 on S14
  // Intermark has no verified claim, and no source of Move One is tied to it.
  const intermark = r.entities.find((e) => e.name === 'Intermark');
  assert.equal(intermark.verified_claims, 0);
  assert.ok(!intermark.source_ids.includes('S14'));
});

test('entity: the fix adds no verified claim and removes none', async () => {
  const r = await evidence();
  assert.deepEqual(r.ledger.map((c) => c.claim_id), ['E1', 'E2', 'E5', 'E10', 'E13', 'E16', 'E18', 'E21']);
  assert.equal(r.excluded.length, 13);
  // A page with no verified claim still has none: sources are not verified by being fetched.
  assert.ok(!r.ledger.some((c) => c.source_ids.includes('S4') || c.source_ids.includes('S7')));
});

test('entity: a name is not invented from a claim that does not open with a company carried by a source', async () => {
  const research = (claim, title, url) => ({ choices: [{ message: { content: '## C1 Direct competitors\nCLAIM: ' + claim + ' | SOURCE TYPE: company own website | PUBLISHED: date not shown | URL: ' + url + ' [1]\n', annotations: [{ type: 'url_citation', url_citation: { title, url } }] } }] });
  const run = async (claim, title, url) => JSON.parse((await runNode('collect-evidence.js', { 'Growth Research': research(claim, title, url), 'Market Research': { choices: [{ message: { content: '' } }] }, 'Brave Search': { web: { results: [] } } })).candidates)[0].entity;
  assert.equal((await run('Reelo says it is a relocation platform.', 'Relocation platform', 'https://reelome.com/')).name, 'Reelo');
  assert.equal((await run('Intermark says it provides relocation services.', 'International relocation', 'https://intermarkrelocation.com/x')).name, 'Intermark');
  assert.equal((await run('Nimbus offers planning calls.', 'Nimbus | Planning calls', 'https://getnimbus.io/')).name, 'Nimbus');           // carried by the page title
  assert.equal(await run('Relocation services are widely available.', 'Moving abroad', 'https://example-movers.com/'), null);      // not a name a source carries
  assert.equal(await run('Acme says it plans moves.', 'Moving abroad', 'https://example-movers.com/'), null);                     // a name no source carries
  assert.equal(await run('movers say they plan moves.', 'Moving abroad', 'https://moversgroup.com/'), null);                   // not a capitalised name
});

test('citations: the two rows blocked in 63221 are correct and now pass', async () => {
  const { ev } = await evidence();
  const out = await check(ev);
  assert.match(lineOf(14), /Reelo \[S6\]/);
  assert.match(lineOf(169), /Reelo \[S6\]/);
  assert.deepEqual(at(out, 14), []);
  assert.deepEqual(at(out, 169).filter((x) => /CITATION|VERIFIED CLAIM/.test(x)), []);
  assert.ok(!out.det_issues.some((i) => /CITATION NOT TIED|WRONG COMPANY|WITHOUT A VERIFIED CLAIM/.test(i.type)));
});

test('citations: correct company citations pass', async () => {
  const { ev } = await evidence();
  assert.deepEqual(await onLast(ev, '| Offer | Reelo offers relocation guides, road maps and planning [S6] |'), []);
  assert.deepEqual(await onLast(ev, '| Offer | Move One Relocations covers consulting, document collection, translations and legalization [S14] |'), []);
  assert.deepEqual(await onLast(ev, '| Offer | StartAbroad [S1][S8], Reelo [S6], and Move One Relocations [S5][S14] describe relocation services |'), []);
});

test('citations: wrong-company citations still block', async () => {
  const { ev } = await evidence();
  assert.deepEqual(await onLast(ev, '| Offer | StartAbroad offers company setup and bank account services [S6] |'), ['BLOCKING CITATION ATTACHED TO THE WRONG COMPANY']);
  assert.deepEqual(await onLast(ev, '| Offer | Reelo covers consulting, document collection and translations [S14] |'), ['BLOCKING CITATION ATTACHED TO THE WRONG COMPANY']);
  assert.deepEqual(await onLast(ev, '| Offer | Move One Relocations offers relocation guides and road maps [S6] |'), ['BLOCKING CITATION ATTACHED TO THE WRONG COMPANY']);
  // A page that was fetched but has no verified claim is still not a source.
  assert.ok((await onLast(ev, '| Offer | LA Relocation Group creates a personalized relocation plan [S4] |')).includes('BLOCKING SOURCE CITED WITHOUT A VERIFIED CLAIM'));
});

// ---------------- 2. Startup budget ----------------

const BUDGET = 'BLOCKING UNCONDITIONAL BUDGET CLAIM WITH UNRESOLVED COSTS';

test('budget: the three sentences that escaped in 63221 now block', async () => {
  const { ev } = await evidence();
  const out = await check(ev);
  assert.match(lineOf(166), /Budget ceiling of under \$5,000 is sufficient for the model as designed/);
  assert.match(lineOf(589), /startup budget ceiling of under \$5,000 is sufficient for the model as designed/);
  assert.match(lineOf(597), /the startup budget is sufficient for the model/);
  [166, 589, 597].forEach((n) => assert.ok(at(out, n).includes(BUDGET), 'L' + n));
  assert.deepEqual(out.det_issues.filter((i) => /BUDGET CLAIM/.test(i.type)).map((i) => i.line), [166, 589, 597]);
});

test('budget: equivalent wording blocks, anywhere in the plan', async () => {
  const { ev } = await evidence();
  for (const s of [
    'Under $5,000 is sufficient to launch this business.',
    'The budget is enough to launch.',
    'Your budget comfortably covers everything needed to get started.',
    'No additional funding is needed to reach the first sale.',
    'The business is fully funded at this ceiling.',
    'The founder has ample capital for this plan.',
    'This plan can be launched within the budget.',
  ]) assert.ok((await onLast(ev, s)).includes(BUDGET), s);
});

test('budget: wording that separates the included costs from all costs passes', async () => {
  const { ev } = await evidence();
  for (const s of [
    'The costs included in the model need $0 of funding at the end of every period; whether the $5,000 ceiling covers all costs is not established until the unresolved costs are known.',
    'The budget ceiling covers the included costs only.',
    'Whether the startup budget is enough cannot be stated while registration, insurance and AI service costs are unresolved.',
    'The budget may not be sufficient if the unresolved costs turn out to be large.',
    'Startup budget: under $5,000 (founder-stated ceiling).',
  ]) assert.deepEqual((await onLast(ev, s)).filter((x) => /BUDGET/.test(x)), [], s);
});

test('budget: with every cost resolved, the check does not run', async () => {
  const { ev } = await evidence();
  const fin = { ...clone(FIN), cost_condition: '', unresolved_costs: [] };
  assert.deepEqual((await onLast(ev, 'The budget is enough to launch.', { fin })).filter((x) => /BUDGET/.test(x)), []);
});

test('budget: the model states the funding requirement of the included costs, separately from the budget', async () => {
  const out = await runNode('compute-financials.js', { 'Founder Context': FOUNDER }, fx('Financial Assumptions'));
  assert.equal(out.cost_headroom.available_usd, 6676);
  const line = out.forecast_block.split('\n').find((l) => l.startsWith('- Startup budget.'));
  assert.match(line, /Funding requirement of the costs included in these figures: \$0 at the end of every period/);
  assert.match(line, /covers the included costs only/);
  assert.match(line, /Whether the budget ceiling of \$5,000 covers all costs is not established while these costs are unresolved/);
  assert.match(out.financial_model, /Nowhere in the plan may a sentence say that the startup budget, the ceiling or the funding is sufficient/);
});

test('budget: Finalize Plan blocks the held plan on the same sentences, and inserting the condition does not hide them', async () => {
  const { ev } = await evidence();
  const cc = await check(ev);
  const out = await runNode('finalize-plan.js', { 'Plan Revision Request': fx('Plan Revision Request')[1], 'Apply Revisions': fx('Apply Revisions'), 'Assemble Plan': fx('Assemble Plan'), 'Compute Financials': FIN, 'Citation Check': cc, 'Founder Context': FOUNDER, 'Build Evidence': ev, 'Verify Claims': fx('Verify Claims'), 'Verify Corrections': fx('Verify Corrections') });
  assert.equal(out.cost_condition_check.present, true);
  assert.equal(out.cost_condition_check.problems.filter((p) => /startup budget is enough/.test(p)).length, 3);
  assert.ok(out.final_findings.filter((f) => f.severity === 'BLOCKING').length >= 3);
  assert.equal(out.status, 'HOLD');
  assert.equal(out.text, fx('Apply Revisions').text);                   // the plan text is not altered to pass
});

// ---------------- 3. Price comparisons with no number ----------------

const PRICE = 'BLOCKING PRICE COMPARISON WITHOUT A VERIFIED PRICE';
const L175 = "Comparable personalized services in adjacent categories give a useful reference point for the general range, but this offer's price and customers' willingness to pay it are unvalidated.";

test('price: the exact sentence from line 175 blocks, in place and alone', async () => {
  const { ev, ledger } = await evidence();
  assert.ok(!ledger.some((c) => /\$\s?\d/.test(c.claim + ' ' + c.page_excerpt)), 'the 63221 ledger holds no price');
  assert.ok(lineOf(175).includes(L175));
  assert.ok(at(await check(ev), 175).includes(PRICE));
  assert.ok((await onLast(ev, '**Price basis.** ' + L175)).includes(PRICE));
});

test('price: other comparisons with no number block', async () => {
  const { ev } = await evidence();
  for (const s of [
    'The $297 price sits within the typical range for comparable services.',
    'Pricing follows the going rate among similar providers.',
    'The price was set using adjacent services as a benchmark.',
    'Similar consultants usually charge more than this price.',
  ]) assert.ok((await onLast(ev, s)).includes(PRICE), s);
});

test('price: acceptable wording passes', async () => {
  const { ev } = await evidence();
  for (const s of [
    'The $297 price is an untested planning assumption.',
    'No comparable price was found in the sources reviewed, so the $297 price is an untested planning assumption.',
    'No reference point for the price exists in the verified evidence.',
    'The price is not benchmarked against any competitor, because no competitor page reviewed lists one.',
    'The first customer conversations should test whether $297 is acceptable, too high, or too low.',
  ]) assert.deepEqual((await onLast(ev, s)).filter((x) => /PRICE/.test(x)), [], s);
});

test('price: with no verified price, the plan must call its price an untested planning assumption', async () => {
  const { ev } = await evidence();
  const LABEL = 'BLOCKING PRICE NOT STATED AS AN UNTESTED ASSUMPTION';
  assert.ok(!(await check(ev)).det_issues.some((i) => i.severity + ' ' + i.type === LABEL), 'the held plan labels its price');
  const stripped = HELD_PLAN.split('\n').map((l) => l.replace(/untested|unvalidated/gi, 'chosen')).join('\n');
  assert.ok((await check(ev, stripped)).det_issues.some((i) => i.severity + ' ' + i.type === LABEL));
});

// ---------------- 4. Competitive gaps and QA-023 ----------------

const GAP = 'BLOCKING COMPETITIVE GAP STATED AS A FINDING';

test('gap: an unsupported gap stated as a finding blocks', async () => {
  const { ev } = await evidence();
  for (const s of [
    'There is a clear gap in the market for decision-stage planning.',
    'No competitor offers support at the decision stage.',
    'None of the competitors addresses the period before the decision.',
    'The decision stage is underserved [S1].',
    'This gives QYLAT a clear advantage over the execution-focused providers.',
  ]) assert.ok((await onLast(ev, s)).includes(GAP), s);
});

test('gap: a clearly labelled hypothesis passes', async () => {
  const { ev } = await evidence();
  for (const s of [
    'A hypothesis worth testing is that the decision stage is underserved.',
    'Among the pages reviewed, none positions around the decision stage, which is a hypothesis about positioning and not an established gap.',
    'If the first ten conversations confirm it, the decision stage could be an underserved segment.',
    'Whether a positioning gap exists at the decision stage is untested.',
    'The decision stage may be underserved; this is a hypothesis to test in the first ten conversations.',
  ]) assert.deepEqual((await onLast(ev, s)).filter((x) => /GAP/.test(x)), [], s);
});

test('gap: each sentence is judged alone, and authorship is not a label', async () => {
  const { ev } = await evidence();
  for (const s of [
    // An unsupported finding, followed by a separate labelled hypothesis.
    'No competitor offers support at the decision stage. A hypothesis worth testing is that QYLAT could occupy that stage.',
    // The same two sentences the other way round.
    'A hypothesis worth testing is that QYLAT could occupy the decision stage. No competitor offers support there.',
    // Authorship in front of, or after, a finding.
    'IdeaToPlan analysis: among the pages reviewed, none positions around the decision stage.',
    'The decision stage is underserved. IdeaToPlan analysis.',
    'IdeaToPlan analysis: among the pages reviewed, none positions around the decision stage. This does not establish that no decision-stage competitor exists.',
    // A conditional that comes after the claim does not govern it.
    'No competitor offers decision-stage planning, which could matter to pricing.',
  ]) assert.deepEqual((await onLast(ev, s)).filter((x) => /GAP/.test(x)), [GAP], s);
});

test('gap: the held plan labels its hypothesis lines, and its contrast at line 154 blocks', async () => {
  const { ev } = await evidence();
  const out = await check(ev);
  assert.match(lineOf(154), /IdeaToPlan analysis: among the pages reviewed/);
  assert.match(lineOf(156), /This is a hypothesis, not an established gap/);
  // Line 154 says the competitors are oriented toward executing a move rather than deciding on one. That is the gap
  // claim as a contrast, with authorship in front of it and its caveat in the next sentence.
  assert.deepEqual(out.det_issues.filter((i) => /COMPETITIVE GAP/.test(i.type)).map((i) => i.line), [154]);
});

test('gap: the sentence the reviewer found in 63221, before revision, is caught when it stands alone', async () => {
  const { ev } = await evidence();
  const before = fx('Plan Revision Request')[0].units.find((u) => u.id === 'U9').text;
  assert.match(before, /None of the pages reviewed explicitly positions around the earlier decision-making stage/);
  // "IdeaToPlan analysis" at the end of the paragraph names the author. It does not make the sentence a hypothesis.
  assert.match(before, /IdeaToPlan analysis\.$/);
  assert.ok((await onLast(ev, before)).includes(GAP));
  assert.ok((await onLast(ev, before.replace(' IdeaToPlan analysis.', ''))).includes(GAP));
});

test('reviewer: the rules for gaps, price comparisons and the startup budget are in the review prompt, as blocking', async () => {
  const { ev } = await evidence();
  const out = await check(ev, fx('Assemble Plan').text, { firstPass: true });
  const system = JSON.parse(out.qa_payload).messages[0].content;
  const blocking = system.slice(system.indexOf('- BLOCKING:'), system.indexOf('- MAJOR:'));
  assert.match(blocking, /a competitive gap, an unmet need, an underserved segment, or a positioning opportunity stated as a finding/);
  assert.match(blocking, /a comparison of the price with what other services charge when no verified price is cited/);
  assert.match(blocking, /a statement that the startup budget is sufficient while costs are unresolved/);
  assert.ok(!/gap or opportunity stated as a finding/.test(system.slice(system.indexOf('- MAJOR:'), system.indexOf('- MINOR:'))));
  assert.match(system, /a hypothesis label in another sentence of the paragraph does not cover a sentence that reads as a finding/);
  assert.match(system, /"IdeaToPlan analysis" identifies who wrote the sentence; it is not evidence and it does not make a factual claim conditional/);
  assert.match(system, /the funding requirement of the included costs, which FINANCIAL FACTS give as a figure, and whether the founder's budget covers all costs/);
  assert.match(system, /List an occurrence only for a line that has to change/);
});

// QA-023 in 63221: the reviewer listed two lines. L154 had the defect and was rewritten. L156 was already a labelled
// hypothesis, the reviewer's own fix text said "no change needed there", and the reviser correctly left it alone.
// Code then counted "1 of 2 occurrences edited" and left the finding open.
const revised = async () => runNode('apply-revisions.js', { 'Plan Revision Request': fx('Plan Revision Request')[0], 'Assemble Plan': fx('Assemble Plan') }, fx('Revise Plan'));
const verdicts = () => { const c = fx('Final QA')[1].choices[0].message.content; return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); };
const secondPass = async (qa, change = () => {}) => {
  const { ev } = await evidence();
  const rev = await revised();
  change(rev);
  const cc = await check(ev, rev.text, { rev });
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': ev }, { choices: [{ message: { content: JSON.stringify(qa) } }] });
  return { out, rev, cc, qa023: out.verification.find((v) => v.id === 'QA-023'), open: out.findings.find((f) => f.id === 'QA-023') };
};

test('QA-023: why the line came back unchanged', async () => {
  const f = fx('Plan Revision Request')[0].findings.find((x) => x.id === 'QA-023');
  assert.deepEqual(f.occurrences.map((o) => o.located), [154, 156]);
  assert.match(f.fix, /L156 is already framed as a hypothesis and is acceptable; no change needed there/);
  // The words the reviewer objected to are not on L156 at all.
  assert.match(f.problem, /potential positioning distinction/);
  assert.ok(!lineOf(156).includes('potential positioning distinction'));
  const rev = await revised();
  assert.equal(rev.text, fx('Apply Revisions').text);                                      // same result as the run
  assert.deepEqual(rev.unchanged_units.map((u) => u.unit), ['U10']);
  assert.equal(rev.unchanged_units[0].start, 156);
  assert.match(rev.unchanged_units[0].why, /returned the passage unchanged/);
  assert.ok(rev.edit_log.some((e) => e.unit === 'U9' && e.issues.includes('QA-023')));
});

test('QA-023: the unchanged passage is sent to verification to be judged', async () => {
  const { cc } = await secondPass(verdicts());
  const p = JSON.parse(cc.qa_payload);
  const user = p.messages[1].content;
  const section = user.slice(user.indexOf('PASSAGES LEFT UNCHANGED'));
  assert.match(section, /unit U10 \| id QA-023 \| MAJOR/);
  assert.match(section, /Passage, unchanged: \*\*Positioning Hypothesis\.\*\*/);
  assert.match(p.messages[0].content, /Do not assume the passage is acceptable because it was left alone/);
});

test('QA-023: an attempted revision alone does not close the finding', async () => {
  const r = await secondPass(verdicts());                                // the verifier says nothing about U10
  assert.equal(r.qa023.status, 'PARTLY_FIXED');
  assert.match(r.qa023.note, /The rest were not verified/);
  assert.ok(r.open);
});

test('QA-023: it closes when verification finds the unchanged passage does not contain the problem', async () => {
  const qa = verdicts();
  qa.unchanged = [{ unit: 'U10', id: 'QA-023', present: false, reason: 'The competitive interpretation in this passage is already worded as a positioning hypothesis, not as a finding.', basis: 'passage', quote: 'Positioning Hypothesis' }];
  const r = await secondPass(qa);
  assert.equal(r.qa023.status, 'FIXED');
  assert.match(r.qa023.note, /left unchanged did not contain the problem/);
  assert.equal(r.open, undefined);
});

test('QA-023: "not present" with no reason and no quoted words closes nothing', async () => {
  const qa = verdicts();
  qa.unchanged = [{ unit: 'U10', id: 'QA-023', present: false, note: 'Fine.' }];
  const r = await secondPass(qa);
  assert.equal(r.qa023.status, 'PARTLY_FIXED');
  assert.match(r.qa023.note, /that answer closes nothing: it gives no reason; it quotes nothing from the passage, its section, or the ledger/);
  assert.ok(r.open);
});

test('QA-023: it stays open, with the line, when verification finds the problem still there', async () => {
  const qa = verdicts();
  qa.unchanged = [{ unit: 'U10', id: 'QA-023', present: true, note: 'Still reads as an established gap.' }];
  const r = await secondPass(qa);
  assert.equal(r.qa023.status, 'PARTLY_FIXED');
  assert.match(r.qa023.note, /The problem is still at L156/);
  assert.ok(r.open);
});

test('revision: a blocking finding with no edit is never closed on the verifier\'s word alone', async () => {
  const qa = verdicts();
  qa.unchanged = [{ unit: 'U10', id: 'QA-023', present: false, note: 'Not present.' }];
  // Same finding, raised as blocking, and neither of its passages edited.
  const r = await secondPass(qa, (rev) => {
    rev.first_findings.find((f) => f.id === 'QA-023').severity = 'BLOCKING';
    const u9 = rev.edit_log.find((e) => e.unit === 'U9');
    rev.edit_log = rev.edit_log.filter((e) => e !== u9);
    rev.unchanged_units.push({ unit: 'U9', issues: ['QA-023'], start: 154, end: 154, line: 154, text: u9.before, why: 'the reviser returned the passage unchanged.' });
  });
  assert.equal(r.qa023.status, 'NOT_FIXED');
  assert.ok(r.open && r.open.severity === 'BLOCKING');
});

// ---------------- Company identity ----------------

// The saved run, with the recovered claim E21 reworded. The page (S14, Move One's own site) and the verifier's
// answer are unchanged: the verifier still calls the claim supported and quotes real page text.
const REST = ' its services are tailored to individual needs and cover consulting, document collection, translations, legalization, and accompanying clients at immigration offices; its page does not list a price.';
const recovered = async (claim, pageHook = (p) => p) => {
  const ce = await runNode('collect-evidence.js', { 'Growth Research': fx('Growth Research'), 'Market Research': fx('Market Research'), 'Brave Search': fx('Brave Search'), 'Founder Context': FOUNDER });
  const recheck = clone(fx('Build Recheck Request'));
  recheck.find((r) => r.source_id === 'S14').corrections[0].claim = claim;
  const fp = clone(fx('Fetch Source Pages'));
  fp.pages = JSON.stringify(JSON.parse(fp.pages).map(pageHook));
  const ev = await runNode('build-evidence.js', { 'Collect Evidence': ce, 'Fetch Source Pages': fp, 'Build Verification Request': fx('Build Verification Request'), 'Verify Claims': fx('Verify Claims'), 'Build Recheck Request': recheck, 'Verify Corrections': fx('Verify Corrections'), 'Founder Context': FOUNDER });
  return { ev, entry: JSON.parse(ev.research_ledger).find((c) => c.claim_id === 'E21'), out: JSON.parse(ev.excluded_claims).find((x) => x.claim_id === 'E21'), entities: JSON.parse(ev.entities), integrity: JSON.parse(ev.source_integrity) };
};

test('identity: a recovered claim that names the right company is kept, with that company', async () => {
  const r = await recovered('Move One Relocations says' + REST);
  assert.equal(r.entry.entity, 'Move One Relocations');
  assert.equal(r.out, undefined);
});

test('identity: a recovered claim that names a company the page does not name is excluded', async () => {
  const r = await recovered('Intermark says' + REST);                  // a known company, and the wrong one for this page
  assert.equal(r.entry, undefined);
  assert.equal(r.out.kind, 'identity');
  assert.match(r.out.reason, /the claim names Intermark, but the fetched page does not name Intermark in its title or text/);
  assert.ok(!r.entities.find((e) => e.name === 'Intermark').source_ids.includes('S14'));
});

test('identity: a recovered claim that names an unknown company the page does not carry is excluded', async () => {
  const r = await recovered('Nordwind Relocation says' + REST);
  assert.equal(r.entry, undefined);
  assert.equal(r.out.kind, 'identity');
  assert.match(r.out.reason, /the claim names Nordwind Relocation, but nothing on the fetched page establishes that company/);
  assert.ok(!r.entities.some((e) => e.name === 'Nordwind Relocation'));
  assert.equal(r.integrity.verification.excluded_for_company_identity, 2);   // this one, and E14 from the run itself (its page does not name the company)
});

test('identity: a company named in passing on another company\'s site is ambiguous, and is excluded', async () => {
  // The Move One page now mentions Reelo, so the name is on the page. The page is still Move One's.
  const mention = (p) => p.source_id === 'S14' ? { ...p, text: p.text + ' Reelo is another platform people compare us with.' } : p;
  const r = await recovered('Reelo says' + REST, mention);
  assert.equal(r.entry, undefined);
  assert.equal(r.out.kind, 'identity');
  assert.match(r.out.reason, /the claim names Reelo, but the page it was checked on is on the site of Move One Relocations/);
  assert.deepEqual(r.entities.find((e) => e.name === 'Reelo').source_ids, ['S6']);
});

test('identity: a claim that does not open with a company name is not a company claim, and is kept', async () => {
  const r = await recovered('Services are tailored to individual needs and cover consulting, document collection, translations, legalization, and accompanying clients at immigration offices.');
  assert.ok(r.entry);
  assert.equal(r.entry.entity, undefined);
  assert.ok(!r.entities.some((e) => /^services$/i.test(e.name)));
  // Its source is still Move One's page, so citing it for another company blocks.
  assert.deepEqual(await onLast(r.ev, '| Offer | StartAbroad covers consulting, document collection and translations [S14] |'), ['BLOCKING CITATION ATTACHED TO THE WRONG COMPANY']);
});

test('identity: search listings and market claims are untouched, and no company claim in the ledger lacks a company', async () => {
  const r = await evidence();
  const listings = r.ledger.filter((c) => /^W /.test(c.question));
  assert.deepEqual(listings.map((c) => c.claim_id), ['E16', 'E18']);
  assert.ok(listings.every((c) => c.entity === undefined));
  assert.ok(r.ledger.filter((c) => /^C\d/.test(c.question)).every((c) => c.entity), 'every competitor claim carries its company');
});

// ---------------- Starter plans follow the same price rules ----------------

const STARTER = { ...FOUNDER, tier: 'Starter' };
const starterLast = async (line, text = HELD_PLAN) => {
  const full = text.replace(/\n+$/, '') + '\n\n' + line + '\n';
  const out = await runNode('citation-check.js', { 'Founder Context': STARTER, 'Compute Financials': FIN, 'Assemble Plan': fx('Assemble Plan'), 'Apply Revisions': { ...fx('Apply Revisions'), text: full } });
  return { last: at(out, full.replace(/\n+$/, '').split('\n').length), all: out.det_issues.map((i) => i.severity + ' ' + i.type) };
};

test('starter: an unsupported price comparison blocks in a Starter plan too', async () => {
  assert.ok((await starterLast('**Price basis.** ' + L175)).last.includes(PRICE));
  assert.ok((await starterLast('The $297 price sits within the typical range for comparable services.')).last.includes(PRICE));
});

test('starter: the founder\'s price may stay as an explicitly labelled assumption', async () => {
  const ok = await starterLast('The $297 price is the founder\'s chosen price and an untested planning assumption.');
  assert.deepEqual(ok.last.filter((x) => /PRICE/.test(x)), []);
  assert.ok(!ok.all.includes('BLOCKING PRICE NOT STATED AS AN UNTESTED ASSUMPTION'));
  const stripped = HELD_PLAN.split('\n').map((l) => l.replace(/untested|unvalidated/gi, 'chosen')).join('\n');
  assert.ok((await starterLast('The price is $297 per session.', stripped)).all.includes('BLOCKING PRICE NOT STATED AS AN UNTESTED ASSUMPTION'));
});

// ---------------- The held plan, rechecked as a whole ----------------

test('63221 recheck: the held plan is still blocked, now for its genuine defects only', async () => {
  const { ev } = await evidence();
  const out = await check(ev);
  const blocking = out.det_issues.filter((i) => i.severity === 'BLOCKING').map((i) => 'L' + i.line + ' ' + i.type);
  assert.deepEqual(blocking, [
    'L166 UNCONDITIONAL BUDGET CLAIM WITH UNRESOLVED COSTS',
    'L589 UNCONDITIONAL BUDGET CLAIM WITH UNRESOLVED COSTS',
    'L597 UNCONDITIONAL BUDGET CLAIM WITH UNRESOLVED COSTS',
    'L605 UNCONDITIONAL PROFIT CLAIM WITH UNRESOLVED COSTS',
    'L175 PRICE COMPARISON WITHOUT A VERIFIED PRICE',
    'L154 COMPETITIVE GAP STATED AS A FINDING',
    // Found by the superlative rule added after execution 63226: "The most common alternative for a person who is uncertain".
    'L150 SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE',
  ]);
});
