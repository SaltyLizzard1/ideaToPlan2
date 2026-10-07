// Builds the production workflow files from what was tested. Writes files only; nothing is deployed from here.
//   node build-production.mjs pipeline                      -> production/pipeline-v2-supervised.json
//   node build-production.mjs approval <test copy json>     -> production/approval-and-delivery.json
//   node build-production.mjs request <request json> <approval workflow id> -> production/request-approval.json
import fs from 'node:fs';
const here = new URL('./', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(f instanceof URL ? f : f, 'utf8'));
const write = (name, wf) => { fs.mkdirSync(new URL('production/', here), { recursive: true }); fs.writeFileSync(new URL('production/' + name, here), JSON.stringify({ ...wf, pinData: {} })); console.log(name + ': ' + wf.nodes.length + ' nodes'); };
const mail = (nodes) => nodes.filter((n) => /gmail/.test(n.type)).map((n) => n.name + (n.disabled ? ' [disabled]' : '') + ' -> ' + String(n.parameters.sendTo));
const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'pipeline') {
  // v2 Test as verified after the supervised edits, minus what exists only for testing.
  const w = read(new URL('backups/v2-test.mLyKvFeYmJHuwXQ9.after-supervised.json', here));
  const nodes = w.nodes.filter((n) => n.name !== 'Test Financial Baseline').map((n) => JSON.parse(JSON.stringify(n)));
  const c = JSON.parse(JSON.stringify(w.connections));
  const wired = (c['Log to Supabase'].main[0] || []).map((x) => x.node).join(',');
  if (wired !== 'Test Financial Baseline') throw new Error('Log to Supabase leads to ' + wired);
  if ((c['Test Financial Baseline'].main[0] || []).map((x) => x.node).join(',') !== 'Founder Context') throw new Error('baseline wiring');
  c['Log to Supabase'].main = [[{ node: 'Founder Context', type: 'main', index: 0 }]];
  delete c['Test Financial Baseline'];
  // The production webhook path. Same credential as the live pipeline.
  nodes.find((n) => n.name === 'Webhook').parameters.path = 'idea-submission-v2';
  // No TEST DATA note on customer orders.
  const fv = nodes.find((n) => n.name === 'Log to Supabase').parameters.fieldsUi.fieldValues;
  const i = fv.findIndex((f) => f.fieldId === 'notes');
  if (i < 0 || !String(fv[i].fieldValue).startsWith('TEST DATA')) throw new Error('notes field not as expected');
  fv.splice(i, 1);
  // The order confirmation goes to the address on the order, as in the live pipeline.
  const conf = nodes.find((n) => n.name === 'confirmation_to_client');
  if (!/Prepare Client Data.*\.email/.test(conf.parameters.sendTo)) throw new Error('confirmation recipient: ' + conf.parameters.sendTo);
  delete conf.disabled;
  const text = JSON.stringify(nodes);
  if (/TEST DATA/.test(text)) throw new Error('TEST DATA remains');
  if (nodes.some((n) => /executeWorkflow$/.test(n.type))) throw new Error('the pipeline may not start another workflow');
  if (!nodes.some((n) => n.name === 'Fingerprint PDF') || !nodes.some((n) => n.name === 'Review Notice')) throw new Error('supervised nodes missing');
  write('pipeline-v2-supervised.json', { name: 'IdeaToPlan - Full Pipeline v2 (supervised)', nodes, connections: c, settings: { executionOrder: 'v1' } });
  console.log(mail(nodes).join('\n'));
} else if (cmd === 'approval') {
  // The tested approval copy with one change: the plan goes to the address on the order.
  const w = read(a);
  const send = w.nodes.find((n) => n.name === 'Send to Customer');
  if (send.parameters.sendTo !== 'liz@ideatoplan.to') throw new Error('unexpected test recipient: ' + send.parameters.sendTo);
  send.parameters.sendTo = "={{ $('Prepare Approval').first().json.client_email }}";
  send.notes = 'The recipient is the email address on the order.';
  if (!w.nodes.some((n) => n.name === 'Verify Attachment') || !w.nodes.some((n) => n.name === 'Load Review')) throw new Error('supervised nodes missing');
  write('approval-and-delivery.json', { name: 'IdeaToPlan - Plan Approval and Delivery (supervised)', nodes: w.nodes, connections: w.connections, settings: { executionOrder: 'v1' } });
  console.log(mail(w.nodes).join('\n'));
} else if (cmd === 'request') {
  const w = read(a);
  if (!b) throw new Error('approval workflow id needed');
  const start = w.nodes.find((n) => n.name === 'Start Approval');
  start.parameters.workflowId.value = b;
  const id = w.nodes.find((n) => n.name === 'Plan Version ID');
  if (!id.parameters.jsCode.includes('PASTE-PLAN-VERSION-ID-HERE')) throw new Error('the version ID placeholder is missing');
  write('request-approval.json', { name: 'IdeaToPlan - Request approval for a reviewed version (run by hand)', nodes: w.nodes, connections: w.connections, settings: { executionOrder: 'v1' } });
} else throw new Error('pipeline | approval <file> | request <file> <approval id>');
