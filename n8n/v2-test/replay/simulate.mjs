// Runs the replay workflow's nodes outside n8n, in the order the workflow connects them, and writes what each
// scenario comes to. The same code text goes into the workflow file (build-copy.mjs), so the result of an n8n
// execution can be compared with this, scenario by scenario. No network, no model.
// Run: node n8n/v2-test/replay/simulate.mjs [mode] [only]      (writes diagnostics/claim-replay/expected-<mode>.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as N from './nodes.mjs';
import { ROOT, src, DATA, VARIANT_B, scenarioList, CONFIG, stageOne, scoreStageOne } from './plan.mjs';
import { buildBatches } from '../tests/claim-helpers.mjs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// A node sees the last run of every node before it, as n8n gives it by default.
export const makeRun = (sd) => async (code, stubs, input) => {
  const $ = (name) => { if (!(name in stubs)) throw new Error('Node has not run: ' + name); const items = (Array.isArray(stubs[name]) ? stubs[name] : [stubs[name]]).map((json) => ({ json })); return { first: () => items[0], all: () => items }; };
  const ins = (Array.isArray(input) ? input : [input || {}]).map((json) => ({ json }));
  const out = await new AsyncFunction('$', '$input', '$getWorkflowStaticData', code)($, { first: () => ins[0], all: () => ins }, () => sd);
  return (Array.isArray(out) ? out : [{ json: out }]).map((i) => (i && i.json !== undefined ? i.json : i));
};

export const simulate = async (mode = 'scenarios', only = '') => {
  const data = await DATA();
  const tokenA = (await buildBatches()).items[0].review;
  const key = await stageOne();
  const list = scenarioList(tokenA, key.map((k) => k.id));
  const cfg = { ...CONFIG, mode, only };
  const sd = {};
  const run = makeRun(sd);
  const S = {};   // node name -> its last output, as items
  S['Replay Config'] = await run(N.replayConfig(cfg), S, {});
  S['Founder Context'] = [data.founder];
  S['Compute Financials'] = [data.fin];
  const scenarios = await run(N.scenarios(list), S, {});
  const results = [];
  for (const sc of scenarios) {
    S['Scenario'] = await run(N.scenario, S, sc);
    S['Apply Revisions'] = [{ ...data.rev, text: sc.plan === 'B' ? data.rev.text.replace(VARIANT_B.from, VARIANT_B.to) : data.rev.text }];
    const ledger = JSON.parse(data.ev.research_ledger);
    if (sc.evidence === 'B') ledger.find((e) => e.claim_id === VARIANT_B.entry).claim = VARIANT_B.claim;
    S['Build Evidence'] = [{ ...data.ev, research_ledger: sc.evidence === 'B' ? JSON.stringify(ledger) : data.ev.research_ledger }];
    S['Citation Check'] = [data.cc];
    S['Claim Selection'] = await run(N.claimSelection, S, {});
    S['Final QA'] = [data.qa];
    S['Build Claim Review'] = await run(src('build-claim-review.js'), S, data.qa);
    let responses;
    if (sc.sequential) {
      responses = [];
      for (const b of S['Build Claim Review']) {
        const g = (await run(N.budgetGate, S, b))[0];
        S['Budget Gate'] = [g];
        if (!g.go) { responses.push((await run(N.notSent, S, g))[0]); continue; }
        const r = (await run(src('replay/scripted-responses.js'), S, g))[0];
        responses.push((await run(N.recordCost, S, r))[0]);
      }
    } else {
      responses = await run(src('replay/scripted-responses.js'), S, S['Build Claim Review']);
    }
    const arranged = await run(N.arrange, S, responses);
    S['Combine Claim Review'] = await run(src('combine-claim-review.js'), S, arranged);
    S['Plan Revision Request'] = await run(src('plan-revision-request.js'), S, S['Combine Claim Review'][0]);
    S['Finalize Plan'] = await run(N.finalizeStub, S, S['Plan Revision Request'][0]);
    S['Delivery Gate'] = await run(src('delivery-gate.js'), S, S['Finalize Plan'][0]);
    const result = (await run(N.scenarioResult, S, S['Delivery Gate'][0]))[0];
    if (sc.name === 'stage one') result.stage_one_score = scoreStageOne(key, S['Combine Claim Review'][0].claim_review.records);
    results.push(result);
  }
  return (await run(N.replayResult, S, results))[0];
};

if (process.argv[1] && process.argv[1].endsWith('simulate.mjs')) {
  const mode = process.argv[2] || 'scenarios', only = process.argv[3] || '';
  const out = await simulate(mode, only);
  const dir = path.join(ROOT, 'diagnostics', 'claim-replay');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'expected-' + mode + (only ? '-' + only.split(' ')[0] : '') + '.json');
  writeFileSync(file, JSON.stringify(out, null, 1));
  const base = out.runs[0];
  console.log(file);
  out.runs.forEach((r) => console.log([r.scenario, 'token ' + r.review_built, r.batches + ' req', r.claims + ' claims', 'settled ' + r.settled, 'defects ' + r.defects, 'open ' + r.open, 'beyond baseline ' + r.unreviewed.filter((id) => !base.unreviewed.includes(id)).length, 'failed [' + r.failed_batches.map((f) => f.split(':')[0]).join(',') + ']', 'rejected ' + r.rejected.length, 'stray ' + r.stray.length, 'held ' + r.held, r.spent_recorded === null ? '' : 'spent ' + r.spent_recorded].join(' | ')));
  if (out.runs.some((r) => r.budget_log.length)) out.runs.forEach((r) => console.log(r.scenario + '\n' + r.budget_log.map((l) => '  batch ' + l.batch + (l.go ? ' sent' : ' NOT SENT') + ' spent before $' + l.spent_before + ' worst case $' + l.worst_case_usd + (l.stop_reason ? ' : ' + l.stop_reason : '')).join('\n')));
  if (out.runs[0].stage_one_score) console.log(JSON.stringify(out.runs[0].stage_one_score, null, 1));
}
