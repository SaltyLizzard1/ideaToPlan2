// The sentence-level claim-to-evidence contract: Build Claim Review, Combine Claim Review, and what Plan Revision
// Request, the gate and the report make of the result.
// Run: node --test n8n/v2-test/tests/claim-review.test.mjs
// No network and no model calls. The plan and its evidence are the preserved fixture of execution 63237. The reviewer's
// answers are scripted here: no model has answered this contract yet, and nothing below claims that one would.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runNode, ROOT } from './harness.mjs';
import { DIR, j, f26, EV, FOUNDER, FIN, REV, TEXT, LEDGER, entry, VERIFIER, check, buildBatches, ALL_YES, ideal, respond, combine, finish, gateOf, reportOf, review, claimAt, clone } from './claim-helpers.mjs';

const digest = () => readdirSync(DIR).sort().map((f) => f + ' ' + createHash('sha256').update(readFileSync(path.join(DIR, f))).digest('hex')).join('\n');
const BEFORE = digest();
const blocking = (out) => out.findings.filter((f) => f.severity === 'BLOCKING');
const confirmed = (out) => blocking(out).filter((f) => !f.unresolved).map((f) => 'L' + f.line + ' ' + f.check);
const open = (out) => blocking(out).filter((f) => f.unresolved).map((f) => f.id + ' ' + f.check);
const rec = (cr, id) => cr.records.find((r) => r.id === id);

// ---------------- 1. The claims ----------------

test('claims: every line of text is split into claims or listed with the reason it holds none', async () => {
  const { items } = await buildBatches();
  const { claims, coverage: c } = items[0].claim_map;
  assert.equal(claims.length, 484);
  assert.deepEqual(c.unclassified, []);
  assert.equal(c.lines_with_claims + c.source_rows.length + c.date_notes.length + c.computed_lines + c.table_headers.length + c.label_only.length + c.unclassified.length, c.prose_lines);
  assert.deepEqual([c.prose_lines, c.lines_with_claims, c.computed_lines, c.table_headers.length, c.label_only.length], [360, 219, 91, 14, 30]);
  assert.deepEqual(c.source_rows, [80, 92, 104, 116]);
  assert.deepEqual(c.date_notes, [{ line: 68, ok: true }, { line: 137, ok: true }]);
  // What is set aside as a label is a heading in bold, a profile name row, or a one-word cell. Nothing else.
  c.label_only.forEach((n) => assert.match(TEXT[n - 1].trim(), /^\*\*[^*]+\*\*$|^\| \*\*[^*|]+\*\* \| \|$|^\| Confidence \| (?:Low|Medium|High) \|$/, 'L' + n + ' ' + TEXT[n - 1]));
  // Every claim is the words of its line.
  claims.forEach((x) => assert.ok(TEXT[x.line - 1].includes(x.text.replace(/;$/, '')), x.id + ' L' + x.line));
});

test('claims: IDs are unique, stable from run to run, and unchanged by an edit elsewhere in the section', async () => {
  const a = (await buildBatches()).items[0].claim_map.claims;
  const b = (await buildBatches()).items[0].claim_map.claims;
  assert.equal(new Set(a.map((x) => x.id)).size, a.length);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  a.forEach((x) => assert.match(x.id, /^K[0-9a-z]{7}(?:-\d+)?$/));
  // One sentence of L129 reworded, and two lines added above it: the other claims keep their IDs and move with the text.
  const l = TEXT.slice();
  l[128] = l[128].replace('This is a hypothesis, not a finding.', 'This is a hypothesis to test, not a finding.');
  l.splice(120, 0, 'A new sentence that was not here before.', '');
  const moved = (await buildBatches({ ...REV, text: l.join('\n') })).items[0].claim_map.claims;
  const was = a.filter((x) => x.line === 129), now = moved.filter((x) => x.line === 131);
  assert.deepEqual(now.slice(0, 2).map((x) => x.id), was.slice(0, 2).map((x) => x.id));
  assert.notEqual(now[2].id, was[2].id);
  const same = a.find((x) => x.line === 483 && /^Nearly two-thirds/.test(x.text));
  assert.equal(moved.find((x) => x.id === same.id).line, 485);
});

test('claims: a table cell carries its company heading, its row, and the entries about that company', async () => {
  const { items } = await buildBatches();
  const c = claimAt(items, 89, /^Comprehensive operational coverage/);
  assert.deepEqual([c.company, c.row, c.cell, c.section, c.heading], ['RELONXT', 'Strength', 2, '4. Competitive Landscape', '']);
  assert.deepEqual(c.candidates, ['E6', 'E7']);
  const f = claimAt(items, 113, /^Established legal and immigration firm/);
  assert.deepEqual([f.company, f.row, f.candidates], ['Fragomen', 'Strength', ['E17']]);
  // A row of a table with named columns carries the row name and the column.
  const w = claimAt(items, 123, /^A resource page listing apps/);
  assert.deepEqual([w.row, w.column, w.company], ['BecomeNomad', 'What they offer', '']);
  // The request puts the exact entry text beside the claim.
  const user = JSON.parse(items.find((b) => b.ids.includes(c.id)).payload).messages[1].content;
  const block = user.slice(user.indexOf('[' + c.id + ']'), user.indexOf('[' + c.id + ']') + 3000);
  assert.match(block, /L89, cell 2 \| 4\. Competitive Landscape \| profile of RELONXT \| row: Strength \| column: Detail \| no citation/);
  assert.ok(block.includes('E6 | about: RELONXT | source: S4 (date not shown) | claim: "' + entry('E6').claim + '" | words on the page: "' + entry('E6').page_excerpt.replace(/\s+/g, ' ').trim() + '"'));
  assert.ok(block.includes('E7 | about: RELONXT'));
});

test('claims: a line that joins statements is split, and a citation stays with the statement it is on', async () => {
  const { items } = await buildBatches();
  const l77 = items[0].claim_map.claims.filter((x) => x.line === 77);
  assert.deepEqual(l77.map((x) => [x.text, x.cites]), [['19 years in business [S3];', ['S3']], ['broad, operationally detailed service list covering logistics from arrival through settling in', []]]);
  const l129 = items[0].claim_map.claims.filter((x) => x.line === 129);
  assert.equal(l129.length, 3);
  assert.ok(l129.every((x) => x.lead === 'Positioning Hypothesis.'));
  assert.match(l129[1].text, /^If customer interviews confirm .* free content alternatives\.$/);
  // A citation after the full stop belongs to the sentence before it; an abbreviation does not end a sentence.
  const l = TEXT.slice();
  l[482] = 'Travelers were surveyed by Holafly, e.g. about visas. [S28] The founder should test this. Updated Sept. 29, 2026 by the publisher.';
  const made = (await buildBatches({ ...REV, text: l.join('\n') })).items[0].claim_map.claims.filter((x) => x.line === 483);
  assert.deepEqual(made.map((x) => x.text), ['Travelers were surveyed by Holafly, e.g. about visas. [S28]', 'The founder should test this.', 'Updated Sept. 29, 2026 by the publisher.']);
  assert.deepEqual(made.map((x) => x.cites), [['S28'], [], []]);
});

// ---------------- 2. The batches ----------------

test('batches: every claim is in exactly one bounded request, and no request depends on another', async () => {
  const { items } = await buildBatches();
  const ids = items[0].claim_map.claims.map((x) => x.id);
  assert.equal(items.length, 13);
  assert.ok(items.every((b) => b.ids.length <= 40 && b.ids.length > 0 && b.claim_skip === false));
  assert.deepEqual(items.flatMap((b) => b.ids), ids);
  assert.deepEqual(items.map((b) => [b.batch, b.of]), items.map((_, k) => [k + 1, 13]));
  items.forEach((b) => {
    const p = JSON.parse(b.payload);
    assert.deepEqual([p.model, p.temperature, p.max_tokens], ['anthropic/claude-sonnet-4.6', 0, 8000]);
    const user = p.messages[1].content;
    assert.ok(user.includes(FOUNDER.founder_context.slice(0, 300)), 'the intake is in every request');
    LEDGER.forEach((e) => assert.ok(user.includes(e.claim_id + ' | about: '), 'every entry is in every request'));
    b.ids.forEach((id) => assert.ok(user.includes('[' + id + '] L')));
    assert.ok(b.payload.length < 60000, 'request ' + b.batch + ' is ' + b.payload.length + ' characters');
  });
  // Only the first item carries the map and the verifier's answer.
  assert.deepEqual(items.map((b) => !!b.claim_map), [true].concat(Array(12).fill(false)));
  assert.equal(items[0].qa_response.choices[0].message.content, VERIFIER.choices[0].message.content);
});

test('batches: the contract asks for the class, the link, and all seven aspects of support', async () => {
  const sys = JSON.parse((await buildBatches()).items[0].payload).messages[0].content;
  for (const k of ['FOUNDER:', 'EXTERNAL:', 'ASSUMPTION:', 'RECOMMENDATION:', 'NONE:']) assert.ok(sys.includes('\n' + k), k);
  for (const k of ['subject:', 'meaning:', 'qualifiers:', 'numbers:', 'dates:', 'population:', 'scope:']) assert.ok(sys.includes('\n' + k), k);
  assert.match(sys, /copy the exact words of the FOUNDER CONTEXT into "intake_quote"/);
  assert.match(sys, /A citation on the sentence does not make it supported\./);
  assert.match(sys, /An entry from the cited source that does not say this is not support\./);
  assert.match(sys, /It must be labelled as such in the sentence itself/);
  assert.match(sys, /"Our read:" is not a label; it names the author\./);
  assert.match(sys, /Return "split": two or more parts, each with "text" copied exactly from the sentence/);
  assert.match(sys, /A paraphrase is fine; a stronger, broader, or different statement is not\./);
});

test('batches: on the first pass, and with the older line review switched on, nothing is asked', async () => {
  const cc1 = j('Citation Check')[0];
  const first = await runNode('build-claim-review.js', { 'Founder Context': FOUNDER, 'Citation Check': { ...cc1, claim_contract: true }, 'Build Evidence': EV }, { choices: [1], usage: { cost: 1 } });
  assert.deepEqual(first, [{ json: { choices: [1], usage: { cost: 1 }, claim_skip: true } }]);
  const legacy = await check(REV, { 'Line Review': { on: true } });
  assert.equal(legacy.claim_contract, false);
  const off = await runNode('build-claim-review.js', { 'Founder Context': FOUNDER, 'Citation Check': legacy, 'Build Evidence': EV, 'Apply Revisions': REV }, VERIFIER);
  assert.equal(off.length, 1);
  assert.equal(off[0].json.claim_skip, true);
});

test('verifier request: with the claim contract on, it no longer asks for the whole plan in one answer', async () => {
  const on = JSON.parse((await check()).qa_payload).messages[1].content;
  assert.match(on, /LINES TO REVIEW\nNone in this request\. The whole plan is reviewed claim by claim in separate requests\./);
  assert.ok(!on.includes('NOT ON THE LIST'));
  const off = JSON.parse((await check(REV, { 'Line Review': { on: true } })).qa_payload).messages[1].content;
  assert.match(off, /LINES TO REVIEW \(125 lines need a verdict/);
});

// ---------------- 3. The known defects of 63237 ----------------

test('known defects: each is a confirmed finding at its sentence when the reviewer says so or shows it', async () => {
  const { items } = await buildBatches();
  const at = (line, re) => claimAt(items, line, re).id;
  const over = {
    // L77: "19 years in business [S3]". The entry that says so was verified on S1.
    [at(77, /^19 years/)]: { class: 'EXTERNAL', supported: true, entries: ['E3'], entry_quote: '19 Years in business', aspects: { ...ALL_YES, numbers: 'yes' } },
    // L79: "Our read:" offered as the label.
    [at(79, /^Our read: Expat US is focused/)]: { class: 'ASSUMPTION', label: 'Our read:' },
    // L89: a strength of RELONXT supported with an entry about WhereNext.
    [at(89, /^Comprehensive/)]: { class: 'EXTERNAL', supported: true, entries: ['E21'], entry_quote: 'every stage of your international move', aspects: ALL_YES },
    // L113: "Established ... firm" goes beyond the entry, by the reviewer's own account of the scope.
    [at(113, /^Established legal/)]: { class: 'EXTERNAL', supported: true, entries: ['E17'], entry_quote: 'Plan for Digital Nomads', aspects: { ...ALL_YES, scope: 'no' } },
    // L127: what the free substitutes do not give.
    [at(127, /^The free substitutes/)]: { class: 'EXTERNAL', supported: false, missing: 'no entry reports what customers get or miss from free content' },
    // L129: a hypothesis about positioning with a fact about the other services inside it.
    [at(129, /^If customer interviews confirm/)]: { split: [
      { text: 'If customer interviews confirm that this is the real barrier, a positioning built around "your personalized plan, not generic advice" could distinguish QYLAT from both', class: 'ASSUMPTION', label: 'could' },
      { text: 'the logistics-focused paid services and the free content alternatives.', class: 'EXTERNAL', supported: false, missing: 'no entry says the services are paid or logistics-focused' },
    ] },
    // L27 and L251: the audience said not to exist.
    [at(27, /^The model is designed this way/)]: { class: 'FOUNDER', supported: false, missing: 'the intake does not say whether an audience exists' },
    [at(251, /^None of these is modeled/)]: { class: 'FOUNDER', supported: false, missing: 'the intake does not say whether an audience exists' },
    // L462: called an assumption, with no label in the sentence.
    [at(462, /^Facebook groups, Reddit communities/)]: { class: 'ASSUMPTION', label: 'hypothesis' },
    // L483: the survey turned into proof of the founder's problem.
    [at(483, /^The problem you are addressing/)]: { class: 'EXTERNAL', supported: true, entries: ['E43'], entry_quote: 'Nearly two-thirds of 600 surveyed travelers', aspects: { ...ALL_YES, meaning: 'yes', population: 'no', scope: 'no' } },
  };
  const combined = await combine(items, respond(items, over));
  const cr = combined.claim_review;
  assert.deepEqual(cr.defects.map((d) => 'L' + d.line + ' ' + d.check), [
    'L27 FOUNDER DETAIL NOT IN THE INTAKE',
    'L77 CITED SOURCE DOES NOT CARRY THE STATEMENT',
    'L79 ASSUMPTION NOT LABELLED IN THE TEXT',
    'L89 ENTRY IS ABOUT ANOTHER COMPANY',
    'L113 ENTRY DOES NOT SUPPORT THE CLAIM',
    'L127 EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY',
    'L129 EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY',
    'L251 FOUNDER DETAIL NOT IN THE INTAKE',
    'L462 ASSUMPTION NOT LABELLED IN THE TEXT',
    'L483 ENTRY DOES NOT SUPPORT THE CLAIM',
  ]);
  const d = (line) => cr.defects.find((x) => x.line === line);
  assert.match(d(77).why, /named E3 as the support\. That entry was verified on S1\. The sentence cites S3, and none of the entries named comes from there\./);
  assert.match(d(79).why, /The sentence carries no hypothesis, assumption, or not-established wording of its own \(the review pointed to "Our read:"\)/);
  assert.match(d(89).why, /in the profile of RELONXT\. The review named E21 as its support, and that entry is about WhereNext\./);
  assert.match(d(113).why, /by its own account the entry does not support the scope of the claim/);
  assert.match(d(483).why, /does not support the population, scope of the claim/);
  // The split keeps the hypothesis and confirms only the fact inside it.
  assert.deepEqual(d(129).parts.map((p) => [p.id.slice(-2), p.check]), [['.b', 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY']]);
  assert.deepEqual(rec(cr, d(129).id).parts.map((p) => p.status), ['settled', 'defect']);
  // The evidence text stands beside the claim in the record.
  assert.deepEqual(d(77).evidence, [{ id: 'E3', entity: 'Expat US', source_ids: ['S1'], claim: 'Expat US says it has 19 years of experience.', page_excerpt: '19 Years in business' }]);
  assert.equal(cr.open.length, 0);

  const cc = await check();
  const out = await finish(cc, combined);
  const cl = out.findings.filter((f) => /^CL-\d/.test(f.id));
  assert.equal(cl.length, 10);
  cl.forEach((f) => { assert.deepEqual([f.severity, f.unresolved, f.source], ['BLOCKING', undefined, 'Claim review']); assert.ok(TEXT[f.line - 1].includes(f.quote.replace(/;$/, ''))); assert.match(f.claim_id, /^K/); });
  assert.ok(!out.findings.some((f) => f.id === 'CL-OPEN'));
  const g = await gateOf(out);
  assert.equal(g.blocked, true);
  assert.match(g.blockers_text, /CL-002 \| CITED SOURCE DOES NOT CARRY THE STATEMENT \| L77/);
  assert.ok(!/CL-/.test(g.unresolved_checks_text));
});

test('known defects: a settled claim does not overrule a finding code made on the same sentence', async () => {
  // The scripted reviewer settles L483 and L129. Code still blocks both.
  const { cr, out } = await review();
  assert.ok(!cr.defects.some((d) => d.line === 483 || d.line === 129));
  assert.ok(confirmed(out).includes('L483 PROBLEM STATED AS CONFIRMED'));
  assert.ok(confirmed(out).includes('L129 PAYMENT STATED WITHOUT EVIDENCE'));
  assert.ok(confirmed(out).includes('L79 PROVIDER FOCUS STATED WITHOUT EVIDENCE'));
});

// ---------------- 4. Valid alternatives ----------------

test('valid support: a paraphrase is settled on the reviewer\'s seven answers, with no test of shared words', async () => {
  const { items } = await buildBatches();
  const c = claimAt(items, 89, /^Comprehensive/);
  // The sentence shares almost no word with the entry. The entry's own words are quoted, and every aspect is answered.
  const a = { class: 'EXTERNAL', supported: true, entries: ['E6'], entry_quote: 'From airport reception and temporary accommodation', aspects: { subject: 'yes', meaning: 'yes', qualifiers: 'na', numbers: 'na', dates: 'na', population: 'na', scope: 'yes' } };
  const cr = (await combine(items, respond(items, { [c.id]: a }))).claim_review;
  const r = rec(cr, c.id);
  assert.deepEqual([r.status, r.cls], ['settled', 'EXTERNAL']);
  assert.deepEqual(r.links.entries, ['E6']);
  assert.equal(r.links.evidence[0].claim, entry('E6').claim);
  assert.equal(r.links.entry_quote, 'From airport reception and temporary accommodation');
  const shared = c.text.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && (entry('E6').claim + ' ' + entry('E6').page_excerpt).toLowerCase().includes(w));
  assert.deepEqual(shared, [], 'not one longer word of the sentence is in the entry');
});

test('valid support: a founder fact is linked to the exact intake passage, and numbers of the plan\'s own model pass', async () => {
  const { items } = await buildBatches();
  const c = claimAt(items, 27, /^You have described additional revenue streams/);
  const cr = (await combine(items, respond(items, { [c.id]: { class: 'FOUNDER', supported: true, intake_quote: 'digital planning products, affiliate commissions from relevant travel and relocation services' } }))).claim_review;
  assert.deepEqual([rec(cr, c.id).status, rec(cr, c.id).links.intake_quote], ['settled', 'digital planning products, affiliate commissions from relevant travel and relocation services']);
  const t = claimAt(items, 37, /^Your target customer is an adult, typically aged 40 to 60/);
  const ok = (await combine(items, respond(items, { [t.id]: { class: 'FOUNDER', supported: true, intake_quote: 'adult, typically age 40 to 60, who is financially stable' } }))).claim_review;
  assert.equal(rec(ok, t.id).status, 'settled');
});

test('valid support: labelled assumptions, recommendations and sentences that assert nothing are settled', async () => {
  const { items } = await buildBatches();
  const hyp = claimAt(items, 79, /^This is a hypothesis to test\./);
  const whether = claimAt(items, 127, /^Whether any of these providers charges a fee/);
  const rec1 = claimAt(items, 37, /^Customer conversations should test this hypothesis directly\./);
  const doubt = claimAt(items, 25, /^The business is designed to serve adults/);
  const cr = (await combine(items, respond(items, {
    [hyp.id]: { class: 'ASSUMPTION', label: 'This is a hypothesis to test' },
    [whether.id]: { class: 'ASSUMPTION', label: 'is not established' },
    [rec1.id]: { class: 'RECOMMENDATION' },
    // The customer's stated doubt at L25: the founder's description of who the business serves, in the intake's words.
    [doubt.id]: { class: 'FOUNDER', supported: true, intake_quote: 'financially stable enough to consider a major lifestyle change' },
  }))).claim_review;
  assert.deepEqual([hyp, whether, rec1, doubt].map((c) => rec(cr, c.id).status), ['settled', 'settled', 'settled', 'settled']);
  assert.deepEqual([hyp, whether, rec1, doubt].map((c) => rec(cr, c.id).cls), ['ASSUMPTION', 'ASSUMPTION', 'RECOMMENDATION', 'FOUNDER']);
});

// ---------------- 5. A source match alone is not support ----------------

test('not support: an answer that only names an entry from the right source leaves the claim unreviewed', async () => {
  const { items } = await buildBatches();
  const c = claimAt(items, 43, /^Nearly two-thirds of 600 surveyed travelers/);
  const good = { class: 'EXTERNAL', supported: true, entries: ['E43'], entry_quote: 'Nearly two-thirds of 600 surveyed travelers', aspects: { ...ALL_YES, numbers: 'yes', population: 'yes' } };
  const cases = [
    [good, 'settled', null],
    [{ ...good, aspects: undefined }, 'open', /does not say whether the entry supports the subject, meaning, qualifiers, numbers, dates, population, scope of the claim; a source match alone is not support/],
    [{ ...good, aspects: { subject: 'yes', meaning: 'yes' } }, 'open', /does not say whether the entry supports the qualifiers, numbers, dates, population, scope/],
    [{ ...good, aspects: { ...ALL_YES, meaning: 'na' } }, 'open', /does not confirm that the entry is about the same subject and says the same thing/],
    [{ ...good, entry_quote: '' }, 'open', /does not quote the words of the entry that carry the support/],
    [{ ...good, entry_quote: 'most travelers struggle with paperwork' }, 'open', /the words it quotes as support are not in the entry it names/],
    [{ ...good, entries: [] }, 'open', /names no ledger entry/],
    [{ ...good, entries: ['E99'] }, 'open', /names E99, which is not in the ledger/],
    [{ ...good, entries: ['E1'], entry_quote: 'Supporting global companies' }, 'defect', /The sentence cites S28, and none of the entries named comes from there/],
    [{ class: 'NONE' }, 'open', /classed NONE and the sentence cites S28/],
    [{ class: 'SUPPORTED' }, 'open', /the class is not FOUNDER, EXTERNAL, ASSUMPTION, RECOMMENDATION, or NONE/],
    [{ class: 'EXTERNAL' }, 'open', /does not say whether the claim is supported/],
  ];
  for (const [a, status, why] of cases) {
    const r = rec((await combine(items, respond(items, { [c.id]: a }))).claim_review, c.id);
    assert.equal(r.status, status, JSON.stringify(a).slice(0, 90) + ' -> ' + r.why);
    if (why) assert.match(r.why, why);
  }
});

test('not support: numbers, dates, quotes and classes that code can check are checked', async () => {
  const { items } = await buildBatches();
  const l = TEXT.slice();
  l[42] = l[42].replace('600 surveyed travelers', '6,000 surveyed travelers');
  const changed = await buildBatches({ ...REV, text: l.join('\n') });
  const c = claimAt(changed.items, 43, /^Nearly two-thirds of 6,000 surveyed travelers/);
  const a = { class: 'EXTERNAL', supported: true, entries: ['E43'], entry_quote: 'Nearly two-thirds of 600 surveyed travelers', aspects: { ...ALL_YES, numbers: 'yes' } };
  const r = rec((await combine(changed.items, respond(changed.items, { [c.id]: a }))).claim_review, c.id);
  assert.deepEqual([r.status, r.why], ['open', 'the number or date 6000 is not in the text of E43 or its source record']);
  // L77 again, this time with the entry that is on S3: the citation is right and the number is not in that entry.
  const y = claimAt(items, 77, /^19 years/);
  const r2 = rec((await combine(items, respond(items, { [y.id]: { class: 'EXTERNAL', supported: true, entries: ['E4'], entry_quote: 'our team provides end-to-end support', aspects: { ...ALL_YES, numbers: 'yes' } } }))).claim_review, y.id);
  assert.deepEqual([r2.status, r2.why], ['open', 'the number or date 19 is not in the text of E4 or its source record']);
  // A founder fact needs words that are in the intake; a label has to be in the sentence; a profile sentence is not "nothing".
  const f = claimAt(items, 27, /^You have described additional revenue streams/);
  const p = claimAt(items, 89, /^Comprehensive/);
  const h = claimAt(items, 79, /^This is a hypothesis to test\./);
  const cr = (await combine(items, respond(items, {
    [f.id]: { class: 'FOUNDER', supported: true, intake_quote: 'the founder already sells digital planning products to an audience' },
    [p.id]: { class: 'NONE' },
    [h.id]: { class: 'ASSUMPTION', label: 'this remains unproven' },
  }))).claim_review;
  assert.match(rec(cr, f.id).why, /classed FOUNDER and the words it quotes are not in the founder context/);
  assert.match(rec(cr, p.id).why, /classed NONE and it is in the profile of RELONXT/);
  assert.match(rec(cr, h.id).why, /classed ASSUMPTION and the label it quotes is not in the sentence/);
  assert.deepEqual([f, p, h].map((x) => rec(cr, x.id).status), ['open', 'open', 'open']);
});

test('not support: a split has to be the words of the sentence and leave none of them out', async () => {
  const { items } = await buildBatches();
  const c = claimAt(items, 129, /^If customer interviews confirm/);
  const a = { text: 'If customer interviews confirm that this is the real barrier, a positioning built around "your personalized plan, not generic advice" could distinguish QYLAT from both', class: 'ASSUMPTION', label: 'could' };
  const b = { text: 'the logistics-focused paid services and the free content alternatives.', class: 'ASSUMPTION', label: 'could' };
  const run = async (split) => rec((await combine(items, respond(items, { [c.id]: { split } }))).claim_review, c.id);
  assert.match((await run([a])).why, /the split has fewer than two parts/);
  assert.match((await run([a, { ...b, text: 'the relocation services that charge fees' }])).why, /a part of the split is not the words of the sentence/);
  assert.match((await run([{ ...a, text: 'If customer interviews confirm that this is the real barrier' }, { ...b, text: 'the free content alternatives.' }])).why, /the parts of the split leave out words of the sentence/);
  // The second part quotes a label that is not in that part: the label of the first part does not reach it.
  // The second part is called an assumption on the strength of "could", which is in the first part. A label covers the
  // assertion it is attached to: the part has none of its own, and that is a confirmed defect.
  const r = await run([a, b]);
  assert.deepEqual([r.status, r.check], ['defect', 'ASSUMPTION NOT LABELLED IN THE TEXT']);
  assert.deepEqual(r.parts.map((p) => p.status), ['settled', 'defect']);
});

// ---------------- 6. Combining the batches ----------------

test('combining: with every claim answered once, nothing is missing and the counts add up', async () => {
  const { items } = await buildBatches();
  const cr = (await combine(items, respond(items))).claim_review;
  assert.deepEqual([cr.claims, cr.batches, cr.missing, cr.duplicates, cr.contradictory, cr.stray, cr.failed_batches], [484, 13, [], [], [], [], []]);
  assert.equal(cr.settled + cr.defects.length + cr.open.length, cr.claims);
  assert.equal(cr.records.length, 484);
  assert.deepEqual(cr.open.map((o) => 'L' + o.line), ['L77']);
  assert.deepEqual([cr.usage.requests, cr.usage.answered, cr.usage.prompt_tokens, cr.usage.completion_tokens, Math.round(cr.usage.cost * 100) / 100, cr.usage.cost_known], [13, 13, 91000, 26000, 0.65, true]);
});

test('combining: a missing verdict, a repeated one, and two that disagree are each recorded for what they are', async () => {
  const { items } = await buildBatches();
  const [a, b, c] = items[1].ids;
  const text = (id) => items[0].claim_map.claims.find((x) => x.id === id);
  const same = ideal(text(b));
  const cr = (await combine(items, respond(items, { [a]: null, [b]: [same, same], [c]: [{ class: 'ASSUMPTION', label: 'if' }, { class: 'EXTERNAL', supported: false, missing: 'nothing supports it' }] }))).claim_review;
  assert.deepEqual(cr.missing, [a]);
  assert.deepEqual([rec(cr, a).status, rec(cr, a).missing, rec(cr, a).why], ['open', true, 'no verdict was given']);
  assert.deepEqual(cr.duplicates, [b]);
  assert.equal(rec(cr, b).status, 'settled', 'the same verdict twice is counted once');
  assert.deepEqual(cr.contradictory, [c]);
  assert.deepEqual([rec(cr, c).status, rec(cr, c).why], ['open', '2 verdicts were given and they disagree (ASSUMPTION/ and EXTERNAL/false)']);
  assert.ok(!cr.defects.some((d) => d.id === c), 'a verdict that is contradicted is not taken as a finding');
});

test('combining: a verdict given in the wrong request is ignored, and the claim is still owed one', async () => {
  const { items } = await buildBatches();
  const id = items[3].ids[0];
  const responses = respond(items, { [id]: null }, (r, b, body) => {
    if (b.batch !== 1) return r;
    body.none = (body.none || []).concat([id, 'K9999999']);
    return { ...r, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] };
  });
  const cr = (await combine(items, responses)).claim_review;
  assert.deepEqual(cr.stray, [{ id, batch: 1, belongs_to: 4 }, { id: 'K9999999', batch: 1, belongs_to: null }]);
  assert.deepEqual(cr.missing, [id]);
});

test('combining: a request that fails, returns nonsense, or is cut off leaves its claims unreviewed and nothing else', async () => {
  const { items } = await buildBatches();
  const responses = respond(items, {}, (r, b, body) => {
    if (b.batch === 2) return { error: { message: 'The service is receiving too many requests from you' } };
    if (b.batch === 5) return { ...r, choices: [{ finish_reason: 'stop', message: { content: 'I could not complete the review.' } }] };
    if (b.batch === 7) return { ...r, choices: [{ finish_reason: 'length', message: { content: JSON.stringify(body).slice(0, 900) } }] };
    if (b.batch === 9) { const half = { ...body, claims: body.claims.slice(0, 3), none: [], recommendation: [] }; return { ...r, choices: [{ finish_reason: 'length', message: { content: JSON.stringify(half) } }] }; }
    return r;
  });
  const cr = (await combine(items, responses)).claim_review;
  assert.deepEqual(cr.failed_batches.map((f) => [f.batch, f.why.slice(0, 44), !!f.partial]), [
    [2, 'the request failed: The service is receiving', false],
    [5, 'the answer is not readable JSON', false],
    [7, 'the answer was cut off at the output limit a', false],
    [9, 'the answer was cut off at the output limit; ', true],
  ]);
  const lost = [2, 5, 7].flatMap((k) => items[k - 1].ids);
  lost.forEach((id) => assert.equal(rec(cr, id).status, 'open'));
  assert.match(rec(cr, items[1].ids[0]).why, /^no verdict: batch 2, the request failed/);
  const nine = items[8].ids.map((id) => rec(cr, id));
  assert.equal(nine.filter((r) => !r.missing).length, 3, 'what the cut-off answer did reach is kept');
  assert.equal(nine.filter((r) => r.missing).length, items[8].ids.length - 3);
  assert.equal(cr.missing.length, lost.length + items[8].ids.length - 3);
  assert.deepEqual([cr.usage.requests, cr.usage.answered], [13, 10]);
  // The other requests are untouched by the failures.
  items[0].ids.forEach((id) => assert.ok(!rec(cr, id).missing));
});

// ---------------- 7. The hold ----------------

test('hold: any claim without a usable verdict is an incomplete check that holds the plan, and is not a finding', async () => {
  const { items, cc } = await buildBatches();
  const id = items[10].ids[4];
  const combined = await combine(items, respond(items, { [id]: null, [claimAt(items, 77, /^19 years/).id]: { class: 'EXTERNAL', supported: true, entries: ['E3'], entry_quote: '19 Years in business', aspects: { ...ALL_YES, numbers: 'yes' } } }));
  const out = await finish(cc, combined);
  const f = out.findings.find((x) => x.id === 'CL-OPEN');
  assert.deepEqual([f.severity, f.unresolved, f.check], ['BLOCKING', true, 'CLAIM REVIEW IS INCOMPLETE']);
  assert.match(f.problem, /of the 484 claims in the revised plan have no usable verdict \(1 with no verdict at all, 0 with verdicts that disagree\)/);
  assert.ok(f.problem.includes(id + ' L'));
  assert.match(f.problem, /They are not confirmed defects and not a clean result\./);
  const g = await gateOf(out);
  assert.equal(g.blocked, true);
  assert.match(g.unresolved_checks_text, /CL-OPEN \| CLAIM REVIEW IS INCOMPLETE/);
  assert.ok(!g.blockers_text.split('\n').some((l) => /CL-OPEN/.test(l) && !/CHECK DID NOT COMPLETE/.test(l)));
});

test('hold: with no claim review at all, on either pass, the plan is held', async () => {
  const cc = await check();
  // Second pass, and the review returned nothing.
  const none = await finish(cc, VERIFIER);
  assert.deepEqual(open(none).filter((x) => /^CL/.test(x)), ['CL-OPEN CLAIM REVIEW DID NOT RUN']);
  assert.equal(none.claim_review, null);
  assert.equal((await gateOf(none)).blocked, true);
  // First pass, and nothing to revise: there will be no second pass, so the review cannot run.
  const cc1 = { ...j('Citation Check')[0], det_issues: [], claim_contract: true };
  const clean = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc1, 'Assemble Plan': f26('Assemble Plan'), 'Build Evidence': EV }, { choices: [{ message: { content: JSON.stringify({ findings: [], summary: 'clean' }) } }] });
  assert.equal(clean.needs_revision, false);
  assert.deepEqual(clean.findings.map((f) => [f.id, f.check, f.unresolved]), [['CL-OPEN', 'CLAIM REVIEW DID NOT RUN', true]]);
  // First pass with a revision coming: nothing is added, the review runs after the revision.
  const revising = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': { ...j('Citation Check')[0], claim_contract: true }, 'Assemble Plan': f26('Assemble Plan'), 'Build Evidence': EV }, { choices: [{ message: { content: JSON.stringify(j('reviewer-answer')) } }] });
  assert.equal(revising.needs_revision, true);
  assert.ok(!revising.findings.some((f) => f.id === 'CL-OPEN'));
});

test('hold: a line code could not judge is decided by the claims on it, and stays open while any of them is open', async () => {
  const { items, cc } = await buildBatches();
  assert.deepEqual(cc.det_issues.filter((i) => i.needs_judgment).map((i) => i.line), [102, 103]);
  const c102 = claimAt(items, 102, /^A customer who wants a self-serve/);
  const settled = await finish(cc, await combine(items, respond(items)));
  assert.deepEqual(settled.claim_review.judged.map((x) => [x.line, x.verdict]).sort(), [[102, 'SETTLED'], [103, 'SETTLED']]);
  assert.ok(!settled.findings.some((f) => f.needs_judgment));
  const missing = await finish(cc, await combine(items, respond(items, { [c102.id]: null })));
  assert.deepEqual(missing.findings.filter((f) => f.needs_judgment).map((f) => [f.line, f.unresolved]), [[102, true]]);
  const bad = await finish(cc, await combine(items, respond(items, { [c102.id]: { class: 'EXTERNAL', supported: false, missing: 'no entry says who Relocate Now is for' } })));
  assert.ok(!bad.findings.some((f) => f.needs_judgment && f.line === 102));
  assert.deepEqual(bad.findings.filter((f) => f.line === 102).map((f) => [f.check, f.unresolved]), [['EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY', undefined]]);
});

// ---------------- 8. The report ----------------

test('report: defects, unreviewed claims, failed requests and coverage are separate, and the cost is a line of its own', async () => {
  const { items, cc } = await buildBatches();
  const y = claimAt(items, 77, /^19 years/);
  const responses = respond(items, { [y.id]: { class: 'EXTERNAL', supported: true, entries: ['E3'], entry_quote: '19 Years in business', aspects: { ...ALL_YES, numbers: 'yes' } }, [items[4].ids[0]]: null }, (r, b) => (b.batch === 12 ? { error: { message: 'timeout' } } : r));
  const out = await finish(cc, await combine(items, responses));
  const report = await reportOf(cc, out);
  const n = items[11].ids.length + 1;
  assert.match(report, new RegExp('CLAIM REVIEW, SENTENCE BY SENTENCE: 484 claims, reviewed in 13 requests\\. Settled: \\d+ \\(\\d+ founder facts linked to the intake, \\d+ external claims linked to ledger entries, \\d+ labelled assumptions, \\d+ recommendations, \\d+ with no factual assertion\\)\\. Confirmed defects: 1\\. Not reviewed: ' + n + '\\.'));
  const a = report.indexOf('Confirmed defects (1):'), b = report.indexOf('Not reviewed: no usable verdict (' + n + ')'), c = report.indexOf('- REQUEST 12 of 13: the request failed: timeout');
  assert.ok(a > 0 && b > a && c > b, [a, b, c].join(' '));
  assert.match(report.slice(a, b), /- K\w+ L77 \| CITED SOURCE DOES NOT CARRY THE STATEMENT \| "19 years in business \[S3\];"/);
  assert.match(report, /COVERAGE: 360 lines of text\. 219 yielded the 484 claims\. Decided by code: 4 source-only rows, 2 date notes checked against the source records, 91 lines of computed financial content, 14 table header rows\. Labels with nothing to assert \(30\): L49, L66, L72, .*\. Lines with no claim and no reason \(0\): none\./);
  assert.match(report, /Claim review \| Review Claims x13 \| anthropic\/claude-sonnet-4\.6 \| in \d+ \| out \d+ \| \$0\.\d+/);
  // With nothing wrong and nothing open, the report still does not call the plan proven.
  const clean = await finish(cc, await combine(items, respond(items, { [y.id]: { class: 'EXTERNAL', supported: true, entries: ['E4'], entry_quote: 'our team provides end-to-end support', aspects: ALL_YES } })));
  assert.match(await reportOf(cc, clean), /Confirmed defects: 0\. Not reviewed: 1\./);
});

// ---------------- 9. Older fixtures ----------------

test('older fixtures: every held plan splits into claims with nothing left unclassified', async () => {
  for (const id of ['63221', '63222', '63223', '63225', '63226']) {
    const D = path.join(ROOT, 'fixtures', 'exec-' + id);
    const fx = (n) => JSON.parse(readFileSync(path.join(D, n + '.json'), 'utf8'));
    if (!existsSync(path.join(D, 'final-plan.md')) || !existsSync(path.join(D, 'Apply Revisions.json'))) continue;
    const text = readFileSync(path.join(D, 'final-plan.md'), 'utf8');
    const one = (v) => (Array.isArray(v) ? v[0] : v);
    const rev = { ...one(fx('Apply Revisions')), text };
    const stubs = { 'Founder Context': one(fx('Founder Context')), 'Compute Financials': one(fx('Compute Financials')), 'Assemble Plan': existsSync(path.join(D, 'Assemble Plan.json')) ? one(fx('Assemble Plan')) : { text }, 'Build Evidence': one(fx('Build Evidence')), 'Apply Revisions': rev };
    if (existsSync(path.join(D, 'Growth Plan Generator1.json'))) stubs['Growth Plan Generator1'] = one(fx('Growth Plan Generator1'));
    const cc = await runNode('citation-check.js', stubs);
    const items = (await runNode('build-claim-review.js', { ...stubs, 'Citation Check': cc }, VERIFIER)).map((i) => i.json);
    const { claims, coverage: c } = items[0].claim_map;
    assert.ok(claims.length > 200, id + ': ' + claims.length + ' claims');
    assert.deepEqual(c.unclassified, [], id);
    assert.equal(c.lines_with_claims + c.source_rows.length + c.date_notes.length + c.computed_lines + c.table_headers.length + c.label_only.length, c.prose_lines, id);
    assert.equal(new Set(claims.map((x) => x.id)).size, claims.length, id);
    assert.ok(items.every((b) => b.ids.length <= 40), id);
    assert.deepEqual(items.flatMap((b) => b.ids), claims.map((x) => x.id), id);
    const lines = text.split('\n');
    claims.forEach((x) => assert.ok(lines[x.line - 1].includes(x.text.replace(/;$/, '')), id + ' ' + x.id));
    // With no answers at all, every claim is open and the plan is held.
    const combined = await runNode('combine-claim-review.js', { 'Build Claim Review': items, 'Founder Context': stubs['Founder Context'], 'Compute Financials': stubs['Compute Financials'], 'Build Evidence': stubs['Build Evidence'] }, { __items: items.map(() => ({ error: { message: 'not run' } })) });
    assert.equal(combined[0].json.claim_review.open.length, claims.length, id);
  }
});

test('fixture: nothing in fixtures/exec-63237 was changed by these tests', () => {
  assert.equal(digest(), BEFORE);
});
