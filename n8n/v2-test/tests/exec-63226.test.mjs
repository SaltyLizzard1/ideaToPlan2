// Regression checks for the defects, the false positives and the refused edits of execution 63226.
// Run: node --test n8n/v2-test/tests/exec-63226.test.mjs
// No network and no model calls. Every input is a saved node output of execution 63226 (fixtures/exec-63226).
// The held plan, its ledger and its records are read, never rewritten. Corrected evidence is built in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, fixture, clone, ROOT } from './harness.mjs';
import { reply, answer } from './pipeline.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63226');
const fx = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const HELD_PLAN = readFileSync(path.join(DIR, 'final-plan.md'), 'utf8');
const FOUNDER = fx('Founder Context');
const FIN = fx('Compute Financials');
const EV = fx('Build Evidence');
const LEDGER = JSON.parse(EV.research_ledger);
const lineOf = (n) => HELD_PLAN.split('\n')[n - 1];
const src = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const check = async (text = HELD_PLAN, { ev = EV, rev } = {}) => runNode('citation-check.js', { 'Line Review': { on: true }, 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': fx('Assemble Plan'), 'Build Evidence': ev, 'Growth Plan Generator1': fx('Growth Plan Generator1'), 'Apply Revisions': rev || { ...fx('Apply Revisions'), text } });
const at = (out, line) => out.det_issues.filter((i) => i.line === line).map((i) => i.severity + ' ' + i.type);
const onLast = async (line, opts) => { const text = HELD_PLAN.replace(/\n+$/, '') + '\n\n' + line + '\n'; return at(await check(text, opts), text.replace(/\n+$/, '').split('\n').length); };
const withLine = async (n, replacement, opts) => { const l = HELD_PLAN.split('\n'); l[n - 1] = replacement; return at(await check(l.join('\n'), opts), n); };
const only = (list, re) => list.filter((x) => re.test(x));

// The reviser's saved answer, with one edit replaced. Everything else is what the model returned in the run.
const reviserOutput = (change = {}) => {
  const raw = fx('Revise Plan').choices[0].message.content;
  const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  o.edits = o.edits.map((e) => (change[e.unit] ? { ...e, ...change[e.unit](e) } : e));
  return { choices: [{ message: { content: JSON.stringify(o) } }] };
};
const savedEdit = (unit) => { const raw = fx('Revise Plan').choices[0].message.content; return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).edits.find((e) => e.unit === unit); };
const apply = (change, ev = EV) => runNode('apply-revisions.js', { 'Plan Revision Request': fx('Plan Revision Request')[0], 'Assemble Plan': fx('Assemble Plan'), 'Build Evidence': ev }, reviserOutput(change));
const ASSEMBLED = fx('Assemble Plan').text.split('\n');
const rowOnly = (e) => e.new_text.split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l)).pop();
const noteOnly = (e) => e.new_text.split('\n').filter((l) => l.trim() && !/^\s*\|.*\|\s*$/.test(l)).join(' ');
const tablesIntact = (text) => { const l = text.split('\n'); return l.every((x, i) => !(/^\s*\|.*\|\s*$/.test(l[i - 1] || '') && /^\s*\|.*\|\s*$/.test(l[i + 1] || '') && x.trim() && !/^\s*\|.*\|\s*$/.test(x))); };
// The verifier's saved answer, with its verdicts on unchanged passages replaced.
const verifierAnswer = (unchanged) => {
  const qa = clone(fx('Final QA')[1]);
  const body = JSON.parse(qa.choices[0].message.content.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  body.unchanged = unchanged(body.unchanged);
  qa.choices[0].message.content = JSON.stringify(body);
  return qa;
};
// The whole-plan review is asked for only where a test is about it. The saved verifier answer of the run predates it.
const secondPass = async (rev, qa = fx('Final QA')[1], { review = false, ev = EV } = {}) => {
  const cc = await check(rev.text, { rev, ev });
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': review ? cc : { ...cc, review_lines: [], claim_contract: false }, 'Apply Revisions': rev, 'Build Evidence': ev }, qa);
  return { cc, out };
};
const gateOf = (out) => runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD', final_findings: [] }, 'Plan Revision Request': out });
const reportOf = async (rev, cc, out) => (await runNode('finalize-plan.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': fx('Assemble Plan'), 'Apply Revisions': rev, 'Build Evidence': EV, 'Citation Check': cc, 'Plan Revision Request': out, 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Brave Search': fixture('Brave Search'), 'Growth Plan Generator1': fx('Growth Plan Generator1'), 'Final QA': fx('Final QA'), 'Revise Plan': fx('Revise Plan'), 'Financial Assumptions': fx('Financial Assumptions'), 'Verify Claims': fx('Verify Claims') })).report;

// ---------------- 1. Table rows ----------------

test('table rows: in the run, both refused replacements were a date note written above an otherwise valid row', () => {
  assert.deepEqual(fx('Apply Revisions').unresolved.map((x) => x.replace(/\(.*?\)/, '').trim()), ['U5 : the replacement would have broken a table row.', 'U8 : the replacement would have broken a table row.']);
  for (const unit of ['U5', 'U8']) {
    const e = savedEdit(unit);
    const parts = e.new_text.split('\n').filter((l) => l.trim());
    assert.equal(parts.length, 2, unit);
    assert.match(parts[0], /^Note: .*\bundated\b/);
    assert.match(parts[1], /^\| (?:Customer|Opportunities) \| .* \|$/);
    assert.equal(parts[1].split('|').length, ASSEMBLED[unit === 'U5' ? 70 : 138].split('|').length, 'the row itself had the right number of cells');
  }
  // The row at L71 was returned unchanged: the only thing the reviser added was the note.
  assert.equal(rowOnly(savedEdit('U5')), ASSEMBLED[70]);
});

test('table rows: the same reviser answer is now applied, with the note above the table and the row in place', async () => {
  const rev = await apply();
  assert.equal(rev.applied_count, 20);
  assert.deepEqual(rev.unresolved, []);
  assert.deepEqual(rev.rejected_units, []);
  assert.deepEqual(rev.unchanged_units, []);
  assert.ok(tablesIntact(rev.text), 'no paragraph stands between two rows of a table');
  const lines = rev.text.split('\n');
  for (const unit of ['U5', 'U8']) {
    const e = rev.edit_log.find((x) => x.unit === unit);
    assert.equal(lines[e.line - 1], rowOnly(savedEdit(unit)), unit + ': the row');
    assert.equal(lines[e.section_note_line - 1], noteOnly(savedEdit(unit)), unit + ': the note');
    assert.equal(lines[e.section_note_line - 2], '');
    assert.equal(lines[e.section_note_line], '');
    assert.match(lines[e.section_note_line + 1], /^\| (?:Item|Category) \| Detail \|$/, unit + ': the note stands directly above the table header');
    assert.ok(e.section_note_line < e.line);
  }
  // Every other line of the plan is where the other 18 edits put it: the two notes add four lines in all.
  assert.equal(lines.length, fx('Apply Revisions').text.split('\n').length + 4);
  // The gap claim that survived the run at L139 is gone from the row.
  assert.ok(!/none was identified that explicitly positions/.test(rev.text));
});

test('table rows: a note given in "section_note" is placed the same way', async () => {
  const rev = await apply({ U5: (e) => ({ new_text: rowOnly(e), section_note: 'Note: S1 is undated; the description may have changed.' }) });
  const e = rev.edit_log.find((x) => x.unit === 'U5');
  assert.equal(e.section_note, 'Note: S1 is undated; the description may have changed.');
  assert.equal(rev.text.split('\n')[e.section_note_line - 1], e.section_note);
  assert.equal(rev.applied_count, 20);
  assert.ok(tablesIntact(rev.text));
});

test('table rows: a section note may name every source of its section, not only the sources of the row', async () => {
  // Found in the model-assisted replay: the reviser's note for Section 4 named all nine sources of the section and was
  // refused because the row at L71 cites only S1.
  const note = 'Note: the sources cited in this section (S1, S3, S6, S7, S4, S10, S15, S13, W5) show no date, so their descriptions may have changed.';
  const rev = await apply({ U5: (e) => ({ new_text: rowOnly(e), section_note: note }) });
  assert.deepEqual(rev.rejected_units, []);
  const e = rev.edit_log.find((x) => x.unit === 'U5');
  assert.equal(rev.text.split('\n')[e.section_note_line - 1], note);
  // "Show no date" is read as a date note by the section check.
  const out = await check(rev.text, { rev });
  assert.ok(!out.det_issues.some((i) => /UNDATED SOURCES WITHOUT/.test(i.type) && /Section 4/.test(i.detail)));
});

test('table rows: a valid replacement of the row alone is applied', async () => {
  const fixed = '| Customer | Expat US says it supports global companies and their employees relocating to the United States, and individuals and families relocating to the US [S1] |';
  const rev = await apply({ U5: () => ({ new_text: fixed }) });
  const e = rev.edit_log.find((x) => x.unit === 'U5');
  assert.equal(rev.text.split('\n')[e.line - 1], fixed);
  assert.equal(e.section_note, undefined);
  assert.equal(rev.applied_count, 20);
});

test('table rows: malformed replacements are refused, the row is left as it was, and the reason is recorded', async () => {
  const row = ASSEMBLED[70];
  const cases = [
    [(e) => ({ new_text: rowOnly(e) + '\n| Extra | A second row |' }), /it holds 2 rows where the table has one/],
    [(e) => ({ new_text: rowOnly(e).replace(/\|\s*$/, '| a third cell |') }), /it has 3 cells and the row has 2/],
    [() => ({ new_text: 'Expat US supports global companies and individuals [S1].' }), /it holds no row where the table has one/],
    [(e) => ({ new_text: 'Expat US is the market leader in this space.\n\n' + rowOnly(e) }), /text other than a source-date note beside a table row/],
    [(e) => ({ new_text: rowOnly(e), section_note: 'Note: S1 and W1 are undated.' }), /names a source its section does not cite \(W1\)/],
    [(e) => ({ new_text: rowOnly(e), section_note: 'Note: S1 and S28 are undated.' }), /the note calls S28 undated, and the source record shows "Updated Sept\. 29, 2026/],
    [(e) => ({ new_text: rowOnly(e), section_note: '## 4. Competitive Landscape' }), /would have added a section header/],
    [() => ({ new_text: '' }), /no replacement text was given/],
  ];
  for (const [change, why] of cases) {
    const rev = await apply({ U5: change });
    assert.equal(rev.applied_count, 19, String(why));
    assert.equal(rev.rejected_units.length, 1);
    assert.equal(rev.rejected_units[0].unit, 'U5');
    assert.match(rev.rejected_units[0].why, why);
    assert.deepEqual(rev.rejected_units[0].issues, ['AUTO-002', 'AUTO-009', 'QA-008']);
    assert.equal(rev.unchanged_units.find((u) => u.unit === 'U5').kind, 'rejected');
    assert.ok(rev.text.split('\n').includes(row), 'the row is unchanged');
    assert.ok(tablesIntact(rev.text));
  }
});

test('table rows: a passage returned unchanged, and a unit with no edit, are recorded as that and not as refused', async () => {
  const same = await apply({ U5: (e) => ({ new_text: rowOnly(e) }) });
  assert.equal(same.unchanged_units.find((u) => u.unit === 'U5').kind, 'unchanged');
  assert.deepEqual(same.rejected_units, []);
  const raw = fx('Revise Plan').choices[0].message.content;
  const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  o.edits = o.edits.filter((e) => e.unit !== 'U5');
  const none = await runNode('apply-revisions.js', { 'Plan Revision Request': fx('Plan Revision Request')[0], 'Assemble Plan': fx('Assemble Plan') }, { choices: [{ message: { content: JSON.stringify(o) } }] });
  assert.equal(none.unchanged_units.find((u) => u.unit === 'U5').kind, 'missing');
  assert.deepEqual(none.rejected_units, []);
});

// A refused replacement for the blocking unit, as in the run. The verifier is made to say that the problem is absent
// from the unchanged passage: the most favourable answer it could give.
const REFUSED = (e) => ({ new_text: rowOnly(e).replace(/\|\s*$/, '| a third cell |') });
const ABSENT = (list) => list.map((u) => ({ ...u, present: false, note: 'Not present.' }));

test('refused edits: each finding on the passage stays open with its original severity, whatever the verifier says', async () => {
  const rev = await apply({ U8: REFUSED });
  assert.deepEqual(rev.rejected_units.map((u) => u.unit + ' ' + u.issues.join(',')), ['U8 QA-002,QA-003,AUTO-010,QA-009']);
  const { out } = await secondPass(rev, verifierAnswer(ABSENT));
  const first = fx('Plan Revision Request')[0].findings;
  const open = out.findings.filter((f) => f.correction_not_applied);
  assert.deepEqual(open.map((f) => f.id).sort(), ['AUTO-010', 'QA-002', 'QA-003', 'QA-009']);
  open.forEach((f) => assert.equal(f.severity, first.find((x) => x.id === f.id).severity, f.id + ' keeps its severity'));
  assert.deepEqual(open.filter((f) => f.severity === 'BLOCKING').map((f) => f.id), ['QA-002', 'QA-003']);
  open.forEach((f) => assert.match(f.problem, /REQUIRED CORRECTION NOT APPLIED: the replacement for U8 at L\d+ was refused by code/));
  // None of them is reported as fixed.
  ['QA-002', 'QA-003', 'QA-009'].forEach((id) => { const v = out.verification.find((x) => x.id === id); assert.notEqual(v.status, 'FIXED', id); assert.equal(v.correction_not_applied, true); });
  assert.equal(out.verification.find((x) => x.id === 'AUTO-010').status, 'NOT_FIXED');
  assert.deepEqual(out.unapplied_corrections.map((x) => x.id + ' ' + x.severity + ' ' + x.units.join()).sort(), ['AUTO-010 MAJOR U8', 'QA-002 BLOCKING U8', 'QA-003 BLOCKING U8', 'QA-009 MAJOR U8']);
});

test('refused edits: the gate counts them apart and holds the plan', async () => {
  const rev = await apply({ U8: REFUSED });
  const { out } = await secondPass(rev, verifierAnswer(ABSENT));
  const g = await gateOf(out);
  assert.equal(g.blocked, true);
  assert.equal(g.version_status, 'changes_requested');
  assert.equal(g.unapplied_correction_count, 4);
  assert.match(g.reason, /4 required corrections were refused by code and not applied \(2 blocking, 2 major\)\. Their findings remain open\./);
  assert.match(g.unapplied_corrections_text, /- BLOCKING \| QA-002 \|/);
  assert.match(g.unapplied_corrections_text, /- MAJOR \| QA-009 \|/);
  assert.match(g.blockers_text, /QA-002/);
  assert.match(g.blockers_text, /QA-003/);
});

test('refused edits: the report never lets "no new defects" stand for the edits that were refused', async () => {
  const rev = await apply({ U8: REFUSED });
  const { cc, out } = await secondPass(rev, verifierAnswer(ABSENT));
  const report = await reportOf(rev, cc, out);
  assert.match(report, /Automated revision: 20 edit units, 19 applied, 1 not applied \(1 replacement refused by code; the findings on that passage are not corrected and stay open\)\./);
  assert.match(report, /REQUIRED CORRECTIONS NOT APPLIED \(4 findings on 1 passage\)\. Each finding is open with its original severity\./);
  assert.match(report, /- U8 at L\d+: the replacement would have broken a table row: it has 3 cells and the row has 2\./);
  assert.match(report, /- QA-002 \| BLOCKING \|/);
  assert.match(report, /- QA-009 \| MAJOR \|/);
  const nd = report.slice(report.indexOf('NEW DEFECTS INTRODUCED BY THE REVISION'));
  if (/^None\./m.test(nd.split('\n')[1])) assert.match(nd.split('\n')[1], /This covers the 19 edits that were applied\. It says nothing about the 1 replacement that code refused; see REQUIRED CORRECTIONS NOT APPLIED\./);
  assert.ok(!/All original blocking and major findings are resolved/.test(report));
});

test('refused edits: without a refusal the gate and the report say nothing about unapplied corrections', async () => {
  const rev = await apply();
  const { out } = await secondPass(rev);
  assert.deepEqual(out.unapplied_corrections, []);
  const g = await gateOf(out);
  assert.equal(g.unapplied_correction_count, 0);
  assert.equal(g.unapplied_corrections_text, 'None.');
  assert.ok(!/refused by code/.test(g.reason));
});

// ---------------- 1b. Closing a major finding on a passage nobody edited ----------------

// QA-014 says L351 presents an assumption as a conclusion ("would be a stronger starting point"). The reviser returns
// the row as it was. Whether the finding may close then rests on the verifier's answer for that unchanged passage.
const ROW351 = ASSEMBLED[350];
const leftAlone351 = () => apply({ U11: () => ({ new_text: ROW351 }) });
const JUSTIFIED = { unit: 'U11', id: 'QA-014', present: false, reason: 'The passage asks the founder to consider whether a different customer profile would be stronger. It is a conditional question, so no assumption is presented as a conclusion.', basis: 'passage', quote: 'consider whether a different customer profile' };
const answers = (list) => verifierAnswer((run) => run.filter((u) => !list.some((x) => x.unit === u.unit && x.id === u.id)).concat(list));

test('closure: a finding closes without an edit on an explicit, reasoned verdict that quotes the passage', async () => {
  assert.match(ROW351, /consider whether a different customer profile, one closer to your own experience, would be a stronger starting point/);
  const rev = await leftAlone351();
  assert.equal(rev.unchanged_units.find((u) => u.unit === 'U11').kind, 'unchanged');
  const { cc, out } = await secondPass(rev, answers([JUSTIFIED]));
  const v = out.verification.find((x) => x.id === 'QA-014');
  assert.equal(v.status, 'FIXED');
  assert.equal(v.closed_without_edit, true);
  assert.match(v.note, /^CLOSED WITHOUT AN EDIT: .*It is a conditional question.*Quoted: "consider whether a different customer profile"/);
  assert.ok(!out.findings.some((f) => f.id === 'QA-014'));
  assert.deepEqual(out.closed_without_edit.map((x) => x.id), ['QA-014']);
  const report = await reportOf(rev, cc, out);
  assert.match(report, /MAJOR FINDINGS CLOSED WITHOUT AN EDIT \(1\)\. The verifier read the unchanged passage and justified each one\. Read the justification\.\n- QA-014 \|/);
});

test('closure: the finding stays open when "not present" is not justified', async () => {
  const rev = await leftAlone351();
  const base = { unit: 'U11', id: 'QA-014', present: false };
  const cases = [
    [{ ...base }, /it gives no reason; it quotes nothing/],
    [{ ...base, note: 'Not present.' }, /it gives no reason/],
    [{ ...base, reason: 'The passage still states that the other profile would be a stronger starting point, an assumption presented as a conclusion.', basis: 'passage', quote: 'would be a stronger starting point' }, /its reason says the problem is in the passage, which contradicts its verdict/],
    [{ ...base, reason: 'The weather in Chiang Mai is pleasant at this time of year and the row reads well.', basis: 'passage', quote: 'would be a stronger starting point' }, /its reason does not address this finding/],
    [{ ...base, reason: 'The assumption is not presented as a conclusion because the row is labelled as a hypothesis.', basis: 'passage', quote: 'This is a hypothesis to test, not a conclusion.' }, /the words it quotes are not in the passage, its section, or the ledger/],
  ];
  for (const [ans, why] of cases) {
    const { out } = await secondPass(rev, answers([ans]));
    const v = out.verification.find((x) => x.id === 'QA-014');
    assert.equal(v.status, 'NOT_FIXED', String(why));
    assert.equal(v.closure_unjustified, true);
    assert.match(v.note, why);
    const f = out.findings.find((x) => x.id === 'QA-014');
    assert.equal(f.severity, 'MAJOR');
    assert.equal(f.closure_unjustified, true);
    assert.deepEqual(out.unjustified_closures.map((x) => x.id), ['QA-014']);
  }
  // "Present", and no answer at all, leave it open as before.
  for (const list of [[{ ...base, present: true, reason: 'The row states the comparison as a fact.' }], null]) {
    const { out } = await secondPass(rev, list ? answers(list) : verifierAnswer((run) => run.filter((u) => u.unit !== 'U11')));
    assert.equal(out.verification.find((x) => x.id === 'QA-014').status, 'NOT_FIXED');
    assert.ok(out.findings.some((x) => x.id === 'QA-014' && x.severity === 'MAJOR'));
  }
});

test('closure: a blocking finding is never closed without an edit, however well the verdict is justified', async () => {
  const rev = await apply({ U8: () => ({ new_text: ASSEMBLED[138] }) });
  const well = (id) => ({ unit: 'U8', id, present: false, reason: 'The competitive gap and its citation are worded conditionally on customer interviews in this passage, so no finding is asserted.', basis: 'passage', quote: 'if customer interviews confirm this is a real need' });
  const { out } = await secondPass(rev, answers([well('QA-002'), well('QA-003')]));
  for (const id of ['QA-002', 'QA-003']) {
    assert.notEqual(out.verification.find((x) => x.id === id).status, 'FIXED', id);
    assert.ok(out.findings.some((f) => f.id === id && f.severity === 'BLOCKING'), id);
  }
  assert.deepEqual(out.closed_without_edit, []);
});

test('closure: a refused replacement is not closed by a justified verdict either', async () => {
  const rev = await apply({ U11: (e) => ({ new_text: e.new_text.replace(/\|\s*$/, '| a third cell |') }) });
  assert.equal(rev.unchanged_units.find((u) => u.unit === 'U11').kind, 'rejected');
  const { out } = await secondPass(rev, answers([JUSTIFIED]));
  const f = out.findings.find((x) => x.id === 'QA-014');
  assert.equal(f.severity, 'MAJOR');
  assert.equal(f.correction_not_applied, true);
  assert.deepEqual(out.closed_without_edit, []);
});

test('closure: the verifier is told what a "not present" answer must contain', async () => {
  const rev = await leftAlone351();
  const p = JSON.parse((await check(rev.text, { rev })).qa_payload);
  assert.match(p.messages[0].content, /An answer of "present": false closes a finding that nobody edited, so it has to be justified/);
  assert.match(p.messages[0].content, /"unchanged":\[\{"unit":"the unit ID","id":the finding id,"present":true or false,"reason":"one or two sentences about this finding","basis":"passage or section_note or ledger","quote":"exact words relied on, or empty"\}\]/);
  assert.match(p.messages[0].content, /When you are not sure, answer true\./);
  const user = p.messages[1].content;
  assert.match(user.slice(user.indexOf('PASSAGES LEFT UNCHANGED')), /unit U11 \| id QA-014 \| MAJOR .*\n   Root problem: L351 recommends/);
});

// ---------------- 1c. Findings about undated sources are decided against the revised section ----------------

// The saved model-assisted replay: the reviser's 28 edits on the draft, and the verifier's answer to them.
const REPLAY = path.join(DIR, 'replay');
const replayJson = (name) => JSON.parse(readFileSync(path.join(REPLAY, name), 'utf8'));
const replayResponse = (name) => ({ choices: [{ message: { content: readFileSync(path.join(REPLAY, name), 'utf8') } }], usage: {} });
const replayRev = async () => runNode('apply-revisions.js', { 'Plan Revision Request': replayJson('Plan Revision Request pass 1.json'), 'Assemble Plan': fx('Assemble Plan'), 'Build Evidence': await rebuiltEvidence() }, replayResponse('reviser-output.json'));
// The evidence as the corrected nodes build it from the saved answers of the run: E24 excluded, E44 not yet checked.
let rebuilt = null;
const rebuiltEvidence = async () => { if (!rebuilt) rebuilt = await runNode('build-evidence.js', evStubs({ 'Build Recheck Request': (await runNode('build-recheck-request.js', { 'Collect Evidence': fx('Collect Evidence'), 'Build Verification Request': fx('Build Verification Request'), 'Verify Claims': fx('Verify Claims') })).map((i) => i.json) })); return rebuilt; };
const replayVerifier = (change = (o) => o) => { const o = change(replayJson('verifier-output.json')); return { choices: [{ message: { content: JSON.stringify(o) } }], usage: {} }; };

test('date notes: in the replay the verifier held QA-008 open for S7, which Section 4 no longer cites', async () => {
  const said = replayJson('verifier-output.json').verifications.find((v) => String(v.id) === 'QA-008');
  assert.equal(said.status, 'PARTLY_FIXED');
  assert.match(said.note, /omits S7, which the finding names as undated in Section 4/);
  const rev = await replayRev();
  const section4 = rev.text.slice(rev.text.indexOf('## 4. '), rev.text.indexOf('## 5. '));
  assert.ok(!/\bS7\b/.test(section4));
});

test('date notes: QA-008 is decided against the sources the revised Section 4 cites, and closes', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const { cc, out } = await secondPass(rev, replayVerifier(), { ev });
  const s4 = cc.section_dates.find((d) => d.no === '4');
  assert.deepEqual(s4.used, ['S1', 'S3', 'S4', 'S6', 'S10', 'S13', 'S15', 'W5']);
  assert.deepEqual(s4.missing, []);
  assert.deepEqual(s4.dated, ['W5 (31/03/2016)']);
  const v = out.verification.find((x) => x.id === 'QA-008');
  assert.equal(v.status, 'FIXED');
  assert.equal(v.decided_by_code, true);
  assert.equal(v.closed_without_edit, undefined);
  assert.match(v.note, /Decided by code against the revised plan: Section 4 now cites S1, S3, S4, S6, S10, S13, S15, W5; .* S7 is named in the finding and no longer cited in this section, so no note is owed for it\. Every undated source the section cites is covered by a note in it\. The verifier answered partly fixed/);
  assert.ok(!out.findings.some((f) => f.id === 'QA-008'));
  // The verifier is shown the same facts.
  const user = JSON.parse(cc.qa_payload).messages[1].content;
  assert.match(user, /SOURCE DATES BY SECTION OF THE REVISED PLAN \(judge every finding about undated or dated sources against this list, not against the sources named in the finding/);
  assert.match(user, /Section 4\. Competitive Landscape \| cites S1, S3, S4, S6, S10, S13, S15, W5 \| undated: S1, S3, S4, S6, S10, S13, S15 \| dated: W5 \(31\/03\/2016\) \| date notes at: L68 \| undated sources with no note: none/);
});

test('date notes: the note that is really missing in Section 3 stays open, whatever the verifier says', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const { cc, out } = await secondPass(rev, replayVerifier(), { ev });
  assert.deepEqual(cc.section_dates.find((d) => d.no === '3').missing, ['S1', 'S4']);
  const open = out.findings.filter((f) => f.check === 'UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION');
  assert.deepEqual(open.map((f) => f.severity + ' L' + f.line), ['MAJOR L57']);
  assert.match(open[0].problem, /Section 3 \(Market Opportunity & Fit\) uses S1, S4 from L57 on/);
  // A reviewer finding about a section that still lacks its note cannot be closed by a "fixed" verdict.
  const noNote = await apply();                       // the run's own revision
  const stripped = { ...noNote, text: noNote.text.split('\n').filter((l) => !/^Note: the competitor sources cited in this section/.test(l)).join('\n') };
  const r = await secondPass(stripped, verifierAnswer((u) => u));
  const v = r.out.verification.find((x) => x.id === 'QA-009');
  assert.equal(v.status, 'NOT_FIXED');
  assert.match(v.note, /Still with no note: S1, S4, S10, S15\./);
});

test('source dates: a page found by search that was read carries the date its own text shows', async () => {
  const before = JSON.parse(EV.sources).find((s) => s.id === 'W5');
  assert.equal(before.published, 'date not shown');
  assert.equal(before.published_basis, 'search listing');
  // The page verifier had read the date in the run. It was never copied to the record.
  const said = fx('Verify Claims').map((r) => { try { return JSON.parse(r.choices[0].message.content.replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch (e) { return null; } }).find((o) => o && o.source_id === 'W5');
  assert.equal(said.date_shown, '31/03/2016');
  const w5 = JSON.parse((await rebuiltEvidence()).sources).find((s) => s.id === 'W5');
  assert.equal(w5.published, '31/03/2016');
  assert.equal(w5.published_iso, '2016-03-31');
  assert.match(w5.published_basis, /^shown on the fetched page/);
  // Research sources are dated exactly as before, and a search page that shows no date stays undated.
  const now = JSON.parse((await rebuiltEvidence()).sources);
  JSON.parse(EV.sources).filter((s) => /^S/.test(s.id)).forEach((s) => assert.equal(now.find((n) => n.id === s.id).published, s.published, s.id));
  assert.equal(now.find((s) => s.id === 'W1').published, 'date not shown');
});

// ---------------- 2. Payment ----------------

const evStubs = (over = {}) => ({ 'Collect Evidence': fx('Collect Evidence'), 'Fetch Source Pages': fx('Fetch Source Pages'), 'Build Verification Request': fx('Build Verification Request'), 'Verify Claims': fx('Verify Claims'), 'Build Recheck Request': fx('Build Recheck Request'), 'Verify Corrections': fx('Verify Corrections'), 'Founder Context': FOUNDER, ...over });
const S7_PAGE = JSON.parse(fx('Fetch Source Pages').pages).find((p) => p.source_id === 'S7').text;
// The verifier's saved answers, with its answer for E24 on S7 changed.
const verifyWith = (change) => fx('Verify Claims').map((r) => {
  const body = JSON.parse(r.choices[0].message.content.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  if (body.source_id !== 'S7') return r;
  body.claims = body.claims.map((c) => (c.claim_id === 'E24' ? { ...c, ...change } : c));
  return { ...r, choices: [{ ...r.choices[0], message: { ...r.choices[0].message, content: JSON.stringify(body) } }] };
});
const ledgerOf = (ev) => JSON.parse(ev.research_ledger);

test('payment: in the run, E24 called Expat US a "paid substitute" on a passage that shows no price, fee, or charge', () => {
  const e24 = LEDGER.find((c) => c.claim_id === 'E24');
  assert.match(e24.claim, /^Expat US’s relocation support is a paid substitute for individuals and families/);
  assert.deepEqual(e24.source_ids, ['S7']);
  assert.ok(!/\$|fee|charg|pric|invoice/i.test(e24.page_excerpt));
  // The page does say "Clear pricing" next to that passage, and that is not a price.
  assert.match(S7_PAGE, /- Concierge support\n- Clear pricing and caring consultants/);
});

const SHORTER = 'Expat US’s relocation support is a substitute for individuals and families relocating to the US who need guidance on visas, schools, housing, and concierge support.';
const recheckItems = async (over = {}) => (await runNode('build-recheck-request.js', { 'Collect Evidence': fx('Collect Evidence'), 'Build Verification Request': fx('Build Verification Request'), 'Verify Claims': fx('Verify Claims'), ...over })).map((i) => i.json);
const E24_EXCERPT = LEDGER.find((c) => c.claim_id === 'E24').page_excerpt;
// What the separate check answered for the shortened claim. The two saved answers of the run come first, unchanged.
const withRecheck = async (claims) => { const items = await recheckItems(); return evStubs({ 'Build Recheck Request': items, 'Verify Corrections': fx('Verify Corrections').concat(claims ? [reply('S7', claims)] : []) }); };

test('payment: removing "paid" is a proposal, with its own ID, sent to the separate check', async () => {
  const items = await recheckItems();
  const saved = fx('Build Recheck Request');
  // The two proposals of the run keep their IDs, their order and their text.
  assert.equal(items.length, 3);
  items.slice(0, 2).forEach((it, i) => { assert.equal(it.source_id, saved[i].source_id); assert.deepEqual(it.corrections, saved[i].corrections); assert.equal(it.payload, saved[i].payload); });
  assert.deepEqual(items.slice(0, 2).flatMap((it) => it.claim_ids), ['E42', 'E43']);
  const s7 = items[2];
  assert.equal(s7.source_id, 'S7');
  assert.deepEqual(s7.corrections, [{ claim_id: 'E44', corrects: 'E24', claim: SHORTER, proposed_excerpt: E24_EXCERPT, kind: 'payment_wording_removed' }]);
  // The second verifier sees the page and the shortened claim. It is not shown the earlier excerpt or told what was removed.
  const p = JSON.parse(s7.payload);
  const sent = p.messages[1].content.slice(p.messages[1].content.indexOf('CLAIMS TO CHECK AGAINST THIS PAGE'));
  assert.deepEqual(JSON.parse(sent.slice(sent.indexOf('['))), [{ claim_id: 'E44', claim: SHORTER, source_type_reported_by_research_tool: 'company own website' }]);
  assert.ok(!/\bpaid\b/.test(sent));
  assert.ok(p.messages[1].content.includes(S7_PAGE.slice(0, 200)));
});

test('payment: with no answer from the separate check, neither E24 nor the shortened claim is in the ledger', async () => {
  // This is the state of a replay that makes no verifier call: the edit alone establishes nothing.
  const ev = await runNode('build-evidence.js', await withRecheck(null));
  const ledger = ledgerOf(ev);
  assert.equal(ledger.length, 13);
  assert.ok(!ledger.some((c) => c.claim_id === 'E24' || c.claim_id === 'E44'));
  // Every remaining entry is identical, except that the entry on W5 now carries the date its page shows.
  ledger.forEach((c) => assert.deepEqual({ ...c, published: '' }, { ...LEDGER.find((o) => o.claim_id === c.claim_id), published: '' }));
  assert.deepEqual(ledger.filter((c) => c.published !== LEDGER.find((o) => o.claim_id === c.claim_id).published).map((c) => c.claim_id + ' ' + c.published), ['E41 31/03/2016']);
  const ex = JSON.parse(ev.excluded_claims);
  const e24 = ex.find((x) => x.claim_id === 'E24');
  assert.equal(e24.kind, 'payment');
  assert.match(e24.reason, /shows no price, fee, charge, or purchase step/);
  assert.deepEqual(e24.corrections, [{ claim_id: 'E44', outcome: 'excluded' }]);
  assert.match(ex.find((x) => x.claim_id === 'E44').kind, /^verifier_(?:missing|malformed)$/);
  // No verified claim is left on S7, so S7 can no longer be cited.
  assert.ok(!ledger.some((c) => c.source_ids.includes('S7')));
  // The saved record of the run is untouched.
  assert.match(JSON.parse(fx('Build Evidence').research_ledger).find((c) => c.claim_id === 'E24').claim, /paid substitute/);
});

test('payment: the shortened claim enters the ledger only when the separate check supports it on the page', async () => {
  const ev = await runNode('build-evidence.js', await withRecheck([answer('E44', { excerpt: E24_EXCERPT })]));
  const ledger = ledgerOf(ev);
  assert.equal(ledger.length, 14);
  const e44 = ledger.find((c) => c.claim_id === 'E44');
  assert.equal(e44.claim, SHORTER);
  assert.equal(e44.derived_from, 'E24');
  assert.equal(e44.claim_as_researched, LEDGER.find((c) => c.claim_id === 'E24').claim);
  assert.equal(e44.payment_not_established, true);
  assert.match(e44.attribution, /research claim E24 called this service paid, which the page passage did not show\. This is that claim without "paid", verified by a separate check/);
  assert.match(e44.limits, /does not support saying the service is paid, charged for, or sold/);
  assert.deepEqual(e44.source_ids, ['S7']);
  assert.equal(e44.entity, 'Expat US');
  assert.ok(!ledger.some((c) => c.claim_id === 'E24'));
  const hist = JSON.parse(ev.source_integrity).corrections.find((h) => h.claim_id === 'E44');
  assert.deepEqual([hist.original, hist.kind, hist.outcome], ['E24', 'payment_wording_removed', 'verified']);
  assert.deepEqual(JSON.parse(ev.source_integrity).verification.payment_wording_removed, ['E44']);
  // "Paid" cited to that entry still blocks.
  assert.ok((await onLast('Expat US offers paid relocation support [S7].', { ev })).includes('BLOCKING PAYMENT STATED WITHOUT EVIDENCE'));
  assert.deepEqual(only(await onLast('Expat US describes relocation support for individuals and families [S7].', { ev }), /PAYMENT|WITHOUT A VERIFIED CLAIM/), []);
});

test('payment: the shortened claim is refused when the separate check does not support it, or quotes text that is not on the page', async () => {
  for (const [claims, kind] of [
    [[answer('E44', { verdict: 'unverifiable', excerpt: '', reasoning: 'The page does not call the service a substitute.' })], 'model'],
    [[answer('E44', { excerpt: 'Expat US is a substitute for individuals and families who need concierge support.' })], 'deterministic'],
    [[answer('E44', { excerpt: E24_EXCERPT, checks: { entity: 'match', amount: 'not_applicable', currency: 'not_applicable', scope: 'not_stated', qualifier: 'not_applicable', period: 'not_applicable', population: 'not_applicable', geography: 'not_applicable', date: 'not_applicable' } })], 'model_checks'],
  ]) {
    const ev = await runNode('build-evidence.js', await withRecheck(claims));
    assert.equal(ledgerOf(ev).length, 13, kind);
    assert.equal(JSON.parse(ev.excluded_claims).find((x) => x.claim_id === 'E44').kind, kind);
    assert.equal(JSON.parse(ev.excluded_claims).find((x) => x.claim_id === 'E24').kind, 'payment');
  }
});

test('payment: what the captured excerpt of E24 does and does not state', () => {
  // Stated in the excerpt: the place, guidance on visas, schools and housing, and concierge support.
  for (const re of [/Moving to the US/, /Guidance on visas, schools, and housing/, /Concierge support/]) assert.match(E24_EXCERPT, re);
  // Not stated in the excerpt: that the service is a substitute for anything, and who it is for.
  assert.ok(!/substitute/i.test(E24_EXCERPT));
  assert.ok(!/famil|individual/i.test(E24_EXCERPT));
  // "Substitute" is not on the page at all: it is the research tool's own category (question C2).
  assert.ok(!/substitute/i.test(S7_PAGE));
  assert.match(LEDGER.find((c) => c.claim_id === 'E24').question, /^C2 Indirect competitors and substitutes/);
  // The fee is on the page and was not quoted by the verifier, so it is not verified evidence.
  assert.match(S7_PAGE, /start at \$1,150/);
  assert.ok(!/1,150/.test(E24_EXCERPT));
});

test('payment: "Clear pricing" quoted from the page is not evidence of a charge', async () => {
  const vc = verifyWith({ excerpt: 'We offer: - Guidance on visas, schools, and housing - Concierge support - Clear pricing and caring consultants' });
  const items = await recheckItems({ 'Verify Claims': vc });
  assert.deepEqual(items[2].corrections.map((k) => k.claim_id + ' ' + k.kind), ['E44 payment_wording_removed']);
  const ev = await runNode('build-evidence.js', evStubs({ 'Verify Claims': vc }));
  assert.equal(JSON.parse(ev.excluded_claims).find((x) => x.claim_id === 'E24').kind, 'payment');
});

test('payment: a quoted fee is evidence of a charge, with or without the amount being in the claim', async () => {
  assert.match(S7_PAGE, /What are Expat US relocation service fees\?\nOur relocation services start at \$1,150 \./);
  const excerpt = 'We offer: - Guidance on visas, schools, and housing - Concierge support ... What are Expat US relocation service fees?';
  const ev = await runNode('build-evidence.js', evStubs({ 'Verify Claims': verifyWith({ excerpt, payment_shown: true }) }));
  const e24 = ledgerOf(ev).find((c) => c.claim_id === 'E24');
  assert.match(e24.claim, /is a paid substitute/);
  assert.equal(e24.payment_not_established, undefined);
  assert.equal(e24.page_excerpt, excerpt);
  assert.deepEqual(JSON.parse(ev.source_integrity).verification.payment_wording_removed, []);
  // The quoted passage is on the page, and no shortened claim is proposed.
  assert.equal((await recheckItems({ 'Verify Claims': verifyWith({ excerpt, payment_shown: true }) })).length, 2);
});

test('payment: a claim whose whole point is the charge is excluded when no charge is shown, and other claims stay', async () => {
  const ce = clone(fx('Collect Evidence'));
  const cands = JSON.parse(ce.candidates);
  cands.find((c) => c.claim_id === 'E24').claim = 'Expat US charges clients for guidance on visas, schools, housing, and concierge support.';
  ce.candidates = JSON.stringify(cands);
  const ev = await runNode('build-evidence.js', evStubs({ 'Collect Evidence': ce }));
  const ex = JSON.parse(ev.excluded_claims).find((x) => x.claim_id === 'E24');
  assert.equal(ex.kind, 'payment');
  assert.match(ex.reason, /shows no price, fee, charge, or purchase step/);
  assert.equal(ledgerOf(ev).length, 13);
  // The other verified facts about Expat US, on S1, S3 and S6, are still in the ledger.
  assert.deepEqual(ledgerOf(ev).filter((c) => c.entity === 'Expat US').map((c) => c.claim_id), ['E1', 'E2', 'E3', 'E4', 'E5']);
});

test('payment: collection marks the claims that assert payment, and the verifier is told what counts', async () => {
  const code = src('collect-evidence.js');
  const re = new RegExp(code.match(/asserts_payment: \/(.+)\/i\.test\(claimText\)/)[1], 'i');
  assert.ok(re.test(LEDGER.find((c) => c.claim_id === 'E24').claim));
  assert.ok(re.test('Start Abroad charges $4,000 for its concierge package.'));
  assert.ok(re.test('Kismet sells relocation packages to families.'));
  assert.ok(!re.test(LEDGER.find((c) => c.claim_id === 'E2').claim));
  assert.ok(!re.test('Expat US says it has 19 years of experience.'));
  const ce = clone(fx('Collect Evidence'));
  ce.candidates = JSON.stringify(JSON.parse(ce.candidates).map((c) => ({ ...c, asserts_payment: re.test(c.claim) })));
  const reqs = (await runNode('build-verification-request.js', { 'Collect Evidence': ce, 'Fetch Source Pages': fx('Fetch Source Pages'), 'Founder Context': FOUNDER })).map((i) => i.json);
  const s7 = JSON.parse(reqs.find((r) => r.source_id === 'S7').payload);
  assert.match(s7.messages[0].content, /8\. Payment\. .*set "payment_shown" to true only if the page text shows a price, a fee, a charge, or a purchase step.*A numeric price is not required\. "Clear pricing"/);
  assert.match(s7.messages[0].content, /"payment_shown":null/);
  const sent = JSON.parse(s7.messages[1].content.slice(s7.messages[1].content.indexOf('CLAIMS TO CHECK AGAINST THIS PAGE') + 33));
  assert.equal(sent.find((c) => c.claim_id === 'E24').asserts_payment, true);
  assert.ok(sent.filter((c) => c.claim_id !== 'E24').every((c) => c.asserts_payment === undefined));
});

const PAID = 'BLOCKING PAYMENT STATED WITHOUT EVIDENCE';

test('payment: line 57 calls relocation services paid with no source and no competitor word, and now blocks', async () => {
  assert.match(lineOf(57), /^\| What alternatives they have \| .*; paid relocation services focused on logistics after a decision is made \(see Competitive Landscape\) \|$/);
  assert.ok(!/\b[SW]\d+\b/.test(lineOf(57)));
  assert.ok(at(await check(), 57).includes(PAID));
  assert.ok(!/L57\b/.test(fx('Delivery Gate').blockers_text + fx('Delivery Gate').warnings_text), 'the run did not report it');
});

test('payment: uncited statements about other providers block in the same layouts', async () => {
  for (const s of [
    'Other alternatives include paid relocation services.',
    'Existing services in this space are paid consulting programs.',
    'Customers pay for relocation help from providers like these.',
    'Expat US offers paid relocation support [S7].',
    'Expat US charges clients for concierge support [S1].',
  ]) assert.ok((await onLast(s)).includes(PAID), s);
  assert.ok((await withLine(57, '| What alternatives they have | Paid relocation services and free forums |')).includes(PAID));
});

test('payment: this offer\'s own paid session, and a statement with a verified charge, pass', async () => {
  for (const s of [
    'Free content is the most direct route to your paid session.',
    'A free checklist is a substitute for a paid planning session.',
    'Whether those services are charged for is not established by the pages reviewed.',
    'Expat US describes relocation support for individuals and families [S7].',
  ]) assert.deepEqual(only(await onLast(s), /PAYMENT STATED/), [], s);
  // With the fee passage verified on S7, "paid" may be said of Expat US and cited to S7.
  const ev = await runNode('build-evidence.js', evStubs({ 'Verify Claims': verifyWith({ excerpt: 'We offer: - Guidance on visas, schools, and housing - Concierge support ... What are Expat US relocation service fees?', payment_shown: true }) }));
  assert.deepEqual(only(await onLast('Expat US offers paid relocation support [S7].', { ev }), /PAYMENT STATED/), []);
  // With E24 excluded, the same sentence blocks.
  const stripped = await runNode('build-evidence.js', evStubs());
  assert.ok((await onLast('Expat US offers paid relocation support [S7].', { ev: stripped })).includes(PAID));
});

// ---------------- 3. The two false positives ----------------

const GAP = 'BLOCKING COMPETITIVE GAP STATED AS A FINDING';
const MANY = 'BLOCKING ONE SOURCE CITED FOR A CLAIM ABOUT MANY';

test('gap: line 125 denies a confirmed gap and passes', async () => {
  assert.match(lineOf(125), /This pattern reflects the limits of what was found, not a confirmed gap in the market\.$/);
  assert.deepEqual(only(at(await check(), 125), /COMPETITIVE GAP/), []);
  assert.match(fx('Delivery Gate').blockers_text, /AUTO-005 \| COMPETITIVE GAP STATED AS A FINDING \| L125/, 'the run blocked on it');
});

test('gap: other denials pass, and the same sentence without the denial blocks', async () => {
  for (const s of [
    'This pattern reflects the limits of what was found, not a confirmed gap in the market.',
    'That is a limit of the research, not evidence of an unmet need.',
    'The review found no proof of a gap in the market.',
    'This is not an established positioning gap.',
  ]) assert.deepEqual(only(await onLast(s), /COMPETITIVE GAP/), [], s);
  for (const s of [
    'This pattern reflects a confirmed gap in the market.',
    'This pattern reflects the limits of what was found and a gap in the market.',
    'This is not only a gap in the market, it is an unmet need.',
    'None of the competitors reviewed offers pre-decision planning, which is not a coincidence.',
  ]) assert.ok((await onLast(s)).includes(GAP), s);
  const l = HELD_PLAN.split('\n');
  l[124] = l[124].replace('not a confirmed gap in the market', 'a confirmed gap in the market');
  assert.ok(at(await check(l.join('\n')), 125).includes(GAP));
});

test('one source: line 71 describes the customers of Expat US in its own profile row and passes', async () => {
  assert.equal(lineOf(70), '| **Expat US** | |');
  assert.match(lineOf(71), /^\| Customer \| Global companies and their employees relocating to the United States, and individuals and families relocating to the US \[S1\] \|$/);
  assert.match(LEDGER.find((c) => c.claim_id === 'E1').claim, /^Expat US supports global companies and their employees relocating to the United States/);
  assert.deepEqual(only(at(await check(), 71), /ONE SOURCE/), []);
  assert.match(fx('Delivery Gate').blockers_text, /AUTO-002 \| ONE SOURCE CITED FOR A CLAIM ABOUT MANY \| L71/, 'the run blocked on it');
});

test('one source: a general claim in the same row still blocks, and so does the customer wording outside a profile', async () => {
  for (const row of [
    '| Customer | Most companies in this space serve global employers and their employees [S1] |',
    '| Customer | Competitors serve global companies and their employees [S1] |',
    '| Customer | Providers in this market offer the same relocation support [S1] |',
    '| Customer | Other firms target the same global companies [S1] |',
  ]) assert.ok((await withLine(71, row)).includes(MANY), row);
  // Outside a company's own profile, with no company named, the statement is not tied to anyone.
  assert.ok((await onLast('Companies in this space offer relocation support to employees [S1].')).includes(MANY));
  // A row labelled with the company is that company's row.
  assert.deepEqual(only(await onLast('| Expat US | Global companies and their employees relocating to the United States [S1] |'), /ONE SOURCE/), []);
  // A row in another company's profile is not.
  const l = HELD_PLAN.split('\n');
  l[69] = '| **RELONXT** | |';
  assert.ok(at(await check(l.join('\n')), 71).some((x) => /ONE SOURCE|WRONG|ANOTHER COMPANY/.test(x)));
});

// ---------------- 4. Unsupported statements of fact ----------------

const FOCUS = 'BLOCKING PROVIDER FOCUS STATED WITHOUT EVIDENCE';
const SURVEY = 'BLOCKING SURVEY FINDING GENERALISED';
const SUPER = 'BLOCKING SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE';

test('focus: no ledger entry of this run says which stage a provider works at', () => {
  assert.ok(!LEDGER.some((c) => /decision|decid|after (?:a|the) move|post-|already committed|execution/i.test(c.claim + ' ' + c.page_excerpt)));
});

test('focus: lines 57, 64, 76, 77, 89, 125 and 481 assign providers a post-decision focus and block', async () => {
  const out = await check();
  for (const n of [64, 125, 481]) assert.match(lineOf(n), /services oriented toward logistics and execution after a relocation decision is made/);
  assert.match(lineOf(89), /Our read: RELONXT, like Expat US, appears to serve people who have already committed to a move and need execution support\./);
  assert.match(lineOf(77), /Our read: Expat US is focused on people who have already made the decision and are moving to the US specifically\./);
  assert.deepEqual(out.det_issues.filter((i) => /PROVIDER FOCUS/.test(i.type)).map((i) => i.line), [57, 64, 76, 77, 89, 125, 481]);
  out.det_issues.filter((i) => /PROVIDER FOCUS/.test(i.type)).forEach((i) => assert.equal(i.severity, 'BLOCKING'));
  assert.ok(!/L57\b|L125 .*focus|L481\b/i.test(fx('Delivery Gate').blockers_text), 'the run did not block on these lines for this');
});

test('focus: the same assignment in other words blocks, hedged or not', async () => {
  for (const s of [
    'The competitors reviewed focus on execution once the decision has been made.',
    'These providers appear to serve customers who have already decided to move.',
    'Relocation services are designed for people after the decision to move [S1] [S4].',
    'Expat US [S1] and RELONXT [S4] work with families after a relocation decision is made.',
  ]) assert.ok((await onLast(s)).includes(FOCUS), s);
});

test('focus: what the pages list, and a statement that the stage is not established, pass', async () => {
  for (const s of [
    'The pages reviewed list home search, school search, visa guidance and utility setup [S1] [S4].',
    'Whether any provider works only after a decision is made is not established by these pages.',
    'It is a hypothesis that these providers serve people who have already decided to move.',
    'Your session is designed for people before a decision is made.',
    'A customer who has already decided to move may still want a second opinion.',
  ]) assert.deepEqual(only(await onLast(s), /PROVIDER FOCUS/), [], s);
});

test('survey: the ledger gives the question, the population and the sample, and lines 47 and 493 drop them', async () => {
  assert.equal(LEDGER.find((c) => c.claim_id === 'E43').claim, 'Nearly two-thirds of 600 surveyed travelers said administrative tasks like paperwork and visas take up more time than they expected');
  assert.match(lineOf(47), /One survey finding confirms that logistical friction is a real experience for travelers, but it does not establish/);
  assert.match(lineOf(493), /One survey finding confirms logistical friction is a real experience for travelers \[S28\]\./);
  const out = await check();
  assert.deepEqual(out.det_issues.filter((i) => /SURVEY FINDING/.test(i.type)).map((i) => i.line + ' ' + i.severity), ['47 BLOCKING', '493 BLOCKING']);
});

test('survey: the finding stated with its sample passes, and so do a denial and a description of the entry', async () => {
  // Line 479 of the held plan states it correctly.
  assert.match(lineOf(479), /nearly two-thirds of 600 surveyed travelers said administrative tasks like paperwork and visas take more time than they expected \[S28\]/);
  assert.deepEqual(only(at(await check(), 479), /SURVEY FINDING/), []);
  for (const s of [
    'One survey shows that nearly two-thirds of 600 surveyed travelers said administrative tasks take more time than they expected [S28].',
    'The survey does not confirm that the problem is real for your customer.',
    'It shows that a survey of travelers was conducted, and nothing about how many such people exist.',
  ]) assert.deepEqual(only(await onLast(s), /SURVEY FINDING/), [], s);
  for (const s of [
    'The survey proves that travelers struggle with paperwork [S28].',
    'A study confirms the problem is real for people in this age group.',
    'The Holafly index demonstrates that administrative friction is widespread.',
  ]) assert.ok((await onLast(s)).includes(SURVEY), s);
});

test('superlative: line 123 calls the status quo the most common substitute with no source, and blocks', async () => {
  assert.match(lineOf(123), /^\| Doing nothing \| .* \| The status quo is the most common substitute for any life-change service; .* \| No source \|$/);
  const hit = (await check()).det_issues.filter((i) => /SUPERLATIVE/.test(i.type));
  assert.deepEqual(hit.map((i) => i.line + ' ' + i.severity), ['123 BLOCKING']);
  assert.equal(hit[0].quote, 'The status quo is the most common substitute for any life-change service');
});

test('superlative: the rule covers substitutes, channels, barriers and reasons, not only companies', async () => {
  for (const s of [
    'Doing nothing is the most common alternative for people at this stage.',
    'Facebook groups are the most popular channel for this audience.',
    'Fear of losing income is the biggest barrier for adults in this age group.',
    'Travel blogs are the most widely used resource among people planning a move [S28].',
  ]) assert.ok((await onLast(s)).includes(SUPER), s);
});

test('superlative: a plain statement, a denial, the model\'s own figures and the founder\'s own data pass', async () => {
  for (const s of [
    'Doing nothing is one substitute; how common it is compared with the others is not established.',
    'Whether doing nothing is the most common alternative is unknown.',
    'Software is the largest cost line in the model.',
    'Done when: you have a revised offer description that addresses the most common objection you heard.',
    'What was the most common objection?',
  ]) assert.deepEqual(only(await onLast(s), /SUPERLATIVE/), [], s);
  // A company ranking is still reported by its own check, once.
  const ranked = await onLast('Expat US is the most popular provider reviewed [S1].');
  assert.deepEqual(only(ranked, /SUPERLATIVE/), []);
  assert.ok(ranked.includes('BLOCKING COMPETITOR RANKED WITHOUT EVIDENCE'));
});

test('instructions: the writer, the reviewer and the reviser are each told the four rules', () => {
  const writer = src('founder-context.js') + src('build-growth-payload.js');
  const reviewer = src('citation-check.js');
  const reviser = src('plan-revision-request.js');
  for (const [name, text] of [['writer', writer], ['reviewer', reviewer], ['reviser', reviser]]) {
    assert.match(text, /a price, a fee, or a charge/, name + ': payment');
    assert.match(text, /after a (?:relocation )?decision is made/, name + ': stage');
    assert.match(text, /what (?:the survey|was) asked, of whom, and how many/, name + ': survey');
    assert.match(text, /the most common substitute/i, name + ': superlative');
  }
  assert.match(reviewer, /CLASSIFY BY SUBSTANCE\. A statement of fact about competitors, customers, or the market that no cited ledger entry states is an unsupported claim and is BLOCKING/);
  assert.match(reviser, /A table row is replaced by one table row\./);
  assert.match(reviser, /"section_note" is only for a note that sources are undated, and only when the unit is a table row\./);
});

// ---------------- 5. The held plan, rechecked ----------------

test('63226 recheck: the saved plan, read only, against the corrected checks', async () => {
  const before = HELD_PLAN;
  const out = await check();
  const blocking = out.det_issues.filter((i) => i.severity === 'BLOCKING').map((i) => 'L' + i.line + ' ' + i.type);
  assert.deepEqual(blocking.sort(), [
    'L123 SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE',
    'L125 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
    'L47 SURVEY FINDING GENERALISED',
    'L481 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
    'L493 SURVEY FINDING GENERALISED',
    'L57 PAYMENT STATED WITHOUT EVIDENCE',
    'L57 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
    'L64 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
    'L76 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
    'L89 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
  ].concat(['L121 DATE NOT IN THE SOURCE RECORD']).concat([
    // Found by the rules added after the paid replay, execution 63237.
    'L77 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
    'L100 PROVIDER CHARACTERISATION NEEDS VERIFICATION',
    'L101 PROVIDER CHARACTERISATION NEEDS VERIFICATION',
    'L125 SUBSTITUTE LIMITATION STATED WITHOUT EVIDENCE',
    'L127 PAYMENT STATED WITHOUT EVIDENCE',
    'L27 UNKNOWN STATED AS NONE',
    'L47 PROBLEM STATED AS CONFIRMED',
    'L493 PROBLEM STATED AS CONFIRMED',
  ]).sort());
  // L121 gives W5 the date March 2016. The saved record of the run has no date for W5; the rebuilt record has it.
  assert.ok(!(await check(HELD_PLAN, { ev: await rebuiltEvidence() })).det_issues.some((i) => i.line === 121 && /DATE NOT IN|DATE NOTE IS/.test(i.type)));
  // The two blockers the run raised in error are gone, and nothing is reported at their lines for those checks.
  assert.ok(!out.det_issues.some((i) => i.line === 71 && /ONE SOURCE/.test(i.type)));
  assert.ok(!out.det_issues.some((i) => i.line === 125 && /COMPETITIVE GAP/.test(i.type)));
  // The ordinary findings are unchanged: undated notes missing in Sections 4 and 5.
  assert.deepEqual(out.det_issues.filter((i) => /UNDATED SOURCES WITHOUT/.test(i.type)).map((i) => i.severity + ' L' + i.line), ['MAJOR L71', 'MAJOR L139']);
  assert.equal(HELD_PLAN, before);
  assert.equal(readFileSync(path.join(DIR, 'final-plan.md'), 'utf8'), before);
});

test('63226 recheck: the reviewer\'s gap finding at L139 is still a confirmed blocker of the held version', () => {
  assert.match(lineOf(139), /Among the competitors reviewed, none was identified that explicitly positions around the pre-decision, barrier-identification phase .* \[S1\] \[S4\] \[S10\] \[S15\]/);
  const g = fx('Delivery Gate');
  assert.equal(g.blocked, true);
  assert.match(g.blockers_text, /QA-003 \|.*\| L139/);
  assert.equal(fx('Insert Plan Version').status, 'changes_requested');
});

test('63226 recheck: the baseline is the $500 scenario, unchanged', () => {
  assert.equal(FIN.price_record.amount, 500);
  assert.match(FIN.price_record.label, /untested scenario assumption/);
  assert.match(src('test-financial-baseline.js'), /500/);
});

test('date notes: a note that names its sources is not a claim about every source of the section', async () => {
  // The reviser's note for Section 5 names S1, S4, S10 and S15. Section 5 also cites S28, whose page shows a date.
  const rev = await apply();
  const out = await check(rev.text, { rev });
  assert.deepEqual(out.det_issues.filter((i) => /SOURCE DATE NOTE IS WRONG|UNDATED SOURCES WITHOUT/.test(i.type)), []);
  // A general note in the same place is wrong, because S28 is dated.
  const general = await apply({ U8: (e) => ({ new_text: rowOnly(e), section_note: 'Note: all sources cited in this section are undated.' }) });
  const wrong = (await check(general.text, { rev: general })).det_issues.filter((i) => /SOURCE DATE NOTE IS WRONG/.test(i.type));
  assert.equal(wrong.length, 1);
  assert.match(wrong[0].detail, /S28/);
});

test('63226 replay: with the corrected Apply Revisions, the L139 gap claim and both missing date notes are resolved', async () => {
  const rev = await apply();
  const out = await check(rev.text, { rev });
  assert.ok(!out.det_issues.some((i) => /COMPETITIVE GAP|UNDATED SOURCES WITHOUT|ONE SOURCE CITED|SOURCE DATE NOTE/.test(i.type)));
  // What the reviser was never asked to fix in the run is still there, and is now reported.
  assert.deepEqual([...new Set(out.det_issues.filter((i) => i.severity === 'BLOCKING').map((i) => i.type))].sort(), ['CHARACTERISATION NOT FOUND IN THE CITED ENTRIES', 'DATE NOT IN THE SOURCE RECORD', 'PAYMENT STATED WITHOUT EVIDENCE', 'PROBLEM STATED AS CONFIRMED', 'PROVIDER CHARACTERISATION NEEDS VERIFICATION', 'PROVIDER FOCUS STATED WITHOUT EVIDENCE', 'SUBSTITUTE LIMITATION STATED WITHOUT EVIDENCE', 'SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE', 'SURVEY FINDING GENERALISED', 'UNKNOWN STATED AS NONE']);
});

// ---------------- 6. Rankings of companies ----------------

const RANK = 'BLOCKING COMPETITOR RANKED WITHOUT EVIDENCE';
const HYPO = 'BLOCKING HYPOTHETICAL RANKING PRESENTED AS ESTABLISHED';

test('ranking: an unsupported ranking of companies blocks, like an unsupported superlative', async () => {
  for (const s of [
    'Expat US is the most comprehensive provider reviewed [S1].',
    'Expat US is the most established competitor, and no other comes close.',
    'Fragomen is the leading provider in this space [S15].',
    'Expat US is more comprehensive than RELONXT [S1] [S4].',
  ]) assert.ok((await onLast(s)).includes(RANK), s);
});

test('ranking: a supported comparison and a clearly labelled hypothesis pass', async () => {
  for (const s of [
    'By the number of services each page lists, Expat US is more comprehensive than RELONXT [S1] [S4].',
    'Expat US\'s page lists more services than RELONXT\'s [S1] [S4].',
    'It is a hypothesis that Expat US is the most comprehensive provider among those reviewed.',
    'Whether Expat US is the most established competitor is not established by these pages.',
  ]) assert.deepEqual(only(await onLast(s), /RANKED|HYPOTHETICAL/), [], s);
});

test('ranking: a ranking offered as a hypothesis may not be relied on as a fact elsewhere', async () => {
  const twoLines = async (a, b) => { const text = HELD_PLAN.replace(/\n+$/, '') + '\n\n' + a + '\n\n' + b + '\n'; const n = text.replace(/\n+$/, '').split('\n').length; const out = await check(text); return { first: at(out, n - 2), second: at(out, n), issue: out.det_issues.find((i) => i.line === n && /HYPOTHETICAL/.test(i.type)) }; };
  const hyp = 'It is a hypothesis that Expat US is the most comprehensive provider among those reviewed.';
  for (const s of [
    'Expat US\'s breadth advantage means a new entrant cannot compete on scope.',
    'Because Expat US leads on scope, QYLAT should position on planning.',
    'Expat US sets the standard for relocation support.',
  ]) {
    const r = await twoLines(hyp, s);
    assert.deepEqual(only(r.first, /RANKED|HYPOTHETICAL/), [], 'the hypothesis itself passes');
    assert.ok(r.second.includes(HYPO), s);
    assert.match(r.issue.detail, /ranks Expat US as a hypothesis\. This text treats that standing as a fact/);
  }
  // The same sentences with no hypothesis anywhere are not reported by this check, and a sentence that repeats the label passes.
  assert.deepEqual(only(await onLast('Expat US sets the standard for relocation support.'), /HYPOTHETICAL/), []);
  assert.deepEqual(only((await twoLines(hyp, 'If the hypothesis holds, Expat US\'s breadth advantage would matter; it is untested.')).second, /HYPOTHETICAL/), []);
  // A plain description of that company elsewhere is not a ranking.
  assert.deepEqual(only((await twoLines(hyp, 'Expat US lists home search, school search and visa guidance [S1].')).second, /HYPOTHETICAL|RANKED/), []);
  // Stating the ranking again without the label is the unsupported ranking itself.
  assert.ok((await twoLines(hyp, 'Expat US is the most comprehensive provider reviewed.')).second.includes(RANK));
});

// ---------------- 7. What the final review of the replay missed ----------------

test('replay misses: the verifier of the replay was never shown the line nobody edited', () => {
  const sent = readFileSync(path.join(REPLAY, 'verifier-user.txt'), 'utf8');
  assert.ok(!sent.includes('hard to replicate'), 'L78 was not in the verifier request');
  assert.ok(!/REVISED PLAN/.test(sent), 'the revised plan was not in the verifier request');
  // It was shown the two edited passages it passed.
  assert.ok(sent.includes('No page reviewed explicitly positions around the pre-decision phase'));
  assert.ok(sent.includes('list services oriented toward logistics and compliance'));
  const said = replayJson('verifier-output.json');
  assert.ok(said.edit_checks.filter((e) => ['U14', 'U15', 'U26'].includes(e.unit)).every((e) => e.verdict === 'NO_NEW_DEFECT'));
});

test('replay misses: the four defects are now reported by code on the replayed plan', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  assert.equal(rev.applied_count, 28);
  const out = await check(rev.text, { rev, ev });
  assert.deepEqual(out.det_issues.filter((i) => i.severity === 'BLOCKING' && i.line).map((i) => 'L' + i.line + ' ' + i.type).sort(), [
    'L102 PROVIDER CHARACTERISATION NEEDS VERIFICATION',
    'L103 PROVIDER CHARACTERISATION NEEDS VERIFICATION',
    'L127 COMPETITIVE GAP STATED AS A FINDING',
    'L129 PAYMENT STATED WITHOUT EVIDENCE',
    'L143 CHARACTERISATION NOT FOUND IN THE CITED ENTRIES',
    'L27 UNKNOWN STATED AS NONE',
    'L485 COMPETITIVE GAP STATED AS A FINDING',
    'L68 SOURCE DATE NOTE IS WRONG',
    'L78 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
    'L79 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
  ]);
  assert.match(out.det_issues.find((i) => i.line === 143).detail, /"oriented toward logistics and compliance", and the verified entries of S1, S4, S10, S15 do not say that/);
  assert.match(out.det_issues.find((i) => i.line === 68).detail, /W5 is called undated, but its page shows "31\/03\/2016"/);
  // Three are confirmed by code. The characterisation at L143 is a comparison of words, which code cannot decide.
  assert.deepEqual(out.det_issues.filter((i) => i.needs_judgment).map((i) => i.line).sort((a, b) => a - b), [102, 103, 143]);
});

test('absence: "no page reviewed positions around X" is a finding unless that sentence labels it', async () => {
  for (const s of [
    'No page reviewed explicitly positions around the pre-decision phase.',
    'None of these pages states whether the provider works with people before they have decided to relocate, and no page reviewed explicitly positions around the pre-decision phase.',
    'No provider reviewed for this plan offers pre-decision planning. That absence does not establish that no such provider exists.',
  ]) assert.ok((await onLast(s)).includes('BLOCKING COMPETITIVE GAP STATED AS A FINDING'), s);
  for (const s of [
    'Whether any page reviewed positions around the pre-decision phase is not established.',
    'It is a hypothesis that no provider reviewed offers pre-decision planning.',
    'If no page reviewed positions around the pre-decision phase, that could be an opening to test.',
  ]) assert.deepEqual(only(await onLast(s), /COMPETITIVE GAP/), [], s);
});

test('stage: a stage attributed to a named company blocks wherever the name stands', async () => {
  for (const s of [
    "A customer who has already decided to relocate to the US would find Expat US's depth of operational support hard to replicate independently.",
    'For people who have already committed to a move, RELONXT is the natural choice.',
  ]) assert.ok((await onLast(s)).includes(FOCUS), s);
  for (const s of [
    'A customer who has already decided to move may still want a second opinion.',
    'Whether Expat US works only with people who have already decided to relocate is not established by its pages.',
  ]) assert.deepEqual(only(await onLast(s), /PROVIDER FOCUS/), [], s);
});

const CHAR = 'BLOCKING CHARACTERISATION NOT FOUND IN THE CITED ENTRIES';
const ITEM = 'BLOCKING LISTED ITEM NOT FOUND IN THE CITED ENTRIES';

test('characterisation: when the words are in the entries of every page cited, code passes it', async () => {
  // Fragomen's verified entry speaks of compliance in its own words.
  assert.match(LEDGER.find((c) => c.claim_id === 'E17').claim, /remain in compliance/);
  assert.deepEqual(only(await onLast("Fragomen's Digital Nomad Services are focused on compliance [S15]."), /CHARACTERISATION|PROVIDER FOCUS/), []);
  assert.deepEqual(only(await onLast('The pages reviewed list home search, school search and utility setup [S1] [S4].'), /CHARACTERISATION|LISTED ITEM/), []);
});

test('characterisation: different words are a question for the final review, never a confirmed defect', async () => {
  // A fair paraphrase and an expansion look the same to code: the words are not in the entry. Both are unresolved.
  assert.match(LEDGER.find((c) => c.claim_id === 'E2').claim, /home search, lease signing, school search and enrollment/);
  const paraphrase = "Expat US's services are focused on finding accommodation and enrolling children [S1].";
  const expansion = 'Expat US is focused on luxury relocations for senior executives [S1].';
  for (const s of [paraphrase, expansion, 'The pages reviewed for Expat US [S1] and RELONXT [S4] list services oriented toward logistics and compliance.']) {
    const text = HELD_PLAN.replace(/\n+$/, '') + '\n\n' + s + '\n';
    const issue = (await check(text)).det_issues.find((i) => i.line === text.replace(/\n+$/, '').split('\n').length && /CHARACTERISATION/.test(i.type));
    assert.equal(issue.severity + ' ' + issue.type, CHAR, s);
    assert.equal(issue.needs_judgment, true);
    assert.match(issue.detail, /That is not proof of a defect: the entries may say the same thing differently\. Code cannot judge meaning/);
  }
});

test('dates: a date given for a source has to be the date in its record', async () => {
  const DATE = 'BLOCKING DATE NOT IN THE SOURCE RECORD';
  const rebuiltEv = await rebuiltEvidence();
  const s = 'The BecomeNomad page [W5] carries a date of 31/03/2016, so the tools listed may no longer be current.';
  assert.ok((await onLast(s)).includes(DATE), 'the saved record has no date for W5');
  assert.deepEqual(only(await onLast(s, { ev: rebuiltEv }), /DATE NOT IN|DATE NOTE IS/), [], 'the rebuilt record has it');
  assert.deepEqual(only(await onLast('The BecomeNomad page [W5] is dated March 2016.', { ev: rebuiltEv }), /DATE NOT IN|DATE NOTE IS/), []);
  assert.ok((await onLast('The BecomeNomad page [W5] carries a date of 12/05/2019.', { ev: rebuiltEv })).some((x) => /DATE NOT IN|DATE NOTE IS/.test(x)));
  assert.ok((await onLast("Expat US's page [S1] was published on 14/02/2024.", { ev: rebuiltEv })).some((x) => /DATE NOT IN|DATE NOTE IS/.test(x)));
  // The date a page was retrieved is not a date of the source.
  assert.deepEqual(only(await onLast('As of the date retrieved (October 2026), Expat US lists home search on its page [S1].', { ev: rebuiltEv }), /DATE NOT IN|DATE NOTE IS/), []);
});

// ---------------- 8. The E44 dependency ----------------

test('E44: the replayed plan depends on it at one line, and is held for that', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const lines = rev.text.split('\n');
  assert.match(lines[73], /^\| Offer \| End-to-end relocation support including .* school search, visa guidance, utility setup, .* \[S1\] \[S3\] \[S6\] \|$/);
  // No verified claim about Expat US mentions guidance. Only the excluded E24 and the unverified E44 do.
  const ledger = JSON.parse(ev.research_ledger);
  assert.ok(!ledger.some((c) => c.claim_id === 'E24' || c.claim_id === 'E44'));
  assert.ok(!ledger.filter((c) => c.entity === 'Expat US').some((c) => /guidance/i.test(c.claim + ' ' + c.page_excerpt)));
  assert.ok(!/\bS7\b/.test(rev.text), 'S7 is no longer cited anywhere');
  const hold = (await check(rev.text, { rev, ev })).det_issues.find((i) => /^SOURCE VERIFICATION INCOMPLETE$/.test(i.type));
  assert.equal(hold.severity, 'BLOCKING');
  assert.match(hold.detail, /covering claim E44\..* E44: L74 says something about Expat US that no verified claim about it states and this unverified claim does \([a-z, ]*guidanc[a-z, ]*\)\./);
  assert.ok(!/the plan names Expat US/.test(hold.detail), 'naming a company that has other verified claims is not the reason');
});

test('E44: with that detail removed, the unverified proposal is unused and the plan is not held for it', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const text = rev.text.replace('school search, visa guidance, utility setup', 'school search, utility setup');
  assert.notEqual(text, rev.text);
  const out = await check(text, { rev: { ...rev, text }, ev });
  assert.ok(!out.det_issues.some((i) => i.type === 'SOURCE VERIFICATION INCOMPLETE'));
  const warn = out.det_issues.find((i) => i.type === 'SOURCE VERIFICATION INCOMPLETE FOR UNUSED CLAIMS');
  assert.equal(warn.severity, 'MAJOR');
  assert.match(warn.detail, /Nothing in the plan rests on them/);
  // E44 itself stays out of the ledger until it is checked.
  assert.ok(!JSON.parse(ev.research_ledger).some((c) => c.claim_id === 'E44'));
});

test('E44: citing S7, or naming a company with no other verified claim, is still a dependency', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const clean = rev.text.replace('school search, visa guidance, utility setup', 'school search, utility setup');
  const cited = clean + '\n\nExpat US describes relocation support [S7].\n';
  const a = (await check(cited, { rev: { ...rev, text: cited }, ev })).det_issues.find((i) => i.type === 'SOURCE VERIFICATION INCOMPLETE');
  assert.equal(a.severity, 'BLOCKING');
  assert.match(a.detail, /the plan cites S7, and no verified claim exists on that page/);
  // With every verified claim about Expat US taken away, naming it is enough: anything said about it may rest on E44.
  const bare = { ...ev, research_ledger: JSON.stringify(JSON.parse(ev.research_ledger).filter((c) => c.entity !== 'Expat US')) };
  const b = (await check(clean, { rev: { ...rev, text: clean }, ev: bare })).det_issues.find((i) => i.type === 'SOURCE VERIFICATION INCOMPLETE');
  assert.equal(b.severity, 'BLOCKING');
  assert.match(b.detail, /E44: the plan names Expat US, and no verified claim about it exists/);
});

// ---------------- 9. The final review covers the whole revised plan ----------------

const LABELS = /hypothes|whether|\bmay\b|\bmight\b|\bcould\b|\bif\b|assum|untested|unvalidated|not (?:yet )?(?:been )?(?:established|known|verified|confirmed|shown|stated)|our read|IdeaToPlan/i;
const scriptedReview = (cc, ev, rev, over = {}) => {
  const ledger = JSON.parse(ev.research_ledger);
  const text = rev.text.split('\n');
  return cc.review_lines.filter((r) => r.kind !== 'source_row' && r.kind !== 'date_note').map((r) => {
    if (over[r.line]) return { line: r.line, ...over[r.line] };
    const cited = [...new Set(text[r.line - 1].match(/\b[SW]\d+\b/g) || [])];
    if (cited.length) return { line: r.line, verdict: 'SUPPORTED', claim_ids: ledger.filter((c) => cited.some((id) => c.source_ids.includes(id))).map((c) => c.claim_id), quote: '', problem: '' };
    return { line: r.line, verdict: /hypothes|whether|\bmay\b|\bmight\b|\bcould\b|\bif\b|assum|untested/i.test(text[r.line - 1]) ? 'LABELLED' : 'NO_EXTERNAL_CLAIM', claim_ids: [], quote: '', problem: '' };
  });
};

const needVerdict = (cc) => cc.review_lines.filter((r) => r.kind !== 'source_row' && r.kind !== 'date_note');

test('whole plan: the final review is owed a verdict for edited and untouched lines alike', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const cc = await check(rev.text, { rev, ev });
  const text = rev.text.split('\n');
  assert.equal(cc.review_lines.length, cc.review_coverage.listed);
  assert.equal(needVerdict(cc).length, cc.review_coverage.needing_a_verdict);
  assert.ok(cc.review_lines.filter((r) => r.edited).length >= 30);
  // The untouched line the replay missed is on the list, with its company and that company's entries beside it.
  assert.deepEqual(cc.review_lines.find((r) => r.line === 78), { line: 78, edited: '', kind: 'profile_row', company: 'Expat US', entries: ['E1', 'E2', 'E3', 'E4', 'E5'] });
  text.forEach((l, i) => { if (/\[[SW]\d+\]/.test(l) || /Expat US|RELONXT|Fragomen|WhereNext|Relocate Now/.test(l)) assert.ok(cc.review_lines.some((r) => r.line === i + 1), 'L' + (i + 1)); });
  assert.ok(cc.review_lines.every((r) => !text[r.line - 1].trim().startsWith('#')));
  const p = JSON.parse(cc.qa_payload);
  assert.equal(p.model, 'anthropic/claude-sonnet-4.6');
  assert.equal(p.temperature, 0);
  assert.match(p.messages[0].content, /4\. WHOLE-PLAN REVIEW\. The edits are not the whole plan\./);
  assert.match(p.messages[0].content, /A statement that something is absent \("no page reviewed positions around X"\) is a statement of fact\./);
  const user = p.messages[1].content;
  assert.ok(user.includes('LINES TO REVIEW (' + needVerdict(cc).length + ' lines need a verdict; what each one is about is in brackets)'));
  assert.ok(user.includes('L78 [profile of Expat US; its ledger entries: E1, E2, E3, E4, E5]'));
  assert.ok(user.slice(user.indexOf('REVISED PLAN (complete')).includes('[L78] | Why a customer might choose them | A customer who has already decided to relocate'));
});

test('whole plan: an answer without the review holds the plan as an incomplete required check', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const { cc, out } = await secondPass(rev, replayVerifier(), { review: true, ev });
  const n = needVerdict(cc).length;
  assert.deepEqual([out.plan_review.required, out.plan_review.unresolved.length], [n, n]);
  const f = out.findings.find((x) => x.id === 'FR-OPEN');
  assert.deepEqual([f.severity, f.unresolved, f.check], ['BLOCKING', true, 'FINAL REVIEW OF THE REVISED PLAN IS INCOMPLETE']);
  assert.match(f.problem, new RegExp(n + ' of the ' + n + ' lines .* have no usable verdict from the final review: L\\d+ \\(no verdict was given\\)'));
  const g = await gateOf(out);
  assert.equal(g.blocked, true);
  assert.ok(g.unresolved_check_count >= 1);
  assert.match(g.unresolved_checks_text, /FR-OPEN \| FINAL REVIEW OF THE REVISED PLAN IS INCOMPLETE/);
});

test('whole plan: an unsupported verdict on an untouched line is a confirmed blocker at that line', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const cc = await check(rev.text, { rev, ev });
  const review = scriptedReview(cc, ev, rev, { 78: { verdict: 'UNSUPPORTED', claim_ids: [], quote: 'hard to replicate independently', problem: 'No ledger entry says which customers Expat US serves best or that its support is hard to replicate.' } });
  const { out } = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: review })), { review: true, ev });
  assert.deepEqual(out.plan_review.unresolved, []);
  assert.deepEqual(out.plan_review.unsupported.map((u) => u.line), [78]);
  assert.equal(out.plan_review.supported + out.plan_review.from_intake + out.plan_review.labelled + out.plan_review.no_external_claim + out.plan_review.contradicted.length, needVerdict(cc).length - 1);
  const f = out.findings.find((x) => x.id === 'FR-001');
  assert.deepEqual([f.severity, f.unresolved, f.check, f.line], ['BLOCKING', undefined, 'UNSUPPORTED CLAIM IN THE REVISED PLAN', 78]);
  assert.match(f.problem, /^This line was not edited, and no earlier finding covered it\. No ledger entry says/);
  assert.ok(!out.findings.some((x) => x.id === 'FR-OPEN'));
});

test('whole plan: a verdict code cannot use leaves the line unreviewed, which is not a finding', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const cc = await check(rev.text, { rev, ev });
  const text = rev.text.split('\n');
  const citedLine = needVerdict(cc).find((r) => /\[S15\]/.test(text[r.line - 1]) && !/\[S1\]/.test(text[r.line - 1])).line;
  const manyCited = needVerdict(cc).find((r) => /\[S1\] \[S3\] \[S6\]/.test(text[r.line - 1])).line;
  const plainLine = needVerdict(cc).find((r) => !/\b[SW]\d+\b/.test(text[r.line - 1]) && !LABELS.test(text[r.line - 1])).line;
  const cases = [
    [citedLine, { verdict: 'SUPPORTED', claim_ids: [] }, /SUPPORTED and names no ledger entry/],
    [citedLine, { verdict: 'SUPPORTED', claim_ids: ['E99'] }, /names E99, which is not in the ledger/],
    // Some of the cited sources are covered by the entries named and some are not: the reviewer may have left one out.
    [manyCited, { verdict: 'SUPPORTED', claim_ids: ['E1'] }, /the line cites S3, S6, and no entry named for it comes from that source/],
    [citedLine, { verdict: 'NO_EXTERNAL_CLAIM' }, /NO_EXTERNAL_CLAIM and the line cites/],
    [plainLine, { verdict: 'FROM_INTAKE', quote: '' }, /FROM_INTAKE and quotes nothing from the founder context/],
    [plainLine, { verdict: 'FROM_INTAKE', quote: 'the founder has run this business for nine years' }, /FROM_INTAKE and the words it quotes are not in the founder context/],
    [plainLine, { verdict: 'FINE' }, /the verdict is not SUPPORTED, FROM_INTAKE, LABELLED, UNSUPPORTED, or NO_EXTERNAL_CLAIM/],
  ];
  for (const [line, entry, why] of cases) {
    const { out } = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: scriptedReview(cc, ev, rev, { [line]: entry }) })), { review: true, ev });
    assert.deepEqual(out.plan_review.unresolved.map((u) => u.line), [line], String(why));
    assert.match(out.plan_review.unresolved[0].why, why);
    assert.deepEqual(out.plan_review.contradicted, []);
    const open = out.findings.find((x) => x.id === 'FR-OPEN');
    assert.equal(open.unresolved, true);
    assert.ok(!out.findings.some((x) => /^F[RC]-\d/.test(x.id)), 'no finding is raised for a line that was not reviewed');
  }
  // Two verdicts for one line, and a line left out, are unreviewed too.
  const full = scriptedReview(cc, ev, rev);
  const twice = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: full.concat([full[0]]) })), { review: true, ev });
  assert.match(twice.out.plan_review.unresolved[0].why, /more than one verdict/);
  const short = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: full.slice(1) })), { review: true, ev });
  assert.deepEqual(short.out.plan_review.unresolved.map((u) => u.line + ' ' + u.why), [full[0].line + ' no verdict was given']);
});

test('whole plan: a verdict that shows the defect by its own account is a confirmed finding, not an incomplete check', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const cc = await check(rev.text, { rev, ev });
  const text = rev.text.split('\n');
  const citedLine = needVerdict(cc).find((r) => /\[S15\]/.test(text[r.line - 1]) && !/\[S1\]/.test(text[r.line - 1])).line;
  const plainLine = needVerdict(cc).find((r) => !/\b[SW]\d+\b/.test(text[r.line - 1]) && !LABELS.test(text[r.line - 1])).line;
  // The reviewer names its support, and none of it is on any page the line cites.
  const a = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: scriptedReview(cc, ev, rev, { [citedLine]: { verdict: 'SUPPORTED', claim_ids: ['E1'] } }) })), { review: true, ev });
  assert.deepEqual(a.out.plan_review.contradicted.map((u) => u.line + ' ' + u.kind), [citedLine + ' cited source does not carry the support']);
  assert.deepEqual(a.out.plan_review.unresolved, []);
  const fa = a.out.findings.find((x) => x.id === 'FC-001');
  assert.deepEqual([fa.severity, fa.unresolved, fa.check, fa.line], ['BLOCKING', undefined, 'CITED SOURCE DOES NOT CARRY THE STATEMENT', citedLine]);
  assert.match(fa.problem, /named E1 as the support for this line\. That entry was verified on S1\. The line cites S15, and none of the entries named comes from there/);
  // The reviewer says the line is excused by a label, and the line has none.
  const b = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: scriptedReview(cc, ev, rev, { [plainLine]: { verdict: 'LABELLED' } }) })), { review: true, ev });
  assert.deepEqual(b.out.plan_review.contradicted.map((u) => u.line + ' ' + u.kind), [plainLine + ' called labelled, and the line has no label']);
  const fb = b.out.findings.find((x) => x.id === 'FC-001');
  assert.deepEqual([fb.severity, fb.unresolved, fb.check], ['BLOCKING', undefined, 'UNSUPPORTED AND NOT LABELLED']);
  assert.ok(!b.out.findings.some((x) => x.id === 'FR-OPEN'));
  const g = await gateOf(b.out);
  assert.match(g.blockers_text, /FC-001 \| UNSUPPORTED AND NOT LABELLED/);
  assert.ok(!/FC-001/.test(g.unresolved_checks_text));
});

test('whole plan: what the intake states is accepted only with its words, and lines with nothing to judge may be given as numbers', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const cc = await check(rev.text, { rev, ev });
  const text = rev.text.split('\n');
  const founderLine = needVerdict(cc).find((r) => r.kind === 'founder' && /firsthand experience living abroad/.test(text[r.line - 1])).line;
  assert.match(FOUNDER.founder_context, /firsthand experiences living abroad/);
  const full = scriptedReview(cc, ev, rev, { [founderLine]: { verdict: 'FROM_INTAKE', quote: 'firsthand experiences living abroad' } });
  // The same answer with every NO_EXTERNAL_CLAIM entry given as a bare line number.
  const compact = { plan_review: full.filter((e) => e.verdict !== 'NO_EXTERNAL_CLAIM'), no_external_claim: full.filter((e) => e.verdict === 'NO_EXTERNAL_CLAIM').map((e) => e.line) };
  const one = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: full })), { review: true, ev });
  const two = await secondPass(rev, replayVerifier((o) => ({ ...o, ...compact })), { review: true, ev });
  for (const { out } of [one, two]) {
    assert.equal(out.plan_review.from_intake, 1);
    assert.deepEqual(out.plan_review.unresolved, []);
  }
  assert.equal(two.out.plan_review.no_external_claim, one.out.plan_review.no_external_claim);
  assert.ok(compact.no_external_claim.length > 10);
});

test('whole plan: source-only rows and date notes are decided by code and need no verdict', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const cc = await check(rev.text, { rev, ev });
  const text = rev.text.split('\n');
  const rows = cc.review_lines.filter((r) => r.kind === 'source_row');
  assert.ok(rows.length >= 4);
  rows.forEach((r) => assert.match(text[r.line - 1], /^\| Source \| (?:\[[SW]\d+\]\s*)+\|$/));
  const notes = cc.review_lines.filter((r) => r.kind === 'date_note');
  assert.deepEqual(notes.map((r) => r.line + ' ' + r.date_note_ok), ['68 false', '137 true']);
  // L68 calls W5 undated against a record that dates it: the note is judged on the record, and fails.
  assert.ok(cc.det_issues.some((i) => i.line === 68 && i.type === 'SOURCE DATE NOTE IS WRONG'));
  const { out } = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: scriptedReview(cc, ev, rev) })), { review: true, ev });
  assert.deepEqual(out.plan_review.unresolved, []);
  assert.equal(out.plan_review.source_rows, rows.length);
  assert.deepEqual(out.plan_review.date_notes_checked_by_code, [{ line: 68, ok: false }, { line: 137, ok: true }]);
  // A "no external claim" verdict for a source-only row is not an error, and neither is its absence.
  const withRow = scriptedReview(cc, ev, rev).concat([{ line: rows[0].line, verdict: 'NO_EXTERNAL_CLAIM' }]);
  assert.deepEqual((await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: withRow })), { review: true, ev })).out.plan_review.unresolved, []);
});

test('whole plan: a complete review with no unsupported line adds no finding and does not overrule code', async () => {
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const cc = await check(rev.text, { rev, ev });
  const { out } = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: scriptedReview(cc, ev, rev) })), { review: true, ev });
  assert.ok(!out.findings.some((x) => /^F[RC]-/.test(x.id)));
  assert.deepEqual([out.plan_review.unsupported.length, out.plan_review.contradicted.length, out.plan_review.unresolved.length], [0, 0, 0]);
  // The code findings on the same plan still hold it: the ones code confirms by itself.
  assert.deepEqual(out.findings.filter((f) => f.severity === 'BLOCKING' && !f.unresolved).map((f) => f.line).sort((a, b) => a - b), [27, 68, 78, 79, 127, 129, 485]);
  // The comparison at L143 was a question, and the review answered it.
  assert.ok(out.plan_review.judged.map((j) => j.line + ' ' + j.verdict).includes('143 SUPPORTED'));
});

// ---------------- 10. W5, the date on its page, and line 68 ----------------

test('W5: the date on the page is a posting date, the record now says so, and line 68 contradicts the record', async () => {
  // The page prints the date with its label.
  assert.match(S7_PAGE.length ? JSON.parse(fx('Fetch Source Pages').pages).find((p) => p.source_id === 'W5').text : '', /Post Author[\s\S]{0,8}31\/03\/2016[\s\S]{0,8}Date Posted/);
  const ev = await rebuiltEvidence();
  const w5 = JSON.parse(ev.sources).find((s) => s.id === 'W5');
  assert.deepEqual([w5.published, w5.published_iso, w5.published_kind], ['31/03/2016', '2016-03-31', 'publication']);
  assert.match(w5.published_context, /Post Author[\s\S]{0,8}31\/03\/2016[\s\S]{0,8}Date Posted/);
  // The exact statement of the replayed plan.
  const rev = await replayRev();
  const l68 = rev.text.split('\n')[67];
  assert.equal(l68, 'Note: the pages cited in this section (S1, S3, S4, S6, S10, S13, S15) show no date, so their descriptions may have changed. W5 is also undated in the research record, and its page carries a date of 31/03/2016.');
  // The failing rule: a source is called undated, and its record carries a date.
  const issue = (await check(rev.text, { rev, ev })).det_issues.find((i) => i.line === 68);
  assert.equal(issue.severity + ' ' + issue.type, 'BLOCKING SOURCE DATE NOTE IS WRONG');
  assert.match(issue.detail, /W5 is called undated, but its page shows "31\/03\/2016"/);
  assert.equal(issue.needs_judgment, undefined);
  // The reviser wrote that sentence against the record of the run, in which W5 had no date. Against that record it passes this rule.
  assert.ok(!(await check(rev.text, { rev })).det_issues.some((i) => i.line === 68 && /SOURCE DATE NOTE IS WRONG/.test(i.type)));
  // With the sentence stating what the record states, nothing is reported at line 68.
  const fixed = rev.text.replace('W5 is also undated in the research record, and its page carries a date of 31/03/2016.', 'W5 was posted on 31/03/2016, so what it lists may no longer be current.');
  assert.deepEqual((await check(fixed, { rev: { ...rev, text: fixed }, ev })).det_issues.filter((i) => i.line === 68), []);
});

test('W5: other dates on the same page are not its publication date', async () => {
  const page = JSON.parse(fx('Fetch Source Pages').pages).find((p) => p.source_id === 'W5').text;
  // The page also shows comment dates and a copyright year.
  for (const d of ['01/04/2016', '06/05/2020', 'Copyright © 2023']) assert.ok(page.includes(d), d);
  const ev = await rebuiltEvidence();
  for (const s of ['The BecomeNomad page [W5] was published on 06/05/2020.', 'The BecomeNomad page [W5] was last updated in 2023, dated 01/04/2016.']) assert.ok((await onLast(s, { ev })).some((x) => /DATE NOT IN|DATE NOTE IS/.test(x)), s);
});

test('dates: a date with no label next to it is recorded as shown, and may not be called the publication date', async () => {
  const ev = await rebuiltEvidence();
  const kinds = Object.fromEntries(JSON.parse(ev.sources).filter((s) => s.published_iso).map((s) => [s.id, s.published_kind]));
  assert.equal(kinds.W5, 'publication');
  assert.equal(kinds.S28, 'updated');
  // The same record with the label taken away: the date is on the page, and what it dates is not known.
  const bare = { ...ev, sources: JSON.stringify(JSON.parse(ev.sources).map((s) => (s.id === 'W5' ? { ...s, published_kind: 'kind not established' } : s))) };
  assert.deepEqual(only(await onLast('The BecomeNomad page [W5] carries a date of 31/03/2016.', { ev: bare }), /DATE NOT IN|DATE NOTE IS/), []);
  const issue = await onLast('The BecomeNomad page [W5] was published on 31/03/2016.', { ev: bare });
  assert.ok(issue.includes('BLOCKING DATE NOT IN THE SOURCE RECORD'));
  assert.deepEqual(only(await onLast('The BecomeNomad page [W5] was published on 31/03/2016.', { ev }), /DATE NOT IN|DATE NOTE IS/), []);
});

// ---------------- 11. Comparisons code cannot decide ----------------

const withLastLine = async (line, verdictFor) => {
  const ev = await rebuiltEvidence();
  const base = await replayRev();
  const text = base.text.replace(/\n+$/, '') + '\n\n' + line + '\n';
  const rev = { ...base, text };
  const n = text.replace(/\n+$/, '').split('\n').length;
  const cc = await check(text, { rev, ev });
  const review = verdictFor === undefined ? null : scriptedReview(cc, ev, rev, verdictFor === null ? {} : { [n]: verdictFor }).filter((e) => verdictFor !== null || e.line !== n);
  const { out } = await secondPass(rev, replayVerifier((o) => (review ? { ...o, plan_review: review } : o)), { review: true, ev });
  return { n, cc, out };
};
const PARAPHRASE = "Expat US's services are focused on finding accommodation and enrolling children [S1].";
const EXPANSION = 'Expat US is focused on luxury relocations for senior executives [S1].';

test('judgment: a fair paraphrase is cleared when the final review names the entry that supports it', async () => {
  const { n, cc, out } = await withLastLine(PARAPHRASE, { verdict: 'SUPPORTED', claim_ids: ['E2'], quote: '', problem: '' });
  assert.ok(cc.det_issues.some((i) => i.line === n && i.needs_judgment));
  // The line was appended after the last section, so the missing date note for S1 there is a separate, real finding.
  assert.ok(!out.findings.some((f) => f.line === n && !/UNDATED SOURCES/.test(f.check)), 'no finding about the comparison remains at the line');
  assert.deepEqual(out.plan_review.judged.filter((j) => j.line === n), [{ line: n, check: 'CHARACTERISATION NOT FOUND IN THE CITED ENTRIES', verdict: 'SUPPORTED', claim_ids: ['E2'] }]);
});

test('judgment: an expansion becomes a confirmed blocker only on the final review\'s verdict', async () => {
  const { n, out } = await withLastLine(EXPANSION, { verdict: 'UNSUPPORTED', claim_ids: [], quote: 'luxury relocations for senior executives', problem: 'No entry for Expat US mentions luxury relocations or senior executives.' });
  const at = out.findings.filter((f) => f.line === n && !/UNDATED SOURCES/.test(f.check));
  assert.deepEqual(at.map((f) => [f.severity, f.check, f.unresolved]), [['BLOCKING', 'UNSUPPORTED CLAIM IN THE REVISED PLAN', undefined]]);
  assert.match(at[0].problem, /No entry for Expat US mentions luxury relocations/);
});

test('judgment: with no verdict the comparison stays an unresolved check and holds the plan', async () => {
  for (const line of [PARAPHRASE, EXPANSION]) {
    const { n, out } = await withLastLine(line, null);
    const f = out.findings.find((x) => x.line === n && x.needs_judgment);
    assert.deepEqual([f.severity, f.unresolved, f.check], ['BLOCKING', true, 'CHARACTERISATION NOT FOUND IN THE CITED ENTRIES'], line);
    const g = await gateOf(out);
    assert.equal(g.blocked, true);
    assert.match(g.unresolved_checks_text, /CHARACTERISATION NOT FOUND IN THE CITED ENTRIES \| L\d+/);
    assert.ok(!g.blockers_text.split('\n').some((l) => /CHARACTERISATION/.test(l) && !/CHECK DID NOT COMPLETE/.test(l)), 'it is never listed as a confirmed defect');
  }
});

test('judgment: support named on a page the line does not cite settles the comparison as a citation defect', async () => {
  // The line cites S1. The reviewer says it is supported, by E17, which was verified on S15.
  const { n, out } = await withLastLine(EXPANSION, { verdict: 'SUPPORTED', claim_ids: ['E17'] });
  assert.ok(!out.findings.some((x) => x.line === n && x.needs_judgment), 'the open question is closed');
  const f = out.findings.find((x) => x.line === n && /^FC-/.test(x.id));
  assert.deepEqual([f.severity, f.unresolved, f.check], ['BLOCKING', undefined, 'CITED SOURCE DOES NOT CARRY THE STATEMENT']);
});

test('judgment: without the whole-plan review at all, the comparison is still unresolved, not confirmed', async () => {
  const { n, out } = await withLastLine(EXPANSION);
  const f = out.findings.find((x) => x.line === n && x.needs_judgment);
  assert.equal(f.unresolved, true);
});

// ---------------- 12. The list-item check ----------------

test('list items: an item named by a cited entry passes, in an enumeration about one company', async () => {
  assert.match(LEDGER.find((c) => c.claim_id === 'E2').claim, /temporary housing booking, airport pick up, .* home search, .* school search and enrollment, .* utility setup, banking/);
  for (const s of [
    "Expat US's page lists temporary housing, airport pickup, home search, school search and utility setup [S1].",
    'Expat US offers support including temporary housing, airport pickup, home search, banking and utility setup [S1].',
  ]) assert.deepEqual(only(await onLast(s), /LISTED ITEM/), [], s);
  // The profile row of the held plan cites four pages, and every item is in one of their entries.
  assert.match(lineOf(72), /^\| Offer \| End-to-end relocation support including temporary housing, .* visa guidance, .* \[S1\] \[S3\] \[S6\] \[S7\] \|$/);
  assert.deepEqual(only(at(await check(), 72), /LISTED ITEM/), []);
});

test('list items: an item whose words are in no cited entry is a question for the final review', async () => {
  const text = HELD_PLAN.replace(/\n+$/, '') + "\n\nExpat US's page lists temporary housing, airport pickup, home search, pet transport and school search [S1].\n";
  const issue = (await check(text)).det_issues.find((i) => /LISTED ITEM/.test(i.type));
  assert.equal(issue.severity + ' ' + issue.type, ITEM);
  assert.equal(issue.needs_judgment, true);
  assert.match(issue.detail, /This list cites S1 and includes "pet transport"\. None of the words of that item is in the verified claims from that page\. That is not proof of a defect/);
  // A paraphrase of an item the entry does name is flagged the same way, which is why code does not confirm it.
  const para = await onLast("Expat US's page lists temporary housing, airport pickup, home search, opening an account and school search [S1].");
  assert.ok(para.includes(ITEM));
  // What this check does not catch: "visa guidance" in the replayed row at L74. The word "visa" is in a verified entry
  // of one of the pages still cited, so a word comparison finds support. That line is held by the E44 dependency check.
  const ev = await rebuiltEvidence();
  const rev = await replayRev();
  const out = await check(rev.text, { rev, ev });
  assert.deepEqual(out.det_issues.filter((i) => /LISTED ITEM/.test(i.type)), []);
  assert.match(out.det_issues.find((i) => i.type === 'SOURCE VERIFICATION INCOMPLETE').detail, /E44: L74 says something about Expat US/);
});

test('list items: ordinary prose, short lists, and sentences about several companies are not read as lists', async () => {
  for (const s of [
    'Competing offers from Expat US [S1], RELONXT [S4], and Fragomen [S15] are live, undated, and describe active services.',
    "Expat US's page lists home search, pet transport and school search [S1].",
    'Expat US [S1] and RELONXT [S4] each list housing, pet transport, schooling, banking and immigration help.',
    'The founder plans content covering budgeting, visas, housing, schooling and healthcare.',
  ]) assert.deepEqual(only(await onLast(s), /LISTED ITEM/), [], s);
});

// ---------------- 13. What the whole-plan review does not reach ----------------

const NO_CUE = 'Most people who move overseas in their fifties return home within two years.';

test('coverage limit: an uncited statement of fact with no company and no topic word is not on the list', async () => {
  const { n, cc, out } = await withLastLine(NO_CUE, null);
  assert.ok(!cc.review_lines.some((r) => r.line === n), 'code did not list the line');
  // No code check reports it either, and a review that answers only the listed lines says nothing about it.
  assert.deepEqual(cc.det_issues.filter((i) => i.line === n), []);
  assert.ok(!out.findings.some((f) => f.line === n));
  assert.deepEqual(out.plan_review.unresolved, []);
  // The reviewer is given the whole plan and is told the list can miss a line.
  const p = JSON.parse(cc.qa_payload);
  assert.ok(p.messages[1].content.includes('[L' + n + '] ' + NO_CUE));
  assert.match(p.messages[0].content, /The list is built by code from source IDs, company names, and a few topic words, so it can miss a line: if any other line of the REVISED PLAN states an external fact that is neither supported nor labelled, add an UNSUPPORTED entry for that line as well\./);
});

test('coverage limit: when the reviewer reports such a line unprompted, it is a confirmed blocker', async () => {
  const ev = await rebuiltEvidence();
  const base = await replayRev();
  const text = base.text.replace(/\n+$/, '') + '\n\n' + NO_CUE + '\n';
  const rev = { ...base, text };
  const n = text.replace(/\n+$/, '').split('\n').length;
  const cc = await check(text, { rev, ev });
  const review = scriptedReview(cc, ev, rev).concat([{ line: n, verdict: 'UNSUPPORTED', claim_ids: [], quote: 'return home within two years', problem: 'No ledger entry reports how many people return, or when.' }]);
  const { cc: cc2, out } = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: review })), { review: true, ev });
  const f = out.findings.find((x) => x.line === n);
  assert.deepEqual([f.severity, f.check, f.unresolved], ['BLOCKING', 'UNSUPPORTED CLAIM IN THE REVISED PLAN', undefined]);
  assert.match(f.problem, /^This line was not on the list code built for the final review; the reviewer reported it\./);
  assert.deepEqual(out.plan_review.added_by_reviewer, [n]);
  // A verdict other than UNSUPPORTED for an unlisted line, or one for a line that does not exist, changes nothing.
  const noise = scriptedReview(cc, ev, rev).concat([{ line: n, verdict: 'SUPPORTED', claim_ids: ['E1'] }, { line: 9999, verdict: 'UNSUPPORTED', quote: 'x', problem: 'y' }]);
  const r2 = await secondPass(rev, replayVerifier((o) => ({ ...o, plan_review: noise })), { review: true, ev });
  assert.ok(!r2.out.findings.some((x) => x.line === n || x.line === 9999));
  const report = await reportOf(rev, cc2, out);
  assert.match(report, /COVERAGE: \d+ of \d+ lines of text were on the review list \(.*\)\. NOT ON THE LIST \(\d+\): L3, .*A statement of fact on one of them is read only if the reviewer reports it unprompted\./);
  assert.ok(cc.review_coverage.not_listed.includes(n));
});
