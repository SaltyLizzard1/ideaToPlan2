// Regression checks for the false positives, review noise and missed defect of execution 63223.
// Run: node --test n8n/v2-test/tests/exec-63223.test.mjs
// No network and no model calls. Every input is a saved node output of execution 63223 (fixtures/exec-63223).
// The held plan is read, never rewritten. Sentences under test are added to a copy in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, clone, ROOT } from './harness.mjs';

const DIR = path.join(ROOT, 'fixtures', 'exec-63223');
const fx = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const HELD_PLAN = readFileSync(path.join(DIR, 'final-plan.md'), 'utf8');
const FOUNDER = fx('Founder Context');
const FIN = fx('Compute Financials');
const EV = fx('Build Evidence');
const lineOf = (n) => HELD_PLAN.split('\n')[n - 1];

const check = async (text = HELD_PLAN, { ev = EV, firstPass = false, rev } = {}) => {
  const stubs = { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': firstPass ? { ...fx('Assemble Plan'), text } : fx('Assemble Plan'), 'Build Evidence': ev, 'Growth Plan Generator1': fx('Growth Plan Generator1') };
  if (!firstPass) stubs['Apply Revisions'] = rev || { ...fx('Apply Revisions'), text };
  return runNode('citation-check.js', stubs);
};
const at = (out, line) => out.det_issues.filter((i) => i.line === line).map((i) => i.severity + ' ' + i.type);
const onLast = async (line, opts) => { const text = HELD_PLAN.replace(/\n+$/, '') + '\n\n' + line + '\n'; return at(await check(text, opts), text.replace(/\n+$/, '').split('\n').length); };
const only = (list, re) => list.filter((x) => re.test(x));
// The saved evidence with its entity list or ledger changed, for cases the run did not contain.
const evidence = ({ entities = (e) => e, ledger = (l) => l } = {}) => ({ ...EV, entities: JSON.stringify(entities(JSON.parse(EV.entities))), research_ledger: JSON.stringify(ledger(JSON.parse(EV.research_ledger))) });

// ---------------- 1. Short names ----------------

const WRONG = 'BLOCKING CITATION ATTACHED TO THE WRONG COMPANY';

test('names: line 59 uses the short name "Kismet Travels" with the right source, and passes', async () => {
  assert.match(lineOf(59), /such as Kismet Travels \[S11\] and Terra Relocations \[S14\], expat financial planners such as Expat Financial Solutions \[S5\]/);
  assert.equal(JSON.parse(EV.entities).find((e) => e.source_ids.includes('S11')).name, 'Kismet Travels & Tours');
  const out = await check();
  assert.deepEqual(only(at(out, 59), /CITATION/), []);
  assert.ok(!out.det_issues.some((i) => /CITATION/.test(i.type)));
});

test('names: correct and swapped citations, with the short name and with the full name', async () => {
  // Kismet Travels & Tours is tied to S11, Terra Relocations to S14.
  for (const kismet of ['Kismet Travels', 'Kismet Travels & Tours']) {
    const layouts = [
      (x, y) => 'Relocation logistics companies such as ' + kismet + ' [' + x + '] and Terra Relocations [' + y + '] are alternatives.',
      (x, y) => '| Alternatives | ' + kismet + ' [' + x + '], Terra Relocations [' + y + '] |',
      (x, y) => '| Threats | 1. ' + kismet + ' offers structured relocation guidance [' + x + ']. 2. Terra Relocations serves families and executives [' + y + ']. |',
    ];
    for (const layout of layouts) {
      assert.deepEqual(only(await onLast(layout('S11', 'S14')), /CITATION/), [], 'correct: ' + layout('S11', 'S14'));
      assert.deepEqual(only(await onLast(layout('S14', 'S11')), /CITATION/), [WRONG, WRONG], 'swapped: ' + layout('S14', 'S11'));
    }
  }
});

test('names: a short name is a name, not a substring', async () => {
  // "expat financial planners" is a description, not Expat Financial Solutions, so S14 is not a wrong citation for it.
  assert.deepEqual(only(await onLast('Some expat financial planners work alongside movers such as Terra Relocations [S14].'), /CITATION/), []);
  // With its capitals, as a name, the short form is that company.
  assert.deepEqual(only(await onLast('Expat Financial lists a one-time financial plan [S5].'), /CITATION/), []);
  assert.deepEqual(only(await onLast('Expat Financial lists a one-time financial plan [S14].'), /CITATION/), [WRONG]);
  // A single leading word is never an alias: "Terra" alone is not Terra Relocations.
  assert.deepEqual(only(await onLast('Terra is a common word in company names [S11].'), /CITATION/), []);
});

test('names: a short name shared by two companies is used for neither', async () => {
  const two = evidence({ entities: (list) => list.concat([{ name: 'Kismet Travels Group', name_words: 'kismet travels group', key: 'kismettravelsgroup', site: 'kismetgroup', source_ids: ['S14'], verified_claims: 1 }]) });
  // "Kismet Travels" could be either company, so it binds to neither and no wrong-company finding is invented.
  assert.deepEqual(only(await onLast('Kismet Travels offers relocation guidance [S14].', { ev: two }), /CITATION/), []);
  assert.deepEqual(only(await onLast('Kismet Travels offers relocation guidance [S11].', { ev: two }), /CITATION/), []);
  // The full names still bind, each to its own source.
  assert.deepEqual(only(await onLast('Kismet Travels & Tours offers relocation guidance [S14].', { ev: two }), /CITATION/), [WRONG]);
  assert.deepEqual(only(await onLast('Kismet Travels Group offers relocation guidance [S11].', { ev: two }), /CITATION/), [WRONG]);
});

// ---------------- 2. Whose price it is ----------------

const STRETCH = 'BLOCKING PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE';
const OWN = 'Expat Financial Solutions states on its own website that it charges $2,500 for its one-time personalized financial plan [S5]; this is that company\'s own price for its own service and is not evidence of market pricing.';

test('price: the $2,500 plan is the company\'s own price on its own site, with no "our" or "we" in the passage', async () => {
  const e9 = JSON.parse(EV.research_ledger).find((c) => c.claim_id === 'E9');
  assert.equal(e9.entity, 'Expat Financial Solutions');
  assert.deepEqual(e9.source_ids, ['S5']);
  assert.match(e9.page_excerpt, /One-time personalized financial plan INCLUDES: .* \$2,500/);
  assert.ok(!/\b(our|we)\b/i.test(e9.page_excerpt));
  assert.equal(JSON.parse(EV.sources).find((s) => s.id === 'S5').domain, 'expatfinancial.solutions');
  assert.match(lineOf(115), /this is that company's own price for its own service/);
  const out = await check();
  assert.deepEqual(only(at(out, 115), /PRICE/), []);
  assert.deepEqual(only(await onLast(OWN), /PRICE/), []);
});

test('price: a "typical range" on a company\'s own site is not that company\'s price', async () => {
  const typical = evidence({ ledger: (l) => l.map((c) => c.claim_id === 'E9' ? { ...c, claim: 'Expat Financial Solutions says one-time financial plans for expats typically range from $2,000 to $8,000.', page_excerpt: 'One-time financial plans for expats typically range from $2,000-$8,000.' } : c) });
  assert.ok((await onLast('Expat Financial Solutions states that plans typically range from $2,000 to $8,000 [S5]; this is that company\'s own price for its own service.', { ev: typical })).includes(STRETCH));
  // Stated as what the page says, the same evidence passes.
  assert.deepEqual(only(await onLast('A page on the Expat Financial Solutions site states that one-time financial plans for expats typically range from $2,000 to $8,000 [S5]. It does not say whose prices those are.', { ev: typical }), /PRICE/), []);
});

test('price: a third party\'s price on a company\'s own site is not that company\'s price', async () => {
  const partner = evidence({ ledger: (l) => l.map((c) => c.claim_id === 'E9' ? { ...c, claim: 'Expat Financial Solutions says its partner firm Beta Advisors charges $900 for a tax review.', page_excerpt: 'Our partner Beta Advisors charges $900 for a tax review.' } : c) });
  assert.ok((await onLast('Expat Financial Solutions lists a tax review at $900 [S5]; this is that company\'s own price for its own service.', { ev: partner })).includes(STRETCH));
});

test('price: a verified third-party page can establish a named company\'s price for a specific offer', async () => {
  // The same claim about Expat Financial Solutions' $2,500 plan, verified on a page that is not the company's own site.
  const elsewhere = evidence({ ledger: (l) => l.map((c) => c.claim_id === 'E9' ? { ...c, source_ids: ['S29'], source_type: 'directory listing' } : c) });
  assert.notEqual(JSON.parse(EV.sources).find((x) => x.id === 'S29').domain, 'expatfinancial.solutions');
  assert.deepEqual(only(await onLast('A directory page states that Expat Financial Solutions charges $2,500 for a one-time personalized financial plan [S29]; this is that company\'s own price for its own service, as reported by that page.', { ev: elsewhere }), /PRICE/), []);
});

test('price: unsupported attribution still blocks, wherever the page is', async () => {
  // The verified price belongs to Expat Financial Solutions. Calling it another company's own price is not supported.
  assert.ok((await onLast('Terra Relocations lists a plan at $2,500 [S5]; this is that company\'s own price for its own service.')).some((x) => /^BLOCKING/.test(x)));
  const elsewhere = evidence({ ledger: (l) => l.map((c) => c.claim_id === 'E9' ? { ...c, source_ids: ['S29'] } : c) });
  assert.ok((await onLast('A directory page gives $2,500 for a plan [S29]; this is Kismet Travels & Tours\' own pricing.', { ev: elsewhere })).includes(STRETCH));
  // An entry about no company states nobody's own price.
  const anonymous = evidence({ ledger: (l) => l.map((c) => { if (c.claim_id !== 'E9') return c; const { entity, ...rest } = c; return { ...rest, claim: 'A financial planning page states that a one-time personalized financial plan is priced at $2,500.' }; }) });
  assert.ok((await onLast('A planning page prices a one-time plan at $2,500 [S5]; this is that provider\'s own pricing.', { ev: anonymous })).includes(STRETCH));
  // A claim that names the company but does not say what it charges.
  const vague = evidence({ ledger: (l) => l.map((c) => c.claim_id === 'E9' ? { ...c, claim: 'Expat Financial Solutions mentions $2,500 on its financial planning page.' } : c) });
  assert.ok((await onLast('Expat Financial Solutions mentions $2,500 [S5]; this is that company\'s own price for its own service.', { ev: vague })).includes(STRETCH));
});

test('price: "their own services on their own pages" is not a statement about a price', async () => {
  assert.match(lineOf(139), /Kismet Travels & Tours and Terra Relocations describe their own relocation services on their own pages \[S11\] \[S14\]/);
  assert.deepEqual(only(at(await check(), 139), /PRICE/), []);
});

// ---------------- 3. Gaps: model scope is not a competitor claim ----------------

const GAP = 'BLOCKING COMPETITIVE GAP STATED AS A FINDING';

test('gap: "None of these is modeled here" is about the model, and passes', async () => {
  assert.match(lineOf(250), /None of these is modeled here because the primary offer is not yet validated\./);
  assert.deepEqual(only(at(await check(), 250), /GAP/), []);
  for (const s of [
    'None of these is modeled here because the primary offer is not yet validated.',
    'None of these costs is included in the forecast, and none covers the first sale.',
    'None of the three scenarios includes paid advertising.',
  ]) assert.deepEqual(only(await onLast(s), /GAP/), [], s);
});

test('gap: an unsupported statement that no competitor offers something still blocks', async () => {
  for (const s of [
    'No competitor offers support at the decision stage.',
    'None of the competitors offers a combined financial and lifestyle planning session.',
    'Among the competitors reviewed, none explicitly addresses the pre-decision stage.',
    'None of the providers reviewed for this plan covers career planning.',
    'Among the competitors reviewed for this plan, none was identified that explicitly positions around the pre-decision stage.',
  ]) assert.ok((await onLast(s)).includes(GAP), s);
  assert.deepEqual(only(await onLast('Among the competitors reviewed, it is a hypothesis worth testing that none explicitly addresses the pre-decision stage.'), /GAP/), []);
});

// ---------------- 4. Review noise ----------------

test('noise: a sentence that says a company could not be verified is not "describing" it', async () => {
  assert.match(lineOf(73), /Three \(Elevations Travel, Move to Traveling, and BerliTravel\) could not be verified on any source page and are not used as evidence\./);
  const out = await check();
  assert.deepEqual(out.det_issues.filter((i) => /UNVERIFIED COMPANY/.test(i.type)), []);
  // Describing an unverified company is still reported, with or without the disclaimer beside it.
  assert.ok((await onLast('Elevations Travel offers concierge relocation planning for families.')).includes('MAJOR UNVERIFIED COMPANY DESCRIBED'));
  assert.ok((await onLast('Elevations Travel, which could not be verified, offers concierge relocation planning.')).includes('MAJOR UNVERIFIED COMPANY DESCRIBED'));
  // Citing a source for it is still blocking.
  assert.ok((await onLast('Elevations Travel offers concierge relocation planning [S3].')).some((x) => /^BLOCKING/.test(x)));
});

test('noise: a dated, attributed figure with its caveat in the same sentence is qualified', async () => {
  assert.match(lineOf(145), /Expat Financial Solutions' website states it charges \$2,500 for its one-time personalized financial plan \[S5\]; the page carries no publication date, so this figure may not reflect current pricing\./);
  const out = await check();
  assert.deepEqual(out.det_issues.filter((i) => /UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION/.test(i.type)), []);
  // The bare figure from the undated page is still a warning.
  assert.ok((await onLast('A one-time financial plan costs $2,500 [S5].')).includes('MAJOR UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION'));
});

// The whole-plan review was added after execution 63226. The saved verifier answer of this run predates it, so the
// replay does not ask for it (review_lines: []). It is tested on its own in exec-63226.test.mjs.
const secondPass = async (rev = fx('Apply Revisions')) => {
  const cc = await check(rev.text, { rev });
  return runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': { ...cc, review_lines: [] }, 'Apply Revisions': rev, 'Build Evidence': EV }, fx('Final QA')[1]);
};

test('noise: of the sixteen overlap warnings in the run, one was a real repeat and the rest are gone', async () => {
  const run = fx('Plan Revision Request')[1].findings.filter((f) => /SAME CLAIM/.test(f.check));
  assert.equal(run.length, 16);
  assert.ok(run.every((f) => f.severity === 'MAJOR'));
  const out = await secondPass();
  // Line 43 still carries the inference that QA-006 removed elsewhere: "It indicates that a sizeable, active population ...".
  const repeats = out.findings.filter((f) => /SAME CLAIM/.test(f.check));
  assert.deepEqual(repeats.map((f) => f.line).sort((a, b) => a - b), [43, 553]);
  const r43 = repeats.find((f) => f.line === 43);
  assert.equal(r43.severity, fx('Apply Revisions').first_findings.find((f) => f.id === 'QA-006').severity);
  assert.match(r43.quote, /^It indicates that a sizeable, active population is engaging with relocation decisions/);
  // The rest were correct disclaimers, or sentences that kept the survey fact after the inference was cut from it.
  const listed = repeats.map((f) => f.line).concat(out.possible_repeats.map((d) => d.line));
  for (const n of [138, 529, 551, 14, 67, 115, 308, 31, 374, 256, 465, 145, 122, 59]) assert.ok(!listed.includes(n), 'L' + n);
  assert.match(lineOf(308), /It does not validate \$500 for this offer\./);
  assert.match(lineOf(551), /InterNations' 2026 Expat Insider survey asked close to 7,800 expats about their reasons for moving abroad \[S29\]\. This is an anecdotal source; it shows that a survey of expats was conducted and does not establish the size of the addressable market/);
  // Line 553 is the same sentence with its examples and source IDs dropped: a confirmed repeat (see the prevalence tests).
  assert.deepEqual(out.possible_repeats, []);
});

// ---------------- Line 553: a few examples are not "widely available" ----------------

const PREVALENCE = 'BLOCKING PREVALENCE STATED WITHOUT EVIDENCE';

test('prevalence: the two sources behind line 553 are one site describing its own tools and one blog anecdote', () => {
  const led = JSON.parse(EV.research_ledger);
  assert.match(led.find((c) => c.claim_id === 'E18').claim, /Discover Wanderlust tools for digital nomads/);
  assert.match(led.find((c) => c.claim_id === 'E19').claim, /Lonely Planet Guides – This is a recent discovery of mine/);
  // The reviewer said so in the run, as a blocking finding, about the cited version of the sentence.
  const qa5 = fx('Plan Revision Request')[0].findings.find((f) => f.id === 'QA-005');
  assert.equal(qa5.severity, 'BLOCKING');
  assert.match(qa5.problem, /Neither entry establishes that free substitutes are 'widely available'/);
  assert.deepEqual(qa5.occurrences.map((o) => o.located), [139, 139, 551]);     // line 553 was not listed
});

test('prevalence: line 553 repeats the corrected sentence without its source IDs, and now blocks twice over', async () => {
  assert.match(lineOf(553), /Free substitutes are widely available and may be sufficient for customers who are comfortable researching independently\./);
  const cc = await check();
  assert.deepEqual(at(cc, 553), [PREVALENCE]);
  const out = await secondPass();
  const repeat = out.findings.find((f) => f.check === 'SAME CLAIM STILL PRESENT ELSEWHERE' && f.line === 553);
  assert.equal(repeat.severity, 'BLOCKING');
  assert.match(repeat.problem, /corrected QA-005/);
  assert.deepEqual(out.possible_repeats, []);
});

test('prevalence: unsupported generalisations block, and named examples pass', async () => {
  for (const s of [
    'Free substitutes are widely available [W2] [W3].',
    'Many free alternatives exist for this customer.',
    'Self-serve tools are readily available and commonly used.',
    'This is a crowded market with numerous providers.',
  ]) assert.ok((await onLast(s)).includes(PREVALENCE), s);
  for (const s of [
    'Free tools and content exist in this space, for example Wanderlust [W2] and BecomeNomad [W3]; how widely they are used is not established.',
    'Whether free substitutes are widely available to this customer is not established.',
    'It is a hypothesis that many free alternatives are sufficient for this customer.',
    'The model assumes video conferencing tools are available at $15 per month.',
  ]) assert.deepEqual(only(await onLast(s), /PREVALENCE/), [], s);
});

// ---------------- 5. A sample is not a population ----------------

const SIZE = 'BLOCKING POPULATION OR DEMAND STATED WITHOUT EVIDENCE';

test('sample: the ledger says a survey asked about 7,800 expats, and nothing about how many expats there are', () => {
  const e16 = JSON.parse(EV.research_ledger).find((c) => c.claim_id === 'E16');
  assert.match(e16.claim, /asked close to 7,800 expats about their life abroad/);
  assert.ok(!/large|active|growing|sizeable|demand/i.test(e16.claim + ' ' + e16.page_excerpt));
});

test('sample: lines 43 and 47 are evidence overreaches, and now block', async () => {
  assert.match(lineOf(47), /The existence of a large, active expat and relocation community suggests the underlying behavior exists\./);
  const out = await check();
  assert.deepEqual(at(out, 47), [SIZE]);
  // Line 43 says the same thing and then hedges something else: "..., but it does not establish the size of the addressable market".
  assert.match(lineOf(43), /It indicates that a sizeable, active population is engaging with relocation decisions, but it does not establish/);
  assert.deepEqual(only(at(out, 43), /POPULATION/), [SIZE]);
  assert.deepEqual(out.det_issues.filter((i) => /POPULATION/.test(i.type)).map((i) => i.line), [43, 47]);
  // The run's gate reported nothing at this line, and its three blockers were elsewhere.
  assert.ok(!fx('Delivery Gate').blockers_text.includes('L47'));
});

test('sample: equivalent statements block, cited or not', async () => {
  for (const s of [
    'InterNations\' 2026 Expat Insider survey asked close to 7,800 expats about their reasons for moving abroad, indicating an active and sizeable population engaging with relocation decisions [S29].',
    'The survey of 7,800 expats [S29] shows a large and growing market for relocation planning.',
    'There is a substantial audience for this kind of planning help.',
    'This points to strong demand among people aged 40 to 60.',
  ]) assert.ok((await onLast(s)).includes(SIZE), s);
});

test('sample: what the survey states, and a labelled hypothesis, pass', async () => {
  for (const s of [
    'InterNations\' 2026 Expat Insider survey asked close to 7,800 expats about their reasons for moving abroad [S29]. The number is the size of its sample; it does not show how many people are considering a move or that they want this offer.',
    'Whether a large community of people in your target group exists is not established.',
    'It is a hypothesis that there is a sizeable audience for this offer; the first ten conversations test it.',
    'IdeaToPlan recommends joining two or three active expat communities to find the first conversations.',
  ]) assert.deepEqual(only(await onLast(s), /POPULATION/), [], s);
});

test('sample: the writer, the reviewer and the reviser are told the same thing', async () => {
  const ctx = await runNode('founder-context.js', { 'Prepare Client Data': FOUNDER });
  assert.match(ctx.writer_system, /A survey's number of respondents is the size of its sample, not of a population/);
  assert.match(ctx.writer_system, /never write "the existence of a large community suggests"/);
  const system = JSON.parse((await check(fx('Assemble Plan').text, { firstPass: true })).qa_payload).messages[0].content;
  assert.match(system, /"A survey asked about 7,800 expats" does not establish that a population, a community, or a market is large, active, or growing/);
  const pr = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': fx('Citation Check')[0], 'Assemble Plan': fx('Assemble Plan'), 'Build Evidence': EV }, fx('Final QA')[0]);
  assert.match(JSON.parse(pr.revise_payload).messages[0].content, /Samples: a survey's number of respondents is the size of its sample/);
});

// ---------------- The held plan, rechecked as a whole ----------------

test('63223 recheck: confirmed defects, no unresolved check, and the three run blockers dismissed', async () => {
  const out = await secondPass();
  const f = out.findings;
  const confirmed = f.filter((x) => x.severity === 'BLOCKING' && !x.unresolved).map((x) => 'L' + x.line + ' ' + x.check);
  assert.ok(confirmed.includes('L43 POPULATION OR DEMAND STATED WITHOUT EVIDENCE'));
  assert.ok(confirmed.includes('L47 POPULATION OR DEMAND STATED WITHOUT EVIDENCE'));
  assert.ok(f.some((x) => x.line === 43 && x.check === 'SAME CLAIM STILL PRESENT ELSEWHERE'));
  assert.ok(confirmed.includes('L553 PREVALENCE STATED WITHOUT EVIDENCE'));
  // Two more were found by rules added after execution 63226: "the most common substitute" at L118 and providers
  // said to "serve customers who have already decided to move" at L122.
  assert.ok(confirmed.includes('L118 SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE'));
  assert.ok(confirmed.includes('L122 PROVIDER FOCUS STATED WITHOUT EVIDENCE'));
  assert.ok(f.filter((x) => x.severity === 'BLOCKING').every((x) => [43, 47, 553, 118, 122].includes(x.line)), 'every blocker is at line 43, 47, 118, 122 or 553');
  assert.equal(f.filter((x) => x.unresolved).length, 0);
  assert.ok(f.filter((x) => x.severity === 'MAJOR').every((x) => x.check === 'FINANCIAL MODEL' || x.check === 'UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION' || [43, 553].includes(x.line)));
  assert.equal(f.filter((x) => x.severity === 'MINOR').length, 2);
  // What the run's gate held on.
  const ran = fx('Delivery Gate').blockers_text;
  assert.match(ran, /CITATION ATTACHED TO THE WRONG COMPANY \| L59/);
  assert.match(ran, /PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE \| L115/);
  assert.match(ran, /COMPETITIVE GAP STATED AS A FINDING \| L250/);
  [59, 115, 250].forEach((n) => assert.ok(!f.some((x) => x.line === n && x.severity === 'BLOCKING'), 'L' + n));
  const gate = await runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD', final_findings: [] }, 'Plan Revision Request': { findings: f } });
  assert.equal(gate.blocked, true);
  assert.ok(gate.confirmed_blocker_count >= 2);
  assert.equal(gate.unresolved_check_count, 0);
});

test('63223 recheck: the baseline is the $500 scenario, unchanged', async () => {
  assert.equal(FIN.price_record.amount, 500);
  assert.equal(FIN.price_record.label, 'untested scenario assumption');
  assert.equal(FIN.cost_headroom.available_usd, 12100);
  const baseline = await runNode('test-financial-baseline.js', {});
  assert.equal(baseline.fixedScenarioPrice, 500);
  assert.equal(baseline.fixedFinancialAssumptions.price.value, 500);
});
