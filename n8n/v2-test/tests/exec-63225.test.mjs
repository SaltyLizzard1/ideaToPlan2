// Regression checks for the defects, the false positive and the mislabelled check of execution 63225.
// Run: node --test n8n/v2-test/tests/exec-63225.test.mjs
// No network and no model calls. Every input is a saved node output of execution 63225 (fixtures/exec-63225).
// The held plan is read, never rewritten. Sentences under test are added to a copy in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, clone, ROOT } from './harness.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63225');
const fx = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const HELD_PLAN = readFileSync(path.join(DIR, 'final-plan.md'), 'utf8');
const FOUNDER = fx('Founder Context');
const FIN = fx('Compute Financials');
const EV = fx('Build Evidence');
const LEDGER = JSON.parse(EV.research_ledger);
const lineOf = (n) => HELD_PLAN.split('\n')[n - 1];

const check = async (text = HELD_PLAN, { ev = EV, firstPass = false, rev } = {}) => {
  const stubs = { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': firstPass ? { ...fx('Assemble Plan'), text } : fx('Assemble Plan'), 'Build Evidence': ev, 'Growth Plan Generator1': fx('Growth Plan Generator1') };
  if (!firstPass) stubs['Apply Revisions'] = rev || { ...fx('Apply Revisions'), text };
  return runNode('citation-check.js', stubs);
};
const at = (out, line) => out.det_issues.filter((i) => i.line === line).map((i) => i.severity + ' ' + i.type);
const onLast = async (line, opts) => { const text = HELD_PLAN.replace(/\n+$/, '') + '\n\n' + line + '\n'; return at(await check(text, opts), text.replace(/\n+$/, '').split('\n').length); };
const only = (list, re) => list.filter((x) => re.test(x));
const secondPass = async (rev = fx('Apply Revisions'), qa = fx('Final QA')[1]) => {
  const cc = await check(rev.text, { rev });
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, qa);
  return { cc, out };
};
const gate = (findings) => runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD', final_findings: [] }, 'Plan Revision Request': { findings } });

// ---------------- 1. Supply is not demand ----------------

const DEMAND = 'BLOCKING DEMAND INFERRED FROM SUPPLY';

test('demand: the ledger of this run holds provider descriptions and two resource pages, and no customer behaviour', () => {
  assert.equal(LEDGER.length, 11);
  assert.ok(LEDGER.every((c) => /^C[12]\b|^W /.test(c.question)));
  assert.ok(!LEDGER.some((c) => /survey|respondents|customers? (?:paid|pay|spent)|bookings|sales|search volume/i.test(c.claim + ' ' + c.page_excerpt)));
});

test('demand: lines 72, 74 and 190 infer customer behaviour from supply, each with a different hedge, and block', async () => {
  assert.match(lineOf(72), /The existence of multiple providers and free resources suggests that people do seek help with this transition/);
  assert.match(lineOf(74), /The research confirms that competing offers exist and that people seek information about living and working abroad\./);
  assert.match(lineOf(190), /The existence of providers describing relocation and lifestyle consulting services is consistent with a space where people seek this kind of help/);
  const out = await check();
  assert.deepEqual(out.det_issues.filter((i) => /DEMAND INFERRED/.test(i.type)).map((i) => i.line), [72, 74, 190]);
  // None of the three was reported in the run.
  assert.ok(!/L72\b|L74\b|L190\b/.test(fx('Delivery Gate').blockers_text + fx('Delivery Gate').warnings_text));
});

test('demand: a hedge does not supply the missing evidence', async () => {
  for (const s of [
    'The existence of several providers suggests that customers want this kind of help.',
    'The availability of free guides indicates that people actively look for relocation advice.',
    'Competing offers exist, which is consistent with a space where people seek planning support.',
    'The number of providers reviewed points to underlying demand among adults in this age group.',
    'The research shows that people need help with this decision.',
    'Providers are active in this space [S1] [S2], which may signal that customers pay for such services.',
  ]) assert.ok((await onLast(s)).includes(DEMAND), s);
});

test('demand: a denial, a labelled hypothesis, and plain supply statements pass', async () => {
  for (const s of [
    'Multiple providers describe offering relocation consulting [S1] [S2]. This shows that offers exist; it does not show that customers seek or pay for them.',
    'The existence of providers does not show whether people in your target group want this kind of help.',
    'It is a hypothesis that the existence of several providers means people seek this kind of help; the first ten conversations test it.',
    'The research confirms that competing offers exist in this space.',
    'Five providers were reviewed, and each describes relocation or consulting services on its own page.',
  ]) assert.deepEqual(only(await onLast(s), /DEMAND INFERRED/), [], s);
});

test('demand: a verified claim that reports customer behaviour supports the statement', async () => {
  const withSurvey = { ...EV, research_ledger: JSON.stringify(LEDGER.concat([{ claim_id: 'E90', question: 'M3 Evidence that customers pay', claim: 'A 2026 survey of 2,000 adults aged 40 to 60 found that 31% had paid for relocation advice.', claim_type: 'external_research', source_ids: ['W5'], source_type: 'survey report', published: '2026', verification: 'supported', page_excerpt: '31% of respondents aged 40 to 60 said they had paid for relocation advice.', credibility: 'high' }])) };
  const s = 'A 2026 survey shows that people aged 40 to 60 pay for relocation advice: 31% of respondents reported paying for it [W5], and several providers exist to serve them.';
  assert.deepEqual(only(await onLast(s, { ev: withSurvey }), /DEMAND INFERRED/), []);
  // The same sentence with no such claim behind the citation blocks.
  assert.ok((await onLast('The existence of several providers [W5] shows that people aged 40 to 60 pay for relocation advice.')).includes(DEMAND));
});

test('demand: the writer, the reviewer and the reviser carry the rule', async () => {
  const ctx = await runNode('founder-context.js', { 'Prepare Client Data': FOUNDER });
  assert.match(ctx.writer_system, /Supply is not demand\. Providers describing their services, and guides or tools being available, show what is offered/);
  assert.match(ctx.writer_system, /a hedge is not evidence/);
  const system = JSON.parse((await check(fx('Assemble Plan').text, { firstPass: true })).qa_payload).messages[0].content;
  assert.match(system, /"suggests that people do seek help", "confirms that people seek information", and "is consistent with a space where people seek this kind of help" are all unsupported/);
  const pr = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': fx('Citation Check')[0], 'Assemble Plan': fx('Assemble Plan'), 'Build Evidence': EV }, fx('Final QA')[0]);
  assert.match(JSON.parse(pr.revise_payload).messages[0].content, /Supply is not demand: providers describing services, and resources being available, show what is offered/);
});

// ---------------- 2. Repeats: the proposition, with its qualifiers and negation ----------------

test('repeat: the reviewer named what was wrong with the original claim, the word "paid"', () => {
  const f = fx('Apply Revisions').first_findings;
  assert.match(f.find((x) => x.id === 'QA-001').problem, /assert that competing providers offer 'paid' relocation and lifestyle consulting/);
  assert.match(f.find((x) => x.id === 'QA-001').fix, /Remove the word 'paid' from every occurrence/);
  const u2 = fx('Apply Revisions').edit_log.find((e) => e.unit === 'U2');
  assert.match(u2.before, /The existence of competing providers confirms that paid offers in this space exist/);
  assert.ok(!/\bpaid\b/.test(u2.after));
});

test('repeat: line 616 says charging is not established, and is not a repeat', async () => {
  assert.match(lineOf(616), /confirming that competing offers exist in this space; whether those services are charged for is not established from the sources reviewed\./);
  assert.match(fx('Delivery Gate').blockers_text, /DUP-001 \| SAME CLAIM STILL PRESENT ELSEWHERE \| L616/);      // what the run reported
  const { out } = await secondPass();
  assert.ok(!out.findings.some((f) => f.line === 616));
  assert.ok(!out.possible_repeats.some((d) => d.line === 616));
  assert.deepEqual(out.findings.filter((f) => /SAME CLAIM/.test(f.check)), []);
  // Lines 14 and 69 carry the same corrected wording and are not listed either.
  [14, 69].forEach((n) => assert.ok(!out.possible_repeats.some((d) => d.line === n) && !out.findings.some((f) => /SAME CLAIM/.test(f.check) && f.line === n), 'L' + n));
});

const withLine = async (sentence) => {
  const rev = clone(fx('Apply Revisions'));
  rev.text = rev.text.replace(/\n+$/, '') + '\n\n' + sentence + '\n';
  const r = await secondPass(rev);
  const n = rev.text.replace(/\n+$/, '').split('\n').length;
  return { n, repeats: r.out.findings.filter((f) => f.check === 'SAME CLAIM STILL PRESENT ELSEWHERE' && f.line === n), listed: r.out.possible_repeats.filter((d) => d.line === n), det: at(r.cc, n) };
};

test('repeat: a paraphrase that still asserts paid offers exist blocks', async () => {
  for (const s of [
    'The existence of competing providers shows that paid offers exist in this space.',
    'Competing providers in this space confirm that paid offers exist for this customer.',
  ]) {
    const r = await withLine(s);
    assert.equal(r.repeats.length, 1, s);
    assert.equal(r.repeats[0].severity, 'BLOCKING', s);
    assert.match(r.repeats[0].problem, /corrected QA-001, QA-008/);
  }
  // A paraphrase with different words is caught by the rule itself, which reads the proposition.
  const other = await withLine('These providers charge clients for relocation consulting [S1] [S2].');
  assert.ok(other.det.includes('BLOCKING PAYMENT STATED WITHOUT EVIDENCE'));
});

test('repeat: the same words, denied or qualified, are the corrected proposition and pass', async () => {
  for (const s of [
    'The existence of competing providers does not confirm that paid offers exist in this space.',
    'Whether paid offers exist in this space is not established by the existence of competing providers.',
    'Competing providers exist in this space; whether those services are charged for is not established.',
  ]) {
    const r = await withLine(s);
    assert.deepEqual(r.repeats, [], s);
    assert.deepEqual(r.listed, [], s);
  }
});

test('repeat: earlier confirmed repeats are still confirmed under the proposition test', async () => {
  const of = async (dir) => {
    const f = (n) => JSON.parse(readFileSync(path.join(ROOT, 'fixtures', dir, n + '.json'), 'utf8'));
    const rev = f('Apply Revisions');
    const cc = await runNode('citation-check.js', { 'Founder Context': f('Founder Context'), 'Compute Financials': f('Compute Financials'), 'Assemble Plan': f('Assemble Plan'), 'Build Evidence': f('Build Evidence'), 'Growth Plan Generator1': f('Growth Plan Generator1'), 'Apply Revisions': rev });
    const out = await runNode('plan-revision-request.js', { 'Founder Context': f('Founder Context'), 'Compute Financials': f('Compute Financials'), 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': f('Build Evidence') }, f('Final QA')[1]);
    return out.findings.filter((x) => x.check === 'SAME CLAIM STILL PRESENT ELSEWHERE').map((x) => x.line).sort((a, b) => a - b);
  };
  assert.deepEqual(await of('exec-63222'), [40, 297]);     // the price inference; "established firms"
  assert.deepEqual(await of('exec-63223'), [43, 553]);     // "a sizeable, active population"; "widely available"
});

// ---------------- 3. Source verification that did not complete ----------------

test('source verification: the unusable answers were for two claims about a company the plan does not use', () => {
  const ex = JSON.parse(EV.excluded_claims).filter((x) => x.kind === 'verifier_malformed');
  assert.deepEqual(ex.map((x) => x.claim_id), ['E19', 'E20']);
  assert.ok(ex.every((x) => /^Wayfinder Travel & Relocation says/.test(x.claim) && x.candidate_source_ids[0] === 'S14'));
  assert.ok(!LEDGER.some((c) => ['E19', 'E20'].includes(c.claim_id)), 'the claims stay out of the ledger');
  assert.ok(!/\bS14\b/.test(HELD_PLAN) && !/wayfinder/i.test(HELD_PLAN));
  assert.equal(JSON.parse(EV.sources).find((s) => s.id === 'S14').domain, 'linkedin.com');
});

const UNUSED = 'MAJOR SOURCE VERIFICATION INCOMPLETE FOR UNUSED CLAIMS';
const HOLDS = 'BLOCKING SOURCE VERIFICATION INCOMPLETE';
const verificationIssue = async (text = HELD_PLAN, ev = EV) => { const i = (await check(text, { ev })).det_issues.find((x) => /^SOURCE VERIFICATION INCOMPLETE/.test(x.type)); return { ...i, label: i.severity + ' ' + i.type }; };
const plus = (line) => HELD_PLAN.replace(/\n+$/, '') + '\n\n' + line + '\n';

test('source verification: E19 and E20 on S14 are unused candidates, so the incomplete check is a research warning, not a hold', async () => {
  const issue = await verificationIssue();
  assert.equal(issue.label, UNUSED);
  assert.match(issue.detail, /covering claims E19, E20\. Those claims were kept out of the ledger\./);
  assert.match(issue.detail, /Nothing in the plan rests on them: the plan does not cite S14 for anything unverified, does not name Wayfinder Travel & Relocation, states no figure from these claims, and has no sentence that says what they say\./);
  assert.match(issue.detail, /The claims stay excluded and the plan is not held for this\. It is a research warning/);
  const { out } = await secondPass();
  const f = out.findings.find((x) => /^SOURCE VERIFICATION INCOMPLETE/.test(x.check));
  assert.equal(f.severity, 'MAJOR');
  assert.notEqual(f.unresolved, true);
  // Alone, it does not hold the plan: the plan goes to review with the warning.
  const g = await runNode('delivery-gate.js', { 'Finalize Plan': { status: 'REVIEW', final_findings: [] }, 'Plan Revision Request': { findings: [f] } });
  assert.equal(g.blocked, false);
  assert.equal(g.unresolved_check_count, 0);
  assert.equal(g.warning_count, 1);
  // In the run it was one of the two blockers that held the plan.
  assert.match(fx('Delivery Gate').blockers_text, /AUTO-002 \| SOURCE VERIFICATION INCOMPLETE/);
});

test('source verification: a used claim holds', async () => {
  // The plan cites the page whose check failed, and no verified claim exists on that page.
  const cited = await verificationIssue(plus('A further provider offers personalized consulting [S14].'));
  assert.equal(cited.label, HOLDS);
  assert.match(cited.detail, /the plan cites S14, and no verified claim exists on that page/);
  // The plan names the company the unverified claims are about.
  const named = await verificationIssue(plus('Wayfinder Travel & Relocation is another alternative for this customer.'));
  assert.equal(named.label, HOLDS);
  assert.match(named.detail, /E19: the plan names Wayfinder Travel & Relocation/);
  assert.match(named.detail, /a required check that did not complete, not a defect that was found; the plan is held/);
});

test('source verification: indirect dependencies hold', async () => {
  // A short form of the company's name.
  assert.match((await verificationIssue(plus('Wayfinder also works with people planning a move.'))).detail, /the plan names Wayfinder\b/);
  assert.equal((await verificationIssue(plus('Wayfinder also works with people planning a move.'))).label, HOLDS);
  // The claim's content with no name and no citation.
  const echo = await verificationIssue(plus('One firm helps individuals navigate international travel, relocation and global lifestyle opportunities through personalized consulting, strategic planning, educational resources and concierge support.'));
  assert.equal(echo.label, HOLDS);
  assert.match(echo.detail, /E19: a sentence of the plan says most of what this claim says/);
  // A figure that only the unverified claim gives.
  const withFigure = { ...EV, excluded_claims: JSON.stringify(JSON.parse(EV.excluded_claims).map((x) => x.claim_id === 'E20' ? { ...x, claim: x.claim.replace(/\.$/, '') + ' and says 87% of its clients relocate within a year.' } : x)) };
  const fig = await verificationIssue(plus('In one account, 87% of clients relocate within a year.'), withFigure);
  assert.equal(fig.label, HOLDS);
  assert.match(fig.detail, /E20: the plan states 87%, a figure only this claim gives/);
});

test('source verification: when the dependency cannot be worked out, it holds', async () => {
  // The excluded record of one failed claim is missing.
  const lost = { ...EV, excluded_claims: JSON.stringify(JSON.parse(EV.excluded_claims).filter((x) => x.claim_id !== 'E19')) };
  const a = await verificationIssue(HELD_PLAN, lost);
  assert.equal(a.label, HOLDS);
  assert.match(a.detail, /E19: its text is not available, so its use cannot be ruled out/);
  // The failed check does not say which claims it covered.
  const integrity = JSON.parse(EV.source_integrity);
  integrity.verification.verifier_problems = [{ source_id: 'S14', claim_ids: [], problem: 'the verifier returned nothing for this page' }];
  const b = await verificationIssue(HELD_PLAN, { ...EV, source_integrity: JSON.stringify(integrity), verification_incomplete: 1 });
  assert.equal(b.label, HOLDS);
  assert.match(b.detail, /the failed check does not say which claims it covered/);
});

test('source verification: a check that did not run at all, and a held check, are unresolved and hold', async () => {
  const { out } = await secondPass(clone(fx('Apply Revisions')));
  const held = { id: 'AUTO-002', severity: 'BLOCKING', unresolved: true, check: 'SOURCE VERIFICATION INCOMPLETE', line: null, problem: 'x' };
  const g = await gate([held]);
  assert.equal(g.blocked, true);
  assert.equal(g.confirmed_blocker_count, 0);
  assert.equal(g.unresolved_check_count, 1);
  // The real second pass, with a dependency added, marks the finding unresolved.
  const rev = clone(fx('Apply Revisions'));
  rev.text = plus('Wayfinder Travel & Relocation is another alternative for this customer.');
  const r = await secondPass(rev);
  const f = r.out.findings.find((x) => x.check === 'SOURCE VERIFICATION INCOMPLETE');
  assert.equal(f.severity, 'BLOCKING');
  assert.equal(f.unresolved, true);
  assert.ok(out.findings.length > 0);
});

// ---------------- 4. Line 157 and the undated sources ----------------

const GAP = 'BLOCKING COMPETITIVE GAP STATED AS A FINDING';

test('line 157: the five direct competitors\' verified entries list services and say nothing about focus or stage', () => {
  const direct = LEDGER.filter((c) => /^C1\b/.test(c.question));
  assert.deepEqual([...new Set(direct.map((c) => c.entity))], ['Mosline Travel Consultancy Firm', 'Start Abroad', 'Traveling with Kristin', 'LA Relocation Group', 'International Relocation Partner']);
  const all = direct.map((c) => c.claim + ' ' + c.page_excerpt).join(' ');
  // None mentions a decision or a stage. The one use of "focus" is LA Relocation Group's "we focus on your well-being".
  assert.ok(!/primarily|decision|decid|\bstage\b|rather than/i.test(all));
  assert.deepEqual(all.match(/\bfocus\w*[^.]{0,22}/gi).map((x) => x.slice(0, 18)), ['focus on your well']);
  // Three of the five describe planning or consulting, not only execution.
  assert.match(direct.find((c) => c.entity === 'Mosline Travel Consultancy Firm').claim, /requirements, timing, budget, and risk/);
  assert.match(direct.find((c) => c.entity === 'Traveling with Kristin').claim, /personalized relocation consulting/);
  assert.match(direct.find((c) => c.claim_id === 'E12').claim, /international consulting services, documentation assistance, and international advisory/);
});

test('line 157: the comparison and the ranking are not supported, and are now reported', async () => {
  assert.match(lineOf(157), /all five direct competitors focus primarily on the execution of a move - logistics, visas, housing, compliance - rather than on the earlier decision-making stage/);
  assert.match(lineOf(157), /Intermark Relocation is the most comprehensive provider reviewed/);
  const out = await check();
  assert.deepEqual(at(out, 157), [GAP, 'BLOCKING COMPETITOR RANKED WITHOUT EVIDENCE']);
  assert.match(out.det_issues.find((i) => i.line === 157 && /RANKED/.test(i.type)).detail, /it does not say what is being compared; it cites no verified claim for Mosline Travel Consultancy Firm, Start Abroad, Traveling with Kristin, LA Relocation Group, International Relocation Partner, Intermark Relocation/);
});

test('line 157: what the reviewed evidence supports, with its scope, passes', async () => {
  for (const s of [
    'The five pages reviewed list visa, housing, documentation and logistics services, and three of them also describe planning or consulting [S1] [S4] [S11]. None of the verified passages says which stage of a customer\'s decision the company is aimed at, so whether any of them serves the pre-decision stage is not established.',
    'It is a hypothesis that the competitors reviewed focus on executing a move rather than on the decision before it; the pages reviewed do not say.',
    'Intermark Relocation\'s page lists webinars, company registration, visas and moving services [S13].',
  ]) assert.deepEqual(only(await onLast(s), /GAP|RANKED/), [], s);
  assert.ok((await onLast('The providers reviewed are built for people who have already decided, not on helping them decide.')).includes(GAP));
});

const RANKED = 'BLOCKING COMPETITOR RANKED WITHOUT EVIDENCE';

test('ranking: six companies were reviewed in this run, five direct and one indirect', () => {
  const reviewed = JSON.parse(EV.entities).filter((e) => LEDGER.some((c) => c.entity === e.name && /^C\d/.test(c.question)));
  assert.deepEqual(reviewed.map((e) => e.name + ' ' + e.source_ids.join('/')), ['Mosline Travel Consultancy Firm S1', 'Start Abroad S2', 'Traveling with Kristin S4', 'LA Relocation Group S5', 'International Relocation Partner S11', 'Intermark Relocation S13']);
});

test('ranking: unsupported superlatives are reported', async () => {
  for (const s of [
    'Intermark Relocation is the most comprehensive provider reviewed, covering both planning and execution.',
    'Intermark Relocation is the most comprehensive provider reviewed [S13].',
    'By the number of services listed, Intermark Relocation is the most comprehensive provider reviewed.',       // a criterion with no evidence
    'Traveling with Kristin is the leading provider in this space [S4].',
    'Start Abroad [S2] and LA Relocation Group [S5] are the most established competitors.',                      // evidence with no criterion
  ]) assert.ok((await onLast(s)).includes(RANKED), s);
});

test('ranking: evidence for two companies does not support "most" among all those reviewed', async () => {
  const two = 'By the number of services each page lists, Intermark Relocation is the most comprehensive provider reviewed: its page lists webinars, company registration, digital nomad visas and moving services [S13], against visas, housing and banking for Start Abroad [S2].';
  const text = HELD_PLAN.replace(/\n+$/, '') + '\n\n' + two + '\n';
  const issue = (await check(text)).det_issues.find((i) => i.line === text.replace(/\n+$/, '').split('\n').length && /RANKED/.test(i.type));
  assert.equal(issue.severity, 'BLOCKING');
  assert.match(issue.detail, /it cites no verified claim for Mosline Travel Consultancy Firm, Traveling with Kristin, LA Relocation Group, International Relocation Partner, and a ranking of the 6 companies reviewed needs evidence for every one of them/);
  assert.match(issue.detail, /Evidence for two companies supports a comparison between those two only/);
  // Five of six is still not all.
  assert.ok((await onLast('In terms of the range of services listed, Intermark Relocation [S13] is the most extensive provider reviewed, ahead of Mosline Travel Consultancy Firm [S1], Start Abroad [S2], Traveling with Kristin [S4] and LA Relocation Group [S5].')).includes(RANKED));
});

test('ranking: a stated criterion with verified evidence for every company reviewed passes', async () => {
  const all = 'By the number of services each page lists, Intermark Relocation [S13] is the most comprehensive provider reviewed, ahead of Mosline Travel Consultancy Firm [S1], Start Abroad [S2], Traveling with Kristin [S4], LA Relocation Group [S5] and International Relocation Partner [S11].';
  assert.deepEqual(only(await onLast(all), /RANKED/), []);
});

test('ranking: evidence for two supports a comparison between those two, worded as that', async () => {
  for (const s of [
    'In terms of the number of services listed, Intermark Relocation is more comprehensive than Start Abroad [S13] [S2].',
    'Of the two, Intermark Relocation is the most comprehensive by the number of services its page lists [S13], compared with Start Abroad [S2].',
    'Intermark Relocation\'s page lists more services than Start Abroad\'s: webinars, company registration, visas and moving services [S13] against visas, housing and banking [S2].',
  ]) assert.deepEqual(only(await onLast(s), /RANKED/), [], s);
  // The comparison still needs its criterion and evidence for both.
  assert.ok((await onLast('Intermark Relocation is more comprehensive than Start Abroad [S13] [S2].')).includes(RANKED));
  assert.ok((await onLast('In terms of the number of services listed, Intermark Relocation is more comprehensive than Start Abroad [S13].')).includes(RANKED));
});

test('ranking: removing the ranking, or wording it as a hypothesis, passes', async () => {
  for (const s of [
    'Intermark Relocation\'s page lists webinars, company registration, digital nomad visas and moving services [S13].',
    'It is a hypothesis that Intermark Relocation is the most comprehensive provider among those reviewed.',
  ]) assert.deepEqual(only(await onLast(s), /RANKED/), [], s);
});

test('undated sources: every source the plan cites is undated, and the plan says so in Section 4 only', () => {
  const sources = JSON.parse(EV.sources);
  const cited = [...new Set(HELD_PLAN.match(/\b[SW]\d+\b/g))];
  assert.deepEqual(cited.sort(), ['S1', 'S11', 'S13', 'S2', 'S4', 'S5', 'W3', 'W5']);
  assert.ok(cited.every((id) => sources.find((x) => x.id === id).published === 'date not shown'));
  const noted = HELD_PLAN.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\bundated\b/i.test(l)).map(([n]) => n);
  assert.deepEqual(noted, [80]);
  assert.match(lineOf(78), /^## 4\. Competitive Landscape/);
  assert.match(lineOf(80), /^All sources reviewed for this plan are undated; the service descriptions may not reflect the current state of each provider\./);
});

test('undated sources: the Section 4 note covers its nine rows; Sections 3 and 6 are the ones with no note', async () => {
  const out = await check();
  const found = out.det_issues.filter((i) => i.type === 'UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION');
  assert.deepEqual(found.map((i) => [i.severity, i.line]), [['MAJOR', 69], ['MAJOR', 188]]);
  assert.match(found[0].detail, /^Section 3 \(Market Opportunity & Fit\) uses S1, S2, S4, S5, S11, S13, W5, W3 from L69 on\. Their pages show no date, and nothing in this section says so\. A note in another section does not cover this one\./);
  assert.match(found[1].detail, /^Section 6 \(Revenue & Financial Model\) uses S1, S2, S4, S5, S11, S13 from L188 on\./);
  // The nine passages the reviewer listed are all in Section 4, below the note, and are not reported.
  const unchanged = fx('Apply Revisions').unchanged_units;
  assert.equal(unchanged.length, 9);
  assert.ok(unchanged.every((u) => u.start > 80 && u.start < 171));
  assert.ok(!found.some((i) => i.line > 78 && i.line < 171));
  // Sections 5 and 11, which the reviewer's fix also named, cite no source at all, so nothing there needs the note.
  const body = HELD_PLAN.split('\n');
  assert.ok(!/\[[SW]\d+\]/.test(body.slice(170, 179).join('\n')) && !/\[[SW]\d+\]/.test(body.slice(609).join('\n')));
});

test('undated sources: a note covers its own section only, and only the sources it is true of', async () => {
  const body = HELD_PLAN.split('\n');
  // The same note at the start of Section 3 covers Section 3; Section 6 is still reported.
  const s3 = body.slice(); s3.splice(40, 0, 'All sources reviewed for this plan are undated; the descriptions may have changed.', '');
  assert.deepEqual((await check(s3.join('\n'))).det_issues.filter((i) => /UNDATED SOURCES/.test(i.type)).map((i) => i.detail.slice(0, 9)), ['Section 6']);
  // A note that names some sources covers those and not the rest.
  const partial = body.slice(); partial.splice(40, 0, 'The pages for [S1] and [S2] carry no publication date.', '');
  const p = (await check(partial.join('\n'))).det_issues.find((i) => /UNDATED SOURCES/.test(i.type) && /^Section 3/.test(i.detail));
  assert.match(p.detail, /uses S4, S5, S11, S13, W5, W3 from/);
  // Without the Section 4 note, Section 4 is reported too: the finding is not cleared by a note elsewhere.
  const none = body.slice(); none[79] = none[79].replace('All sources reviewed for this plan are undated; the service descriptions may not reflect the current state of each provider. ', '');
  assert.deepEqual((await check(none.join('\n'))).det_issues.filter((i) => /UNDATED SOURCES/.test(i.type)).map((i) => i.detail.slice(0, 9)), ['Section 3', 'Section 4', 'Section 6']);
  // "All sources are undated" is wrong in a section that cites a dated page.
  const dated = { ...EV, sources: JSON.stringify(JSON.parse(EV.sources).map((x) => x.id === 'S13' ? { ...x, published: 'March 3, 2026', published_iso: '2026-03-03' } : x)) };
  const wrong = (await check(HELD_PLAN, { ev: dated })).det_issues.find((i) => i.type === 'SOURCE DATE NOTE IS WRONG' && i.line === 80);
  assert.equal(wrong.severity, 'BLOCKING');
  assert.match(wrong.detail, /Section 4 says its sources are undated, and it cites S13 \(March 3, 2026\)/);
});

test('undated sources: the revision verifier is shown each unchanged passage with its section and that section\'s note', async () => {
  const { cc } = await secondPass();
  const p = JSON.parse(cc.qa_payload);
  const user = p.messages[1].content;
  const block = user.slice(user.indexOf('PASSAGES LEFT UNCHANGED'));
  assert.equal((block.match(/\n   Section: 4\. Competitive Landscape\n   Notes about source dates in that section: \[L80\] All sources reviewed for this plan are undated;/g) || []).length, 9);
  assert.match(block, /unit U5 \| id QA-015 \| MAJOR/);
  assert.match(p.messages[0].content, /a note in the same section that accurately covers the passage's sources answers it, and the problem is not present in that passage\. A note in a different section does not count/);
});

test('undated sources: the run\'s nine "present" answers were given without that context, and the finding is not cleared by code', async () => {
  const judged = JSON.parse(fx('Final QA')[1].choices[0].message.content.replace(/^[^{]*/, '').replace(/[^}]*$/, '')).unchanged;
  assert.equal(judged.length, 9);
  assert.ok(judged.every((u) => u.id === 'QA-015' && u.present === true));
  // Replaying the saved answers, QA-015 stays open: code does not overrule the verifier because a note exists.
  const { out } = await secondPass();
  assert.equal(out.verification.find((x) => x.id === 'QA-015').status, 'PARTLY_FIXED');
  assert.ok(out.findings.some((f) => f.id === 'QA-015' && f.severity === 'MAJOR'));
  // With "not present" for the nine rows, which is what the note supports, the finding closes on the verifier's word.
  const qa = clone(fx('Final QA')[1]);
  const o = JSON.parse(qa.choices[0].message.content.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  o.unchanged.forEach((u) => { u.present = false; u.reason = 'The note at L80 in the same section says the sources are undated, which covers the undated sources this row cites.'; u.basis = 'section_note'; u.quote = 'All sources reviewed for this plan are undated'; });
  o.verifications.find((v) => String(v.id) === 'QA-015').status = 'FIXED';
  qa.choices[0].message.content = JSON.stringify(o);
  const closed = await secondPass(fx('Apply Revisions'), qa);
  assert.equal(closed.out.verification.find((x) => x.id === 'QA-015').status, 'FIXED');
  // The two sections that really lack the note are still reported by code.
  assert.deepEqual(closed.out.findings.filter((f) => f.check === 'UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION').map((f) => f.line), [69, 188]);
});

// ---------------- The held plan, rechecked as a whole ----------------

test('63225 recheck: seven confirmed defects, no unresolved required check, and the ordinary findings', async () => {
  const { out } = await secondPass();
  const f = out.findings;
  assert.deepEqual(f.filter((x) => x.severity === 'BLOCKING' && !x.unresolved).map((x) => 'L' + x.line + ' ' + x.check), [
    'L157 COMPETITIVE GAP STATED AS A FINDING',
    'L72 DEMAND INFERRED FROM SUPPLY',
    'L74 DEMAND INFERRED FROM SUPPLY',
    'L190 DEMAND INFERRED FROM SUPPLY',
    // Found by the superlative rule added after execution 63226: "the most common alternative", "substitute", "outcome".
    'L55 SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE',
    'L152 SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE',
    'L153 SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE',
    // An unsupported ranking of companies is a statement of fact, and blocks like any other since commit after 10c023c.
    'L157 COMPETITOR RANKED WITHOUT EVIDENCE',
  ]);
  assert.deepEqual(f.filter((x) => x.unresolved), []);
  assert.deepEqual(f.filter((x) => x.severity === 'MAJOR').map((x) => x.check + (x.line ? ' L' + x.line : '')).sort(), [
    'FINANCIAL MODEL',
    'SOURCE VERIFICATION INCOMPLETE FOR UNUSED CLAIMS',
    'Stale or undated evidence used without qualification L80',
    'UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION L188',
    'UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION L69',
  ]);
  assert.equal(f.filter((x) => x.severity === 'MINOR').length, 2);
  assert.deepEqual(out.possible_repeats, []);
  assert.ok(!f.some((x) => x.line === 616), 'corrected line 616 passes');
  const g = await gate(f);
  assert.equal(g.blocked, true);
  assert.equal(g.confirmed_blocker_count, 8);
  assert.equal(g.unresolved_check_count, 0);
  assert.equal(g.warning_count, 5);
});

test('63225 recheck: the $500 baseline is unchanged', async () => {
  assert.equal(FIN.price_record.amount, 500);
  assert.equal(FIN.cost_headroom.available_usd, 12100);
  assert.equal((await runNode('test-financial-baseline.js', {})).fixedScenarioPrice, 500);
});
