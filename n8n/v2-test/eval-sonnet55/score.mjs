// Scores a set of claim-review responses for the frozen stage-one benchmark (replay/plan.mjs, key fixed before any
// model was asked). The same code scores Sonnet 4.6 (responses saved from execution 63256) and Sonnet 5.5.
// No network, no model. Run: node n8n/v2-test/eval-sonnet55/score.mjs <responses.json> [label]
//   responses.json: an array of OpenRouter chat-completion responses, in request order (request 1, request 2).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as N from '../replay/nodes.mjs';
import { ROOT, src, DATA, scenarioList, CONFIG, stageOne, scoreStageOne, KEY_CLARIFICATIONS } from '../replay/plan.mjs';
import { makeRun } from '../replay/simulate.mjs';
import { buildBatches } from '../tests/claim-helpers.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
export const prepare = async () => {
  const data = await DATA();
  const tokenA = (await buildBatches()).items[0].review;
  const key = await stageOne();
  const list = scenarioList(tokenA, key.map((k) => k.id));
  const sd = {};
  const run = makeRun(sd);
  const S = {};
  S['Replay Config'] = await run(N.replayConfig({ ...CONFIG, mode: 'stage_one', only: '' }), S, {});
  S['Founder Context'] = [data.founder];
  S['Compute Financials'] = [data.fin];
  const scenarios = await run(N.scenarios(list), S, {});
  const sc = scenarios.find((x) => x.name === 'stage one');
  if (!sc) throw new Error('no stage one scenario');
  S['Scenario'] = await run(N.scenario, S, sc);
  S['Apply Revisions'] = [data.rev];
  S['Build Evidence'] = [data.ev];
  S['Citation Check'] = [data.cc];
  S['Claim Selection'] = await run(N.claimSelection, S, {});
  S['Final QA'] = [data.qa];
  S['Build Claim Review'] = await run(src('build-claim-review.js'), S, data.qa);
  return { S, run, key };
};

export const score = async (responses) => {
  const { S, run, key } = await prepare();
  const arranged = await run(N.arrange, S, responses);
  const combined = (await run(src('combine-claim-review.js'), S, arranged))[0];
  const cr = combined.claim_review;
  const byId = Object.fromEntries(cr.records.map((r) => [r.id, r]));
  // The model's own answer per claim, read from the raw responses, apart from what code made of it.
  const raw = {};
  for (const r of responses) {
    try { const t = r.choices[0].message.content; const o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); for (const a of (o.claims || o.answers || o.verdicts || [])) raw[a.id] = a; } catch (e) { /* unreadable response: every claim of it stays without an answer */ }
  }
  const rows = key.map((k) => ({ id: k.id, line: k.line, cat: k.cat, expect: k.expect, basis: k.basis, text: k.text, status: (byId[k.id] || {}).status || 'absent', check: (byId[k.id] || {}).check || '', why: (byId[k.id] || {}).why || '', model_answer: raw[k.id] || null }));
  return { score: scoreStageOne(key, cr.records), rows, rejected_responses: cr.rejected_responses || [], usage: responses.map((r) => r.usage || null), models: responses.map((r) => r.model) };
};

if (process.argv[1] && process.argv[1].endsWith('score.mjs')) {
  const file = process.argv[2], label = process.argv[3] || 'run';
  if (file === '--requests') {
    const { S } = await prepare();
    const saved = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'exec-63256', 'requests-as-sent.json'), 'utf8'));
    console.log('requests built now:', S['Build Claim Review'].length, '| equal to the requests sent in 63256:', S['Build Claim Review'].map((x, k) => saved[k] && sha(x.payload) === saved[k].sha).join(', '));
  } else {
    let responses = JSON.parse(readFileSync(file, 'utf8'));
    responses = (Array.isArray(responses) ? responses : [responses]).map((r) => r.json || r);
    const out = await score(responses);
    writeFileSync(path.join(ROOT, 'eval-sonnet55', 'score-' + label + '.json'), JSON.stringify({ label, key_clarifications: KEY_CLARIFICATIONS, ...out }, null, 1));
    const s = out.score;
    console.log(label, '| usable', s.completeness.usable, 'of', s.completeness.sent, '| defects found', s.detection.found, 'of', s.detection.targets, '| missed as settled', s.detection.missed_as_settled.length, '| targets unreviewed', s.detection.left_unreviewed.length, '| controls wrongly defect', s.false_positives.wrongly_defect.length, 'of', s.false_positives.controls, '| controls unreviewed', s.false_positives.left_unreviewed.length);
    for (const r of out.rows) console.log(' ', r.expect.padEnd(7), r.status.padEnd(8), 'L' + r.line, r.id, '|', r.cat, '|', (r.model_answer ? [r.model_answer.class, r.model_answer.supported, r.model_answer.label || ''].filter((x) => x !== undefined && x !== '').join(' ') : 'no answer'), r.check ? '| ' + r.check : '');
  }
}
