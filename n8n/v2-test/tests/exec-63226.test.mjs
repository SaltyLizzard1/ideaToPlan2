// Regression checks for the defects, the false positives and the refused edits of execution 63226.
// Run: node --test n8n/v2-test/tests/exec-63226.test.mjs
// No network and no model calls. Every input is a saved node output of execution 63226 (fixtures/exec-63226).
// The held plan, its ledger and its records are read, never rewritten. Corrected evidence is built in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, fixture, clone, ROOT } from './harness.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63226');
const fx = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const HELD_PLAN = readFileSync(path.join(DIR, 'final-plan.md'), 'utf8');
const FOUNDER = fx('Founder Context');
const FIN = fx('Compute Financials');
const EV = fx('Build Evidence');
const LEDGER = JSON.parse(EV.research_ledger);
const lineOf = (n) => HELD_PLAN.split('\n')[n - 1];
const src = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const check = async (text = HELD_PLAN, { ev = EV, rev } = {}) => runNode('citation-check.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': fx('Assemble Plan'), 'Build Evidence': ev, 'Growth Plan Generator1': fx('Growth Plan Generator1'), 'Apply Revisions': rev || { ...fx('Apply Revisions'), text } });
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
const apply = (change) => runNode('apply-revisions.js', { 'Plan Revision Request': fx('Plan Revision Request')[0], 'Assemble Plan': fx('Assemble Plan') }, reviserOutput(change));
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
const secondPass = async (rev, qa = fx('Final QA')[1]) => {
  const cc = await check(rev.text, { rev });
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, qa);
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
    [(e) => ({ new_text: rowOnly(e), section_note: 'Note: S1 and S28 are undated.' }), /names a source the row does not cite \(S28\)/],
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

test('refused edits: a major finding on a passage the reviser itself left unchanged can still be closed by the verifier', async () => {
  // This is the one path by which a finding of the first review can leave the report without an edit. It needs the
  // reviser to return the passage as it was and the verifier to read the passage and say the problem is not in it.
  // It never applies to a blocking finding, and never to a refused replacement.
  const rev = await apply({ U8: (e) => ({ new_text: ASSEMBLED[138] }) });
  assert.equal(rev.unchanged_units.find((u) => u.unit === 'U8').kind, 'unchanged');
  const { out } = await secondPass(rev, verifierAnswer(ABSENT));
  assert.equal(out.verification.find((x) => x.id === 'QA-009').status, 'FIXED');
  assert.notEqual(out.verification.find((x) => x.id === 'QA-003').status, 'FIXED', 'a blocking finding is never closed on the verifier\'s word');
  assert.ok(out.findings.some((f) => f.id === 'QA-003' && f.severity === 'BLOCKING'));
  assert.deepEqual(out.unapplied_corrections, []);
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

test('payment: the same verifier answer now keeps the supported facts of E24 and drops "paid"', async () => {
  const ev = await runNode('build-evidence.js', evStubs());
  const ledger = ledgerOf(ev);
  const e24 = ledger.find((c) => c.claim_id === 'E24');
  assert.equal(e24.claim, 'Expat US’s relocation support is a substitute for individuals and families relocating to the US who need guidance on visas, schools, housing, and concierge support.');
  assert.equal(e24.claim_as_researched, LEDGER.find((c) => c.claim_id === 'E24').claim);
  assert.equal(e24.payment_not_established, true);
  assert.match(e24.limits, /does not support saying the service is paid, charged for, or sold/);
  assert.deepEqual(e24.source_ids, ['S7']);
  // Nothing else changes: the same 14 entries, the same 29 exclusions, and every other entry is identical.
  assert.equal(ledger.length, 14);
  ledger.filter((c) => c.claim_id !== 'E24').forEach((c) => assert.deepEqual(c, LEDGER.find((o) => o.claim_id === c.claim_id)));
  assert.equal(JSON.parse(ev.excluded_claims).length, JSON.parse(EV.excluded_claims).length);
  const v = JSON.parse(ev.source_integrity).verification;
  assert.deepEqual(v.payment_wording_removed, ['E24']);
  assert.equal(v.excluded_for_payment_not_shown, 0);
  // The saved record of the run is untouched.
  assert.match(JSON.parse(fx('Build Evidence').research_ledger).find((c) => c.claim_id === 'E24').claim, /paid substitute/);
});

test('payment: "Clear pricing" quoted from the page is not evidence of a charge', async () => {
  const ev = await runNode('build-evidence.js', evStubs({ 'Verify Claims': verifyWith({ excerpt: 'We offer: - Guidance on visas, schools, and housing - Concierge support - Clear pricing and caring consultants' }) }));
  const e24 = ledgerOf(ev).find((c) => c.claim_id === 'E24');
  assert.equal(e24.payment_not_established, true);
  assert.ok(!/\bpaid\b/.test(e24.claim));
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
  // With "paid" removed from E24, the same sentence blocks.
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

test('focus: lines 57, 64, 89, 125 and 481 assign providers a post-decision focus and block', async () => {
  const out = await check();
  for (const n of [64, 125, 481]) assert.match(lineOf(n), /services oriented toward logistics and execution after a relocation decision is made/);
  assert.match(lineOf(89), /Our read: RELONXT, like Expat US, appears to serve people who have already committed to a move and need execution support\./);
  assert.deepEqual(out.det_issues.filter((i) => /PROVIDER FOCUS/.test(i.type)).map((i) => i.line), [57, 64, 89, 125, 481]);
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
  assert.ok(ranked.includes('MAJOR COMPETITOR RANKED WITHOUT EVIDENCE'));
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
    'L89 PROVIDER FOCUS STATED WITHOUT EVIDENCE',
  ]);
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
  assert.deepEqual([...new Set(out.det_issues.filter((i) => i.severity === 'BLOCKING').map((i) => i.type))].sort(), ['PAYMENT STATED WITHOUT EVIDENCE', 'PROVIDER FOCUS STATED WITHOUT EVIDENCE', 'SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE', 'SURVEY FINDING GENERALISED']);
});
