// Compares the code of n8n Code nodes, as exported from n8n, with the local files the tests run.
// Run: node n8n/v2-test/tests/compare-deployed.mjs <exported workflow JSON> [--adopt]
// The export is the JSON that the n8n API returns for a workflow. With --adopt, a local file that differs is
// overwritten with the deployed code, so the tests then run exactly what n8n runs.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

const FILES = { 'Collect Evidence': 'collect-evidence.js', 'Fetch Source Pages': 'fetch-source-pages.js', 'Build Verification Request': 'build-verification-request.js', 'Build Evidence': 'build-evidence.js', 'Citation Check': 'citation-check.js', 'Delivery Gate': 'delivery-gate.js', 'Sanitize Data': 'sanitize-data.js', 'Build Growth Payload': 'build-growth-payload.js', 'Founder Context': 'founder-context.js', 'Plan Revision Request': 'plan-revision-request.js', 'Finalize Plan': 'finalize-plan.js', 'Compute Financials': 'compute-financials.js', 'Build Recheck Request': 'build-recheck-request.js', 'Apply Revisions': 'apply-revisions.js', 'Build Financial Request': 'build-financial-request.js', 'Test Financial Baseline': 'test-financial-baseline.js' };
const norm = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const raw = readFileSync(process.argv[2], 'utf8');
const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
const nodes = (parsed.data || parsed).nodes;
let differ = 0;
for (const [name, file] of Object.entries(FILES)) {
  const node = nodes.find((n) => n.name === name);
  if (!node) { console.log(name.padEnd(28), 'not in this workflow'); continue; }
  const deployed = norm(node.parameters.jsCode);
  const local = norm(readFileSync(path.join(ROOT, file), 'utf8'));
  if (deployed === local) { console.log(name.padEnd(28), 'identical', deployed.length + ' chars'); continue; }
  differ++;
  let i = 0;
  while (i < deployed.length && deployed[i] === local[i]) i++;
  console.log(name.padEnd(28), 'DIFFERS at char ' + i + '\n  deployed: ' + JSON.stringify(deployed.slice(Math.max(0, i - 40), i + 80)) + '\n  local:    ' + JSON.stringify(local.slice(Math.max(0, i - 40), i + 80)));
  if (process.argv.includes('--adopt')) { writeFileSync(path.join(ROOT, file), deployed + '\n', 'utf8'); console.log('  local file overwritten with the deployed code'); }
}
process.exit(differ ? 1 : 0);
