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

test('source verification: it is reported as an incomplete check with its dependency, and still holds', async () => {
  const { cc, out } = await secondPass();
  const issue = cc.det_issues.find((i) => i.type === 'SOURCE VERIFICATION INCOMPLETE');
  assert.equal(issue.severity, 'BLOCKING');
  assert.match(issue.detail, /covering claims E19, E20/);
  assert.match(issue.detail, /Nothing in the plan rests on these checks: it does not cite S14 and does not name Wayfinder Travel & Relocation\. The claims stay excluded\./);
  assert.match(issue.detail, /a required check that did not complete, not a defect that was found; the plan is held/);
  const f = out.findings.find((x) => x.check === 'SOURCE VERIFICATION INCOMPLETE');
  assert.equal(f.unresolved, true);
  const g = await gate(out.findings);
  assert.equal(g.blocked, true);
  assert.equal(g.unresolved_check_count, 1);
  assert.match(g.unresolved_checks_text, /SOURCE VERIFICATION INCOMPLETE/);
  assert.match(g.blockers_text, /CHECK DID NOT COMPLETE \| AUTO-\w+ \| SOURCE VERIFICATION INCOMPLETE/);
  // In the run it was counted as a confirmed blocker.
  assert.equal(fx('Delivery Gate').unresolved_check_count, 0);
  assert.equal(fx('Delivery Gate').confirmed_blocker_count, 2);
});

test('source verification: alone, an incomplete check still holds the plan', async () => {
  const g = await gate([{ id: 'AUTO-002', severity: 'BLOCKING', unresolved: true, check: 'SOURCE VERIFICATION INCOMPLETE', line: null, problem: 'x' }]);
  assert.equal(g.blocked, true);
  assert.equal(g.version_status, 'changes_requested');
  assert.equal(g.confirmed_blocker_count, 0);
  assert.equal(g.unresolved_check_count, 1);
});

test('source verification: when the plan does use the page or the company, the dependency says so', async () => {
  const text = HELD_PLAN.replace(/\n+$/, '') + '\n\nWayfinder Travel & Relocation offers personalized consulting [S14].\n';
  const issue = (await check(text)).det_issues.find((i) => i.type === 'SOURCE VERIFICATION INCOMPLETE');
  assert.match(issue.detail, /The plan depends on these checks: it cites S14 and names Wayfinder Travel & Relocation\./);
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
  assert.deepEqual(at(out, 157), [GAP, 'MAJOR COMPETITOR RANKED WITHOUT EVIDENCE']);
});

test('line 157: what the reviewed evidence supports, with its scope, passes', async () => {
  for (const s of [
    'The five pages reviewed list visa, housing, documentation and logistics services, and three of them also describe planning or consulting [S1] [S4] [S11]. None of the verified passages says which stage of a customer\'s decision the company is aimed at, so whether any of them serves the pre-decision stage is not established.',
    'It is a hypothesis that the competitors reviewed focus on executing a move rather than on the decision before it; the pages reviewed do not say.',
    'Intermark Relocation\'s page lists webinars, company registration, visas and moving services [S13].',
  ]) assert.deepEqual(only(await onLast(s), /GAP|RANKED/), [], s);
  assert.ok((await onLast('The providers reviewed are built for people who have already decided, not on helping them decide.')).includes(GAP));
});

test('undated sources: the note is at the start of Section 4 only, so the nine rows are covered and three sections are not', () => {
  const noted = HELD_PLAN.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\bundated\b/i.test(l)).map(([n]) => n);
  assert.deepEqual(noted, [80]);
  assert.match(lineOf(78), /^## 4\. Competitive Landscape/);
  assert.match(lineOf(80), /^All sources reviewed for this plan are undated; the service descriptions may not reflect the current state of each provider\./);
  // The reviewer asked for the note at the start of Section 4 and at the first use of each source in Sections 3, 5 and 11.
  const qa15 = fx('Apply Revisions').first_findings.find((f) => f.id === 'QA-015');
  assert.match(qa15.fix, /at the start of Section 4 \(Competitive Landscape\) and at the first use of each source in Sections 3, 5, and 11/);
  // The nine passages left unchanged are all inside Section 4, below the note.
  const unchanged = fx('Apply Revisions').unchanged_units;
  assert.equal(unchanged.length, 9);
  assert.ok(unchanged.every((u) => u.start > 80 && u.start < 171));
  // Sections 3, 5 and 11 cite the same undated sources and carry no note.
  assert.match(lineOf(69), /\[S1\] \[S2\] \[S4\] \[S5\] \[S11\] \[S13\]/);
  assert.ok(lineOf(69) && !/undated/i.test(HELD_PLAN.split('\n').slice(38, 77).join('\n')));
  assert.ok(!/undated/i.test(HELD_PLAN.split('\n').slice(170, 179).join('\n')));
  assert.ok(!/undated/i.test(HELD_PLAN.split('\n').slice(609).join('\n')));
});

test('undated sources: the finding stays open, because the reviser left passages unchanged and the verifier found the problem present', async () => {
  const { out } = await secondPass();
  const v = out.verification.find((x) => x.id === 'QA-015');
  assert.equal(v.status, 'PARTLY_FIXED');
  assert.match(v.note, /unchanged passages U5-U13 cite undated sources with no staleness flag/);
  // The verifier read each of the nine passages on its own and answered "present" for all of them.
  const judged = JSON.parse(fx('Final QA')[1].choices[0].message.content.replace(/^[^{]*/, '').replace(/[^}]*$/, '')).unchanged;
  assert.equal(judged.length, 9);
  assert.ok(judged.every((u) => u.id === 'QA-015' && u.present === true));
  assert.ok(out.findings.some((f) => f.id === 'QA-015' && f.severity === 'MAJOR'));
});

// ---------------- The held plan, rechecked as a whole ----------------

test('63225 recheck: confirmed defects, one unresolved check, ordinary findings, and the dismissed false positive', async () => {
  const { out } = await secondPass();
  const f = out.findings;
  assert.deepEqual(f.filter((x) => x.severity === 'BLOCKING' && !x.unresolved).map((x) => 'L' + x.line + ' ' + x.check), [
    'L157 COMPETITIVE GAP STATED AS A FINDING',
    'L72 DEMAND INFERRED FROM SUPPLY',
    'L74 DEMAND INFERRED FROM SUPPLY',
    'L190 DEMAND INFERRED FROM SUPPLY',
  ]);
  assert.deepEqual(f.filter((x) => x.unresolved).map((x) => x.check), ['SOURCE VERIFICATION INCOMPLETE']);
  assert.deepEqual(f.filter((x) => x.severity === 'MAJOR').map((x) => x.check).sort(), ['COMPETITOR RANKED WITHOUT EVIDENCE', 'FINANCIAL MODEL', 'Stale or undated evidence used without qualification']);
  assert.equal(f.filter((x) => x.severity === 'MINOR').length, 2);
  assert.deepEqual(out.possible_repeats, []);
  assert.ok(!f.some((x) => x.line === 616), 'the run\'s false blocker at line 616 is gone');
  const g = await gate(f);
  assert.equal(g.blocked, true);
  assert.equal(g.confirmed_blocker_count, 4);
  assert.equal(g.unresolved_check_count, 1);
  assert.equal(g.warning_count, 3);
});

test('63225 recheck: the $500 baseline is unchanged', async () => {
  assert.equal(FIN.price_record.amount, 500);
  assert.equal(FIN.cost_headroom.available_usd, 12100);
  assert.equal((await runNode('test-financial-baseline.js', {})).fixedScenarioPrice, 500);
});
