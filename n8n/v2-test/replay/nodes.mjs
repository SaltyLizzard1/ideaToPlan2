// Code of the small nodes that exist only in the isolated claim-review replay workflow. None of them is in v2 Test.
// build-copy.mjs places them in the workflow file; simulate.mjs runs the same text offline, so that what n8n returns
// can be compared with what the code returns outside n8n.

// Replay Config. dry_run true: no request leaves the workflow. Each mode is one execution.
//   scenarios        every fault scenario, answers scripted, all responses of a run at once
//   sequential_dry   one run, requests sent one at a time through the budget gate, answers scripted
//   stage_one        the stage-one selection, one request, through the budget gate
export const replayConfig = (cfg) => `const cfg = ${JSON.stringify(cfg)};
// A new execution starts with nothing spent.
const sd = $getWorkflowStaticData('global');
sd.claim_spent = 0; sd.claim_sent = 0; sd.claim_cost_unknown = false; sd.claim_stopped = ''; sd.claim_log = [];
return [{ json: cfg }];`;

export const scenarios = (list) => `const cfg = $('Replay Config').first().json;
const all = ${JSON.stringify(list)};
const mine = all.filter((s) => s.mode === cfg.mode && (!cfg.only || cfg.only === s.name));
if (!mine.length) throw new Error('No scenario for mode ' + cfg.mode);
// Scripted answers stand in for a model only in a dry run. With dry_run off, a run goes through the budget gate or not at all.
if (cfg.dry_run !== true && mine.some((s) => !s.sequential)) throw new Error('These scenarios use scripted answers and run only with dry_run true.');
// The sequential path holds one run per execution.
if (mine.some((s) => s.sequential) && mine.length > 1) throw new Error('A sequential mode takes exactly one scenario; set "only" in Replay Config.');
return mine.map((s) => ({ json: s }));`;

export const scenario = `return [{ json: $input.first().json }];`;

export const claimSelection = `return [{ json: { ids: $('Scenario').first().json.selection || [] } }];`;

export const finalizeStub = `// Stands in for Finalize Plan, which writes nothing here: the gate needs only a status and the final findings.
return [{ json: { status: 'HOLD', final_findings: [] } }];`;

// One request at a time: before each, what has been spent is compared with what the next could cost at most.
export const budgetGate = `const cfg = $('Replay Config').first().json;
const sc = $('Scenario').first().json;
const ceiling = Number(sc.ceiling_usd) || cfg.ceiling_usd;
const sd = $getWorkflowStaticData('global');
const b = $input.first().json;
const p = JSON.parse(b.payload);
const estIn = Math.ceil((p.messages[0].content.length + p.messages[1].content.length) / 3.3);
const worst = Math.round((estIn * cfg.usd_per_m_in + p.max_tokens * cfg.usd_per_m_out) / 1e6 * 1e4) / 1e4;
const spent = Number(sd.claim_spent) || 0, sent = Number(sd.claim_sent) || 0;
let stop = '';
// A stop is final: once one request is held back, none after it is sent, whatever it would cost.
if (sd.claim_stopped) stop = 'an earlier request was not sent, and nothing is sent after a stop';
else if (sd.claim_cost_unknown) stop = 'the cost of an earlier request was not reported, so what has been spent is not known';
else if (sent >= cfg.max_requests) stop = 'the limit of ' + cfg.max_requests + ' requests is reached';
else if (spent + worst > ceiling) stop = 'spent USD ' + spent.toFixed(4) + ' and the next request could cost up to USD ' + worst.toFixed(4) + ', over the ceiling of USD ' + ceiling.toFixed(2);
if (stop && !sd.claim_stopped) sd.claim_stopped = stop;
(sd.claim_log = sd.claim_log || []).push({ batch: b.batch, go: !stop, spent_before: Math.round(spent * 1e6) / 1e6, sent_before: sent, worst_case_usd: worst, stop_reason: stop });
return [{ json: { ...b, go: !stop, stop_reason: stop, spent_before: spent, sent_before: sent, worst_case_usd: worst, dry_run: cfg.dry_run === true } }];`;

export const notSent = `const b = $input.first().json;
return [{ json: { not_sent: true, batch: b.batch, why: b.stop_reason } }];`;

// After every request, scripted or real: the recorded cost is added. A response with no cost stops the next request.
export const recordCost = `const sd = $getWorkflowStaticData('global');
const r = $input.first().json || {};
sd.claim_sent = (Number(sd.claim_sent) || 0) + 1;
const cost = r.usage && typeof r.usage.cost === 'number' ? r.usage.cost : null;
if (cost === null) sd.claim_cost_unknown = true; else sd.claim_spent = (Number(sd.claim_spent) || 0) + cost;
return [{ json: r }];`;

// Faults that concern the list of responses as a whole. Dry run only; with dry_run false the list passes untouched.
export const arrange = `const cfg = $('Replay Config').first().json;
const sc = $('Scenario').first().json;
const fx = sc.faults || {};
let items = $input.all().map((i) => i.json);
if (cfg.dry_run !== true) return items.map((json) => ({ json }));
const batchOf = (r) => { try { return JSON.parse(r.choices[0].message.content).batch; } catch (e) { return null; } };
if (fx.drop_batches) items = items.filter((r) => !fx.drop_batches.includes(batchOf(r)));
if (fx.prepend_stale) {
  const old = items.slice(0, fx.prepend_stale).map((r) => { const o = JSON.parse(r.choices[0].message.content); o.review = fx.prepend_stale_token; return { ...r, id: r.id + '-stale', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(o) } }] }; });
  items = old.concat(items);
}
if (fx.reverse) items = items.slice().reverse();
if (fx.shuffle) items = fx.shuffle.map((k) => items[k]).filter(Boolean);
return items.map((json) => ({ json }));`;

// What one run came to, in a form that can be compared line for line with the offline run of the same code.
export const scenarioResult = `const sc = $('Scenario').first().json;
const built = $('Build Claim Review').all().map((i) => i.json);
const combined = $('Combine Claim Review').first().json;
const cr = combined.claim_review || {};
const prr = $('Plan Revision Request').first().json;
const gate = $input.first().json;
const sd = $getWorkflowStaticData('global');
const rev = $('Apply Revisions').first().json;
const records = cr.records || [];
return [{ json: {
  scenario: sc.name,
  plan: sc.plan || 'A',
  plan_is_variant_b: String(rev.text).includes('This is a hypothesis to test in interviews, not a finding.'),
  review_built: (built[0] || {}).review || null,
  review_combined: cr.review || null,
  batches: built.length,
  claims: cr.claims,
  settled: cr.settled,
  defects: (cr.defects || []).length,
  open: (cr.open || []).length,
  unreviewed: records.filter((r) => r.status === 'open').map((r) => r.id).sort(),
  missing: (cr.missing || []).length,
  not_sent: (cr.not_sent || []).length,
  contradictory: cr.contradictory || [],
  duplicates: cr.duplicates || [],
  stray: (cr.stray || []).map((x) => x.id + ':' + x.batch + '>' + x.belongs_to),
  failed_batches: (cr.failed_batches || []).map((f) => f.batch + (f.partial ? ' partial' : '') + ': ' + f.why),
  rejected: (cr.rejected_responses || []).map((x) => (x.batch || '-') + ': ' + x.why.slice(0, 60)),
  repeated_batches: cr.repeated_batches || [],
  on_judgment: cr.on_judgment || {},
  usage: cr.usage || null,
  claim_findings: (prr.findings || []).filter((f) => String(f.id).startsWith('CL-')).map((f) => f.id + (f.unresolved ? ' unresolved ' : ' confirmed ') + f.check).filter((x, i, a) => x.includes('CL-OPEN') || i < 3 || i === a.length - 1),
  claim_defect_findings: (prr.findings || []).filter((f) => /^CL-\\d/.test(String(f.id))).length,
  held: gate.blocked === true,
  unresolved_check_count: gate.unresolved_check_count,
  confirmed_blocker_count: gate.confirmed_blocker_count,
  kept_verifier_answer: Array.isArray(combined.choices),
  budget_log: sc.sequential ? (sd.claim_log || []) : [],
  spent_recorded: sc.sequential ? Math.round((Number(sd.claim_spent) || 0) * 1e6) / 1e6 : null,
} }];`;

export const replayResult = `const cfg = $('Replay Config').first().json;
const runs = $input.all().map((i) => i.json);
return [{ json: { dry_run: cfg.dry_run === true, mode: cfg.mode, scenarios: runs.length, names: runs.map((r) => r.scenario), runs } }];`;

export const faultProbeItems = `// Three requests to see, at no cost, what n8n hands on when the middle one fails. No model, no credential.
// The first and third ask this n8n instance for its own health page; the second asks a closed port.
return [
  { json: { n: 1, url: 'http://127.0.0.1:5678/healthz' } },
  { json: { n: 2, url: 'http://127.0.0.1:9/closed' } },
  { json: { n: 3, url: 'http://127.0.0.1:5678/healthz' } },
];`;

export const faultProbeResult = `const items = $input.all().map((i) => i.json);
return [{ json: { returned: items.length, shapes: items.map((j, k) => ({ position: k + 1, keys: Object.keys(j || {}), has_error: !!(j && j.error), error_type: j && j.error ? typeof j.error : null, error_text: j && j.error ? String(j.error.message || j.error.description || JSON.stringify(j.error)).slice(0, 160) : null, status: j && j.status ? j.status : null })) } }];`;
