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
  assert.equal(sha(items), GROWTH_ITEMS_SHA);
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

const GROWTH_ITEMS_SHA = '739084b778ae386098939dc2b5d775b06f7042d8d91c096a8eb79ce45c277f9d';
const GROWTH_COMBINED_SHA = 'f4ff5d149396503992058d588306fd795e17af8f931e7de462a7fe47bb3139da';
