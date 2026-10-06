// Builds the supervised-launch node files and workflow files. Reads exports; changes nothing in n8n.
//   node build.mjs nodes
//   node build.mjs approval <export of YECjOQHj4oQYVdVW> <out.json>
//   node build.mjs request <id of the approval workflow to call> <export of YECjOQHj4oQYVdVW> <out.json>
//   node build.mjs save <export of v2 Test> <out.json> [parent version id] [corrected text file] [note] [sources json file]
//   node build.mjs codetest <out.json>
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { NODES, ALERT_SEND_ERROR_MESSAGE } from './src/nodes.mjs';

const here = new URL('./', import.meta.url);
const part = (f) => fs.readFileSync(new URL('src/' + f, here), 'utf8').trim();
export const nodeCode = (file) => {
  if (!(file in NODES)) throw new Error('no node source ' + file);
  return NODES[file].replace('// @sha256', part('sha256.part.js')).replace('// @approval-checks', part('approval-checks.part.js'));
};
export const writeNodes = () => { for (const f of Object.keys(NODES)) fs.writeFileSync(new URL('nodes/' + f, here), nodeCode(f) + '\n'); return Object.keys(NODES).length; };

const load = (file) => { const raw = fs.readFileSync(file, 'utf8'); const d = JSON.parse(raw.slice(raw.indexOf('{'))); return d.data || d; };
const SUPA = { supabaseApi: { id: 'oxQOdBDbGP7WmsX1', name: 'Supabase account' } };
const ZERO = '00000000-0000-0000-0000-000000000000';
let n = 0;
const pos = () => [220 * (n++), 0];
const code = (name, file, extra = {}) => ({ id: 'sv-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(), parameters: { jsCode: typeof file === 'string' && file.endsWith('.js') ? nodeCode(file) : file }, ...extra });
const getAll = (name, table, conditions, extra = {}) => ({ id: 'sv-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.supabase', typeVersion: 1, position: pos(), parameters: { operation: 'getAll', tableId: table, returnAll: true, filterType: 'manual', matchType: 'allFilters', filters: { conditions: conditions.map(([keyName, keyValue]) => ({ keyName, condition: 'eq', keyValue })) } }, credentials: SUPA, alwaysOutputData: true, ...extra });
const iff = (name, expr) => ({ id: 'sv-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos(), parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c1', leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } });
const trigger = () => ({ id: 'sv-run-once', name: 'Run Once', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(), parameters: {} });
const link = (c, from, to, out = 0) => { c[from] = c[from] || { main: [] }; while (c[from].main.length <= out) c[from].main.push([]); c[from].main[out].push({ node: to, type: 'main', index: 0 }); };
const chain = (c, names) => { for (let i = 0; i < names.length - 1; i++) link(c, names[i], names[i + 1]); };
const copy = (wf, name) => { const x = wf.nodes.find((k) => k.name === name); if (!x) throw new Error('missing node ' + name); if (x.disabled) throw new Error('disabled node ' + name); const y = JSON.parse(JSON.stringify(x)); y.position = pos(); return y; };
// A call to another workflow is allowed only where it is named: the request workflow starts the approval workflow.
const FORBIDDEN = /executeWorkflow$|langchain|openAi|anthropic|agent/i;
const check = (wf, allow = {}) => {
  const names = new Set(wf.nodes.map((k) => k.name));
  if (names.size !== wf.nodes.length) throw new Error('duplicate node names');
  for (const k of wf.nodes) {
    if (FORBIDDEN.test(k.type) && !(allow.executeWorkflow && k.type.endsWith('executeWorkflow'))) throw new Error('forbidden node type ' + k.type);
    if (/openrouter|perplexity|api\.search\.brave|anthropic\.com/i.test(JSON.stringify(k.parameters).replace(/"jsCode":"(?:[^"\\]|\\.)*"/g, '')) ) throw new Error('model or research address in ' + k.name);
    for (const r of JSON.stringify(k.parameters).match(/\$\('([^']+)'\)/g) || []) if (!names.has(r.slice(3, -2))) throw new Error(k.name + ' refers to a node that is not in the workflow: ' + r);
  }
  for (const [from, o] of Object.entries(wf.connections)) { if (!names.has(from)) throw new Error('connection from unknown ' + from); for (const b of o.main) for (const t of b) if (!names.has(t.node)) throw new Error('connection to unknown ' + t.node); }
  return wf;
};

// ---- Approval and delivery: the shared workflow with the agreed edits ----
export function buildApproval(sharedExport) {
  const sh = load(sharedExport);
  const wf = { name: 'SUPERVISED TEST COPY - Plan Approval and Delivery (inactive, sends to Liz only)', nodes: JSON.parse(JSON.stringify(sh.nodes)), connections: JSON.parse(JSON.stringify(sh.connections)), settings: { executionOrder: 'v1', timezone: sh.settings.timezone, saveManualExecutions: true, errorWorkflow: sh.settings.errorWorkflow, callerPolicy: sh.settings.callerPolicy } };
  const node = (name) => { const x = wf.nodes.find((k) => k.name === name); if (!x) throw new Error('missing ' + name); return x; };
  for (const k of wf.nodes.filter((x) => x.type.endsWith('gmail'))) if (k.parameters.sendTo !== 'liz@ideatoplan.to') throw new Error('unexpected recipient in ' + k.name);
  node('Prepare Approval').parameters.jsCode = nodeCode('prepare-approval.js');
  node('Build Approval Email').parameters.jsCode = nodeCode('build-approval-email.js');
  node('Classify Send Error').parameters.jsCode = nodeCode('classify-send-error.js');
  node('Alert Send Error').parameters.message = ALERT_SEND_ERROR_MESSAGE;
  node('Claim').parameters.fieldsUi.fieldValues.push(
    { fieldId: 'approved_plan_sha256', fieldValue: "={{ $('Prepare Approval').first().json.plan_sha256 }}" },
    { fieldId: 'approved_pdf_sha256', fieldValue: "={{ $('Prepare Approval').first().json.pdf_sha256 }}" });
  n = 0;
  const at = (x, p) => { x.position = p; return x; };
  wf.nodes.push(
    at(getAll('Load All Versions', 'plan_versions', [['submission_id', "={{ $('Load Version').first().json.submission_id || '" + ZERO + "' }}"]], { executeOnce: true }), [440, 180]),
    at(getAll('Load Review', 'plan_reviews', [['plan_version_id', "={{ $('Load Version').first().json.id || '" + ZERO + "' }}"], ['decision', 'release_for_approval']], { executeOnce: true }), [660, 180]),
    at(code('Verify Attachment', 'verify-attachment.js'), [2530, -60]),
    at(iff('Attachment Matches?', '={{ $json.attachment_ok === true }}'), [2640, -330]));
  // Start > Load Version > Load Submission > Load All Versions > Load Review > Prepare Approval
  wf.connections['Load Submission'] = { main: [[{ node: 'Load All Versions', type: 'main', index: 0 }]] };
  chain(wf.connections, ['Load All Versions', 'Load Review', 'Prepare Approval']);
  // Build Customer Email > Verify Attachment > Attachment Matches? > Send to Customer | Classify Send Error
  wf.connections['Build Customer Email'] = { main: [[{ node: 'Verify Attachment', type: 'main', index: 0 }]] };
  link(wf.connections, 'Verify Attachment', 'Attachment Matches?');
  link(wf.connections, 'Attachment Matches?', 'Send to Customer', 0);
  link(wf.connections, 'Attachment Matches?', 'Classify Send Error', 1);
  return check(wf);
}

// ---- Request approval for a reviewed version ----
export function buildRequest(approvalWorkflowId, sharedExport) {
  const sh = load(sharedExport);
  n = 0;
  const download = copy(sh, 'Download PDF'); download.name = 'Download Stored PDF'; download.id = 'sv-download-stored-pdf';
  download.parameters.url = '=https://yglmlnfsyzsvozxirlpo.supabase.co/storage/v1/object/authenticated/plans/{{ $json.pdf_path }}';
  const nodes = [
    trigger(),
    code('Plan Version ID', "// Paste the plan version ID between the quotes, then run the workflow once.\nreturn [{ json: { plan_version_id: 'PASTE-PLAN-VERSION-ID-HERE' } }];"),
    getAll('Load Version', 'plan_versions', [['id', "={{ /^[0-9a-f-]{36}$/i.test(String($json.plan_version_id).trim()) ? String($json.plan_version_id).trim() : '" + ZERO + "' }}"]]),
    getAll('Load Submission', 'idea_submissions', [['id', "={{ $json.submission_id || '" + ZERO + "' }}"]]),
    getAll('Load All Versions', 'plan_versions', [['submission_id', "={{ $('Load Version').first().json.submission_id || '" + ZERO + "' }}"]], { executeOnce: true }),
    getAll('Load Review', 'plan_reviews', [['plan_version_id', "={{ $('Load Version').first().json.id || '" + ZERO + "' }}"], ['decision', 'release_for_approval']], { executeOnce: true }),
    code('Check Version', 'request-check.js'),
    download,
    code('Verify Stored PDF', 'verify-stored-pdf.js'),
    iff('Needs Reopen?', '={{ $json.needs_reopen === true }}'),
    { id: 'sv-reopen', name: 'Reopen', type: 'n8n-nodes-base.supabase', typeVersion: 1, position: pos(), credentials: SUPA, alwaysOutputData: true,
      parameters: { operation: 'update', tableId: 'plan_versions', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: '={{ $json.plan_version_id }}' }, { keyName: 'status', condition: 'eq', keyValue: '={{ $json.status }}' }] }, fieldsUi: { fieldValues: [{ fieldId: 'status', fieldValue: 'awaiting_approval' }] } } },
    iff('Reopened?', '={{ !!$json.id }}'),
    { id: 'sv-start-approval', name: 'Start Approval', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: pos(),
      parameters: { source: 'database', workflowId: { __rl: true, value: approvalWorkflowId, mode: 'id' }, workflowInputs: { mappingMode: 'defineBelow', value: { plan_version_id: "={{ $('Check Version').first().json.plan_version_id }}" }, matchingColumns: [], schema: [{ id: 'plan_version_id', displayName: 'plan_version_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }], attemptToConvertTypes: false, convertFieldsToString: true }, mode: 'once', options: { waitForSubWorkflow: false } } },
    code('Already Requested', 'already-requested.js'),
  ];
  const c = {};
  chain(c, ['Run Once', 'Plan Version ID', 'Load Version', 'Load Submission', 'Load All Versions', 'Load Review', 'Check Version', 'Download Stored PDF', 'Verify Stored PDF', 'Needs Reopen?']);
  link(c, 'Needs Reopen?', 'Reopen', 0); link(c, 'Needs Reopen?', 'Start Approval', 1);
  link(c, 'Reopen', 'Reopened?'); link(c, 'Reopened?', 'Start Approval', 0); link(c, 'Reopened?', 'Already Requested', 1);
  return check({ name: 'SUPERVISED TEST - Request approval for a reviewed version (inactive)', nodes, connections: c, settings: { executionOrder: 'v1', timezone: sh.settings.timezone, saveManualExecutions: true, errorWorkflow: sh.settings.errorWorkflow } }, { executeWorkflow: true });
}

// The formatter is the repository's file, not the copy in v2 Test: the PDF carries no internal review status.
const formatNode = (v2) => { const x = copy(v2, 'Format Plan as HTML'); x.parameters.jsCode = fs.readFileSync(new URL('../format-plan-html.js', here), 'utf8').split('\r\n').join('\n').trimEnd(); if (/Hold - not for delivery|review email/i.test(x.parameters.jsCode)) throw new Error('the formatter still prints review status'); return x; };

// ---- Save a hand-corrected text as the next version. No model, approval or customer node. ----
export function buildSave(v2Export, input = {}) {
  const v2 = load(v2Export);
  n = 0;
  const reviewInput = { parent_version_id: input.parent_version_id || 'PASTE-PARENT-PLAN-VERSION-ID-HERE', corrected_text: input.corrected_text || '', note: input.note || '' };
  if (input.sources_cited) reviewInput.sources_cited = input.sources_cited;
  const insert = copy(v2, 'Insert Plan Version');
  const pv = (f) => "={{ $('Prepare Version').first().json." + f + ' }}';
  insert.parameters.fieldsUi.fieldValues.push(...['plan_text', 'sources_cited', 'plan_sha256', 'pdf_sha256', 'origin', 'parent_version_id'].map((f) => ({ fieldId: f, fieldValue: pv(f) })));
  const nodes = [
    trigger(),
    code('Review Input', '// FIXED INPUT: the parent version, the corrected text and a note. Written by build.mjs from the review folder.\nreturn [{ json: ' + JSON.stringify(reviewInput) + ' }];'),
    getAll('Load Parent', 'plan_versions', [['id', "={{ /^[0-9a-f-]{36}$/i.test(String($json.parent_version_id).trim()) ? String($json.parent_version_id).trim() : '" + ZERO + "' }}"]]),
    getAll('Load Submission', 'idea_submissions', [['id', "={{ $json.submission_id || '" + ZERO + "' }}"]]),
    getAll('Load All Versions', 'plan_versions', [['submission_id', "={{ $('Load Parent').first().json.submission_id || '" + ZERO + "' }}"]], { executeOnce: true }),
    code('Check Parent', 'check-parent.js'),
    code('Prepare Client Data', 'reviewed-client-data.js'),
    code('Finalize Plan', 'reviewed-finalize.js'),
    formatNode(v2),
    copy(v2, 'Generate PDF'),
    code('Fingerprint PDF', 'fingerprint-pdf.js'),
    code('Resolve Submission', 'reviewed-submission.js'),
    copy(v2, 'List Plan Versions'),
    code('Prepare Version', 'prepare-version.js'),
    copy(v2, 'Upload Plan PDF'),
    code('Delivery Gate', 'reviewed-gate.js'),
    insert,
    copy(v2, 'Create Held Link'),
    copy(v2, 'Held Notice'),
  ];
  const held = nodes.find((k) => k.name === 'Held Notice');
  if (held.parameters.sendTo !== 'liz@ideatoplan.to') throw new Error('unexpected recipient');
  const c = {};
  chain(c, nodes.map((k) => k.name));
  return check({ name: 'SUPERVISED TEST - Save Reviewed Version (inactive, no models)', nodes, connections: c, settings: { executionOrder: 'v1' } });
}

// ---- Zero-cost engine test of the nodes that read files. No credentials, no network. ----
export function buildCodeTest() {
  n = 0;
  const bytes = Buffer.alloc(150000); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17 + 3) % 256; bytes.write('%PDF-1.7');
  const text = 'Plan text with a caf' + String.fromCharCode(233) + ' and a ' + String.fromCharCode(8364) + ' sign.\nSecond line.';
  const expected = { pdf_sha256: createHash('sha256').update(bytes).digest('hex'), plan_sha256: createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'), pdf_bytes: bytes.length };
  const fixed = (name, json) => code(name, '// FIXED TEST INPUT. Nothing is read from or written to anywhere outside this run.\nreturn [{ json: ' + JSON.stringify(json).replace(/[\u0080-￿]/g, (ch) => "' + String.fromCharCode(" + ch.charCodeAt(0) + ") + '") + ' }];');
  const nodes = [
    trigger(),
    code('Finalize Plan', "// FIXED TEST INPUT.\nconst text = 'Plan text with a caf' + String.fromCharCode(233) + ' and a ' + String.fromCharCode(8364) + ' sign.' + String.fromCharCode(10) + 'Second line.';\nreturn [{ json: { text, status: 'HOLD', report: 'test report', sources_cited: [{ id: 'S1' }], origin: 'hand_corrected', parent_version_id: '22222222-2222-2222-2222-222222222222' } }];"),
    fixed('Resolve Submission', { submission_id: '11111111-1111-1111-1111-111111111111' }),
    fixed('Check Version', { plan_version_id: '33333333-3333-3333-3333-333333333333', pdf_path: 'test/v2.pdf', pdf_sha256: expected.pdf_sha256, status: 'changes_requested', needs_reopen: true }),
    code('Generate PDF', "// A fixed 150,000 byte file standing for the rendered PDF.\nconst b = Buffer.alloc(150000);\nfor (let i = 0; i < b.length; i++) b[i] = (i * 17 + 3) % 256;\nb.write('%PDF-1.7');\nreturn [{ json: {}, binary: { pdf_data: await this.helpers.prepareBinaryData(b, 'document.pdf', 'application/pdf') } }];"),
    code('Fingerprint PDF', 'fingerprint-pdf.js'),
    code('List Plan Versions', "// FIXED TEST INPUT: one existing version.\nreturn [{ json: { id: '22222222-2222-2222-2222-222222222222', version: 1 } }];"),
    code('Prepare Version', 'prepare-version.js'),
    code('Build Customer Email', "// The same re-wrapping the delivery workflow does: the stored file becomes the attachment \"data\".\nconst item = $input.first();\nreturn [{ json: { pdf_sha256: item.json.pdf_sha256, plan_version_id: '33333333-3333-3333-3333-333333333333' }, binary: { data: { ...item.binary.pdf_data, fileName: 'IdeaToPlan - Test.pdf', mimeType: 'application/pdf' } } }];"),
    code('Verify Attachment', 'verify-attachment.js'),
    code('Verify Stored PDF', 'verify-stored-pdf.js'),
    code('Swap File', "// A different file under the same name, with the approved fingerprint left as it was.\nconst item = $input.first();\nconst b = Buffer.alloc(150000, 7);\nb.write('%PDF-1.7');\nreturn [{ json: { pdf_sha256: item.json.pdf_sha256 }, binary: { data: await this.helpers.prepareBinaryData(b, 'IdeaToPlan - Test.pdf', 'application/pdf') } }];"),
    code('Verify Swapped File', 'verify-attachment.js'),
  ];
  const c = {};
  chain(c, ['Run Once', 'Finalize Plan', 'Resolve Submission', 'Check Version', 'Generate PDF', 'Fingerprint PDF', 'List Plan Versions']);
  // Prepare Version reads the version list as its input, and the file from Fingerprint PDF by name.
  chain(c, ['List Plan Versions', 'Prepare Version', 'Build Customer Email', 'Verify Attachment', 'Verify Stored PDF']);
  link(c, 'Build Customer Email', 'Swap File'); link(c, 'Swap File', 'Verify Swapped File');
  return { wf: check({ name: 'TEST - supervised code nodes (no credentials, no network, safe to archive)', nodes, connections: c, settings: { executionOrder: 'v1' } }), expected };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const [cmd, ...a] = process.argv.slice(2);
  const out = (file, wf) => { fs.writeFileSync(file, JSON.stringify({ ...wf, pinData: {} })); console.log(wf.name + ': ' + wf.nodes.length + ' nodes, ' + wf.nodes.map((k) => k.type.split('.').pop()).filter((t, i, l) => l.indexOf(t) === i).join(', ')); };
  if (cmd === 'nodes') console.log('node files written:', writeNodes());
  else if (cmd === 'approval') out(a[1], buildApproval(a[0]));
  else if (cmd === 'request') out(a[2], buildRequest(a[0], a[1]));
  else if (cmd === 'save') out(a[1], buildSave(a[0], a[2] ? { parent_version_id: a[2], corrected_text: fs.readFileSync(a[3], 'utf8'), note: a[4] || '', sources_cited: a[5] ? JSON.parse(fs.readFileSync(a[5], 'utf8')) : undefined } : {}));
  else if (cmd === 'codetest') { const t = buildCodeTest(); out(a[0], t.wf); console.log('expected', JSON.stringify(t.expected)); }
  else console.log('usage: see the top of this file');
}
