// Execution 63257, the final acceptance fixture: one end-to-end generation in v2 Test, held by the gate with 112
// confirmed defects and 1 unresolved check. The saved records, plan, PDF and model answers are kept as they were. This
// file rechecks the saved answers under the corrected code. No network and no model.
// Run: node --test n8n/v2-test/tests/exec-63257.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runNode, ROOT } from './harness.mjs';

const D = path.join(ROOT, 'fixtures', 'exec-63257');
const raw = (n) => readFileSync(path.join(D, n));
const j = (n) => JSON.parse(readFileSync(path.join(D, n + '.json'), 'utf8'));
const one = (v) => (Array.isArray(v) ? v[0] : v);
const sha = (n) => createHash('sha256').update(raw(n)).digest('hex');
const base = () => ({ 'Founder Context': j('Founder Context'), 'Compute Financials': j('Compute Financials'), 'Assemble Plan': j('Assemble Plan'), 'Build Evidence': j('Build Evidence'), 'Growth Plan Generator1': j('Growth Plan Generator1'), 'Apply Revisions': j('Apply Revisions') });

let cached;
const recheck = async () => {
  if (cached) return cached;
  const b = base();
  const cc = await runNode('citation-check.js', b);
  const items = (await runNode('build-claim-review.js', { ...b, 'Citation Check': cc }, j('Final QA')[1])).map((i) => i.json);
  const combined = (await runNode('combine-claim-review.js', { ...b, 'Build Claim Review': items }, { __items: j('Review Claims') }))[0].json;
  const prr = await runNode('plan-revision-request.js', { ...b, 'Citation Check': cc }, combined);
  const gate = await runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD', final_findings: [] }, 'Plan Revision Request': prr });
  cached = { cc, items, cr: combined.claim_review, prr, gate };
  return cached;
};
const at = (list, line) => list.filter((x) => x.line === line);

test('63257: the saved plan, PDF, review and model answers are untouched, and the saved gate result stands', () => {
  assert.equal(sha('final-plan.md'), '817b46e8be2f244a3f75bef848ac42d2b2b61d138db89095ac67850ee160124d');
  assert.equal(sha('plan-v1.pdf'), 'c15974a0fc81dad7da0f0a3b339e56d9a2c2c215691d8123652a5fe833f79e00');
  assert.equal(sha('claim-review.json').slice(0, 14), 'f9f37df5cb7017');
  assert.equal(sha('Review Claims.json').slice(0, 14), '358c0075c99ff0');
  const g = one(j('Delivery Gate'));
  assert.deepEqual([g.blocked, g.confirmed_blocker_count, g.unresolved_check_count], [true, 112, 1]);
  const saved = j('claim-review');
  assert.deepEqual([saved.claims, saved.settled, saved.defects.length, saved.open.length, saved.duplicates.length, saved.contradictory.length], [511, 338, 98, 75, 78, 7]);
});

test('63257 recheck: the same answers, read by the corrected code', async () => {
  const { cr, items } = await recheck();
  assert.deepEqual([cr.claims, items.length, cr.rejected_responses.length, cr.failed_batches.length], [511, 13, 0, 0]);
  assert.deepEqual([cr.settled, cr.defects.length, cr.open.length, cr.contradictory.length], [474, 33, 4, 0]);
  // Computed financial statements go to the model's own numbers, date notes to the source record, and both are
  // decided by code. Statements that evidence or intake information is missing settle on the model's own reading.
  assert.deepEqual(cr.by_code, { MODEL: 96, 'DATE NOTE': 4 });
  assert.equal(cr.on_judgment['statement that evidence or intake information is missing'], 14);
  assert.equal(cr.settled_by_class.FOUNDER, 26);
});

test('63257 recheck: the false positives are gone, by category', async () => {
  const { prr, cr } = await recheck();
  const f = prr.findings;
  const saved = j('Plan Revision Request')[1].findings;
  assert.equal(saved.filter((x) => x.check === 'CITATION ATTACHED TO THE WRONG COMPANY').length, 11);
  assert.equal(saved.filter((x) => x.check === 'PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE').length, 3);
  // A list of date notes names several sources and companies. It is not a claim about the wrong company.
  assert.equal(f.filter((x) => x.check === 'CITATION ATTACHED TO THE WRONG COMPANY').length, 0);
  // A sentence that says prices do not establish demand is not a price stretched into demand.
  assert.equal(f.filter((x) => x.check === 'PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE').length, 0);
  const text = (r) => String(r.text);
  const bad = cr.defects.concat(cr.open);
  for (const re of [/^Net cash\b/, /^(?:Note: )?[SW]\d+\b.*\b(?:is|are) undated\b/i, /were reviewed for this plan/, /verified pric(?:e|ing) was found/, /^This assessment is conditional/, /share that one amount/]) assert.ok(!bad.some((r) => re.test(text(r))), String(re));
  // The four that stay open are held, as an unresolved check has to be.
  assert.deepEqual(cr.open.map((r) => r.line), [6, 107, 148, 430]);
});

test('63257 recheck: the genuine defects still hold', async () => {
  const { cr, prr, gate } = await recheck();
  const code = (line, check, severity) => assert.ok(prr.findings.some((x) => x.line === line && x.check === check && x.severity === severity), 'L' + line + ' ' + check);
  code(128, 'SUBSTITUTE LIMITATION STATED WITHOUT EVIDENCE', 'BLOCKING');
  code(91, 'COUNT DOES NOT MATCH THE LIST', 'BLOCKING');
  code(403, 'ACTION PLAN TARGET EXCEEDS THE FORECAST', 'BLOCKING');
  code(79, 'OFFER DETAIL NOT IN THE INTAKE', 'BLOCKING');
  code(106, 'UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION', 'MAJOR');
  // Competitor characterisations and uncited external statements: the reviewer's verdicts are kept as they were.
  for (const line of [64, 67, 68, 105, 106, 118, 119, 127, 128, 130]) assert.ok(at(cr.defects, line).length > 0, 'L' + line);
  assert.equal(gate.blocked, true);
  assert.deepEqual([gate.confirmed_blocker_count, gate.unresolved_check_count], [37, 1]);
  assert.ok(prr.findings.some((x) => x.id === 'CL-OPEN' && x.unresolved));
});

test('63257: the writer rule, the baseline wording and the printed page', async () => {
  const fc = await runNode('founder-context.js', { 'Prepare Client Data': one(j('Founder Context')), 'Test Financial Baseline': one(j('Test Financial Baseline')) });
  assert.match(fc.writer_system, /RULE 20\. KEEP THE PLAN CONSISTENT WITH ITS OWN MODEL AND ITS OWN EVIDENCE\./);
  const tb = JSON.stringify(await runNode('test-financial-baseline.js', {}));
  assert.ok(!/earlier test run|Held fixed for comparison/.test(tb));
  assert.equal((await runNode('test-financial-baseline.js', {})).fixedScenarioPrice, 500);
  // The saved page carried thirteen printed separators and a rule number as a heading.
  const saved = one(j('Format Plan as HTML')).html;
  assert.ok(/Rule 7/.test(saved) && /<p>---<\/p>|>---</.test(saved));
  const out = one(await runNode('format-plan-html.js', { 'Finalize Plan': one(j('Finalize Plan')), 'Prepare Client Data': one(j('Founder Context')) })).json;
  assert.ok(!/Rule \d+[:.]/.test(out.html), 'no rule number in a heading');
  assert.ok(!/>\s*---\s*</.test(out.html), 'no printed separator');
  assert.match(out.html, /Revenue stream validation/);
  assert.match(out.html, /\.header p\{color:#dbe6f2/);
});
