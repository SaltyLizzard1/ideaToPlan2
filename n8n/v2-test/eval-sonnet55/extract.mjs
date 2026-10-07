// Takes a saved n8n execution of the evaluation workflow and stores the model response under outputs/<label>.json.
// Prints the finish reason, token counts and the cost OpenRouter reported. No network.
// Run: node n8n/v2-test/eval-sonnet55/extract.mjs <saved execution file>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (Array.isArray(raw)) raw = JSON.parse(raw[0].text);
const exec = raw.data || raw;
const nodes = exec.nodes || (exec.data && exec.data.resultData && exec.data.resultData.runData) || {};
const first = (name) => { const n = nodes[name]; if (!n) return null; if (n.data && n.data.output) return n.data.output[0][0].json; const r = Array.isArray(n) ? n[0] : n; return r.data.main[0][0].json; };
const res = first('Result');
if (!res) throw new Error('no Result node in this execution: ' + Object.keys(nodes).join(', '));
const r = res.response || {};
mkdirSync(path.join(here, 'outputs'), { recursive: true });
writeFileSync(path.join(here, 'outputs', res.label + '.json'), JSON.stringify({ execution: exec.id, startedAt: exec.startedAt, stoppedAt: exec.stoppedAt, label: res.label, response: r }, null, 1));
const ch = (r.choices || [])[0] || {};
const u = r.usage || {};
const text = (ch.message && ch.message.content) || '';
console.log(JSON.stringify({ execution: exec.id, label: res.label, model: r.model, provider: r.provider, finish: ch.finish_reason, error: r.error ? JSON.stringify(r.error).slice(0, 300) : undefined, prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, reasoning_tokens: (u.completion_tokens_details || {}).reasoning_tokens, cost: u.cost, content_chars: text.length, seconds: Math.round((new Date(exec.stoppedAt) - new Date(exec.startedAt)) / 1000) }));
