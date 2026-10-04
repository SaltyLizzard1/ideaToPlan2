// Finalize Plan: picks the final text, sets the delivery status, and writes the review report.
// HOLD = a blocking issue remains. REVIEW = a major issue remains. SEND = neither.
const res = $('Plan Revision Request').first().json;
let rev = null;
try { rev = $('Apply Revisions').first().json; } catch (e) {}
const text = (rev && typeof rev.text === 'string' && rev.text) ? rev.text : ($('Assemble Plan').first().json.text || '');

const findings = res.findings || [];
// Source-list integrity. Every source ID cited in the final plan must have an entry to print in the Sources section.
// The Sources section is built from sources_cited, so what is checked here is exactly what is printed.
let allSources = [];
try { allSources = JSON.parse($('Build Evidence').first().json.sources || '[]'); } catch (e) {}
const srcById = {};
allSources.forEach((x) => { srcById[x.id] = x; });
const citedIds = [...new Set(text.match(/\b[SW]\d+\b/g) || [])];
const sources_cited = citedIds.filter((id) => srcById[id] && srcById[id].url).map((id) => srcById[id]);
const listedIds = new Set(sources_cited.map((x) => x.id));
citedIds.filter((id) => !listedIds.has(id)).forEach((id) => findings.push({ id: 'SRC-' + id, severity: 'BLOCKING', source: 'Automated check', check: 'CITED SOURCE MISSING FROM SOURCES', section: '', line: null, quote: '', problem: 'The plan cites ' + id + ', but there is no source entry for it to print in the Sources section.', fix: 'Remove the citation or correct the source ID.' }));

const by = (sev) => findings.filter((f) => f.severity === sev);
const status = by('BLOCKING').length ? 'HOLD' : by('MAJOR').length ? 'REVIEW' : 'SEND';

const lines = [];
lines.push('STATUS: ' + status + (status === 'HOLD' ? ' - do not send. Unresolved blocking issues are listed below.' : status === 'REVIEW' ? ' - check the major items below before sending.' : ' - no blocking or major issues remain.'));
if (rev) {
  lines.push('First review: ' + rev.before_counts.blocking + ' blocking, ' + rev.before_counts.major + ' major, ' + rev.before_counts.minor + ' minor.');
  if (rev.stats) lines.push('Blocking and major root findings: ' + rev.stats.root_findings + ', covering ' + rev.stats.occurrences + ' occurrences. Edit units: ' + rev.stats.units + ' (' + rev.stats.consolidated_units + ' combine overlapping findings or adjacent lines).');
  lines.push('Automated revision: ' + rev.requested_count + ' edit units, ' + rev.applied_count + ' applied, ' + (rev.requested_count - rev.applied_count) + ' not applied.' + ((rev.unlocated || []).length ? ' Separately, ' + rev.unlocated.length + ' finding(s) had no editable location.' : '') + (rev.revision_error ? ' ' + rev.revision_error : ''));
} else {
  lines.push('Automated revision: ' + ((res.unlocated || []).length ? 'not run, because no finding could be located for editing.' : 'not needed.'));
  (res.unlocated || []).forEach((x) => lines.push('- ' + x));
}
lines.push((rev ? 'After verification: ' : 'Review result: ') + by('BLOCKING').length + ' blocking, ' + by('MAJOR').length + ' major, ' + by('MINOR').length + ' minor.');
// The verification summary is computed from the verdicts. The reviewer's own free-text summary is not used after a revision.
if (rev) {
  const ver0 = res.verification || [];
  const nOf = (st) => ver0.filter((v) => v.status === st).length;
  const openCount = ver0.length - nOf('FIXED');
  lines.push('Verification result: ' + nOf('FIXED') + ' of ' + ver0.length + ' original blocking and major findings fixed, ' + nOf('PARTLY_FIXED') + ' partly fixed, ' + (nOf('NOT_FIXED') + nOf('NOT_VERIFIED')) + ' not fixed. New defects introduced by the revision: ' + (res.new_defects || []).length + '. ' + (openCount || (res.new_defects || []).length || by('BLOCKING').length || by('MAJOR').length ? 'Not everything is resolved: ' + by('BLOCKING').length + ' blocking and ' + by('MAJOR').length + ' major findings remain.' : 'All original blocking and major findings are resolved and none remain.'));
} else if (res.qa_summary) lines.push('QA summary of the first review: ' + res.qa_summary);

if (rev) {
  const ver = res.verification || [];
  lines.push('', 'VERIFICATION OF THE ORIGINAL BLOCKING AND MAJOR FINDINGS (' + ver.length + ')');
  if (!ver.length) lines.push('None to verify.');
  ver.forEach((v) => lines.push(v.id + ' | ' + (v.occurrences > 1 ? v.occurrences + ' occurrences | ' : '') + v.status.replace('_', ' ') + ' | ' + v.severity + ' | ' + v.check + (v.note ? ' | ' + v.note : '')));
  const nd = res.new_defects || [];
  lines.push('', 'NEW DEFECTS INTRODUCED BY THE REVISION (' + nd.length + ')');
  if (!nd.length) lines.push('None.');
  nd.forEach((f) => lines.push(f.id + ' | ' + f.severity + ' | ' + f.check + (f.unit ? ' | introduced by edit ' + f.unit : '') + ' | ' + f.problem));
  if (rev.unresolved.length) { lines.push('', 'EDIT UNITS NOT APPLIED (' + rev.unresolved.length + ')'); rev.unresolved.forEach((x) => lines.push('- ' + x)); }
  if ((rev.unlocated || []).length) { lines.push('', 'FINDINGS WITH NO EDITABLE LOCATION (' + rev.unlocated.length + ')'); rev.unlocated.forEach((x) => lines.push('- ' + x)); }
  if ((rev.stray || []).length) { lines.push('', 'REVISER OUTPUT IGNORED (' + rev.stray.length + ')'); rev.stray.forEach((x) => lines.push('- ' + x)); }
}

['BLOCKING', 'MAJOR', 'MINOR'].forEach((sev) => {
  const list = by(sev);
  if (!list.length) return;
  lines.push('', 'REMAINING ' + sev + ' (' + list.length + ')');
  list.forEach((f, i) => {
    lines.push((f.id || (i + 1)) + ' [' + f.source + '] ' + f.check + (f.section ? ' | ' + f.section : ''));
    lines.push('   ' + f.problem);
    if ((f.occurrences || []).length > 1) lines.push('   Occurrences: ' + f.occurrences.map((o) => 'L' + o.line + (o.section ? ' ' + o.section : '')).join('; '));
    if (f.quote) lines.push('   Text: ' + f.quote);
    if (f.fix) lines.push('   Fix: ' + f.fix);
  });
});
let derivedFigs = [];
try { derivedFigs = $('Citation Check').first().json.derived_figures || []; } catch (e) {}
if (derivedFigs.length) {
  lines.push('', 'FIGURES ACCEPTED AS DERIVED FROM THE FINANCIAL MODEL (' + derivedFigs.length + ')');
  derivedFigs.forEach((d) => lines.push('- ' + d.figure + ' = ' + d.how + ' (L' + d.line + ')'));
}
let recon = [];
try { recon = $('Compute Financials').first().json.reconciliation || []; } catch (e) {}
if (recon.length) {
  lines.push('', 'BUDGET AND FORECAST RECONCILIATION (' + recon.filter((r) => r.ok).length + ' of ' + recon.length + ' checks passed)');
  recon.forEach((r) => lines.push('- ' + (r.ok ? 'OK' : 'FAILED') + ' | ' + r.check + ': ' + r.detail));
}
const fromComputed = findings.filter((f) => f.check === 'COMPUTED CONTENT WORDING' || f.check === 'FINANCIAL MODEL');
lines.push('', 'UNRESOLVED ISSUES ORIGINATING IN COMPUTED FINANCIAL CONTENT (' + fromComputed.length + ')');
if (!fromComputed.length) lines.push('None.');
fromComputed.forEach((f) => lines.push('- ' + f.severity + ' | ' + f.problem));
lines.push('', 'SOURCES: ' + citedIds.length + ' cited in the plan, ' + sources_cited.length + ' listed in the Sources section.');
lines.push('', 'Limit: ledger entries were verified against the fetched source pages. Plan sentences were checked against the ledger, not against the pages. Pages that need a browser to render, and PDFs, could not be read.');

// Run telemetry. Token counts and costs are MEASURED: they come from the OpenRouter responses. Nothing is estimated.
// Usage that no response reported is listed as unknown and is never filled in with a guess.
const ctx = $('Founder Context').first().json;
const calls = [];
const addCall = (stage, node, r) => { if (!r || !r.usage) return; calls.push({ stage, node, model: r.model || '', input_tokens: r.usage.prompt_tokens || 0, output_tokens: r.usage.completion_tokens || 0, cost_usd: typeof r.usage.cost === 'number' ? r.usage.cost : null }); };
const nodeJson = (n) => { try { return $(n).first().json; } catch (e) { return null; } };
addCall('Research', 'Distill Search Query', nodeJson('Distill Search Query'));
addCall('Research', 'Growth Research', nodeJson('Growth Research'));
addCall('Research', 'Market Research', nodeJson('Market Research'));
addCall('Financial assumptions', 'Financial Assumptions', nodeJson('Financial Assumptions'));
addCall('Writer', 'Growth Plan Generator1', nodeJson('Growth Plan Generator1'));
const qa1 = rev ? rev.first_qa_usage : res.qa_usage;
if (qa1) addCall('QA', 'Final QA (review)', qa1);
addCall('Revision', 'Revise Plan', rev ? nodeJson('Revise Plan') : null);
if (rev && res.qa_usage) addCall('Verification', 'Final QA (verification)', res.qa_usage);
// Source verification: one model call per fetched page. Usage is summed from the responses that reported it.
let verifierItems = [];
try { verifierItems = $('Verify Claims').all().map((i) => i.json); } catch (e) {}
try { verifierItems = verifierItems.concat($('Verify Corrections').all().map((i) => i.json)); } catch (e) {}
const verifierMeasured = verifierItems.filter((r) => r && r.usage && typeof r.usage.cost === 'number');
const verifierUnknown = verifierItems.length - verifierMeasured.length;
if (verifierItems.length) calls.push({ stage: 'Source verification', node: 'Verify Claims and Verify Corrections', model: (verifierMeasured[0] && verifierMeasured[0].model) || '', call_count: verifierItems.length, calls_with_unknown_usage: verifierUnknown, input_tokens: verifierMeasured.reduce((p, r) => p + (r.usage.prompt_tokens || 0), 0), output_tokens: verifierMeasured.reduce((p, r) => p + (r.usage.completion_tokens || 0), 0), cost_usd: verifierMeasured.length ? verifierMeasured.reduce((p, r) => p + r.usage.cost, 0) : null });
let verifyStats = null;
try { verifyStats = JSON.parse($('Build Evidence').first().json.source_integrity).verification; } catch (e) {}
const unmetered = [];
if (nodeJson('Brave Search')) unmetered.push('Brave Search: 1 call, cost not in the response');
if (ctx.tier !== 'Growth') unmetered.push('Basic LLM Chain (Starter writer): token usage is not exposed by this node');
unmetered.push('PDF generation: 1 call, cost not in the response');
if (verifierUnknown) unmetered.push('Verify Claims: ' + verifierUnknown + ' of ' + verifierItems.length + ' calls returned no usage, so their tokens and cost are unknown and are not in the totals');
if (verifyStats) unmetered.push('Source page fetches: ' + verifyStats.pages_requested + ' plain HTTP requests made by the workflow itself, no per-request charge');
const now = Date.now();
const stamp = (n) => { const j = nodeJson(n); return j && j.t_ms ? j.t_ms : null; };
const marks = [['Research', stamp('Build Evidence')], ['Financial assumptions and calculation', stamp('Compute Financials')], ['Writer', stamp('Assemble Plan')], ['QA', rev ? rev.qa_done_ms : res.t_ms], ['Revision', rev ? rev.t_ms : null], ['Verification', rev ? res.t_ms : null]];
const stage_seconds = [];
let prev = ctx.run_started_ms || null;
marks.forEach(([name, t]) => { if (!t || !prev) return; stage_seconds.push({ stage: name, seconds: Math.round((t - prev) / 1000) }); prev = t; });
const sumOf = (k) => calls.reduce((p, c) => p + (c[k] || 0), 0);
const costKnown = calls.every((c) => c.cost_usd !== null && !c.calls_with_unknown_usage);
const callCount = calls.reduce((p, c) => p + (c.call_count || 1), 0);
const telemetry = { ai_calls: callCount, calls, unmetered, cost_basis: { measured_usd: Math.round(sumOf('cost_usd') * 10000) / 10000, estimated_usd: null, estimates: 'none: no cost in this report is an estimate', unknown: unmetered }, source_verification: verifyStats ? { fetch_seconds: Math.round((verifyStats.fetch_ms || 0) / 100) / 10, verify_seconds: Math.round((verifyStats.verify_ms || 0) / 100) / 10, pages_requested: verifyStats.pages_requested, pages_read: verifyStats.pages_read, verified: verifyStats.verified, excluded: verifyStats.excluded } : null, stage_seconds, total_seconds_to_finalize: ctx.run_started_ms ? Math.round((now - ctx.run_started_ms) / 1000) : null, input_tokens: sumOf('input_tokens'), output_tokens: sumOf('output_tokens'), metered_cost_usd: Math.round(sumOf('cost_usd') * 10000) / 10000, cost_complete: costKnown };
lines.push('', 'RUN TELEMETRY (' + ctx.tier + ' plan)');
calls.forEach((c) => lines.push('- ' + c.stage + ' | ' + c.node + (c.call_count ? ' x' + c.call_count : '') + ' | ' + c.model + ' | in ' + c.input_tokens + ' | out ' + c.output_tokens + ' | ' + (c.cost_usd === null ? 'cost not reported' : '$' + c.cost_usd.toFixed(4))));
lines.push('AI calls: ' + callCount + '. Tokens: ' + telemetry.input_tokens + ' in, ' + telemetry.output_tokens + ' out. Metered AI and research cost: $' + telemetry.metered_cost_usd.toFixed(4) + (costKnown ? '' : ' (incomplete: at least one call reported no cost)') + '.');
lines.push('Cost basis: measured from provider responses. Estimated: none. Unknown usage is listed below and is not included.');
unmetered.forEach((u) => lines.push('Not metered: ' + u));
if (verifyStats) lines.push('Source verification: ' + verifyStats.verified + ' claims verified, ' + verifyStats.excluded + ' excluded; ' + verifyStats.pages_read + ' of ' + verifyStats.pages_requested + ' pages read; fetch ' + (Math.round((verifyStats.fetch_ms || 0) / 100) / 10) + 's, verify ' + (Math.round((verifyStats.verify_ms || 0) / 100) / 10) + 's (inside the Research stage time).');
if (stage_seconds.length) lines.push('Time by stage: ' + stage_seconds.map((x) => x.stage + ' ' + x.seconds + 's').join(', ') + '. Total to this point: ' + telemetry.total_seconds_to_finalize + 's (PDF and email come after).');

return { text, status, report: lines.join('\n'), revised: !!rev, sources_cited, telemetry };
