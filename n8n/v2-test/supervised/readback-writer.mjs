// Compares a saved n8n workflow (n8n_get_workflow, mode full) with the repository after the writer change.
// Run: node supervised/readback-writer.mjs <saved workflow file> <backup json of the same workflow before the change>
import { readFileSync } from 'node:fs';
const load = (f) => { let j = JSON.parse(readFileSync(f, 'utf8')); if (Array.isArray(j)) j = JSON.parse(j[0].text); return j.data || j; };
const norm = (s) => String(s).split('\r\n').join('\n').trimEnd();
const w = load(process.argv[2]), before = load(process.argv[3]);
const here = new URL('../', import.meta.url);
const repo = (f) => norm(readFileSync(new URL(f, here), 'utf8'));
const node = (W, n) => W.nodes.find((x) => x.name === n);
const same = { 'Build Growth Payload': 'build-growth-payload.js', 'Format Growth Output1': 'format-growth-output.js' };
for (const [n, f] of Object.entries(same)) console.log(n, norm(node(w, n).parameters.jsCode) === repo(f) ? 'SAME as repository' : 'DIFFERENT from repository');
const p = node(w, 'Build Growth Payload').parameters.jsCode;
console.log('writer line:', (p.match(/payload: JSON\.stringify\(\{[^[]*/) || [''])[0].trim());
const changed = [];
for (const n of w.nodes) { const b = node(before, n.name); if (!b) changed.push('ADDED ' + n.name); else if (JSON.stringify(b.parameters) !== JSON.stringify(n.parameters) || !!b.disabled !== !!n.disabled || JSON.stringify(b.credentials || {}) !== JSON.stringify(n.credentials || {})) changed.push(n.name); }
for (const b of before.nodes) if (!node(w, b.name)) changed.push('REMOVED ' + b.name);
console.log('nodes that differ from the backup:', changed.join(', ') || 'none');
console.log('connections unchanged:', JSON.stringify(w.connections) === JSON.stringify(before.connections), '| active:', w.active, '| nodes:', w.nodes.length);
const models = {}; for (const n of w.nodes) { const m = JSON.stringify(n.parameters).match(/anthropic\/claude-[a-z0-9.-]+|perplexity\/[a-z0-9.-]+/g); if (m) models[n.name] = [...new Set(m)].join(','); }
console.log('models:', JSON.stringify(models));
console.log('version:', w.versionId, '| published version:', w.activeVersionId || 'none');
