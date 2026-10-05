// Finalize Plan: picks the final text, sets the delivery status, and writes the review report.
// HOLD = a blocking issue remains. REVIEW = a major issue remains. SEND = neither.
const res = $('Plan Revision Request').first().json;
let rev = null;
try { rev = $('Apply Revisions').first().json; } catch (e) {}
let text = (rev && typeof rev.text === 'string' && rev.text) ? rev.text : ($('Assemble Plan').first().json.text || '');

const findings = (res.findings || []).slice();
// Findings raised here, after revision. The Delivery Gate reads them as well as the reviewer's findings.
const final_findings = [];

// COST CONDITION. When costs are unresolved, Compute Financials writes the condition the conclusion depends on. It is
// placed at the start of the Viability Assessment here, by code, after the model's revision, so its wording and
// figures cannot drift. The surrounding text is then checked: placing the paragraph does not make a plan acceptable
// if the plan still says the business works unconditionally, or that every cost is known.
let finModel = {};
try { finModel = $('Compute Financials').first().json || {}; } catch (e) {}
const costCondition = String(finModel.cost_condition || '');
const cost_condition_check = { required: !!costCondition, inserted: false, present: false, problems: [] };
if (costCondition) {
  const plainText = (v) => String(v).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  const isHeader = (l) => /^##\s/.test(l.trim());
  const bounds = (list, re) => { const a = list.findIndex((l) => isHeader(l) && re.test(l)); if (a < 0) return null; const b = list.findIndex((l, i) => i > a && isHeader(l)); return { start: a, end: b < 0 ? list.length : b }; };
  let L = text.split('\n');
  let v = bounds(L, /Viability/i);
  if (!v) cost_condition_check.problems.push('The plan has no Viability Assessment section, so the cost condition could not be placed.');
  else {
    if (!plainText(L.slice(v.start + 1, v.end).join(' ')).includes(plainText(costCondition))) { L.splice(v.start + 1, 0, '', costCondition); cost_condition_check.inserted = true; text = L.join('\n'); }
    L = text.split('\n');
    v = bounds(L, /Viability/i);
    cost_condition_check.present = plainText(L.slice(v.start + 1, v.end).join(' ')).includes(plainText(costCondition));
    if (!cost_condition_check.present) cost_condition_check.problems.push('The cost condition is not in the Viability Assessment after insertion.');
    const VIABLE = /\b(?:is|are|looks?|appears?|remains?|proves?) (?:financially |commercially |clearly |already )?(?:viable|profitable|sustainable|self-sustaining|worth pursuing|financially sound)\b|\bwill (?:be profitable|break even|cover its costs|turn a profit|make a profit)\b|\b(?:profitable|cash[- ]positive) (?:from|in|by) (?:month|year|the first)\b|\bthe (?:business|model|numbers?) works?\b/i;
  const CONDITIONAL = /\b(?:if|provided|as long as|unless|only|conditional|depends?|subject to|assum\w*|would|could|may|might|not|whether|until)\b/i;
  // Statements that deny the condition: that every cost is known or included, or that the threshold is a budget or an estimate.
  const DENIES = /\ball (?:the )?(?:costs|expenses) (?:are|have been) (?:included|accounted for|known|covered|captured)\b|\bno (?:other|further|additional|hidden|unknown|unresolved) costs\b|\b(?:costs|expenses) are fully (?:known|covered|accounted for)\b|\b(?:every|each) cost (?:is|has been) (?:included|accounted for|known)\b|\b(?:budget|allowance) (?:of|for) (?:each|every) (?:of these )?costs?\b|\bthreshold (?:is|as) (?:an? )?(?:estimate|budget|forecast) of\b/i;
    [v, bounds(L, /Executive Summary/i)].filter(Boolean).forEach((sec) => {
      for (let i = sec.start + 1; i < sec.end; i++) {
        const t = L[i].trim();
        if (!t || t.startsWith('#') || plainText(t) === plainText(costCondition)) continue;
        (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?;])\s+/)).forEach((sentence) => {
          if (VIABLE.test(sentence) && !CONDITIONAL.test(sentence)) cost_condition_check.problems.push('L' + (i + 1) + ' states that the business works with no condition, while costs are unresolved: "' + sentence.trim().slice(0, 200) + '"');
          else if (DENIES.test(sentence) && !/\bnot\b/i.test(sentence)) cost_condition_check.problems.push('L' + (i + 1) + ' contradicts the cost condition: "' + sentence.trim().slice(0, 200) + '"');
        });
      }
    });
  }
  // Startup budget, checked on every line the model wrote. The funding the included costs need is a computed figure;
  // whether the founder's budget covers all costs is not known while costs are unresolved, and the plan must not say it is.
  const BUDGET_ENOUGH = /\b(?:budget|ceiling|funds?|funding|capital|savings)\b[^.;]{0,80}?\b(?:sufficient|enough|adequate|ample|covers? (?:the|all|every|everything|what|launch)|will cover|can cover|fully funds?|is (?:not a|no) constraint)\b|\b(?:sufficient|enough|adequate|ample)\b[^.;]{0,40}?\b(?:budget|funds?|funding|capital|to (?:launch|start|get started|begin|open|fund|cover))\b|\bno (?:additional|further|outside|external|extra|more) (?:funding|capital|investment|money) (?:is |will be )?(?:needed|required|necessary)\b|\b(?:fully|comfortably|easily|well) (?:funded|within (?:the |your )?budget|under (?:the |your )?(?:budget|ceiling))\b|\bcan (?:launch|start|be launched|be started) (?:within|on|under|for) (?:the |your |this )?(?:budget|ceiling)\b/i;
  // Acceptable: the sentence limits itself to the included costs, or says that cover of all costs is not established.
  const BUDGET_QUALIFIED = /\b(?:unresolved|included costs?|costs? (?:that are )?included|costs? in the (?:model|figures|forecast)|included in (?:the|these) (?:model|figures|forecast)|not (?:yet )?(?:established|resolved|known|confirmed)|whether|cannot (?:yet )?be|until the|not (?:sufficient|enough|adequate)|insufficient)\b/i;
// Profit wording, checked on every line the model wrote.
  const PROFIT_CLAIM = /\breach(?:es|ed|ing)? (?:operating )?(?:profit|profitability|break-?even)\b|\b(?:is|becomes?|turns?) (?:operating[- ])?profitable\b|\bturns? (?:a |an )?(?:operating )?profit\b|\bprofitable (?:quickly|immediately|early|from)\b|\b(?:generates?|produces?|makes?|earns?) (?:a |an )?(?:operating )?profit (?:quickly|immediately|from the first)\b/i;
  // Acceptable: the sentence says the figure is for the included costs, or that the result depends on the unresolved costs.
  const PROFIT_QUALIFIED = /\b(?:unresolved|included costs?|costs? (?:that are )?included|costs? in the (?:model|figures|forecast)|included in (?:the|these) (?:model|figures|forecast))\b/i;
  const computedLines = new Set([finModel.scenario_block, finModel.forecast_block, finModel.budget_block, finModel.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || computedLines.has(t) || plainText(t) === plainText(costCondition)) return;
    (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?;])\s+/)).forEach((sentence) => {
      if (BUDGET_ENOUGH.test(sentence) && !BUDGET_QUALIFIED.test(sentence)) cost_condition_check.problems.push('L' + (i + 1) + ' says the startup budget is enough, while costs are unresolved: "' + sentence.trim().slice(0, 200) + '"');
      if (PROFIT_CLAIM.test(sentence) && !PROFIT_QUALIFIED.test(sentence)) cost_condition_check.problems.push('L' + (i + 1) + ' says the business reaches profit, without saying that this covers the included costs only and depends on the unresolved costs: "' + sentence.trim().slice(0, 200) + '"');
    });
  });
  cost_condition_check.problems.forEach((p, n) => { const f = { id: 'FIN-' + String(n + 1).padStart(3, '0'), severity: 'BLOCKING', source: 'Final check', check: 'COST CONDITION', section: 'Viability Assessment', line: null, quote: '', problem: p, fix: '', occurrences: [] }; findings.push(f); final_findings.push(f); });
  // Unresolved costs always reach a person: with no other finding the status is REVIEW, never SEND.
  if (!cost_condition_check.problems.length && !findings.some((f) => f.severity === 'BLOCKING' || f.severity === 'MAJOR')) { const f = { id: 'FIN-REVIEW', severity: 'MAJOR', source: 'Final check', check: 'COST CONDITION', section: 'Viability Assessment', line: null, quote: '', problem: 'Costs are unresolved (' + (finModel.unresolved_costs || []).join('; ') + '). The conclusion is conditional on them. Confirm them with the founder before sending.', fix: '', occurrences: [] }; findings.push(f); final_findings.push(f); }
}

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
  const refusedUnits = rev.rejected_units || [];
  lines.push('Automated revision: ' + rev.requested_count + ' edit units, ' + rev.applied_count + ' applied, ' + (rev.requested_count - rev.applied_count) + ' not applied' + (refusedUnits.length ? ' (' + refusedUnits.length + ' replacement' + (refusedUnits.length === 1 ? '' : 's') + ' refused by code; the findings on ' + (refusedUnits.length === 1 ? 'that passage' : 'those passages') + ' are not corrected and stay open)' : '') + '.' + ((rev.unlocated || []).length ? ' Separately, ' + rev.unlocated.length + ' finding(s) had no editable location.' : '') + (rev.revision_error ? ' ' + rev.revision_error : ''));
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
  if (!nd.length) lines.push('None.' + ((rev.rejected_units || []).length ? ' This covers the ' + rev.applied_count + ' edits that were applied. It says nothing about the ' + rev.rejected_units.length + ' replacement' + (rev.rejected_units.length === 1 ? '' : 's') + ' that code refused; see REQUIRED CORRECTIONS NOT APPLIED.' : ''));
  nd.forEach((f) => lines.push(f.id + ' | ' + f.severity + ' | ' + f.check + (f.unit ? ' | introduced by edit ' + f.unit : '') + ' | ' + f.problem));
  const maybe = res.possible_repeats || [];
  if (maybe.length) { lines.push('', 'SENTENCES THAT MAY REPEAT A CORRECTED CLAIM (' + maybe.length + '). These are not findings. Read each one.'); maybe.forEach((d) => lines.push('- L' + d.line + ' | edit ' + d.unit + ' corrected ' + d.issues.join(', ') + ' | ' + d.found)); }
  const pr = res.plan_review;
  if (pr && (pr.required || pr.listed)) {
    const ranges = (list) => { const out = []; list.slice().sort((a, b) => a - b).forEach((n) => { const last = out[out.length - 1]; if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]); }); return out.map((r) => (r[0] === r[1] ? 'L' + r[0] : 'L' + r[0] + '-' + r[1])).join(', '); };
    lines.push('', 'FINAL REVIEW OF THE WHOLE REVISED PLAN: ' + pr.required + ' lines needed a verdict. Supported by named ledger entries: ' + pr.supported + '. Stated in the founder context: ' + (pr.from_intake || 0) + '. Labelled as hypothesis or inference: ' + pr.labelled + '. No external claim: ' + pr.no_external_claim + '. Unsupported: ' + (pr.unsupported.length + (pr.contradicted || []).length) + '. Not reviewed: ' + pr.unresolved.length + '.' + (pr.unsupported.length || (pr.contradicted || []).length || pr.unresolved.length ? '' : ' This is the model\'s reading, checked by code only for the entries, intake words, and labels it names. It is not proof that every line is supported.'));
    if (pr.unsupported.length) lines.push('Unsupported, as the reviewer found (' + pr.unsupported.length + '):');
    pr.unsupported.forEach((u) => lines.push('- L' + u.line + (u.unlisted ? ' (not on the list; reported by the reviewer)' : u.edited ? ' (edit ' + u.edited + ')' : ' (not edited)') + ': ' + (u.quote ? '"' + u.quote.slice(0, 140) + '" ' : '') + u.problem));
    if ((pr.contradicted || []).length) lines.push('Unsupported, shown by the reviewer\'s own verdict (' + pr.contradicted.length + '):');
    (pr.contradicted || []).forEach((u) => lines.push('- L' + u.line + ' | ' + u.kind + ': ' + u.problem));
    if (pr.unresolved.length) lines.push('Not reviewed: no usable verdict (' + pr.unresolved.length + '). These are incomplete checks, not findings:');
    pr.unresolved.slice(0, 40).forEach((u) => lines.push('- L' + u.line + (u.edited ? ' (edit ' + u.edited + ')' : '') + ': ' + u.why));
    if (pr.unresolved.length > 40) lines.push('- and ' + (pr.unresolved.length - 40) + ' more, each with no usable verdict: ' + pr.unresolved.slice(40).map((u) => 'L' + u.line).join(', '));
    (pr.judged || []).forEach((j) => lines.push('- DECIDED BY THE FINAL REVIEW L' + j.line + ': ' + j.check + ' -> ' + j.verdict + (j.claim_ids.length ? ' (' + j.claim_ids.join(', ') + ')' : '') + '. Code could not judge the meaning and asked.'));
    const notes = pr.date_notes_checked_by_code || [];
    lines.push('Decided by code, with no verdict asked: ' + (pr.source_rows || 0) + ' source-only rows (they state nothing) and ' + notes.length + ' date notes checked against the source records' + (notes.some((n) => !n.ok) ? ' (' + notes.filter((n) => !n.ok).map((n) => 'L' + n.line).join(', ') + ' failed and ' + (notes.filter((n) => !n.ok).length === 1 ? 'is' : 'are') + ' listed as a finding)' : '') + '.');
    const cov = pr.coverage;
    if (cov) lines.push('COVERAGE: ' + cov.listed + ' of ' + cov.prose_lines + ' lines of text were on the review list (' + Object.keys(cov.by_kind).map((k) => cov.by_kind[k] + ' ' + k.replace('_', ' ')).join(', ') + '). NOT ON THE LIST (' + cov.not_listed.length + '): ' + (ranges(cov.not_listed) || 'none') + '. Code found no source, company, profile, customer, market, founder, or offer wording on those lines. A statement of fact on one of them is read only if the reviewer reports it unprompted.');
  }
  const cr = res.claim_review;
  if (cr) {
    const span = (list) => { const out = []; list.slice().sort((a, b) => a - b).forEach((n) => { const last = out[out.length - 1]; if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]); }); return out.map((r) => (r[0] === r[1] ? 'L' + r[0] : 'L' + r[0] + '-' + r[1])).join(', '); };
    const by = cr.settled_by_class || {};
    lines.push('', 'CLAIM REVIEW, SENTENCE BY SENTENCE: ' + cr.claims + ' claims, reviewed in ' + cr.batches + ' requests. Settled: ' + cr.settled + ' (' + (['FOUNDER', 'EXTERNAL', 'ASSUMPTION', 'RECOMMENDATION', 'NONE'].map((k) => (by[k] || 0) + ' ' + ({ FOUNDER: 'founder facts linked to the intake', EXTERNAL: 'external claims linked to ledger entries', ASSUMPTION: 'labelled assumptions', RECOMMENDATION: 'recommendations', NONE: 'with no factual assertion' })[k]).join(', ')) + '). Confirmed defects: ' + cr.defects.length + '. Not reviewed: ' + cr.open.length + '.' + (cr.defects.length || cr.open.length ? '' : ' This is the model\'s reading, with every reference it gave checked by code. It is not proof that every sentence is supported.'));
    if (cr.defects.length) lines.push('Confirmed defects (' + cr.defects.length + '):');
    cr.defects.forEach((d) => lines.push('- ' + d.id + ' L' + d.line + ' | ' + d.check + ' | "' + String(d.text).slice(0, 160) + '" ' + d.why));
    if (cr.open.length) lines.push('Not reviewed: no usable verdict (' + cr.open.length + '). These are incomplete checks, not findings:');
    cr.open.slice(0, 40).forEach((o) => lines.push('- ' + o.id + ' L' + o.line + ': ' + o.why));
    if (cr.open.length > 40) lines.push('- and ' + (cr.open.length - 40) + ' more: ' + cr.open.slice(40).map((o) => o.id + ' L' + o.line).join(', '));
    (cr.failed_batches || []).forEach((b) => lines.push('- REQUEST ' + b.batch + ' of ' + cr.batches + ': ' + b.why + ' (' + b.claims + ' claims).'));
    (cr.rejected_responses || []).forEach((x) => lines.push('- RESPONSE NOT USED' + (x.batch ? ' (it named batch ' + x.batch + ')' : '') + ': ' + x.why + '.'));
    if ((cr.not_sent || []).length) lines.push('Not sent for review in this run: ' + cr.not_sent.length + ' claims.');
    const oj = cr.on_judgment || {};
    if (Object.keys(oj).length) lines.push('Settled on the reviewer\'s judgment alone, with nothing for code to check (' + Object.keys(oj).map((k) => oj[k] + ' ' + k).join(', ') + '). A well-formed and wrong answer passes here.');
    if ((cr.duplicates || []).length) lines.push('Answered twice with the same verdict, counted once: ' + cr.duplicates.join(', ') + '.');
    if ((cr.stray || []).length) lines.push('Verdicts given for a claim that was not in the request, ignored: ' + cr.stray.map((x) => x.id + ' (in request ' + x.batch + ')').join(', ') + '.');
    (cr.judged || []).forEach((j) => lines.push('- DECIDED BY THE CLAIM REVIEW L' + j.line + ': ' + j.check + ' -> ' + j.verdict + '. Code could not judge the meaning and asked.'));
    const cv = cr.coverage || {};
    lines.push('COVERAGE: ' + (cv.prose_lines || 0) + ' lines of text. ' + (cv.lines_with_claims || 0) + ' yielded the ' + cr.claims + ' claims. Decided by code: ' + (cv.source_rows || []).length + ' source-only rows, ' + (cv.date_notes || []).length + ' date notes checked against the source records, ' + (cv.computed_lines || 0) + ' lines of computed financial content, ' + (cv.table_headers || []).length + ' table header rows. Labels with nothing to assert (' + (cv.label_only || []).length + '): ' + (span(cv.label_only || []) || 'none') + '. Lines with no claim and no reason (' + (cr.unclassified_lines || []).length + '): ' + (span(cr.unclassified_lines || []) || 'none') + '.');
  }
  const closedNoEdit = res.closed_without_edit || [];
  if (closedNoEdit.length) { lines.push('', 'MAJOR FINDINGS CLOSED WITHOUT AN EDIT (' + closedNoEdit.length + '). The verifier read the unchanged passage and justified each one. Read the justification.'); closedNoEdit.forEach((v) => lines.push('- ' + v.id + ' | ' + v.check + ' | ' + v.note)); }
  const noClose = res.unjustified_closures || [];
  if (noClose.length) { lines.push('', 'CLOSURES NOT ACCEPTED (' + noClose.length + '). The verifier said the problem was absent and did not justify it. The finding stays open.'); noClose.forEach((v) => lines.push('- ' + v.id + ' | ' + v.severity + ' | ' + v.check)); }
  const open = findings.filter((f) => f.correction_not_applied === true);
  if ((rev.rejected_units || []).length || open.length) {
    lines.push('', 'REQUIRED CORRECTIONS NOT APPLIED (' + open.length + ' finding' + (open.length === 1 ? '' : 's') + ' on ' + (rev.rejected_units || []).length + ' passage' + ((rev.rejected_units || []).length === 1 ? '' : 's') + '). Each finding is open with its original severity.');
    (rev.rejected_units || []).forEach((u) => lines.push('- ' + u.unit + ' at L' + u.line + ': ' + u.why));
    open.forEach((f) => lines.push('- ' + f.id + ' | ' + f.severity + ' | ' + f.check + (f.line ? ' | L' + f.line : '')));
    if (!open.length) lines.push('- The automated checks no longer report a finding on these passages.');
  }
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
if (cost_condition_check.required) { lines.push('', 'COST CONDITION: ' + (cost_condition_check.present ? (cost_condition_check.inserted ? 'inserted by code' : 'already present') + ' at the start of the Viability Assessment.' : 'NOT placed.') + ' Surrounding text: ' + (cost_condition_check.problems.length ? cost_condition_check.problems.length + ' problem(s).' : 'no contradicting statement found.')); cost_condition_check.problems.forEach((p) => lines.push('- ' + p)); }
{ const pr = finModel.price_record; if (pr && pr.amount !== null && pr.amount !== undefined) lines.push('', 'PRICE RECORD: $' + pr.amount + ' per ' + pr.unit + ', ' + pr.label + ' (source: ' + pr.source + '). Decided once for this submission by ' + pr.decided_by + ' on ' + pr.run_date + '; every figure in the plan uses it.'); }
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
if (res.claim_review && res.claim_review.usage) { const u = res.claim_review.usage; calls.push({ stage: 'Claim review', node: 'Review Claims x' + u.requests, model: u.model || '', input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0, cost_usd: u.cost_known ? u.cost : null }); }
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

return { text, status, report: lines.join('\n'), revised: !!rev, sources_cited, telemetry, cost_condition_check, final_findings };
