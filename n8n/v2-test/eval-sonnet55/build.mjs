// Builds the isolated evaluation workflow for the Sonnet 4.6 / Sonnet 5.5 comparison.
// The workflow has four nodes: a manual trigger, a node that picks ONE request, the OpenRouter call, and a result node.
// It writes nothing to the database, uploads nothing, sends no email and starts no other workflow.
// One execution sends one request. The request number is changed by hand between executions.
// The workflow file holds founder inputs, so it goes to diagnostics/, which is not tracked.
// Run: node n8n/v2-test/eval-sonnet55/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runNode, ROOT } from '../tests/harness.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const fx = (run, name) => { const v = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', run, name + '.json'), 'utf8').replace(/^﻿/, '')); const a = Array.isArray(v) ? v[0] : v; return a && a.json ? a.json : a; };

export const NEW_MODEL = 'anthropic/claude-sonnet-5.5';
export const OLD_MODEL = 'anthropic/claude-sonnet-4.6';
// Necessary differences for Sonnet 5.5, recorded in COMPARISON.md:
//   temperature is left out (Anthropic rejects non-default sampling values on this model);
//   thinking cannot be switched off, so max_tokens is raised to leave room for it. No reasoning setting is sent.
const forNew = (payload, maxTokens) => { const p = JSON.parse(payload); p.model = NEW_MODEL; delete p.temperature; p.max_tokens = maxTokens; return JSON.stringify(p); };

// ---- Test 1: claim review. The two requests exactly as sent to Sonnet 4.6 in execution 63256. ----
const sent = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'exec-63256', 'requests-as-sent.json'), 'utf8'));
for (const r of sent) if (sha(r.payload) !== r.sha) throw new Error('saved request ' + r.batch + ' does not match its fingerprint');

// ---- Test 2: drafting. The production writer request for the 63260 intake and ledger, asked for one section. ----
const SECTION_ONLY = [
  '',
  'TEST INSTRUCTION',
  'For this request write only section 9, "## 9. 90-Day Action Plan", exactly as it would appear in the full plan.',
  'Every rule above applies. Do not write any other section. Do not add commentary before or after the section.',
].join('\n');
const writer = await runNode('build-growth-payload.js', { 'Founder Context': fx('exec-63260', 'Founder Context'), 'Build Evidence': fx('exec-63260', 'Build Evidence'), 'Compute Financials': fx('exec-63260', 'Compute Financials') });
const wp = JSON.parse((Array.isArray(writer) ? writer[0] : writer).payload || (Array.isArray(writer) ? writer[0].json.payload : writer.json.payload));
// The comparison was run when the writer still named Sonnet 4.6 at temperature 0.3. The writer has since been switched,
// so the Sonnet 4.6 request is rebuilt here with the settings it had on the day of the test.
wp.messages[1].content += '\n' + SECTION_ONLY;
const draftOld = JSON.stringify({ model: OLD_MODEL, max_tokens: 6000, temperature: 0.3, messages: wp.messages });

export const REQUESTS = [
  { n: 0, label: 'review-1-sonnet-5.5', test: 'review', payload: forNew(sent[0].payload, 16000) },
  { n: 1, label: 'review-2-sonnet-5.5', test: 'review', payload: forNew(sent[1].payload, 16000) },
  { n: 2, label: 'draft-sonnet-4.6', test: 'draft', payload: draftOld },
  { n: 3, label: 'draft-sonnet-5.5', test: 'draft', payload: forNew(draftOld, 12000) },
];
// Identical inputs: the messages of each pair are the same text.
const msgs = (p) => JSON.stringify(JSON.parse(p).messages);
if (msgs(REQUESTS[0].payload) !== msgs(sent[0].payload) || msgs(REQUESTS[1].payload) !== msgs(sent[1].payload)) throw new Error('review messages changed');
if (msgs(REQUESTS[2].payload) !== msgs(REQUESTS[3].payload)) throw new Error('draft messages differ between the models');

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const pick = '// ONE request per execution. Change N by hand between executions: 0, 1, 2, 3.\nconst N = 0;\nconst R = ' + JSON.stringify(REQUESTS.map((r) => ({ n: r.n, label: r.label, payload: r.payload }))) + ';\nconst r = R[N];\nif (!r) throw new Error("no request " + N);\nreturn [{ json: { n: r.n, label: r.label, payload: r.payload } }];';
  const nodes = [
    { id: 'ev-1', name: 'Run Once', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    { id: 'ev-2', name: 'Pick Request', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { jsCode: pick } },
    { id: 'ev-3', name: 'OpenRouter', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [440, 0], parameters: { method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth', sendHeaders: true, headerParameters: { parameters: [{ name: 'HTTP-Referer', value: 'https://quityourlifeandtravel.com' }, { name: 'X-Title', value: 'IdeaToPlan' }] }, sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ $json.payload }}', options: { timeout: 600000 } }, credentials: { httpBearerAuth: { id: 'zeH7yl8iNbDhIjLz', name: 'Bearer Auth account' } }, onError: 'continueRegularOutput', retryOnFail: false },
    { id: 'ev-4', name: 'Result', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0], parameters: { jsCode: "const r = $input.first().json; const p = $('Pick Request').first().json;\nreturn [{ json: { n: p.n, label: p.label, response: r } }];" } },
  ];
  const connections = { 'Run Once': { main: [[{ node: 'Pick Request', type: 'main', index: 0 }]] }, 'Pick Request': { main: [[{ node: 'OpenRouter', type: 'main', index: 0 }]] }, 'OpenRouter': { main: [[{ node: 'Result', type: 'main', index: 0 }]] } };
  const dir = path.join(ROOT, 'diagnostics', 'eval-sonnet55');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'eval-workflow.json'), JSON.stringify({ name: 'EVAL - Sonnet 4.6 vs 5.5 (isolated: one model call per run, no writes, no email)', nodes, connections, settings: { executionOrder: 'v1' }, pinData: {} }));
  const tok = (p) => Math.round(JSON.parse(p).messages.reduce((s, m) => s + String(m.content).length, 0) / 3.6);
  for (const r of REQUESTS) { const p = JSON.parse(r.payload); console.log(r.n, r.label, '| model', p.model, '| max_tokens', p.max_tokens, '| temperature', p.temperature === undefined ? 'not sent' : p.temperature, '| about', tok(r.payload), 'input tokens'); }
  console.log('wrote', path.join(dir, 'eval-workflow.json'));
}
