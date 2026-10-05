// Plan Revision Request: turns the QA result into a findings list.
// Pass 1: merges automated and QA findings, locates every occurrence in the plan, groups overlapping occurrences into edit units,
//         decides whether to revise, and builds the reviser request.
// Pass 2: reads QA's verification of the revision and produces the final findings. It never asks for another revision.
const ctx = $('Founder Context').first().json;
const fin = $('Compute Financials').first().json;
const cc = $('Citation Check').first().json;
const attempt = cc.attempt || 0;
// RUN DATE: the date this run started, read from the workflow clock. It is never hardcoded and never left to a
// model's own sense of the current year. Every prompt that judges a date is given this line.
const runDate = (() => {
  let ms = Date.now();
  try { const c = $('Founder Context').first().json; if (c && Number(c.run_started_ms) > 0) ms = Number(c.run_started_ms); } catch (e) {}
  const d = new Date(ms);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const iso = d.toISOString().slice(0, 10);
  return { ms, iso, line: 'RUN DATE: today is ' + iso + ' (' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + '), timezone UTC. This is the current date. Do not rely on your own sense of the current year. A date on or before ' + iso + ' is in the past and is not an error. Only a date after ' + iso + ' is in the future; a future publication date is an error to report and is never treated as published.' };
})();

let qa = null, qa_usage = null;
try { const r = $input.first().json; if (r && r.usage) qa_usage = { model: r.model || '', usage: r.usage }; } catch (e) {}
try { const raw = $input.first().json.choices[0].message.content || ''; qa = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) {}
const SEV = ['BLOCKING', 'MAJOR', 'MINOR'];
const s = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const sev = (v, fallback) => SEV.includes(s(v).toUpperCase()) ? s(v).toUpperCase() : fallback;
const lineNo = (v) => { const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };
const fromAuto = (i) => ({ severity: i.severity, source: 'Automated check', check: i.type, problem: i.detail, fix: '', occurrences: i.line ? [{ line: i.line, section: '', quote: i.quote || '' }] : [], line: i.line || null, quote: i.quote || '', section: '' });
// A QA finding is one root problem with one or more occurrences.
const fromQa = (f, source, fallback) => {
  const occ = (Array.isArray(f.occurrences) ? f.occurrences : []).map((o) => ({ line: lineNo(o && o.line), section: s(o && o.section), quote: s(o && o.quote) })).filter((o) => o.line);
  if (!occ.length && lineNo(f.line)) occ.push({ line: lineNo(f.line), section: s(f.section), quote: s(f.quote) });
  return { severity: sev(f.severity, fallback), source, check: s(f.check), problem: s(f.root_problem) || s(f.problem), fix: s(f.fix), occurrences: occ, line: occ.length ? occ[0].line : null, quote: occ.length ? occ[0].quote : s(f.quote), section: occ.length ? occ[0].section : s(f.section) };
};
const order = (list) => list.sort((x, y) => SEV.indexOf(x.severity) - SEV.indexOf(y.severity));

if (!attempt) {
  // ---------- Pass 1: first review ----------
  const findings = (cc.det_issues || []).map(fromAuto);
  const qaOk = qa && Array.isArray(qa.findings);
  if (qaOk) qa.findings.forEach((f) => findings.push(fromQa(f, 'QA review', 'MAJOR')));
  const fixable = findings.filter((f) => f.severity !== 'MINOR').length;
  if (!qaOk) findings.unshift({ severity: 'BLOCKING', source: 'Automated check', check: 'QA DID NOT RUN', section: '', line: null, quote: '', occurrences: [], problem: 'The QA review did not return a readable result, so this plan has not been reviewed. Check the Final QA node in this execution.', fix: 'Review the plan by hand.' });
  // Stable IDs. A finding keeps its ID through revision and verification.
  order(findings);
  let qn = 0, an = 0;
  findings.forEach((f) => { f.id = f.source === 'QA review' ? 'QA-' + String(++qn).padStart(3, '0') : 'AUTO-' + String(++an).padStart(3, '0'); });
  const needs_revision = fixable > 0;

  // ----- Locate every occurrence, then group overlapping ones into edit units -----
  const planLines = ($('Assemble Plan').first().json.text || '').split('\n');
  const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const protectedText = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l || '');
  const filled = (i) => i >= 0 && i < planLines.length && planLines[i].trim() !== '';
  // Where is this occurrence? The stated line if the quote is on it; otherwise the one line nearby, or the one line in the plan, that has it.
  const locate = (o) => {
    const at = o.line - 1;
    const q = norm(o.quote);
    if (!q) return filled(at) ? at : -1;
    const has = (i) => filled(i) && norm(planLines[i]).includes(q);
    if (has(at)) return at;
    const near = [];
    for (let i = at - 5; i <= at + 5; i++) if (has(i)) near.push(i);
    if (near.length === 1) return near[0];
    const all = [];
    planLines.forEach((l, i) => { if (has(i)) all.push(i); });
    if (all.length === 1) return all[0];
    // The quote may be loosely copied. Accept the stated line only if most of the quote's longer words are on it.
    if (filled(at)) {
      const words = q.split(' ').filter((w) => w.length > 3);
      const lineText = ' ' + norm(planLines[at]) + ' ';
      if (words.length && words.filter((w) => lineText.includes(' ' + w + ' ')).length / words.length >= 0.6) return at;
    }
    return -1;
  };
  const lineIssues = {};
  const unlocated = [];
  let occurrence_total = 0;
  findings.filter((f) => f.severity !== 'MINOR').forEach((f) => {
    if (!f.occurrences.length) { if (f.check !== 'QA DID NOT RUN') unlocated.push(f.id + (/COMPUTED CONTENT|FINANCIAL MODEL/.test(f.check) ? ': this finding is in computed financial content, which the reviser cannot edit. It has to be corrected at the financial-assumptions step.' : ': no line was given for this finding, so it could not be edited.')); return; }
    f.occurrences.forEach((o) => {
      occurrence_total++;
      const i = locate(o);
      if (i < 0) { unlocated.push(f.id + ' (L' + o.line + '): the quoted text could not be located in the plan, so this occurrence was not edited.'); return; }
      const t = planLines[i].trim();
      if (/^#{1,6}\s/.test(t) || protectedText.has(t)) { unlocated.push(f.id + ' (L' + (i + 1) + '): this line is a section header or computed financial content and cannot be edited.'); return; }
      o.located = i + 1;
      (lineIssues[i] = lineIssues[i] || new Set()).add(f.id);
    });
  });
  // Adjacent lines of the same block become one unit (one replacement). Table rows stay one row per unit.
  const idxs = Object.keys(lineIssues).map(Number).sort((x, y) => x - y);
  const units = [];
  idxs.forEach((i) => {
    const last = units[units.length - 1];
    if (last && i === last.end && !isRow(planLines[i]) && !isRow(planLines[i - 1])) { last.end = i + 1; lineIssues[i].forEach((id) => last.set.add(id)); }
    else units.push({ start: i + 1, end: i + 1, set: new Set(lineIssues[i]) });
  });
  units.forEach((u, n) => { u.id = 'U' + (n + 1); u.issues = [...u.set]; delete u.set; u.text = planLines.slice(u.start - 1, u.end).join('\n'); });
  const byId = {};
  findings.forEach((f) => { byId[f.id] = f; });
  const stats = {
    root_findings: fixable,
    occurrences: occurrence_total,
    units: units.length,
    consolidated_units: units.filter((u) => u.issues.length > 1 || u.end > u.start).length,
    unlocated: unlocated.length,
  };

  let ledger = '';
  if (ctx.tier === 'Growth') { try { ledger = $('Build Evidence').first().json.research_ledger || ''; } catch (e) {} }

  const system = `You correct specific problems in a business plan by replacing individual passages. You do not rewrite the plan.

The problems have already been grouped into EDIT UNITS. Each unit is one passage of the plan (one line, or a few adjacent lines), shown with its current text and every finding that affects it.

Output one JSON object and nothing else, with no code fence:
{"edits":[{"unit":"U1","action":"replace" or "delete","new_text":"the complete corrected passage"}]}

HOW EDITS WORK
- Return exactly one edit for each unit. The edit replaces the unit's whole current text with "new_text".
- "new_text" is the entire corrected passage: keep everything that was not wrong, in the same voice and format. For a table row, return the whole row with the same number of cells. For a unit of several lines, keep the line breaks.
- One replacement must resolve every finding listed for the unit.
- Use "delete" to remove the passage when nothing in it is worth keeping. Never delete a table row that the table needs.
- If a unit's text does not contain the problem described, still return an edit with action "replace" and the text unchanged.

HOW TO FIX
- Remove the whole defect. Read every sentence of the passage, not only the quoted words. If another sentence in the passage makes the same unsupported claim in different words, fix or delete it too.
- Unsupported or overstated statement: either weaken it to exactly what the available evidence supports, or recast it as an IdeaToPlan recommendation with its reason ("IdeaToPlan recommends X because Y") or as a hypothesis to test, or delete it. Never write a new factual claim, statistic, trend, prediction, or "research suggests" statement to replace the one that was flagged. If in doubt, delete.
- Mismatched citation: use the source ID the EVIDENCE LEDGER gives for that exact claim, or remove the claim.
- A verified source is not a verified claim. Keep a source ID only on what one ledger entry states. Put a conclusion in IdeaToPlan's own voice with no source ID.
- Demand: competitors existing is not evidence of buyers, sales, or willingness to pay. Reword any such statement as a hypothesis that requires validation.
- Price: the offer's own price is a planning assumption with no source ID. Remove a source ID from any sentence that ties the price to pages that state no price, and keep those pages only on the service descriptions they support. Never write that the price is market-validated. A competitor price keeps its amount, currency, what it buys, and its length, and is never called equivalent to this offer.
- Payment and market: do not write that providers are paid or charge unless a ledger entry states a price for them. A market existing means offers are available, not that demand is shown. One company's page supports statements about that company only.
- Cost condition: the paragraph in the Viability Assessment that begins "This assessment is conditional." is computed. Never remove it, reword it, or change its figures. When a finding asks you to add it, put it at the start of the passage exactly as the finding gives it, and keep the rest of the passage after it. Do not state that the business is viable, profitable, or sustainable without that condition.
- Dates: judge every date against the RUN DATE at the top of the user message. Never add a remark that a date is anomalous, future-dated, or suspicious, and remove such a remark when a finding asks for it.
- Never add an external fact, number, source ID, URL, or name that is not in the EVIDENCE LEDGER.
- Every financial figure you write must be copied exactly from FINANCIAL FACTS. Never calculate, total, or round. If the right figure is not there, reword without a number.
- A price for a different kind of service is a reference point only. It is not evidence of what this offer should cost.
- Unknown is not none. Where the plan says the founder lacks something the FOUNDER CONTEXT does not mention, say the information was not provided, or make the recommendation conditional.
- Do not introduce a new absolute or comparative claim (best, fastest, only, most, will, always) while fixing another.
- Keep the plan's voice. Plain English. No em dashes. Do not add sections, tables, callouts, or line IDs.`;

  const user = [
    'EDIT UNITS (return one edit for each)',
    units.length ? units.map((u) => u.id + ' | L' + u.start + (u.end > u.start ? '-L' + u.end : '') + '\n   Findings to resolve:\n' + u.issues.map((id) => '   - ' + id + ' | ' + byId[id].severity + ' | ' + byId[id].check + ' | ' + byId[id].problem + (byId[id].fix ? ' | Fix: ' + byId[id].fix : '')).join('\n') + '\n   Current text:\n' + u.text).join('\n\n') : 'None.',
    '',
    ctx.founder_context,
    '',
    fin.financial_model,
    '',
    'EVIDENCE LEDGER',
    ledger || 'None. No research was done for this plan.',
    '',
    'PLAN (for context only; edit nothing outside the units)',
    cc.numbered_plan,
  ].join('\n');

  return {
    attempt,
    t_ms: Date.now(),
    qa_usage,
    needs_revision: needs_revision && units.length > 0,
    findings,
    units,
    unlocated,
    stats,
    verification: [],
    new_defects: [],
    qa_summary: qa ? s(qa.summary) : '',
    revise_payload: (needs_revision && units.length > 0) ? JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', max_tokens: 8000, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: runDate.line + '\n\n' + user }] }) : '',
  };
}

// ---------- Pass 2: verification of the revision ----------
const rev = $('Apply Revisions').first().json;
const first = rev.first_findings || [];
const log = rev.edit_log || [];
const editsFor = (id) => log.filter((e) => (e.issues || []).includes(id));
const verOk = qa && Array.isArray(qa.verifications);
const verdict = {};
if (verOk) qa.verifications.forEach((v) => { verdict[s(v.id)] = { status: s(v.status).toUpperCase().replace(/\s+/g, '_'), note: s(v.note) }; });

const autoNow = (cc.det_issues || []).map(fromAuto);
// An automated finding that is still reported keeps the ID it had in the first review.
autoNow.forEach((n) => { const o = first.find((f) => f.source === 'Automated check' && f.check === n.check && (f.problem === n.problem || (f.quote && f.quote === n.quote))); if (o) n.id = o.id; });
const verification = [];
const findings = autoNow.slice();
first.forEach((f) => {
  if (f.source === 'Automated check') {
    // The automated checks were rerun on the revised plan, so they verify themselves.
    if (f.severity === 'MINOR') return;
    const still = autoNow.some((n) => n.id === f.id);
    verification.push({ id: f.id, severity: f.severity, source: f.source, check: f.check, occurrences: (f.occurrences || []).length, status: still ? 'NOT_FIXED' : 'FIXED', note: still ? 'The automated check still reports it.' : 'The automated check no longer reports it.' });
    return;
  }
  const mine = editsFor(f.id);
  if (f.severity === 'MINOR') { if (!mine.length) findings.push(f); return; }
  // An original finding keeps its ID. Code decides the verdict when nothing was edited; QA decides it when something was.
  const occ = f.occurrences || [];
  const editedOcc = occ.filter((o) => o.located && mine.some((e) => o.located >= e.start && o.located <= e.end)).length;
  const v = verdict[f.id];
  let status, note;
  if (!mine.length) { status = 'NOT_FIXED'; note = 'No edit was applied for this finding.'; }
  else if (v && ['FIXED', 'PARTLY_FIXED', 'NOT_FIXED'].includes(v.status)) { status = v.status; note = v.note; }
  else { status = 'NOT_VERIFIED'; note = 'An edit was applied but QA gave no verdict on it.'; }
  if (status === 'FIXED' && editedOcc < occ.length) { status = 'PARTLY_FIXED'; note = editedOcc + ' of ' + occ.length + ' occurrences were edited. ' + note; }
  verification.push({ id: f.id, severity: f.severity, source: f.source, check: f.check, occurrences: occ.length, status, note });
  if (status !== 'FIXED') findings.push({ ...f, status, problem: f.problem + ' (After revision: ' + status.replace('_', ' ').toLowerCase() + '. ' + note + ')' });
});
// A new defect is only something the revision added. If a finding on the same edit unit is still open, the problem belongs to that finding.
const openIds = new Set(verification.filter((x) => x.status !== 'FIXED').map((x) => x.id));
const unitOf = (id) => log.find((e) => e.unit === s(id).toUpperCase());
const new_defects = (verOk && Array.isArray(qa.new_defects) ? qa.new_defects : [])
  .filter((f) => { const e = unitOf(f.unit); return !(e && e.issues.some((id) => openIds.has(id))); })
  .map((f, i) => { const e = unitOf(f.unit); return { ...fromQa(f, 'Introduced by revision', 'MAJOR'), id: 'REV-' + String(i + 1).padStart(3, '0'), unit: s(f.unit).toUpperCase(), line: e ? e.line : null, problem: s(f.problem), quote: s(f.quote) }; });
new_defects.forEach((f) => findings.push(f));
if (!verOk) findings.unshift({ id: 'AUTO-VER', severity: 'BLOCKING', source: 'Automated check', check: 'VERIFICATION DID NOT RUN', section: '', line: null, quote: '', occurrences: [], problem: 'The verification pass did not return a readable result, so the revision has not been checked. Check the Final QA node in this execution.', fix: 'Review the plan by hand.' });
order(findings);
findings.forEach((f, i) => { if (!f.id) f.id = 'AUTO-V' + String(i + 1).padStart(2, '0'); });

return {
  attempt,
  t_ms: Date.now(),
  qa_usage,
  needs_revision: false,
  findings,
  verification,
  new_defects,
  qa_summary: qa ? s(qa.summary) : '',
  revise_payload: '',
};
