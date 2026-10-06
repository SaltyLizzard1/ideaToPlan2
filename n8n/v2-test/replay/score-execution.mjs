// Scores a stage-one execution against the fixed answer key (replay/plan.mjs, committed before the model was asked).
// The score reads the model's claim verdicts only. What code found on the same sentences is listed beside it and never
// counted as the model's detection.
// Run: node n8n/v2-test/replay/score-execution.mjs <execution file with the OpenRouter responses> <execution file with Combine Claim Review> <file with the prepared requests>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stageOne, scoreStageOne } from './plan.mjs';
import { check, LEDGER } from '../tests/claim-helpers.mjs';

const load = (f) => JSON.parse(readFileSync(f, 'utf8')).data;
const a = load(process.argv[2]), b = load(process.argv[3]);
const prepared = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const items = (exec, name) => (exec.nodes[name] ? exec.nodes[name].data.output.flat().map((i) => i.json) : null);
const sha = (s) => createHash('sha256').update(s).digest('hex');

const sent = items(a, 'Build Claim Review');
console.log('execution', a.id, a.status, a.startedAt, '->', a.stoppedAt);
console.log('requests as sent equal the prepared requests:', sent.map((x, k) => sha(x.payload) === prepared[k].sha).join(', '));
const responses = items(a, 'Review Claims (OpenRouter)');
console.log('\nRESPONSES');
responses.forEach((r, k) => { const ch = (r.choices || [])[0] || {}; let o = null; try { const raw = ch.message.content; o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) {} console.log(' request ' + (k + 1) + ' | id ' + r.id + ' | model ' + r.model + ' | provider ' + r.provider + ' | finish ' + ch.finish_reason + ' | in ' + (r.usage || {}).prompt_tokens + ' out ' + (r.usage || {}).completion_tokens + ' | cost $' + (r.usage || {}).cost + ' | readable ' + !!o + ' | token ' + (o && o.review) + ' batch ' + (o && o.batch) + ' | verdicts ' + (o ? (o.claims || []).length + ' claims, ' + (o.recommendation || []).length + ' recommendation, ' + (o.none || []).length + ' none' : 0)); });
const replay = items(a, 'Replay Result')[0].runs[0];
console.log(' gate: ' + replay.budget_log.map((l) => 'request ' + l.batch + (l.go ? ' sent' : ' NOT SENT') + ', spent before $' + l.spent_before + ', worst case $' + l.worst_case_usd).join(' | '));
console.log(' inspection: ' + replay.response_log.map((x) => x.batch + ': ' + x.inspection).join(' | '), '| total recorded $' + replay.spent_recorded);

const cr = items(b, 'Combine Claim Review')[0].claim_review;
const key = await stageOne();
const byId = Object.fromEntries(cr.records.map((r) => [r.id, r]));
const rows = key.map((k) => ({ ...k, rec: byId[k.id] }));
const usable = rows.filter((r) => r.rec.status === 'settled' || r.rec.status === 'defect');
console.log('\nVERDICTS for the 36 claims sent: usable ' + usable.length + ', unusable ' + rows.filter((r) => r.rec.status === 'open' && !r.rec.missing).length + ', missing ' + rows.filter((r) => r.rec.missing).length + ' | rejected responses ' + cr.rejected_responses.length + ', stray ' + cr.stray.length + ', duplicates ' + cr.duplicates.length + ', contradictory ' + cr.contradictory.length + ' | not sent ' + cr.not_sent.length);
const score = scoreStageOne(key, cr.records);

// What code reports on the same lines, from the saved plan. Listed beside the model's verdict, not added to it.
const cc = await check();
const codeAt = (line) => cc.det_issues.filter((i) => i.line === line && i.severity === 'BLOCKING').map((i) => i.type);
// The raw answer the model gave for each claim, as it wrote it.
const rawAnswers = {};
responses.forEach((r) => { try { const raw = r.choices[0].message.content; const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); (o.claims || []).forEach((x) => { rawAnswers[x.id] = x; }); (o.recommendation || []).forEach((x) => { const id = typeof x === 'object' ? x.id : x; rawAnswers[id] = { class: 'RECOMMENDATION', ...(typeof x === 'object' ? x : {}) }; }); (o.none || []).forEach((x) => { const id = typeof x === 'object' ? x.id : x; rawAnswers[id] = { class: 'NONE', ...(typeof x === 'object' ? x : {}) }; }); } catch (e) {} });
const brief = (x) => { if (!x) return 'no answer'; if (x.split) return 'SPLIT: ' + x.split.map((p) => '[' + p.class + (p.supported !== undefined ? ' supported=' + p.supported : '') + (p.label ? ' label="' + p.label + '"' : '') + (p.missing ? ' missing="' + p.missing + '"' : '') + (p.entries ? ' entries=' + p.entries.join(',') : '') + '] "' + p.text + '"').join(' + '); return x.class + (x.supported !== undefined ? ' supported=' + x.supported : '') + (x.entries ? ' entries=' + x.entries.join(',') : '') + (x.entry_quote ? ' entry_quote="' + x.entry_quote + '"' : '') + (x.aspects ? ' aspects=' + Object.entries(x.aspects).map(([k2, v]) => k2[0] + ':' + v).join(' ') : '') + (x.intake_quote ? ' intake_quote="' + x.intake_quote + '"' : '') + (x.label ? ' label="' + x.label + '"' : '') + (x.kind ? ' kind=' + x.kind : '') + (x.reason ? ' reason="' + x.reason + '"' : '') + (x.missing ? ' missing="' + x.missing + '"' : ''); };
const line = (r) => 'L' + r.line + ' ' + r.id + ' | ' + r.cat + ' | model: ' + r.rec.status.toUpperCase() + (r.rec.check ? ' (' + r.rec.check + ')' : '') + ' | code on this line: ' + (codeAt(r.line).join(', ') || 'nothing');
const full = (r) => '   CLAIM: ' + r.text + '\n   KEY: expect ' + r.expect + '. Basis: ' + r.basis + '\n   MODEL ANSWER: ' + brief(rawAnswers[r.id]) + (r.rec.why ? '\n   CODE ON THE ANSWER: ' + r.rec.why : '') + (rawAnswers[r.id] && rawAnswers[r.id].entries ? '\n   EVIDENCE NAMED: ' + rawAnswers[r.id].entries.map((id) => { const e = LEDGER.find((x) => x.claim_id === id); return e ? id + ' (' + e.source_ids + ', about ' + e.entity + '): "' + e.claim + '" | page: "' + e.page_excerpt + '"' : id + ' (not in ledger)'; }).join('\n                   ') : '');

const out = [];
const say = (s) => { console.log(s); out.push(s); };
say('\nDETECTION: ' + score.detection.found + ' of ' + score.detection.targets + ' expected defects returned as defects by the model');
rows.filter((r) => r.expect === 'defect').forEach((r) => say(' ' + (r.rec.status === 'defect' ? 'FOUND   ' : r.rec.status === 'settled' ? 'MISSED  ' : 'UNREVIEWED ') + line(r) + ' | key basis: ' + (r.basis.startsWith('code') ? 'code rule' : r.basis.startsWith('ledger') ? 'ledger' : 'my reading')));
say('\nFALSE POSITIVES: ' + score.false_positives.wrongly_defect.length + ' of ' + score.false_positives.controls + ' controls returned as defects; ' + score.false_positives.left_unreviewed.length + ' controls left unreviewed');
rows.filter((r) => r.expect === 'settle').forEach((r) => say(' ' + (r.rec.status === 'settled' ? 'settled ' : r.rec.status === 'defect' ? 'DEFECT  ' : 'UNREVIEWED ') + line(r) + ' | as ' + (r.rec.cls || '-')));
say('\nNOT SCORED');
rows.filter((r) => r.expect === 'either').forEach((r) => say(' ' + line(r) + '\n' + full(r)));
say('\nBY CATEGORY ' + JSON.stringify(score.by_category));
say('\nDISAGREEMENTS WITH THE KEY, AND EVERY EXPECTATION THAT RESTS ON MY READING');
rows.filter((r) => r.expect !== 'either' && ((r.expect === 'defect') !== (r.rec.status === 'defect') || r.rec.status === 'open' || r.basis.startsWith('my reading'))).forEach((r) => say(' ' + line(r) + '\n' + full(r)));
writeFileSync(process.argv[2].replace(/\.json$/, '') + '.stage-one-score.txt', out.join('\n'));
writeFileSync(process.argv[2].replace(/\.json$/, '') + '.stage-one-score.json', JSON.stringify({ execution: a.id, score, responses: responses.map((r) => ({ id: r.id, model: r.model, provider: r.provider, usage: r.usage, finish_reason: ((r.choices || [])[0] || {}).finish_reason })), answers: rawAnswers }, null, 1));
