// Regression checks for citation integrity, run against the preserved output of execution 63211.
// Run: node --test n8n/v2-test/tests/citation-integrity.test.mjs n8n/v2-test/tests/source-verification.test.mjs
// No network and no model calls. Each test runs the same code that is pasted into the n8n Code nodes.
// Evidence is built through the whole evidence chain (Collect Evidence, Fetch Source Pages, Build Verification
// Request, Build Evidence) with captured pages and a scripted verifier that calls every claim supported, so what
// is tested here is source identity and the plan checks, not the verifier. See source-verification.test.mjs for that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNode, fixture, clone } from './harness.mjs';
import { pipeline, research, withRenderedFB } from './pipeline.mjs';

const run = (stubs) => pipeline({ stubs, pagesHook: withRenderedFB });
const buildEvidence = async () => (await run()).ev;
const siteOfClaim = (p, c) => p.sources.find((s) => s.id === c.source_ids[0]).domain;
const about = (p, name) => p.ledger.filter((c) => c.claim.startsWith(name));

// Citation Check with the delivered plan (or a variant of it) and a chosen evidence set.
const citationCheck = async (ev, planText) => {
  const rev = clone(fixture('Apply Revisions'));
  if (planText !== undefined) rev.text = planText;
  return runNode('citation-check.js', {
    'Founder Context': fixture('Founder Context'),
    'Compute Financials': fixture('Compute Financials'),
    'Assemble Plan': fixture('Assemble Plan'),
    'Apply Revisions': rev,
    'Build Evidence': ev,
    'Growth Plan Generator1': fixture('Growth Plan Generator1'),
  });
};
const delivered = () => fixture('Apply Revisions').text;
const withLine = (line) => delivered() + '\n\n' + line + '\n';
const lastLine = (text) => text.replace(/\n+$/, '').split('\n').length;
const INTEGRITY = ['CITATION ATTACHED TO THE WRONG COMPANY', 'CITATION NOT TIED TO THIS COMPANY', 'FIGURE CITED TO THE WRONG SOURCE', 'UNSUPPORTED STATISTIC', 'SOURCE DATE NOTE ON THE WRONG SOURCE'];
const on = (out, L) => out.det_issues.filter((i) => i.line === L);

test('root cause: the pre-fix Build Evidence ties company claims to another company\'s page', async () => {
  const ev = await runNode('base/build-evidence.before.js', research());
  const p = { sources: JSON.parse(ev.sources), ledger: JSON.parse(ev.research_ledger) };
  const fb = about(p, 'Freedom & Beyond');
  assert.ok(fb.length >= 3, 'the research output contains Freedom & Beyond claims');
  fb.forEach((c) => assert.equal(siteOfClaim(p, c), 'larelocationgroup.com'));
  assert.equal(siteOfClaim(p, about(p, 'Global Citizen Life')[0]), 'expatslivingabroad.com');
  assert.equal(siteOfClaim(p, about(p, 'Harmony in the Wild')[0]), 'freedomandbeyond.co');
  assert.equal(siteOfClaim(p, about(p, 'Expats Living Abroad')[0]), 'harmonyinthewild.com');
  // The 2016 date belongs to the Harmony in the Wild claim, but the pre-fix code stamped it on Freedom & Beyond's record.
  assert.match(p.sources.find((s) => s.domain === 'freedomandbeyond.co').published, /^2016-01-01/);
});

test('known mismatches: every verified company claim sits on a page that names that company', async () => {
  const p = await run();
  const expect = { 'Freedom & Beyond': 'freedomandbeyond.co', 'Expats Living Abroad': 'expatslivingabroad.com', 'Global Citizen Life': 'globalcitizenlife.org', 'LA Relocation Group': 'larelocationgroup.com', 'Start Abroad': 'startabroad.com', 'Move Abroad Coach': 'moveabroadcoach.com', 'ExpatExact': 'expatexact.com' };
  for (const [name, domain] of Object.entries(expect)) {
    const mine = about(p, name);
    assert.ok(mine.length > 0, name + ' has claims in the ledger');
    mine.forEach((c) => assert.equal(siteOfClaim(p, c), domain, name));
  }
  // Harmony in the Wild's page could not be read, so nothing about it is in the ledger at all.
  assert.equal(about(p, 'Harmony in the Wild').length, 0);
  // LA Relocation Group's record carries no one else's price.
  const la = p.sources.find((s) => s.domain === 'larelocationgroup.com').id;
  assert.ok(!p.ledger.some((c) => c.source_ids.includes(la) && /\$/.test(c.claim)));
});

test('source dates come from the fetched page, never from another source or from the research tool', async () => {
  const p = await run();
  p.sources.filter((s) => s.kind === 'research').forEach((s) => assert.ok(!/2016/.test(String(s.published)), s.id));
  assert.equal(p.sources.find((s) => s.domain === 'freedomandbeyond.co').published, 'date not shown');
  assert.equal(p.sources.find((s) => s.domain === 'harmonyinthewild.com').published, 'date not shown');
});

test('source reordering: shuffling the returned source list does not move a claim to another company', async () => {
  for (const order of ['reverse', 'rotate']) {
    const stubs = research();
    const ann = stubs['Growth Research'].choices[0].message.annotations;
    stubs['Growth Research'].choices[0].message.annotations = order === 'reverse' ? ann.slice().reverse() : ann.slice(4).concat(ann.slice(0, 4));
    const p = await run(stubs);
    about(p, 'Freedom & Beyond').forEach((c) => assert.equal(siteOfClaim(p, c), 'freedomandbeyond.co', order));
    about(p, 'LA Relocation Group').forEach((c) => assert.equal(siteOfClaim(p, c), 'larelocationgroup.com', order));
    about(p, 'Traveling with Kristin').forEach((c) => assert.equal(siteOfClaim(p, c), 'travelingwithkristin.com', order));
    assert.ok(about(p, 'Freedom & Beyond').length >= 2, order);
    assert.ok(about(p, 'LA Relocation Group').length >= 3, order);
  }
});

test('stable IDs: a URL keeps one ID and each ID maps to one URL', async () => {
  const a = await run();
  const b = await run();
  assert.deepEqual(a.sources.map((s) => [s.id, s.url]), b.sources.map((s) => [s.id, s.url]));
  assert.equal(new Set(a.sources.map((s) => s.id)).size, a.sources.length);
  assert.equal(new Set(a.sources.map((s) => s.url)).size, a.sources.length);
});

test('a claim with a page address is checked against that page first, and a claim no page supports is discarded', async () => {
  const stubs = research();
  const msg = stubs['Growth Research'].choices[0].message;
  msg.content = '## C1 Direct competitors\n'
    + 'CLAIM: Freedom & Beyond lists a $400 strategy session. | SOURCE TYPE: company own website | PUBLISHED: date not shown | URL: https://freedomandbeyond.co/ [1]\n'
    + 'CLAIM: Madeup Movers sells a $987 plan. | SOURCE TYPE: company own website | PUBLISHED: date not shown | URL: https://madeup-movers.example/pricing [2]\n';
  const p = await run(stubs);
  const fb = p.ledger.find((c) => c.claim.startsWith('Freedom & Beyond'));
  assert.equal(siteOfClaim(p, fb), 'freedomandbeyond.co');
  assert.match(fb.attribution, /page address given by the research tool/);
  assert.ok(!p.ledger.some((c) => /Madeup Movers/.test(c.claim)));
  assert.ok(p.excluded.some((x) => /Madeup Movers/.test(x.claim)));
  // The excluded claim's own words are withheld from the writer.
  assert.ok(!/Madeup Movers|987/.test(p.ev.research_gaps));
  // The address the research tool wrote was not a retrieved source, so it was never fetched.
  assert.ok(!p.ctx.calls.some((u) => /madeup-movers/.test(u)));
});

test('QA on the delivered plan: the four known wrong-company citations are blocking', async () => {
  const out = await citationCheck(await buildEvidence());
  const wrong = out.det_issues.filter((i) => i.type === 'CITATION ATTACHED TO THE WRONG COMPANY' || i.type === 'CITATION NOT TIED TO THIS COMPANY');
  wrong.forEach((i) => assert.equal(i.severity, 'BLOCKING'));
  const has = (name, id) => wrong.some((i) => i.detail.includes('about ' + name) && i.detail.includes('cites ' + id));
  assert.ok(has('Freedom & Beyond', 'S5'), 'Freedom & Beyond cited to S5');
  assert.ok(has('Harmony in the Wild', 'S10'), 'Harmony in the Wild cited to S10');
  assert.ok(has('Expats Living Abroad', 'S11'), 'Expats Living Abroad cited to S11');
  assert.ok(has('Global Citizen Life', 'S4'), 'Global Citizen Life cited to S4');
  // Freedom & Beyond's prices are cited to LA Relocation Group's page, including where the company is not named.
  const fig = out.det_issues.filter((i) => i.type === 'FIGURE CITED TO THE WRONG SOURCE' && /S10/.test(i.detail) && /cites [^.]*\bS5\b/.test(i.detail));
  fig.forEach((i) => assert.equal(i.severity, 'BLOCKING'));
  assert.ok(fig.some((i) => /\b400\b/.test(i.detail)), 'the $400 figure is flagged where it cites S5');
});

test('QA on the delivered plan: the 2016 date note is on the wrong source', async () => {
  const out = await citationCheck(await buildEvidence());
  const note = out.det_issues.filter((i) => i.type === 'SOURCE DATE NOTE ON THE WRONG SOURCE');
  assert.equal(note.length, 1);
  assert.equal(note[0].severity, 'BLOCKING');
  assert.equal(note[0].line, 144);
  assert.match(note[0].detail, /dated 2016/);
});

test('an existing source ID on the wrong claim is blocking', async () => {
  const text = withLine('The digital nomad services market reached $54.49 billion in 2026 [S25].');
  const out = await citationCheck(await buildEvidence(), text);
  const hit = on(out, lastLine(text)).filter((i) => i.type === 'FIGURE CITED TO THE WRONG SOURCE');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].severity, 'BLOCKING');
  assert.match(hit[0].detail, /S27/);
});

test('an unsupported statistic on a cited line is blocking', async () => {
  const text = withLine('There are 99 million lifestyle planners in Europe [S27].');
  const out = await citationCheck(await buildEvidence(), text);
  const hit = on(out, lastLine(text)).filter((i) => i.type === 'UNSUPPORTED STATISTIC');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].severity, 'BLOCKING');
});

test('correct citations raise no integrity finding', async () => {
  for (const line of [
    'The digital nomad services market grew from $44.65 billion in 2025 to $54.49 billion in 2026, at a CAGR of 22.1%, globally [S27].',
    'Freedom and Beyond lists a $400 strategy call [S10].',
  ]) {
    const text = withLine(line);
    const out = await citationCheck(await buildEvidence(), text);
    assert.deepEqual(on(out, lastLine(text)).filter((i) => INTEGRITY.includes(i.type)).map((i) => i.type), [], line);
  }
});

test('an unverified statistic stated as fact is a warning, and the qualified wording is accepted', async () => {
  const ev = await buildEvidence();
  const bare = withLine('The number of digital nomads in the United States will reach 72 million in 2026 [S17].');
  const a = await citationCheck(ev, bare);
  const warn = on(a, lastLine(bare)).filter((i) => i.type === 'UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION');
  assert.equal(warn.length, 1);
  assert.equal(warn[0].severity, 'MAJOR');
  const hedged = withLine('One undated source estimates that the number of digital nomads in the United States will reach 72 million in 2026 [S17]; treat this as directional.');
  const b = await citationCheck(ev, hedged);
  assert.equal(on(b, lastLine(hedged)).filter((i) => i.type === 'UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION').length, 0);
});

// The findings list in the shape Plan Revision Request produces from automated checks.
const asFindings = (out) => out.det_issues.map((i, n) => ({ id: 'AUTO-' + String(n + 1).padStart(3, '0'), severity: i.severity, source: 'Automated check', check: i.type, problem: i.detail, line: i.line, quote: i.quote, occurrences: i.line ? [{ line: i.line }] : [] }));
const gate = (finalize, findings) => runNode('delivery-gate.js', { 'Finalize Plan': finalize, 'Plan Revision Request': { findings } });

test('delivery gate: the delivered plan is held and cannot enter approval', async () => {
  const out = await citationCheck(await buildEvidence());
  const findings = asFindings(out);
  const status = findings.some((f) => f.severity === 'BLOCKING') ? 'HOLD' : findings.some((f) => f.severity === 'MAJOR') ? 'REVIEW' : 'SEND';
  assert.equal(status, 'HOLD');
  const g = await gate({ status }, findings);
  assert.equal(g.blocked, true);
  assert.equal(g.version_status, 'changes_requested');
  assert.ok(g.citation_blocker_count >= 4);
});

test('delivery gate: warnings alone do not block, and it fails closed', async () => {
  const warn = [{ id: 'QA-001', severity: 'MAJOR', check: 'Repetition', problem: 'x' }];
  const open = await gate({ status: 'REVIEW' }, warn);
  assert.equal(open.blocked, false);
  assert.equal(open.version_status, 'awaiting_approval');
  assert.equal(open.warning_count, 1);
  // A blocking finding blocks even if the status says otherwise.
  const mismatch = await gate({ status: 'REVIEW' }, [{ id: 'AUTO-001', severity: 'BLOCKING', check: 'CITATION ATTACHED TO THE WRONG COMPANY', problem: 'x' }]);
  assert.equal(mismatch.blocked, true);
  assert.equal(mismatch.citation_blocker_count, 1);
  // A missing or unknown status blocks.
  assert.equal((await gate({}, [])).blocked, true);
  assert.equal((await gate({ status: 'OK' }, [])).version_status, 'changes_requested');
  assert.equal((await gate({ status: 'HOLD' }, [])).blocked, true);
});
