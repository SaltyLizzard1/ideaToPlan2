// Builds the temporary rendering-only copy used once to render the reviewed text of execution 63260 as version 2.
// It holds a manual trigger, four fixed-input nodes, two guards, and the existing formatting, PDF, storage,
// version-record and held-notice nodes of v2 Test, copied unchanged. It holds no model, research, approval,
// customer-confirmation or customer-delivery node, and no subworkflow call.
// Run: node build-render-copy.mjs <export of v2 Test> <pins.json> <output file>
import fs from 'node:fs';
const [exportFile, pinsFile, outFile] = process.argv.slice(2);
const raw = fs.readFileSync(exportFile, 'utf8');
const wf = JSON.parse(raw.slice(raw.indexOf('{'))).data;
const pins = JSON.parse(fs.readFileSync(pinsFile, 'utf8'));
const text = fs.readFileSync(new URL('corrected-plan-v2.md', import.meta.url), 'utf8');
const SUBMISSION = '9e68ffe1-bf25-4af5-af7e-47d309ba6bc4';

const COPIED = ['Format Plan as HTML', 'Generate PDF', 'Resolve Submission', 'List Plan Versions', 'Prepare Version', 'Upload Plan PDF', 'Delivery Gate', 'Insert Plan Version', 'Delivery Blocked?', 'Create Held Link', 'Held Notice'];
const ALLOWED_TYPES = ['n8n-nodes-base.code', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.supabase', 'n8n-nodes-base.if', 'n8n-nodes-base.gmail'];
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const copied = COPIED.map((name) => {
  const n = byName[name];
  if (!n) throw new Error('missing ' + name);
  if (n.disabled) throw new Error('disabled ' + name);
  if (!ALLOWED_TYPES.includes(n.type)) throw new Error('type ' + n.type);
  return JSON.parse(JSON.stringify(n));
});

const fp = pins['Finalize Plan'][0].json;
const client = pins['Prepare Client Data'][0].json;
if (pins['Log to Supabase'][0].json.id !== SUBMISSION) throw new Error('submission');
const note = [
  'REVIEWED TEST VERSION. NOT APPROVED. HOLD remains in force.',
  'This is version 2 of the plan generated in execution 63260, with corrections C1 to C8, the wording P1 to P16 and the owner review decisions of 2026-10-06 applied by hand. Every replacement is listed in n8n/v2-test/reviews/exec-63260/tracked-changes.md.',
  'What was checked: the offline code checks were run on this text and leave one standing warning (FINANCIAL MODEL: five cost categories are unresolved and disclosed; the forecast is conditional on them). The automated claim review was NOT run on this text. For version 1 that review did not complete for 52 claims; those were reviewed by hand, which is recorded as a manual review and is not automated verification.',
  'Version 1 and its PDF are unchanged. Its gate result stands: 38 confirmed blocking findings and 1 required check that did not complete.',
  'This version was rendered by a temporary rendering-only copy of the workflow that holds no model, approval or customer-delivery node. It was not sent for approval.',
].join('\n\n');

let x = 0;
const place = () => { x += 240; return [x, 300]; };
const code = (name, jsCode) => ({ parameters: { jsCode }, type: 'n8n-nodes-base.code', typeVersion: 2, position: place(), id: 'render-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name });
const fixed = (name, json, why) => code(name, '// FIXED INPUT for the one rendering run of the reviewed text of execution 63260. ' + why + '\nreturn [{ json: ' + JSON.stringify(json) + ' }];');

const trigger = { parameters: {}, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: place(), id: 'render-trigger', name: 'Run Once' };
const nClient = fixed('Prepare Client Data', client, 'The client data of execution 63260, unchanged. Nothing is read from a webhook.');
const nLog = fixed('Log to Supabase', { id: SUBMISSION, fixed_input: true }, 'NOT a database node: it only names the existing submission, so that no submission row is created or changed.');
const nFinal = fixed('Finalize Plan', { text, status: 'HOLD', report: note, revised: fp.revised, sources_cited: fp.sources_cited, final_findings: [] }, 'The reviewed text (corrected-plan-v2.md), status HOLD. No model runs here.');
// The one finding the offline code checks leave on this text: the standing warning about unresolved costs. It is a
// warning, so it is listed in the notice and does not decide the hold; status HOLD does.
const standing = JSON.parse(fs.readFileSync(new URL('../../diagnostics/exec-63260/prr-final.json', import.meta.url), 'utf8')).findings.filter((f) => f.id === 'AUTO-008');
if (standing.length !== 1 || standing[0].severity !== 'MAJOR') throw new Error('standing warning');
const nFindings = fixed('Plan Revision Request', { findings: standing, fixed_input: true }, 'NOT a review: it carries the one standing warning, so that Delivery Gate has a findings list to read. No model runs here.');
const guardVersion = code('Guard Version', `// Stops the run unless this is version 2 of the 63260 submission and nothing else. Passes the item through unchanged.
const j = $input.first().json;
if (j.submission_id !== '${SUBMISSION}') throw new Error('Wrong submission: ' + j.submission_id + '. Nothing was uploaded.');
if (j.version !== 2 || j.pdf_path !== '${SUBMISSION}/v2.pdf') throw new Error('Expected version 2, got version ' + j.version + ' at ' + j.pdf_path + '. Nothing was uploaded.');
if (j.review_status !== 'HOLD') throw new Error('Expected review status HOLD, got ' + j.review_status + '. Nothing was uploaded.');
return $input.all();`);
const guardHold = code('Guard Hold', `// Stops the run unless the gate holds this version. Passes the item through unchanged.
const g = $('Delivery Gate').first().json;
if (g.blocked !== true || g.version_status !== 'changes_requested' || g.review_status !== 'HOLD') throw new Error('The gate did not hold this version (' + g.version_status + ', ' + g.review_status + '). No version row was written.');
return $input.all();`);

const order = [trigger, nClient, nLog, nFindings, nFinal];
const chain = ['Run Once', 'Prepare Client Data', 'Log to Supabase', 'Plan Revision Request', 'Finalize Plan', 'Format Plan as HTML', 'Generate PDF', 'Resolve Submission', 'List Plan Versions', 'Prepare Version', 'Guard Version', 'Upload Plan PDF', 'Delivery Gate', 'Guard Hold', 'Insert Plan Version', 'Delivery Blocked?', 'Create Held Link', 'Held Notice'];
const nodes = chain.map((name) => order.find((n) => n.name === name) || (name === 'Guard Version' ? guardVersion : name === 'Guard Hold' ? guardHold : copied.find((n) => n.name === name)));
x = 0; nodes.forEach((n) => { n.position = place(); });
const connections = {};
for (let i = 0; i < chain.length - 1; i++) connections[chain[i]] = { main: [[{ node: chain[i + 1], type: 'main', index: 0 }]] };
// "Delivery Blocked?": output 0 (blocked) goes to the held link, as in v2 Test. Output 1 (not blocked) goes nowhere.
const origBlocked = wf.connections['Delivery Blocked?'].main;
if (origBlocked[0][0].node !== 'Create Held Link' || origBlocked[1][0].node !== 'Start Approval') throw new Error('branches of Delivery Blocked? are not as expected');
connections['Delivery Blocked?'] = { main: [[{ node: 'Create Held Link', type: 'main', index: 0 }], []] };

const out = { name: 'IdeaToPlan - RENDER ONLY 63260 v2 (temporary, inactive, no models)', nodes, connections, settings: { executionOrder: (wf.settings || {}).executionOrder || 'v1' }, pinData: {} };
fs.writeFileSync(outFile, JSON.stringify(out));

// ---------- Inspection, printed without any credential value ----------
const mask = (v) => (typeof v === 'string' && /^(?:Bearer |ey[A-Za-z0-9_-]{10,}|sk-|sb_)/.test(v.replace(/^=/, '')) ? '<secret-like value, hidden>' : v);
for (const n of nodes) {
  const p = n.parameters || {};
  const refs = [...new Set((JSON.stringify(p).match(/\$\('([^']+)'\)/g) || []))].join(' ');
  const headers = ((p.headerParameters || {}).parameters || []).map((h) => h.name + '=' + (String(h.value).length > 40 ? '<' + String(h.value).length + ' chars>' : mask(h.value))).join(', ');
  console.log([n.name, n.type.split('.').pop(), p.method || p.operation || '', String(p.url || p.tableId || p.sendTo || '').slice(0, 95), 'cred:' + Object.keys(n.credentials || {}).join('+'), p.authentication || '', headers ? 'headers: ' + headers : '', refs ? 'refs: ' + refs : ''].filter(Boolean).join(' | '));
}
const names = new Set(nodes.map((n) => n.name));
const unknownRefs = [...new Set(nodes.flatMap((n) => (JSON.stringify(n.parameters).match(/\$\('([^']+)'\)/g) || []).map((r) => r.slice(3, -2))))].filter((r) => !names.has(r));
console.log('references to nodes not in the copy:', unknownRefs.join(', ') || 'none');
console.log('node types:', [...new Set(nodes.map((n) => n.type))].join(', '));
console.log('executeWorkflow nodes:', nodes.filter((n) => /executeWorkflow|langchain|openAi|agent/i.test(n.type)).length, '| nodes:', nodes.length, '| text chars:', text.length, '| bytes:', JSON.stringify(out).length);
console.log('model or research URLs:', nodes.filter((n) => /openrouter|anthropic|perplexity|brave|openai/i.test(JSON.stringify(n.parameters))).map((n) => n.name).join(', ') || 'none');
console.log('email recipients:', nodes.filter((n) => n.type.endsWith('gmail')).map((n) => n.name + ' -> ' + n.parameters.sendTo).join('; '));
