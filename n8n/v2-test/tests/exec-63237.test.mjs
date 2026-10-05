// Regression checks built on the paid replay, execution 63237 (fixtures/exec-63237).
// Run: node --test n8n/v2-test/tests/exec-63237.test.mjs
// No network and no model calls. The reviewer, reviser and verifier answers are the ones the models returned in that run.
// The fixture is read, never rewritten: every changed plan, answer or record below is built in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runNode, fixture, clone, ROOT } from './harness.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63237');
const DIR26 = path.join(ROOT, 'fixtures', 'exec-63226');
const j = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const f26 = (name) => JSON.parse(readFileSync(path.join(DIR26, name + '.json'), 'utf8'));
const digest = () => readdirSync(DIR).sort().map((f) => f + ' ' + createHash('sha256').update(readFileSync(path.join(DIR, f))).digest('hex')).join('\n');
const BEFORE = digest();

const EV = j('Build Evidence')[0];
const FOUNDER = f26('Founder Context');
const FIN = f26('Compute Financials');
const ASSEMBLE = f26('Assemble Plan');
const SAVED_REV = j('Apply Revisions')[0];
const REQ1 = j('Plan Revision Request')[0];
const PLAN = SAVED_REV.text;
const TEXT = PLAN.split('\n');
const resp = (o) => ({ choices: [{ message: { content: JSON.stringify(o) } }], usage: {} });
const LABELS = /\b(?:hypothesis|assumption|not established|not confirmed|to test|IdeaToPlan (?:recommends|notes|suggests))\b/i;

const check = (rev = SAVED_REV) => runNode('citation-check.js', { 'Line Review': { on: true }, 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': ASSEMBLE, 'Build Evidence': EV, 'Growth Plan Generator1': f26('Growth Plan Generator1'), 'Apply Revisions': rev });
const withText = (text) => ({ ...SAVED_REV, text });
const at = (out, line) => out.det_issues.filter((i) => i.line === line).map((i) => i.severity + (i.needs_judgment ? ' (needs judgment) ' : ' ') + i.type);
const swap = async (n, replacement) => { const l = TEXT.slice(); l[n - 1] = replacement; return at(await check(withText(l.join('\n'))), n); };
const applyWith = (change = {}) => {
  const o = clone(j('reviser-answer'));
  o.edits = o.edits.map((e) => (change[e.unit] ? { ...e, ...change[e.unit](e) } : e));
  return runNode('apply-revisions.js', { 'Plan Revision Request': REQ1, 'Assemble Plan': ASSEMBLE, 'Build Evidence': EV }, resp(o));
};
const firstPass = (answer = j('reviewer-answer')) => runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': j('Citation Check')[0], 'Assemble Plan': ASSEMBLE, 'Build Evidence': EV }, resp(answer));
const secondPass = async (answer = j('verifier-answer'), rev = SAVED_REV) => {
  const cc = await check(rev);
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, resp(answer));
  return { cc, out };
};
const gateOf = (out) => runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD', final_findings: [] }, 'Plan Revision Request': out });
const reportOf = async (cc, out, rev = SAVED_REV) => (await runNode('finalize-plan.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': ASSEMBLE, 'Apply Revisions': rev, 'Build Evidence': EV, 'Citation Check': cc, 'Plan Revision Request': out, 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Brave Search': fixture('Brave Search'), 'Growth Plan Generator1': f26('Growth Plan Generator1'), 'Final QA': f26('Final QA'), 'Revise Plan': f26('Revise Plan'), 'Financial Assumptions': f26('Financial Assumptions'), 'Verify Claims': f26('Verify Claims') })).report;
const tablesIntact = (text) => { const l = text.split('\n'); return l.every((x, i) => !(/^\s*\|.*\|\s*$/.test(l[i - 1] || '') && /^\s*\|.*\|\s*$/.test(l[i + 1] || '') && x.trim() && !/^\s*\|.*\|\s*$/.test(x))); };
const key = (f) => 'L' + f.line + ' ' + f.check;

test('fixture: the saved plan is the one the verifier read, and it has not been touched', () => {
  assert.equal(PLAN.trim(), readFileSync(path.join(DIR, 'revised-plan.md'), 'utf8').trim());
  assert.deepEqual(SAVED_REV.unresolved.map((x) => x.slice(0, 3).trim()), ['U2', 'U11']);
  assert.equal(j('verifier-answer').plan_review.length, 81);
});

// ---------------- 1. Staleness notes ----------------

test('date notes: in the run, the accurate note that W5 is from 2016 was refused', () => {
  assert.match(SAVED_REV.unresolved[1], /^U11 \(L121, QA-015\): the replacement put text other than a source-date note beside a table row/);
  assert.equal(j('reviser-answer').edits.find((e) => e.unit === 'U11').section_note, 'Note: W5 is dated March 2016; the tools and platforms listed may no longer be current.');
  assert.deepEqual(JSON.parse(JSON.stringify((typeof EV.sources === 'string' ? JSON.parse(EV.sources) : EV.sources).filter((s) => s.id === 'W5').map((s) => [s.published_iso, s.published_kind]))), [['2016-03-31', 'publication']]);
});

test('date notes: the same reviser answer is now applied, the note above the table and every row in place', async () => {
  const rev = await applyWith();
  assert.deepEqual(rev.unresolved, ['U2 (L25, QA-010): the reviser returned the passage unchanged.']);
  assert.deepEqual(rev.rejected_units, []);
  const l = rev.text.split('\n');
  const n = l.indexOf('Note: W5 is dated March 2016; the tools and platforms listed may no longer be current.');
  assert.ok(n > 0);
  assert.deepEqual([l[n - 1], l[n + 1]], ['', '']);
  assert.match(l[n + 2], /^\| Name \| What they offer \|/);
  const row = l.find((x) => x.startsWith('| BecomeNomad |'));
  assert.equal(row.split('|').length, 6);
  assert.equal(row, TEXT.find((x) => x.startsWith('| BecomeNomad |')), 'the row itself is the row that was there');
  assert.ok(tablesIntact(rev.text));
  // The finding that asked for the note is not raised again by code on the new text.
  const cc = await check(rev);
  assert.ok(!cc.det_issues.some((i) => /STALE|SOURCE DATE NOTE IS WRONG/.test(i.type)));
  assert.ok(cc.review_lines.some((r) => r.kind === 'date_note' && r.line === n + 1 && r.date_note_ok === true));
});

test('date notes: a staleness note is checked against the source record, and other wordings of the same fact pass', async () => {
  const note = (text) => ({ U11: () => ({ section_note: text }) });
  const good = [
    'Note: W5 was published on 31 March 2016, more than two years before this plan was written.',
    'Note: W5 dates from 2016 and may be out of date.',
    'Note: S13 is undated. W5 is dated March 2016 and may no longer be current.',
  ];
  for (const g of good) {
    const rev = await applyWith(note(g));
    assert.deepEqual(rev.rejected_units, [], g);
    assert.ok(rev.text.split('\n').includes(g), g);
    assert.ok(tablesIntact(rev.text));
  }
  const bad = [
    ['Note: W5 is dated March 2019; the tools listed may no longer be current.', /the note gives W5 the date "March 2019", and the source record shows/],
    ['Note: W5 is dated 2021 and may be out of date.', /the note gives W5 the date "2021", and the source record shows/],
    ['Note: this source is dated March 2016 and may be out of date.', /the note gives a date \("March 2016"\) without naming the source it dates/],
    ['Note: S13 is dated March 2016 and may be out of date.', /the note gives S13 the date "March 2016", and the source record holds no date for it/],
    ['Note: W5 is undated; the tools listed may have changed.', /the note calls W5 undated, and the source record shows/],
    ['Note: BecomeNomad is the weakest of these sources.', /text other than a source-date note beside a table row/],
    ['Note: W5 is dated March 2016. BecomeNomad is rarely used by people over 40.', /the note also says "BecomeNomad is rarely used by people over 40\.", which is not about the date of a source/],
    ['Note: W5 is dated March 2016; its tools may no longer be current, and free lists like it are what most people over 40 start with before they ever consider paying anyone for help.', /the note also says "its tools may no longer be current, and free lists/],
  ];
  for (const [b, why] of bad) {
    const rev = await applyWith(note(b));
    const r = rev.unresolved.find((x) => x.startsWith('U11'));
    if (why) { assert.ok(r, b); assert.match(r, why, b); assert.ok(!rev.text.includes(b)); }
    assert.ok(tablesIntact(rev.text), b);
    // A refused note leaves the row as it was, and the finding open.
    if (why) assert.ok(rev.unchanged_units.some((u) => u.unit === 'U11' && u.kind === 'rejected'));
  }
});

test('date notes: a note that also states a fact is not a date note, and needs a verdict like any other line', async () => {
  const l68 = TEXT[67];
  const base = await check();
  assert.equal(base.review_lines.find((r) => r.line === 68).kind, 'date_note');
  const more = await check(withText(PLAN.replace(l68, l68 + ' Most of these providers are rarely used by people over 40.')));
  const r = more.review_lines.find((x) => x.line === 68);
  assert.notEqual(r.kind, 'date_note');
  assert.equal(r.date_note_ok, undefined);
  assert.ok(JSON.parse(more.qa_payload).messages[1].content.includes('L68 ['), 'it is on the list of lines that need a verdict');
  assert.equal(more.review_coverage.needing_a_verdict, base.review_coverage.needing_a_verdict + 1);
});

// ---------------- 2. Source-only rows and date notes ----------------

test('source rows and date notes: six of the eight unusable verdicts of the run were about lines that state nothing to review', async () => {
  const saved = j('Plan Revision Request')[1].plan_review.unresolved;
  assert.deepEqual(saved.map((u) => u.line), [68, 77, 80, 92, 104, 116, 137, 462]);
  const { cc, out } = await secondPass();
  const kindOf = (n) => cc.review_lines.find((r) => r.line === n).kind;
  assert.deepEqual([80, 92, 104, 116].map(kindOf), ['source_row', 'source_row', 'source_row', 'source_row']);
  assert.deepEqual([68, 137].map(kindOf), ['date_note', 'date_note']);
  [80, 92, 104, 116].forEach((n) => assert.match(TEXT[n - 1], /^\| Source \| (?:\[[SW]\d+\]\s*)+\|$/));
  // The verifier's "no external claim" for them is accepted: none of the six is an incomplete check now.
  assert.ok(!out.plan_review.unresolved.some((u) => [68, 80, 92, 104, 116, 137].includes(u.line)));
  assert.equal(out.plan_review.source_rows, 4);
  assert.deepEqual(out.plan_review.date_notes_checked_by_code, [{ line: 68, ok: true }, { line: 137, ok: true }]);
});

test('date notes: they are judged against the source record, not excused for being notes', async () => {
  // L68 says eight S sources show no date, and none of them has one. True, so it passes.
  assert.deepEqual(at(await check(), 68), []);
  // The same sentence about a source whose record carries a date is wrong, and blocks.
  const wrong = await check(withText(PLAN.replace('The sources used in this section (S1, S3, S4,', 'The sources used in this section (S28, S1, S3, S4,')));
  assert.ok(wrong.det_issues.some((i) => i.line === 68 && i.type === 'SOURCE DATE NOTE IS WRONG'));
  assert.equal(wrong.review_lines.find((r) => r.line === 68).date_note_ok, false);
  const { out } = await secondPass(j('verifier-answer'), withText(PLAN.replace('The sources used in this section (S1, S3, S4,', 'The sources used in this section (S28, S1, S3, S4,')));
  assert.deepEqual(out.plan_review.date_notes_checked_by_code[0], { line: 68, ok: false });
  assert.ok(out.findings.some((f) => f.line === 68 && f.check === 'SOURCE DATE NOTE IS WRONG' && f.severity === 'BLOCKING' && !f.unresolved));
});

// ---------------- 3. Coverage ----------------

test('coverage: every company-profile row is listed with its company and that company\'s ledger entries', async () => {
  const cc = await check();
  const rows = cc.review_lines.filter((r) => r.kind === 'profile_row');
  assert.equal(rows.length, 28);
  assert.deepEqual([...new Set(rows.map((r) => r.company))], ['Expat US', 'RELONXT', 'Relocate Now', 'Fragomen']);
  const ledger = JSON.parse(EV.research_ledger);
  rows.forEach((r) => { assert.ok(r.entries.length, 'L' + r.line); r.entries.forEach((id) => assert.ok(ledger.some((e) => e.claim_id === id), id)); });
  // The two strength rows the replay never saw, because they cite nothing and name nobody.
  assert.equal(TEXT[88], '| Strength | Comprehensive operational coverage from arrival through full settlement |');
  assert.deepEqual(cc.review_lines.find((r) => r.line === 89), { line: 89, edited: '', kind: 'profile_row', company: 'RELONXT', entries: ['E6', 'E7'] });
  assert.deepEqual(cc.review_lines.find((r) => r.line === 113), { line: 113, edited: '', kind: 'profile_row', company: 'Fragomen', entries: ['E17'] });
  // Every table row between a profile heading and the next heading is covered, either as a row to judge or as a source row.
  let company = '';
  TEXT.forEach((l, i) => {
    if (/^#{2,4} /.test(l)) company = /Expat US|RELONXT|Relocate Now|Fragomen/.test(l) ? l : '';
    if (company && /^\| (?!---)/.test(l) && !/^\| *(?:Field|Item|Attribute) *\|/i.test(l) && l.split('|').length === 4 && l.split('|')[2].trim()) assert.ok(cc.review_lines.some((r) => r.line === i + 1), 'L' + (i + 1) + ' ' + l.slice(0, 60));
  });
  const user = JSON.parse(cc.qa_payload).messages[1].content;
  assert.ok(user.includes('L89 [profile of RELONXT; its ledger entries: E6, E7]'));
  assert.ok(user.includes('L113 [profile of Fragomen; its ledger entries: E17]'));
});

test('coverage: statements about the founder, the audience and the offer are listed, with the intake beside them', async () => {
  const cc = await check();
  for (const n of [27, 251, 287, 386]) assert.equal(cc.review_lines.find((r) => r.line === n).kind, 'founder', 'L' + n);
  const p = JSON.parse(cc.qa_payload);
  const user = p.messages[1].content;
  assert.match(user, /L27 \[about the founder, the audience, or the offer/);
  assert.ok(user.includes(FOUNDER.founder_context.slice(0, 200)), 'the founder context is in the same request');
  assert.match(p.messages[0].content, /FROM_INTAKE when what the line says about the founder, the audience, or the offer is what the FOUNDER CONTEXT says/);
  assert.match(p.messages[0].content, /"an audience that does not yet exist" is UNSUPPORTED when the intake does not say so/);
});

test('coverage: uncited statements about people, markets and competitors are listed', async () => {
  const cc = await check();
  assert.equal(cc.review_lines.find((r) => r.line === 462).kind, 'external');
  assert.ok(!/\[[SW]\d+\]/.test(TEXT[461]));
  assert.match(TEXT[461], /^Reasoning: People who are seriously considering a major life change often seek out communities/);
  const uncited = cc.review_lines.filter((r) => r.kind === 'external' && !/\[[SW]\d+\]/.test(TEXT[r.line - 1]));
  assert.ok(uncited.length >= 30);
});

test('coverage: what is not on the list is reported line by line, in the request and in the report', async () => {
  const { cc, out } = await secondPass();
  const c = cc.review_coverage;
  assert.deepEqual([c.prose_lines, c.listed, c.needing_a_verdict, c.not_listed.length], [269, 131, 125, 138]);
  assert.equal(c.listed + c.not_listed.length, c.prose_lines);
  assert.equal(Object.values(c.by_kind).reduce((a, b) => a + b, 0), c.listed);
  assert.ok(c.not_listed.every((n) => !cc.review_lines.some((r) => r.line === n)));
  // L25 is not listed: it describes the customer in the founder's words and trips no cue. That is stated, not hidden.
  assert.ok(c.not_listed.includes(25));
  const user = JSON.parse(cc.qa_payload).messages[1].content;
  assert.match(user, /NOT ON THE LIST/);
  assert.deepEqual(out.plan_review.coverage, c);
  const report = await reportOf(cc, out);
  assert.match(report, /COVERAGE: 131 of 269 lines of text were on the review list \(.*28 profile row.*\)\. NOT ON THE LIST \(138\): L3, L5, L7-13, L17-19, L25, /);
  assert.match(report, /A statement of fact on one of them is read only if the reviewer reports it unprompted\./);
});

// ---------------- 4. Stage and focus wording ----------------

test('stage: L79 assigns Expat US a post-decision focus, and "Our read:" does not label it', async () => {
  const cc = await check();
  assert.deepEqual(at(cc, 79), ['BLOCKING PROVIDER FOCUS STATED WITHOUT EVIDENCE']);
  assert.match(TEXT[78], /Our read: Expat US is focused on people who have already made the decision/);
  // Genuine failures in other words.
  for (const bad of [
    '| Why a customer might choose QYLAT instead | Expat US works with people who have already made the decision to move. |',
    '| Why a customer might choose QYLAT instead | Our read: Expat US serves customers after the decision has been made. |',
  ]) assert.deepEqual(await swap(79, bad), ['BLOCKING PROVIDER FOCUS STATED WITHOUT EVIDENCE'], bad);
  // Corrected wording.
  for (const good of [
    '| Why a customer might choose QYLAT instead | Whether Expat US also serves people who have not yet decided to move is not established by its pages. If QYLAT\'s pre-decision framing resonates in customer conversations, it addresses a different moment. This is a hypothesis to test. |',
    '| Why a customer might choose QYLAT instead | The services Expat US lists are home search, settling-in and immigration support. Our hypothesis, to be tested in customer conversations, is that people who have not yet decided to move are not the customer those pages describe. |',
  ]) assert.deepEqual(await swap(79, good), [], good);
});

test('stage: L102 and L103 characterise the provider ambiguously, which is a question for the reviewer and not a confirmed defect', async () => {
  const cc = await check();
  assert.deepEqual(at(cc, 102), ['BLOCKING (needs judgment) PROVIDER CHARACTERISATION NEEDS VERIFICATION']);
  assert.deepEqual(at(cc, 103), ['BLOCKING (needs judgment) PROVIDER CHARACTERISATION NEEDS VERIFICATION']);
  // With no verdict the question is an incomplete check that holds the plan.
  const none = await secondPass({ ...j('verifier-answer'), plan_review: j('verifier-answer').plan_review.filter((e) => ![102, 103].includes(e.line)) });
  const open = none.out.findings.filter((f) => [102, 103].includes(f.line) && f.needs_judgment);
  assert.deepEqual(open.map((f) => [f.line, f.unresolved, f.severity]), [[102, true, 'BLOCKING'], [103, true, 'BLOCKING']]);
  const g = await gateOf(none.out);
  assert.match(g.unresolved_checks_text, /PROVIDER CHARACTERISATION NEEDS VERIFICATION \| L102/);
  assert.ok(!g.blockers_text.split('\n').some((l) => /PROVIDER CHARACTERISATION/.test(l) && !/CHECK DID NOT COMPLETE/.test(l)));
  // A valid paraphrase is settled by a verdict that names an entry from that company's own pages, whatever the words.
  const entries = cc.review_lines.find((r) => r.line === 102).entries;
  const yes = await secondPass({ ...j('verifier-answer'), plan_review: j('verifier-answer').plan_review.filter((e) => e.line !== 102).concat([{ line: 102, verdict: 'SUPPORTED', claim_ids: [entries[0]] }]) });
  assert.ok(!yes.out.findings.some((f) => f.line === 102));
  assert.ok(yes.out.plan_review.judged.some((x) => x.line === 102 && x.verdict === 'SUPPORTED'));
  // An unsupported verdict confirms it.
  const no = await secondPass({ ...j('verifier-answer'), plan_review: j('verifier-answer').plan_review.filter((e) => e.line !== 102).concat([{ line: 102, verdict: 'UNSUPPORTED', claim_ids: [], quote: 'managing an active relocation', problem: 'No entry for Relocate Now says who it is for.' }]) });
  const f = no.out.findings.find((x) => x.line === 102);
  assert.deepEqual([f.severity, f.unresolved], ['BLOCKING', undefined]);
});

test('stage: wording that describes the listed services without assigning a customer stage raises nothing', async () => {
  for (const ok of [
    '| Why a customer might choose them | A customer who wants one digital tool for the tasks its page lists may find the consolidated platform useful |',
    '| Why a customer might choose QYLAT instead | QYLAT\'s offer is a personalized conversation and plan. Whether Relocate Now is used by people who have not yet decided is not established by its page. |',
  ]) assert.deepEqual(await swap(103, ok), [], ok);
});

// ---------------- 5. The review contract, and the claims missed in the replay ----------------

test('contract: the four rules broken in the replay are in the verifier\'s instructions', async () => {
  const sys = JSON.parse((await check()).qa_payload).messages[0].content;
  assert.match(sys, /A hypothesis label covers the assertion it is attached to and nothing else\./);
  assert.match(sys, /it still states as fact that those services are paid and logistics-focused, and that needs ledger entries or it is UNSUPPORTED/);
  assert.match(sys, /"Our read:" in front of .* is not a label: it names the author\./);
  assert.match(sys, /A survey finding keeps its population, its sample, and its scope\./);
  assert.match(sys, /What substitutes cannot give the customer .* is UNSUPPORTED unless an entry reports it or the sentence itself calls it a hypothesis\./);
  assert.match(sys, /In a company's profile, every row is about that company: judge it against the entries listed for that profile\./);
  assert.match(sys, /A detail about the founder, the audience, or the offer that the FOUNDER CONTEXT does not state is UNSUPPORTED unless the line presents it as a proposed assumption or as not captured in the intake/);
});

test('hypothesis label: L129 is a hypothesis about positioning that states as fact that the other services are paid', async () => {
  assert.deepEqual(at(await check(), 129), ['BLOCKING PAYMENT STATED WITHOUT EVIDENCE']);
  assert.match(TEXT[128], /could distinguish QYLAT from both the logistics-focused paid services and the free content alternatives\. This is a hypothesis, not a finding\./);
  const fixed = TEXT[128].replace('both the logistics-focused paid services and the free content alternatives', 'both the relocation services reviewed and the free content alternatives');
  assert.deepEqual(await swap(129, fixed), []);
  // Saying what the evidence does not show about payment is not a payment claim.
  assert.deepEqual(await swap(129, 'Whether the relocation services reviewed charge for planning help is not established. No research was found that confirms demand for paid planning services.'), []);
  // The saved verifier called the line LABELLED. Code holds it regardless.
  assert.equal(j('verifier-answer').plan_review.find((e) => e.line === 129).verdict, 'LABELLED');
  const { out } = await secondPass();
  assert.ok(out.findings.some((f) => f.line === 129 && f.check === 'PAYMENT STATED WITHOUT EVIDENCE' && f.severity === 'BLOCKING' && !f.unresolved));
});

test('survey: L43 and L483 turn a survey of 600 travelers about paperwork into proof that the founder\'s problem is real', async () => {
  const cc = await check();
  assert.deepEqual(at(cc, 483), ['BLOCKING PROBLEM STATED AS CONFIRMED']);
  assert.deepEqual(at(cc, 43), ['BLOCKING PROBLEM STATED AS CONFIRMED']);
  // The sample and its scope kept, and no claim that the problem is confirmed.
  const fixed = 'Nearly two-thirds of 600 surveyed travelers said administrative tasks like paperwork and visas take more time than they expected [S28]. That survey covers travelers broadly. Whether the people you want to serve have the problem your offer addresses is not established and is the first thing to test.';
  assert.deepEqual(await swap(483, fixed), []);
  // A hypothesis about the problem is a valid alternative.
  assert.deepEqual(await swap(483, 'Your hypothesis is that people who want a major lifestyle change do not know where to start. Nearly two-thirds of 600 surveyed travelers said administrative tasks take more time than they expected [S28], which does not confirm that hypothesis.'), []);
  // Dropping the sample is still caught by the older rule.
  // The sample dropped, with or without the word "survey": the finding has become a fact about travelers in general.
  for (const bad of [
    'Most travelers find that paperwork and visas take more time than they expected [S28].',
    'Nearly two-thirds of travelers said administrative tasks take more time than they expected [S28].',
    'Travelers report that paperwork takes more time than they expected [S28].',
  ]) assert.deepEqual(await swap(483, bad), ['BLOCKING SURVEY FINDING GENERALISED'], bad);
  // The sample in the sentence before, and a sentence that says what the survey does not show, are both fine.
  assert.deepEqual(await swap(483, 'Holafly surveyed 600 travelers for its Digital Nomad Friction Index 2026. Nearly two-thirds of them said administrative tasks take more time than they expected [S28].'), []);
  assert.deepEqual(await swap(483, 'The survey does not show that most people in your target group struggle with planning [S28].'), []);
  // A different fact from the same page is not a survey finding.
  assert.deepEqual(await swap(483, 'Holafly publishes the Digital Nomad Friction Index 2026 [S28].'), []);
});

test('substitutes: L127 says what free content cannot provide, with no entry and no label on that sentence', async () => {
  assert.deepEqual(at(await check(), 127), ['BLOCKING SUBSTITUTE LIMITATION STATED WITHOUT EVIDENCE']);
  assert.match(TEXT[126], /The free substitutes, blogs, forums, and resource lists, address the information need but not the personalized, structured planning need\./);
  const hyp = TEXT[126].replace('The free substitutes, blogs, forums, and resource lists, address the information need but not the personalized, structured planning need.', 'Our hypothesis, to be tested, is that free blogs, forums, and resource lists address the information need but not the planning need.');
  assert.deepEqual(await swap(127, hyp), []);
  const open = TEXT[126].replace('The free substitutes, blogs, forums, and resource lists, address the information need but not the personalized, structured planning need.', 'Whether free blogs, forums, and resource lists leave a planning need unmet is not established.');
  assert.deepEqual(await swap(127, open), []);
  // The label two sentences later does not reach back.
  assert.match(TEXT[126], /Whether a gap exists at the pre-decision stage is a hypothesis to test/);
});

test('intake: L27 and L251 say the audience does not exist, and the intake does not say so', async () => {
  const cc = await check();
  assert.deepEqual(at(cc, 27), ['BLOCKING UNKNOWN STATED AS NONE']);
  assert.deepEqual(at(cc, 251), ['BLOCKING UNKNOWN STATED AS NONE']);
  assert.ok(!/does not yet exist|no audience/i.test(FOUNDER.founder_context));
  const proposed = TEXT[26].replace('require an audience that does not yet exist', 'require an audience; the intake does not say whether you have one, so this plan assumes you are starting without one');
  assert.deepEqual(await swap(27, proposed), []);
  const labelled = TEXT[250].replace('they depend on an audience that does not yet exist and', 'they depend on an audience, and this plan assumes, as a planning assumption you should correct if it is wrong, that you have not built one yet, and');
  assert.deepEqual(await swap(251, labelled), []);
  // When the intake does say so, the same sentence is the founder's own fact.
  const told = await runNode('citation-check.js', { 'Line Review': { on: true }, 'Founder Context': { ...FOUNDER, assets_state: 'none' }, 'Compute Financials': FIN, 'Assemble Plan': ASSEMBLE, 'Build Evidence': EV, 'Growth Plan Generator1': f26('Growth Plan Generator1'), 'Apply Revisions': SAVED_REV });
  assert.deepEqual(at(told, 27).filter((x) => /UNKNOWN STATED AS NONE/.test(x)), FOUNDER.assets_state === 'unknown' ? [] : at(cc, 27).filter((x) => /UNKNOWN STATED AS NONE/.test(x)));
});

// ---------------- 6. Unsupported verdicts and unusable verdicts ----------------

test('verdicts: L77 and L462 are confirmed defects from the verifier\'s own answer, not incomplete checks', async () => {
  const va = j('verifier-answer').plan_review;
  assert.deepEqual(va.find((e) => e.line === 77), { line: 77, verdict: 'SUPPORTED', claim_ids: ['E3'], quote: '', problem: '' });
  assert.equal(va.find((e) => e.line === 462).verdict, 'LABELLED');
  assert.ok(!LABELS.test(TEXT[461]));
  const { out } = await secondPass();
  assert.deepEqual(out.plan_review.contradicted.map((u) => [u.line, u.kind]), [[77, 'cited source does not carry the support'], [462, 'called labelled, and the line has no label']]);
  assert.ok(!out.plan_review.unresolved.some((u) => u.line === 77 || u.line === 462));
  const fc = out.findings.filter((f) => /^FC-/.test(f.id));
  assert.deepEqual(fc.map((f) => [f.id, f.line, f.check, f.severity, f.unresolved]), [
    ['FC-001', 77, 'CITED SOURCE DOES NOT CARRY THE STATEMENT', 'BLOCKING', undefined],
    ['FC-002', 462, 'UNSUPPORTED AND NOT LABELLED', 'BLOCKING', undefined],
  ]);
  assert.match(fc[0].problem, /named E3 as the support for this line\. That entry was verified on S1\. The line cites S3/);
  const g = await gateOf(out);
  const confirmed = g.blockers_text.split('\n').filter((l) => !/CHECK DID NOT COMPLETE/.test(l)).join('\n');
  assert.match(confirmed, /FC-001 \| CITED SOURCE DOES NOT CARRY THE STATEMENT \| L77/);
  assert.match(confirmed, /FC-002 \| UNSUPPORTED AND NOT LABELLED \| L462/);
  assert.ok(!/FC-00/.test(g.unresolved_checks_text));
});

test('verdicts: the report keeps three lists apart, and the lines the verifier never saw stay incomplete', async () => {
  const { cc, out } = await secondPass();
  // The saved answer covers the 81 lines listed in the run. The list is longer now, and what it did not answer is not a finding.
  assert.equal(out.plan_review.unresolved.length, 50);
  assert.ok(out.plan_review.unresolved.every((u) => u.why === 'no verdict was given'));
  assert.deepEqual(out.plan_review.unsupported.map((u) => u.line), [123]);
  const open = out.findings.find((f) => f.id === 'FR-OPEN');
  assert.deepEqual([open.unresolved, open.check], [true, 'FINAL REVIEW OF THE REVISED PLAN IS INCOMPLETE']);
  assert.ok(!/L77\b|L462\b/.test(open.problem));
  const report = await reportOf(cc, out);
  const a = report.indexOf('Unsupported, as the reviewer found (1):');
  const b = report.indexOf('Unsupported, shown by the reviewer\'s own verdict (2):');
  const c = report.indexOf('Not reviewed: no usable verdict (50). These are incomplete checks, not findings:');
  assert.ok(a > 0 && b > a && c > b, [a, b, c].join(' '));
  assert.match(report.slice(a, b), /L123/);
  assert.match(report.slice(b, c), /L77[\s\S]*L462/);
  assert.ok(!/L77\b|L462\b|L123\b/.test(report.slice(c, report.indexOf('Decided by code', c))));
  // All fifty are named: forty with their reason, and the rest by line.
  assert.match(report, /- and 10 more, each with no usable verdict: L459, L463, L465, L466, L467, L471, L473, L487, L498, L517/);
  assert.match(report, /Decided by code, with no verdict asked: 4 source-only rows \(they state nothing\) and 2 date notes checked against the source records\./);
});

test('verdicts: the gate holds on confirmed defects and on incomplete checks, counted separately', async () => {
  const { out } = await secondPass();
  const g = await gateOf(out);
  assert.equal(g.blocked, true);
  assert.deepEqual([g.confirmed_blocker_count, g.unresolved_check_count], [10, 3]);
  assert.deepEqual(out.findings.filter((f) => f.severity === 'BLOCKING' && !f.unresolved).map(key).sort(), [
    'L123 UNSUPPORTED CLAIM IN THE REVISED PLAN',
    'L127 SUBSTITUTE LIMITATION STATED WITHOUT EVIDENCE',
    'L129 PAYMENT STATED WITHOUT EVIDENCE',
    'L251 UNKNOWN STATED AS NONE',
    'L27 UNKNOWN STATED AS NONE',
    'L43 PROBLEM STATED AS CONFIRMED',
    'L462 UNSUPPORTED AND NOT LABELLED',
    'L483 PROBLEM STATED AS CONFIRMED',
    'L77 CITED SOURCE DOES NOT CARRY THE STATEMENT',
    'L79 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
  ]);
  assert.deepEqual(out.findings.filter((f) => f.severity === 'BLOCKING' && f.unresolved).map((f) => f.id + ' L' + f.line).sort(), ['AUTO-V03 L102', 'FR-OPEN L6', 'QA-010 L25']);
});

// ---------------- 7. QA-010 and the passage a finding belongs to ----------------

test('attribution: the reviewer listed L25 and wrote that L25 needs no change, so L25 is not an occurrence', async () => {
  const raw = j('reviewer-answer').findings.find((f) => /realistic/.test(f.root_problem || f.problem || '') && /L25 is quoting/.test(f.fix));
  assert.deepEqual((raw.occurrences || []).map((o) => o.line).sort((a, b) => a - b), [25, 423]);
  // In the run this produced U2, an edit request for a passage the reviewer had called acceptable.
  assert.deepEqual(REQ1.units.find((u) => u.id === 'U2').issues, ['QA-010']);
  assert.equal(REQ1.units.find((u) => u.id === 'U2').start, 25);
  const p1 = await firstPass();
  const f = p1.findings.find((x) => x.id === 'QA-010');
  assert.deepEqual(f.occurrences.map((o) => o.line), [423]);
  assert.deepEqual(f.not_occurrences, [25]);
  assert.equal(f.line, 423);
  assert.equal(p1.units.length, REQ1.units.length - 1);
  assert.ok(!p1.units.some((u) => u.start <= 25 && u.end >= 25));
  assert.ok(p1.units.some((u) => u.issues.includes('QA-010') && u.start === 423));
});

test('attribution: the rule reads the reviewer\'s own fix, and has nothing to do with the word "realistic"', async () => {
  assert.ok(!/realistic/.test(readFileSync(path.join(ROOT, 'plan-revision-request.js'), 'utf8').split('\n').filter((l) => /not_occurrences|acceptable/.test(l)).join('\n')));
  const answer = clone(j('reviewer-answer'));
  const i = answer.findings.findIndex((f) => /L25 is quoting/.test(f.fix));
  // The plan's own assurance at L25: the reviewer lists it and does not excuse it, so it stays an occurrence.
  answer.findings[i].fix = 'At L25 and L423, say that feasibility is an assumption to test.';
  const kept = (await firstPass(answer)).findings.find((x) => x.id === 'QA-010');
  assert.deepEqual(kept.occurrences.map((o) => o.line).sort((a, b) => a - b), [25, 423]);
  assert.equal(kept.not_occurrences, undefined);
  // A different finding, a different word: the line the fix calls acceptable is dropped all the same.
  const other = clone(j('reviewer-answer'));
  const k = other.findings.findIndex((f, n) => n !== i && (f.occurrences || []).length >= 2);
  const [first, second] = other.findings[k].occurrences;
  other.findings[k].fix = 'L' + first.line + ' is acceptable as written; no change needed there. At L' + second.line + ', rewrite the sentence.';
  const before = (await firstPass()).findings.find((x) => x.problem === (other.findings[k].root_problem || other.findings[k].problem));
  const after = (await firstPass(other)).findings.find((x) => x.problem === (other.findings[k].root_problem || other.findings[k].problem));
  assert.ok(before.occurrences.some((o) => o.line === first.line));
  assert.ok(!after.occurrences.some((o) => o.line === first.line));
  assert.deepEqual(after.not_occurrences, [first.line]);
});

test('attribution: the customer\'s stated doubt is not the plan asserting feasibility, and the plan\'s own assurance still is', async () => {
  // L25 reports what the customer does not know. Code raises nothing on it.
  assert.match(TEXT[24], /who feel stuck because they do not know whether it is realistic, affordable, or logistically possible/);
  assert.deepEqual(at(await check(), 25), []);
  // The reviewer and the verifier are both told the difference.
  const p = JSON.parse(j('Citation Check')[0].qa_payload ? (await runNode('citation-check.js', { 'Line Review': { on: true }, 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': ASSEMBLE, 'Build Evidence': EV, 'Growth Plan Generator1': f26('Growth Plan Generator1') })).qa_payload : '{}');
  assert.match(p.messages[0].content, /AN OCCURRENCE IS A LINE THAT HAS TO CHANGE: never list a line that your own fix says is acceptable as written\./);
  assert.match(p.messages[0].content, /A sentence that reports the customer's doubt .* is not the plan asserting feasibility\./);
  assert.match(JSON.parse((await check()).qa_payload).messages[0].content, /Do not confuse the customer's own doubt with the plan's assurance/);
  // The plan's own assurance, with the same word, is still a finding when the reviewer raises it without excusing it.
  const answer = clone(j('reviewer-answer'));
  const i = answer.findings.findIndex((f) => /L25 is quoting/.test(f.fix));
  answer.findings[i].fix = 'At L423, replace "whether that is realistic" with a test criterion.';
  answer.findings[i].occurrences = answer.findings[i].occurrences.filter((o) => o.line === 423);
  const f = (await firstPass(answer)).findings.find((x) => x.id === 'QA-010');
  assert.deepEqual([f.severity, f.occurrences.map((o) => o.line)], ['BLOCKING', [423]]);
});

test('attribution: on the saved second pass, QA-010 at L25 is a contradiction for a person to read, not a confirmed blocker', async () => {
  // In the run: L423 was fixed, L25 came back unchanged, and the verifier called the finding partly fixed while
  // answering that the problem is not at L25. The plan was held on QA-010 as a confirmed defect.
  const saved = j('Plan Revision Request')[1].findings.find((f) => f.id === 'QA-010');
  assert.deepEqual([saved.severity, saved.unresolved, saved.line], ['BLOCKING', undefined, 25]);
  const { out } = await secondPass();
  const f = out.findings.find((x) => x.id === 'QA-010');
  assert.deepEqual([f.severity, f.unresolved, f.verifier_conflict], ['BLOCKING', true, true]);
  assert.match(f.problem, /THE VERIFIER DISAGREES WITH ITSELF\./);
  const g = await gateOf(out);
  assert.match(g.unresolved_checks_text, /QA-010/);
  assert.ok(!g.blockers_text.split('\n').some((l) => /QA-010/.test(l) && !/CHECK DID NOT COMPLETE/.test(l)));
});

test('fixture: nothing in fixtures/exec-63237 was changed by these tests', () => {
  assert.equal(digest(), BEFORE);
});
