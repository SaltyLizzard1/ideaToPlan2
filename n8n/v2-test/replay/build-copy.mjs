// Writes the workflow file of the isolated claim-review replay. The file holds founder inputs and the plan, so it goes
// to diagnostics/, which is not tracked. Nothing here talks to n8n: the file is imported by hand.
// Run: node n8n/v2-test/replay/build-copy.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as N from './nodes.mjs';
import { ROOT, src, DATA, VARIANT_B, scenarioList, CONFIG, stageOne } from './plan.mjs';
import { buildBatches } from '../tests/claim-helpers.mjs';

const data = await DATA();
const tokenA = (await buildBatches()).items[0].review;
const key = await stageOne();
const list = scenarioList(tokenA, key.map((k) => k.id));
const fixed = (what, json) => '// FIXED DATA of execution 63237: ' + what + '. Read from the preserved fixture when this file was built. Not fetched, not recomputed.\nreturn [{ json: ' + JSON.stringify(json) + ' }];';

let x = 0;
const nodes = [], connections = {};
const add = (name, type, typeVersion, parameters, extra = {}, y = 0) => { nodes.push({ id: 'cr-' + String(nodes.length + 1).padStart(2, '0'), name, type, typeVersion, position: [x += 220, 300 + y], parameters, ...extra }); return name; };
const code = (name, jsCode, y) => add(name, 'n8n-nodes-base.code', 2, { jsCode }, {}, y);
const iff = (name, left, y) => add(name, 'n8n-nodes-base.if', 2.3, { conditions: { options: { version: 1, leftValue: '', caseSensitive: true, typeValidation: 'loose' }, conditions: [{ leftValue: left, rightValue: 'true', operator: { type: 'string', operation: 'equals' }, id: 'cond-' + name.toLowerCase().replace(/[^a-z]+/g, '-') }], combinator: 'and' }, looseTypeValidation: true }, {}, y);
const loop = (name, y) => add(name, 'n8n-nodes-base.splitInBatches', 3, { batchSize: 1, options: {} }, {}, y);
const link = (from, to, out = 0) => { const c = connections[from] = connections[from] || { main: [] }; while (c.main.length <= out) c.main.push([]); c.main[out].push({ node: to, type: 'main', index: 0 }); };

add('Run the replay', 'n8n-nodes-base.manualTrigger', 1, {});
code('Replay Config', N.replayConfig(CONFIG));
code('Founder Context', fixed('the founder context', data.founder));
code('Compute Financials', fixed('the computed financial model', data.fin));
code('Scenarios', N.scenarios(list));
loop('Loop Scenarios');
code('Scenario', N.scenario);
code('Apply Revisions', '// FIXED DATA of execution 63237: the revised plan as Apply Revisions returned it. The second-pass scenarios reword one sentence.\nconst rev = ' + JSON.stringify(data.rev) + ';\nconst sc = $(\'Scenario\').first().json;\nreturn [{ json: { ...rev, text: sc.plan === \'B\' ? rev.text.replace(' + JSON.stringify(VARIANT_B.from) + ', ' + JSON.stringify(VARIANT_B.to) + ') : rev.text } }];');
code('Build Evidence', '// FIXED DATA of execution 63237: sources, ledger and entities. The second-pass scenarios correct the wording of one entry.\nconst ev = ' + JSON.stringify(data.ev) + ';\nconst sc = $(\'Scenario\').first().json;\nif (sc.evidence !== \'B\') return [{ json: ev }];\nconst ledger = JSON.parse(ev.research_ledger);\nledger.find((e) => e.claim_id === ' + JSON.stringify(VARIANT_B.entry) + ').claim = ' + JSON.stringify(VARIANT_B.claim) + ';\nreturn [{ json: { ...ev, research_ledger: JSON.stringify(ledger) } }];');
code('Citation Check', fixed('what the current Citation Check code returns for the revised plan (second pass), computed offline', data.cc));
code('Claim Selection', N.claimSelection);
code('Final QA', fixed('the verifier answer the model returned in that execution', data.qa));
code('Build Claim Review', src('build-claim-review.js'));
iff('Claims To Review', '={{ String($json.claim_skip) }}');
iff('Sequential?', "={{ String($('Scenario').first().json.sequential === true) }}");
code('Saved Responses', src('replay/scripted-responses.js'), -180);
loop('Loop Requests', 180);
code('Budget Gate', N.budgetGate, 180);
iff('Send?', '={{ String($json.go) }}', 180);
iff('Dry Run?', '={{ String($json.dry_run) }}', 180);
code('Saved Response', src('replay/scripted-responses.js'), 120);
add('Review Claims (OpenRouter)', 'n8n-nodes-base.httpRequest', 4.4, { method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth', sendHeaders: true, headerParameters: { parameters: [{ name: 'HTTP-Referer', value: 'https://quityourlifeandtravel.com' }, { name: 'X-Title', value: 'IdeaToPlan' }] }, sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ $json.payload }}', options: { timeout: 600000 } }, { credentials: { httpBearerAuth: { id: 'zeH7yl8iNbDhIjLz', name: 'Bearer Auth account' } }, onError: 'continueRegularOutput', retryOnFail: false }, 320);
code('Record Cost', N.recordCost, 220);
code('Not Sent', N.notSent, 420);
code('Arrange Responses', N.arrange);
code('Combine Claim Review', src('combine-claim-review.js'));
code('Plan Revision Request', src('plan-revision-request.js'));
code('Finalize Plan', N.finalizeStub);
code('Delivery Gate', src('delivery-gate.js'));
code('Scenario Result', N.scenarioResult);
code('Replay Result', N.replayResult, -260);
x = 440;
code('Fault Probe Items', N.faultProbeItems, 640);
add('Fault Probe', 'n8n-nodes-base.httpRequest', 4.4, { method: 'GET', url: '={{ $json.url }}', options: { timeout: 5000 } }, { onError: 'continueRegularOutput', retryOnFail: false }, 640);
code('Fault Probe Result', N.faultProbeResult, 640);

for (const [a, b] of [['Run the replay', 'Replay Config'], ['Replay Config', 'Founder Context'], ['Founder Context', 'Compute Financials'], ['Compute Financials', 'Scenarios'], ['Scenarios', 'Loop Scenarios'],
  ['Scenario', 'Apply Revisions'], ['Apply Revisions', 'Build Evidence'], ['Build Evidence', 'Citation Check'], ['Citation Check', 'Claim Selection'], ['Claim Selection', 'Final QA'], ['Final QA', 'Build Claim Review'], ['Build Claim Review', 'Claims To Review'],
  ['Saved Responses', 'Arrange Responses'], ['Budget Gate', 'Send?'], ['Saved Response', 'Record Cost'], ['Review Claims (OpenRouter)', 'Record Cost'], ['Record Cost', 'Loop Requests'], ['Not Sent', 'Loop Requests'],
  ['Arrange Responses', 'Combine Claim Review'], ['Combine Claim Review', 'Plan Revision Request'], ['Plan Revision Request', 'Finalize Plan'], ['Finalize Plan', 'Delivery Gate'], ['Delivery Gate', 'Scenario Result'], ['Scenario Result', 'Loop Scenarios'],
  ['Run the replay', 'Fault Probe Items'], ['Fault Probe Items', 'Fault Probe'], ['Fault Probe', 'Fault Probe Result']]) link(a, b);
// Loop nodes: output 0 is "done", output 1 is "loop".
link('Loop Scenarios', 'Replay Result', 0); link('Loop Scenarios', 'Scenario', 1);
link('Loop Requests', 'Arrange Responses', 0); link('Loop Requests', 'Budget Gate', 1);
// IF nodes: output 0 is true, output 1 is false.
link('Claims To Review', 'Plan Revision Request', 0); link('Claims To Review', 'Sequential?', 1);
link('Sequential?', 'Loop Requests', 0); link('Sequential?', 'Saved Responses', 1);
link('Send?', 'Dry Run?', 0); link('Send?', 'Not Sent', 1);
link('Dry Run?', 'Saved Response', 0); link('Dry Run?', 'Review Claims (OpenRouter)', 1);

const wf = { name: 'IdeaToPlan - CLAIM REVIEW REPLAY 63237 (dry run, inactive, no writes)', nodes, connections, settings: { executionOrder: 'v1' }, active: false };
const dir = path.join(ROOT, 'diagnostics', 'claim-replay');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'claim-review-replay.workflow.json');
writeFileSync(file, JSON.stringify(wf));
const types = {};
nodes.forEach((n) => { types[n.type] = (types[n.type] || 0) + 1; });
console.log(file, JSON.stringify(wf).length + ' characters', nodes.length + ' nodes');
console.log(JSON.stringify(types));
console.log('http nodes:', nodes.filter((n) => n.type.endsWith('httpRequest')).map((n) => n.name + ' -> ' + n.parameters.url).join(' | '));
console.log('token A', tokenA, '| stage one claims', key.length);
