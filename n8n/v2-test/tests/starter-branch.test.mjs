// The Starter path through the claim review. Market research runs only for a Growth plan, so on a Starter order the
// research nodes (Build Evidence among them) never run, and a node that reads one of them without a guard stops the
// workflow. Execution 65009 (2026-10-11) stopped that way in Build Claim Review, after the customer confirmation.
// Run: node --test n8n/v2-test/tests/starter-branch.test.mjs
// No network and no model calls. There is no saved Starter execution to replay, so the Starter plan here is the
// fixture plan of execution 63237 with its citations taken out and the tier set to Starter, and the nodes that only a
// Growth run executes are left unstubbed: the harness then throws for them exactly as n8n does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runNode, ROOT } from './harness.mjs';
import { f26, EV, FOUNDER, FIN, REV, LEDGER, VERIFIER, ALL_YES, ideal, respond, buildBatches, combine, clone } from './claim-helpers.mjs';

// Nodes that run only on the Growth branch. None of them is stubbed in a Starter run below.
const GROWTH_ONLY = ['Sanitize Data', 'Distill Search Query', 'Brave Search', 'Growth Research', 'Market Research', 'Collect Evidence', 'Fetch Source Pages', 'Build Verification Request', 'Verify Claims', 'Build Recheck Request', 'Verify Corrections', 'Build Evidence', 'Build Growth Payload', 'Growth Plan Generator1', 'Format Growth Output1'];
// Code nodes a Starter order passes through, from the financial request to the gate.
const STARTER_PATH = ['build-financial-request.js', 'compute-financials.js', 'assemble-plan.js', 'citation-check.js', 'build-claim-review.js', 'combine-claim-review.js', 'plan-revision-request.js', 'apply-revisions.js', 'finalize-plan.js', 'delivery-gate.js', 'format-plan-html.js'];

const uncite = (t) => String(t || '').replace(/[ \t]*\[[SW]\d+\]/g, '');
const STARTER = { ...clone(FOUNDER), tier: 'Starter', package: 'Starter' };
const S_ASM = { ...clone(f26('Assemble Plan')), text: uncite(f26('Assemble Plan').text) };
const S_REV = { ...clone(REV), text: uncite(REV.text) };
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const flatRecords = (cr) => cr.records.flatMap((r) => (r.parts ? r.parts : [r]));

// The Starter chain, with only the nodes a Starter run has executed.
const sCheck = () => runNode('citation-check.js', { 'Founder Context': STARTER, 'Compute Financials': FIN, 'Assemble Plan': S_ASM, 'Apply Revisions': S_REV });
const sBatches = async () => { const cc = await sCheck(); return { cc, items: (await runNode('build-claim-review.js', { 'Founder Context': STARTER, 'Citation Check': cc, 'Apply Revisions': S_REV }, VERIFIER)).map((i) => i.json) }; };
const sCombine = async (items, responses) => (await runNode('combine-claim-review.js', { 'Build Claim Review': items, 'Founder Context': STARTER, 'Compute Financials': FIN }, { __items: responses }))[0].json;
const sFinish = (cc, combined) => runNode('plan-revision-request.js', { 'Founder Context': STARTER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': S_REV }, combined);
const sGate = (out) => runNode('delivery-gate.js', { 'Finalize Plan': { status: 'REVIEW', final_findings: [] }, 'Plan Revision Request': out });

test('starter: Build Claim Review runs when Build Evidence has not run, and says the plan is unresearched', async () => {
  const { cc, items } = await sBatches();
  assert.equal(cc.attempt, 1);
  assert.equal(cc.claim_contract, true);
  assert.ok(items.length >= 2, 'the plan is split into more than one batch');
  const map = items[0].claim_map;
  assert.equal(map.research, 'not_run');
  assert.ok(map.claims.length > 300);
  assert.deepEqual(map.coverage.unclassified, []);
  // No claim is offered a ledger entry, because there is no ledger.
  assert.deepEqual(map.claims.filter((c) => c.candidates.length), []);
  assert.deepEqual(map.claims.filter((c) => c.names.length), []);
  for (const b of items) {
    const user = JSON.parse(b.payload).messages[1].content;
    assert.match(user, /LEDGER \(every verified entry; the only external evidence there is\)\nNone\. No market research was run for this plan, so there is no external evidence\. No EXTERNAL claim can be supported/);
    // Nothing of the Growth fixture's research reaches the request.
    for (const e of LEDGER) assert.ok(!user.includes(e.claim_id + ' | about:'), 'ledger entry ' + e.claim_id + ' in a Starter request');
    assert.ok(!/ENTRIES BESIDE IT \(exact text\):\n {4}(?!none:)/.test(user), 'a claim was shown an entry');
  }
});

test('starter: the claim review, the revision request and the gate all run with no Growth-only node', async () => {
  const { cc, items } = await sBatches();
  const combined = await sCombine(items, respond(items));
  const cr = combined.claim_review;
  assert.equal(cr.research, 'not_run');
  assert.equal(cr.claims, items[0].claim_map.claims.length);
  const out = await sFinish(cc, combined);
  assert.ok(Array.isArray(out.findings));
  const gate = await sGate(out);
  assert.equal(typeof gate.blocked, 'boolean');
  assert.ok(['changes_requested', 'awaiting_approval'].includes(gate.version_status));
  // The report is written too. Finalize Plan reads the research nodes only inside guards.
  const fin = await runNode('finalize-plan.js', { 'Founder Context': STARTER, 'Compute Financials': FIN, 'Assemble Plan': S_ASM, 'Apply Revisions': S_REV, 'Citation Check': cc, 'Plan Revision Request': out, 'Final QA': f26('Final QA'), 'Revise Plan': f26('Revise Plan'), 'Financial Assumptions': f26('Financial Assumptions') });
  assert.equal(typeof fin.report, 'string');
  assert.deepEqual(fin.sources_cited || [], []);
});

test('starter: no external claim is ever settled as supported, whatever the reviewer answers', async () => {
  const { cc, items } = await sBatches();
  const claims = items[0].claim_map.claims;
  const real = LEDGER[0];
  // A reviewer that calls every claim an externally supported fact, naming a real entry of another plan's ledger,
  // quoting its real words, and answering yes on every aspect. Nothing in a Starter run can back that up.
  const over = {};
  claims.forEach((c) => { over[c.id] = { class: 'EXTERNAL', supported: true, entries: [real.claim_id], entry_quote: String(real.page_excerpt || real.claim).slice(0, 24), aspects: ALL_YES }; });
  const lying = await sCombine(items, respond(items, over));
  const recs = flatRecords(lying.claim_review);
  assert.deepEqual(recs.filter((r) => r.status === 'settled' && r.cls === 'EXTERNAL'), []);
  assert.ok(recs.filter((r) => r.status === 'open').length > 300, 'the claims stay unreviewed');
  const out = await sFinish(cc, lying);
  const open = out.findings.find((f) => f.id === 'CL-OPEN');
  assert.deepEqual([open.severity, open.unresolved, open.check], ['BLOCKING', true, 'CLAIM REVIEW IS INCOMPLETE']);
  const gate = await sGate(out);
  assert.equal(gate.blocked, true);
  assert.equal(gate.version_status, 'changes_requested');

  // Supported, and naming no entry at all: still not settled.
  const one = claims.find((c) => ideal(c).class === 'EXTERNAL') || claims[0];
  const bare = await sCombine(items, respond(items, { [one.id]: { class: 'EXTERNAL', supported: true, entries: [], aspects: ALL_YES } }));
  assert.equal(flatRecords(bare.claim_review).filter((r) => r.status === 'settled' && r.cls === 'EXTERNAL').length, 0);
  assert.equal((await sGate(await sFinish(cc, bare))).blocked, true);

  // The honest answer for an external statement in an unresearched plan is "unsupported", and that is a confirmed
  // defect at its sentence, not a pass.
  const honest = await sCombine(items, respond(items, { [one.id]: { class: 'EXTERNAL', supported: false, missing: 'no research was run' } }));
  const rec = flatRecords(honest.claim_review).find((r) => r.id === one.id);
  assert.equal(rec.status, 'defect');
  const outH = await sFinish(cc, honest);
  assert.ok(outH.findings.some((f) => f.severity === 'BLOCKING' && f.check === 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY' && f.line === one.line));
  assert.equal((await sGate(outH)).blocked, true);
});

test('starter: on the first pass nothing is asked, as before', async () => {
  const cc0 = await runNode('citation-check.js', { 'Founder Context': STARTER, 'Compute Financials': FIN, 'Assemble Plan': S_ASM });
  assert.equal(cc0.attempt, 0);
  const out = await runNode('build-claim-review.js', { 'Founder Context': STARTER, 'Citation Check': cc0 }, VERIFIER);
  assert.equal(out.length, 1);
  assert.equal(out[0].json.claim_skip, true);
});

test('growth: Build Evidence is still required, and both nodes stop without it', async () => {
  const { cc, items } = await buildBatches();
  await assert.rejects(runNode('build-claim-review.js', { 'Founder Context': FOUNDER, 'Citation Check': cc, 'Apply Revisions': REV }, VERIFIER), /Node has not run: Build Evidence/);
  await assert.rejects(runNode('combine-claim-review.js', { 'Build Claim Review': items, 'Founder Context': FOUNDER, 'Compute Financials': FIN }, { __items: respond(items) }), /Node has not run: Build Evidence/);
});

test('growth: with Build Evidence the requests and the combined review are exactly what they were before the fix', async () => {
  assert.equal(FOUNDER.tier, 'Growth');
  const { items } = await buildBatches();
  assert.equal(items[0].claim_map.claims.length, 499);
  assert.ok(!('research' in items[0].claim_map));
  const user = JSON.parse(items[0].payload).messages[1].content;
  assert.ok(user.includes(LEDGER[0].claim_id + ' | about:'), 'the ledger is in the request');
  assert.ok(!user.includes('No market research was run'));
  const combined = await combine(items, respond(items));
  assert.ok(!('research' in combined.claim_review));
  // Digests of the output of the unpatched nodes on this fixture, taken at commit ba7d201 before the change.
  // The output limit was raised from 8,000 to 16,000 on 2026-10-12 (see output-limits.test.mjs). Every request must
  // carry the new limit, and apart from that one number be exactly what it was: the old digest proves the second.
  assert.ok(items.every((b) => b.payload.includes('"max_tokens":16000')));
  const withOldLimit = items.map((b) => ({ ...b, payload: b.payload.replace('"max_tokens":16000', '"max_tokens":8000') }));
  assert.equal(sha(withOldLimit), GROWTH_ITEMS_SHA);
  assert.equal(sha(combined), GROWTH_COMBINED_SHA);
});

test('branch dependency: no node on the Starter path reads a Growth-only node outside a guard', () => {
  const problems = [];
  for (const file of STARTER_PATH) {
    const lines = readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
    lines.forEach((l, i) => {
      for (const name of GROWTH_ONLY) {
        const at = l.indexOf("$('" + name + "')");
        if (at < 0) continue;
        const before = l.slice(0, at);
        // Guarded: inside a try on the same line, or chosen by the tier ("researched ? ... : {}").
        const guarded = /\btry\s*\{/.test(before) || /\bresearched\s*\?\s*\(?\s*$/.test(before);
        if (!guarded) problems.push(file + ':' + (i + 1) + ' reads ' + name + ' with no guard');
      }
    });
  }
  assert.deepEqual(problems, []);
});

// ---------------- Two false positives found in execution 65050 (2026-10-11) ----------------
// 1. "modelled" was not read as a label where "modeled" is. 2. The Starter writer is told to say that no research was
// done, and the review then called that sentence a founder detail missing from the intake.

const NO_COMPETITOR = 'No competitor research was done for this plan.';
const NO_MARKET = 'Market research was not part of this plan.';
const OTHERS_CHARGE = 'Other bookkeeping services charge about $300 a month.';
const JOINED = 'No competitor research was done for this plan, and other bookkeeping services charge about $300 a month.';
const withLines = (rev, lines) => ({ ...clone(rev), text: rev.text + '\n\n' + lines.join('\n\n') + '\n' });
const byText = (items, text) => { const c = items[0].claim_map.claims.find((x) => x.text === text); if (!c) throw new Error('no claim with the text: ' + text); return c; };
const recOf = (cr, id) => cr.records.find((r) => r.id === id);
const FOUNDER_NO = { class: 'FOUNDER', supported: false, missing: 'the intake does not state this' };
const EXTERNAL_NO = { class: 'EXTERNAL', supported: false, missing: 'no ledger entry states this' };
// A Starter run over a plan with extra lines at its end. stubs adds to, or replaces, what the combine node can read.
const sRun = async (lines, answers, { stubs = {}, editItems = (x) => x } = {}) => {
  const rev = withLines(S_REV, lines);
  const cc = await runNode('citation-check.js', { 'Founder Context': STARTER, 'Compute Financials': FIN, 'Assemble Plan': S_ASM, 'Apply Revisions': rev });
  const items = editItems((await runNode('build-claim-review.js', { 'Founder Context': STARTER, 'Citation Check': cc, 'Apply Revisions': rev }, VERIFIER)).map((i) => i.json));
  const over = {}; for (const [text, a] of Object.entries(answers)) over[byText(items, text).id] = a;
  const combined = (await runNode('combine-claim-review.js', { 'Build Claim Review': items, 'Founder Context': STARTER, 'Compute Financials': FIN, ...stubs }, { __items: respond(items, over) }))[0].json;
  const out = await runNode('plan-revision-request.js', { 'Founder Context': STARTER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev }, combined);
  return { items, cr: combined.claim_review, out, gate: await sGate(out), rec: (text) => recOf(combined.claim_review, byText(items, text).id) };
};

test('modelled: it labels an assumption wherever "modeled" does, and nothing else changes', async () => {
  const UK = 'No paid acquisition is modelled.', US = 'No paid acquisition is modeled.', PLAIN = 'No paid acquisition is planned.';
  const label = (w) => ({ class: 'ASSUMPTION', label: w });
  const r = await sRun([UK, US, PLAIN], { [UK]: label('modelled'), [US]: label('modeled'), [PLAIN]: label('planned') });
  assert.equal(r.rec(US).status, 'settled');
  assert.equal(r.rec(UK).status, 'settled');
  assert.deepEqual([r.rec(UK).cls, r.rec(UK).status], [r.rec(US).cls, r.rec(US).status]);
  // A sentence with no label word is still a defect: the spelling is all that was added.
  assert.deepEqual([r.rec(PLAIN).status, r.rec(PLAIN).check], ['defect', 'ASSUMPTION NOT LABELLED IN THE TEXT']);
  // The words that say something is not established: "not yet modelled" is read as "not yet modeled" is.
  const A_UK = 'Referral volume is not yet modelled.', A_US = 'Referral volume is not yet modeled.';
  const a = await sRun([A_UK, A_US], { [A_UK]: EXTERNAL_NO, [A_US]: EXTERNAL_NO });
  assert.deepEqual([a.rec(A_UK).status, a.rec(A_UK).check || ''], [a.rec(A_US).status, a.rec(A_US).check || '']);
  assert.notEqual(a.rec(A_UK).status, 'defect');
});

test('no research: in a Starter run the two statements are settled by code, on the evidence of the run', async () => {
  const r = await sRun([NO_COMPETITOR, NO_MARKET], { [NO_COMPETITOR]: FOUNDER_NO, [NO_MARKET]: FOUNDER_NO });
  for (const t of [NO_COMPETITOR, NO_MARKET]) {
    const rec = r.rec(t);
    assert.deepEqual([rec.status, rec.cls], ['settled', 'RESEARCH NOT RUN'], t);
    assert.match(rec.by_code, /confirmed by this run: the research nodes did not execute/);
  }
  assert.equal(r.cr.by_code['RESEARCH NOT RUN'], 2);
  // It is settled whatever class the reviewer gave it, and it is never counted as an external claim with support.
  const again = await sRun([NO_COMPETITOR], { [NO_COMPETITOR]: { class: 'EXTERNAL', supported: false, missing: 'no entry' } });
  assert.equal(again.rec(NO_COMPETITOR).cls, 'RESEARCH NOT RUN');
  assert.deepEqual(flatRecords(again.cr).filter((x) => x.status === 'settled' && x.cls === 'EXTERNAL'), []);
});

test('no research: nothing else in the sentence or the paragraph is excused', async () => {
  // The next sentence of the same paragraph is an external claim with no evidence. It stays a blocking defect.
  const para = await sRun([NO_COMPETITOR + ' ' + OTHERS_CHARGE], { [NO_COMPETITOR]: FOUNDER_NO, [OTHERS_CHARGE]: EXTERNAL_NO });
  assert.equal(para.rec(NO_COMPETITOR).status, 'settled');
  assert.deepEqual([para.rec(OTHERS_CHARGE).status, para.rec(OTHERS_CHARGE).check], ['defect', 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY']);
  assert.ok(para.out.findings.some((f) => f.severity === 'BLOCKING' && f.check === 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY' && f.line === byText(para.items, OTHERS_CHARGE).line));
  assert.equal(para.gate.blocked, true);
  // Joined into one sentence, the statement does not cover the rest: the whole sentence is judged, and is a defect.
  const joined = await sRun([JOINED], { [JOINED]: FOUNDER_NO });
  assert.deepEqual([joined.rec(JOINED).status, joined.rec(JOINED).check], ['defect', 'FOUNDER DETAIL NOT IN THE INTAKE']);
  // Split by the reviewer, each part is judged on its own: the statement is settled and the claim beside it is not.
  const first = 'No competitor research was done for this plan,', second = 'and other bookkeeping services charge about $300 a month.';
  const split = await sRun([JOINED], { [JOINED]: { split: [{ text: first, ...FOUNDER_NO }, { text: second, ...EXTERNAL_NO }] } });
  const parts = split.rec(JOINED).parts || [];
  if (parts.length === 2) {
    assert.equal(parts[1].status, 'defect');
    assert.equal(parts[1].check, 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY');
  } else assert.notEqual(split.rec(JOINED).status, 'settled');
  assert.equal(split.gate.blocked, true);
  // A citation on the statement, or words added to it, and it is no longer the statement.
  const more = 'No competitor research was done for this plan because competitors are few.';
  const extra = await sRun([more], { [more]: FOUNDER_NO });
  assert.equal(extra.rec(more).status, 'defect');
});

test('no research: the statement is not accepted unless the run itself shows that research did not run', async () => {
  // A Starter plan in an execution where Build Evidence has output: research ran, so the sentence is false.
  const ran = await sRun([NO_COMPETITOR], { [NO_COMPETITOR]: FOUNDER_NO }, { stubs: { 'Build Evidence': EV } });
  assert.deepEqual([ran.rec(NO_COMPETITOR).status, ran.rec(NO_COMPETITOR).check], ['defect', 'FOUNDER DETAIL NOT IN THE INTAKE']);
  // Build Claim Review did not mark the claim map as unresearched.
  const unmarked = await sRun([NO_COMPETITOR], { [NO_COMPETITOR]: FOUNDER_NO }, { editItems: (items) => { delete items[0].claim_map.research; return items; } });
  assert.equal(unmarked.rec(NO_COMPETITOR).status, 'defect');
});

test('no research: in a researched Growth plan the same sentences are judged as before, and unsupported claims stay blocked', async () => {
  const rev = withLines(REV, [NO_COMPETITOR, NO_MARKET, OTHERS_CHARGE]);
  const { cc, items } = await buildBatches(rev);
  const id = (t) => byText(items, t).id;
  const combined = await combine(items, respond(items, { [id(NO_COMPETITOR)]: FOUNDER_NO, [id(NO_MARKET)]: FOUNDER_NO, [id(OTHERS_CHARGE)]: EXTERNAL_NO }));
  const cr = combined.claim_review;
  assert.deepEqual([recOf(cr, id(NO_COMPETITOR)).status, recOf(cr, id(NO_COMPETITOR)).check], ['defect', 'FOUNDER DETAIL NOT IN THE INTAKE']);
  assert.deepEqual([recOf(cr, id(NO_MARKET)).status, recOf(cr, id(NO_MARKET)).check], ['defect', 'FOUNDER DETAIL NOT IN THE INTAKE']);
  assert.deepEqual([recOf(cr, id(OTHERS_CHARGE)).status, recOf(cr, id(OTHERS_CHARGE)).check], ['defect', 'EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY']);
  assert.ok(!cr.by_code || !('RESEARCH NOT RUN' in cr.by_code));
  const out = await runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, combined);
  assert.equal((await runNode('delivery-gate.js', { 'Finalize Plan': { status: 'REVIEW', final_findings: [] }, 'Plan Revision Request': out })).blocked, true);
});

const GROWTH_ITEMS_SHA = '739084b778ae386098939dc2b5d775b06f7042d8d91c096a8eb79ce45c277f9d';
const GROWTH_COMBINED_SHA = 'f4ff5d149396503992058d588306fd795e17af8f931e7de462a7fe47bb3139da';
