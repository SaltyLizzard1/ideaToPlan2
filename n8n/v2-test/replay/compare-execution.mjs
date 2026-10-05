// Compares what an n8n execution of the replay returned with what the same code returns offline (simulate.mjs).
// Run: node n8n/v2-test/replay/compare-execution.mjs <saved n8n_executions result> <expected-*.json>
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const exec = (Array.isArray(raw) ? JSON.parse(raw[0].text) : raw).data;
const out = (name) => { const n = exec.nodes[name]; return n ? n.data.output[0].map((i) => i.json) : null; };
const got = out('Replay Result')[0];
const want = JSON.parse(readFileSync(process.argv[3], 'utf8'));
console.log('execution', exec.id, exec.status, 'dry_run', got.dry_run, 'mode', got.mode, '| scenarios in n8n', got.runs.length, 'offline', want.runs.length);
console.log('OpenRouter node ran:', !!exec.nodes['Review Claims (OpenRouter)']);
let same = 0;
got.runs.forEach((g, k) => {
  const w = want.runs[k];
  const diff = Object.keys({ ...g, ...w }).filter((key) => { try { assert.deepEqual(g[key], w[key]); return false; } catch (e) { return true; } });
  if (!diff.length) same++;
  console.log((diff.length ? 'DIFFERS ' : 'same    ') + g.scenario + ' | token ' + g.review_built + ' | settled ' + g.settled + ' defects ' + g.defects + ' open ' + g.open + ' | failed [' + g.failed_batches.map((f) => f.split(':')[0]).join(',') + '] rejected ' + g.rejected.length + ' stray ' + g.stray.length + ' | ' + g.claim_findings.filter((x) => x.includes('CL-OPEN')).join('') + (diff.length ? ' | fields that differ: ' + diff.join(', ') : ''));
  if (diff.length) diff.slice(0, 3).forEach((key) => console.log('   ' + key + '\n     n8n:     ' + String(JSON.stringify(g[key])).slice(0, 300) + '\n     offline: ' + String(JSON.stringify(w[key])).slice(0, 300)));
});
console.log(same + ' of ' + got.runs.length + ' scenarios identical to the offline run');
const probe = out('Fault Probe Result');
if (probe) console.log('fault probe:', JSON.stringify(probe[0]));
writeFileSync(process.argv[2].replace(/\.json$/, '') + '.replay-result.json', JSON.stringify({ execution: exec.id, replay: got, probe }, null, 1));
