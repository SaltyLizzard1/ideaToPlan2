// Plan Revision Request: turns the QA result into a findings list.
// Pass 1: merges automated and QA findings, locates every occurrence in the plan, groups overlapping occurrences into edit units,
//         decides whether to revise, and builds the reviser request.
// Pass 2: reads QA's verification of the revision and produces the final findings. It never asks for another revision.
const ctx = $('Founder Context').first().json;
const fin = $('Compute Financials').first().json;
const cc = $('Citation Check').first().json;
const attempt = cc.attempt || 0;
// THE CLAIM CONTRACT. On the second pass the whole revised plan is reviewed sentence by sentence, in batches, and
// Combine Claim Review hands the result in with the verifier's answer. When the contract is on, the older line-by-line
// review is not asked for and not read.
const claimContract = cc.claim_contract === true;
let claimReview = null;
try { const c = $input.first().json.claim_review; if (c && typeof c === 'object') claimReview = c; } catch (e) {}
const claimOpen = (check, problem, line) => ({ id: 'CL-OPEN', severity: 'BLOCKING', unresolved: true, source: 'Claim review', check, section: '', line: line || null, quote: '', occurrences: [], problem, fix: '' });
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
// A check that did not complete (the source verifier or the reviewer returned nothing usable) holds the plan, and is
// marked unresolved: it is not a defect that was found.
const INCOMPLETE_CHECK = /^(?:SOURCE VERIFICATION INCOMPLETE|SOURCE VERIFICATION DID NOT RUN|QA DID NOT RUN|VERIFICATION DID NOT RUN)$/;
const fromAuto = (i) => ({ severity: i.severity, ...(INCOMPLETE_CHECK.test(i.type) || i.needs_judgment ? { unresolved: true } : {}), ...(i.needs_judgment ? { needs_judgment: true } : {}), source: 'Automated check', check: i.type, problem: i.detail, fix: '', occurrences: i.line ? [{ line: i.line, section: '', quote: i.quote || '' }] : [], line: i.line || null, quote: i.quote || '', section: '' });
// A QA finding is one root problem with one or more occurrences.
const fromQa = (f, source, fallback) => {
  // AN OCCURRENCE IS A LINE THAT HAS TO CHANGE. A reviewer sometimes lists a line and says, in the same finding, that it
  // is acceptable as written ("L25 is quoting the founder's hypothesis and is acceptable; no change needed there").
  // Such a line is not where the defect is. It is taken off the finding, and the finding is located at the lines that
  // do have to change. This reads the reviewer's own statement; it does not judge the wording of the line.
  const said = s(f.fix) + ' ' + s(f.root_problem || f.problem);
  const exempt = new Set([...said.matchAll(/\bL(\d+)\b[^.;]{0,200}?\b(?:acceptable as written|is acceptable|no change (?:is )?needed|needs? no change|does not need (?:a |to )?chang\w*|leave (?:it )?(?:as it is|as written|unchanged)|not (?:itself )?a defect)\b/gi)].map((m) => +m[1]));
  const listed = (Array.isArray(f.occurrences) ? f.occurrences : []).map((o) => ({ line: lineNo(o && o.line), section: s(o && o.section), quote: s(o && o.quote) })).filter((o) => o.line);
  const occ = listed.some((o) => !exempt.has(o.line)) ? listed.filter((o) => !exempt.has(o.line)) : listed;
  const not_occurrences = listed.filter((o) => !occ.includes(o)).map((o) => o.line);
  if (!occ.length && lineNo(f.line)) occ.push({ line: lineNo(f.line), section: s(f.section), quote: s(f.quote) });
  return { severity: sev(f.severity, fallback), source, check: s(f.check), problem: s(f.root_problem) || s(f.problem), fix: s(f.fix), occurrences: occ, ...(not_occurrences.length ? { not_occurrences } : {}), line: occ.length ? occ[0].line : null, quote: occ.length ? occ[0].quote : s(f.quote), section: occ.length ? occ[0].section : s(f.section) };
};
const order = (list) => list.sort((x, y) => SEV.indexOf(x.severity) - SEV.indexOf(y.severity));

if (!attempt) {
  // ---------- Pass 1: first review ----------
  const findings = (cc.det_issues || []).map(fromAuto);
  const qaOk = qa && Array.isArray(qa.findings);
  if (qaOk) qa.findings.forEach((f) => findings.push(fromQa(f, 'QA review', 'MAJOR')));
  const fixable = findings.filter((f) => f.severity !== 'MINOR').length;
  if (!qaOk) findings.unshift({ severity: 'BLOCKING', unresolved: true, source: 'Automated check', check: 'QA DID NOT RUN', section: '', line: null, quote: '', occurrences: [], problem: 'The QA review did not return a readable result, so this plan has not been reviewed. Check the Final QA node in this execution.', fix: 'Review the plan by hand.' });
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
{"edits":[{"unit":"U1","action":"replace" or "delete","new_text":"the complete corrected passage","section_note":""}]}

HOW EDITS WORK
- Return exactly one edit for each unit. The edit replaces the unit's whole current text with "new_text".
- "new_text" is the entire corrected passage: keep everything that was not wrong, in the same voice and format. For a unit of several lines, keep the line breaks.
- A table row is replaced by one table row. When the unit's current text is a table row, "new_text" is that one row, with the same number of cells, and nothing else: no sentence above it, below it, or beside it, and no second row. A replacement that breaks this is refused by code and the finding stays open.
- "section_note" is only for a note that sources are undated, and only when the unit is a table row. Put the note there, as one sentence or two, and code places it above the table. Leave it empty in every other case.
- One replacement must resolve every finding listed for the unit.
- Use "delete" to remove the passage when nothing in it is worth keeping. Never delete a table row that the table needs.
- If a unit's text does not contain the problem described, still return an edit with action "replace" and the text unchanged.

HOW TO FIX
- Remove the whole defect. Read every sentence of the passage, not only the quoted words. If another sentence in the passage makes the same unsupported claim in different words, fix or delete it too.
- Unsupported or overstated statement: either weaken it to exactly what the available evidence supports, or recast it as an IdeaToPlan recommendation with its reason ("IdeaToPlan recommends X because Y") or as a hypothesis to test, or delete it. Never write a new factual claim, statistic, trend, prediction, or "research suggests" statement to replace the one that was flagged. If in doubt, delete.
- Mismatched citation: use the source ID the EVIDENCE LEDGER gives for that exact claim, or remove the claim.
- A verified source is not a verified claim. Keep a source ID only on what one ledger entry states. Put a conclusion in IdeaToPlan's own voice with no source ID.
- Prevalence: a few pages that describe their own offers are examples. Remove "widely available", "common", "numerous", and the like unless a ledger entry says so; name the examples with their source IDs and say that how widely they are used is not established.
- Undated sources: when a finding says a source is undated and not flagged, add one sentence at its first use in that section saying which sources are undated and that the descriptions may have changed. Name only sources that are undated: never write "all sources in this section" when the section also cites a dated one. When the unit is a table row, the sentence goes in "section_note", never in the row and never next to it. A note in another section does not cover this one. If the unit's own section already carries such a note for these sources, return the text unchanged.
- Provider focus and stage: the ledger entries list services. Remove any statement that providers focus on logistics or execution, are oriented toward what happens after a decision is made, or leave the planning stage out. Say what the pages list, with their source IDs. Whether a provider works before a decision is a question the pages do not answer.
- Survey findings: keep what the survey asked, of whom, and how many ("nearly two-thirds of 600 surveyed travelers said ..."). Remove "confirms", "proves", "shows that" when the sentence turns the finding into a fact about travelers, customers, or people in general, and say what the finding does not cover.
- Superlatives: "the most common substitute", "the biggest barrier", "the most popular channel" compare one thing with all the others. Without a ledger entry that makes that comparison, write that it is one substitute, barrier, or channel, and remove the superlative.
- Rankings: "the most comprehensive provider reviewed" ranks every company reviewed. It needs the criterion in the sentence and a source ID for each of those companies. With evidence for two, write a comparison between those two only ("A's page lists more services than B's [S1] [S2]"). Otherwise remove the ranking and say what that company's page lists.
- Supply is not demand: providers describing services, and resources being available, show what is offered. Remove any statement that this suggests, indicates, confirms, or is consistent with people seeking, wanting, or paying for such help. A hedge does not make it supported. Say which offers exist and word customer behaviour as a hypothesis to test.
- Samples: a survey's number of respondents is the size of its sample. Remove any statement that a community, a population, or a market is large, active, or growing, or that demand exists, when it rests on a sample size. Keep only what the ledger entry states.
- Demand: competitors existing is not evidence of buyers, sales, or willingness to pay. Reword any such statement as a hypothesis that requires validation.
- Price: the offer's own price is a planning assumption with no source ID. Remove a source ID from any sentence that ties the price to pages that state no price, and keep those pages only on the service descriptions they support. Never write that the price is market-validated. A competitor price keeps its amount, currency, what it buys, and its length, and is never called equivalent to this offer.
- Payment and market: do not write that providers are paid, charge, or sell unless a ledger entry for them states a price, a fee, or a charge. This holds with no source ID too ("paid relocation services" in a list of alternatives). Remove the word and describe what they offer. A market existing means offers are available, not that demand is shown. One company's page supports statements about that company only.
- Competitive gaps: a gap, an unmet need, an underserved segment, a positioning opportunity, or a statement that no competitor does something is a hypothesis unless a ledger entry states it. Word the sentence that makes the claim as a hypothesis to test, in that sentence. A label in another sentence does not cover it, and writing "IdeaToPlan analysis" is not enough: it names the author and does not make the claim conditional.
- Price comparisons: with no verified price in the ledger, remove any comparison with what other services charge, including one that gives no number (a reference point, a general range, a benchmark, a going rate), and say that the price is an untested planning assumption.
- Price evidence: a ledger price is one page's own words. Keep it as that: what the page states, with its source ID. Never write that it shows what a market, a category, established firms, or customers pay, that it leaves room for this offer, or that the page charges it itself unless the ledger entry says so. Fix every sentence in the passage that does this, not only the one quoted.
- The offer's price is the one in FINANCIAL FACTS and no other. Never write that a scenario, a forecast, or a result validates, confirms, or supports it.
- Profit: while costs are unresolved, a sentence that says the business reaches profit or breaks even must say, in that sentence, that the figure covers the costs included in the model and that actual profitability depends on the unresolved costs.
- Startup budget: while costs are unresolved, never write that the budget, the ceiling, or the funding is sufficient, enough, or adequate, or that it covers launch. Give the funding requirement of the included costs exactly as FINANCIAL FACTS state it, and say that whether the budget covers all costs is not established until the unresolved costs are known.
- Cost condition: when costs are unresolved, code places a paragraph beginning "This assessment is conditional." at the start of the Viability Assessment after your edits. Do not write that paragraph and do not paraphrase it. Make the text around it agree with it: no sentence may say the business is viable, profitable, or sustainable without that condition, and no sentence may say that all costs are known or included.
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

  // With no revision there is no second pass, and the claim review runs on the second pass. A plan that skips it has
  // not been through the claim-to-evidence contract. That is a required check that did not run, and it holds the plan.
  if (claimContract && !(needs_revision && units.length > 0)) findings.push(claimOpen('CLAIM REVIEW DID NOT RUN', 'No revision was requested, so the sentence-by-sentence review of the plan against its evidence did not run. No claim in this plan has been classified or linked to its support. This is not a confirmed defect and not a clean result.'));
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

const unchanged = rev.unchanged_units || [];
const presence = {};
if (verOk && Array.isArray(qa.unchanged)) qa.unchanged.forEach((u) => { if (u && typeof u.present === 'boolean') presence[s(u.unit).toUpperCase() + '|' + s(u.id)] = { present: u.present, note: s(u.note), reason: s(u.reason) || s(u.note), quote: s(u.quote), basis: s(u.basis).toLowerCase() }; });
// CLOSING A FINDING ON A PASSAGE NOBODY EDITED. A major finding can be wrong: the reviewer may have missed a note in
// the same section, or misread the passage. The verification pass may then close it without an edit, and only when
// its answer can be checked:
// 1. an explicit verdict that the problem is not present;
// 2. a reason, in its own words, that is about this finding and does not itself say the problem is there;
// 3. the words it relies on, quoted exactly from the passage, from the passage's section, or from the evidence ledger.
// An answer that lacks any of these closes nothing. The finding stays open and the report says why.
const PRESENT_TEXT = /\bstill (?:asserts?|states?|says|contains?|presents?|cites?|uses|reads|there|present|unsupported)\b|\bremains? (?:in|present|unsupported|uncorrected|unflagged)\b|\bis (?:still )?present\b|\bproblem persists\b|\bdoes (?:assert|contain|state)\b|\bnot (?:been )?(?:fixed|corrected|resolved|addressed)\b|\bno (?:such )?note\b|\b(?:still|is|are) missing\b|\bstill lacks?\b/i;
const flat = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
const wordsOf = (v) => [...new Set(String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 5))];
const revisedForClosure = String(rev.text || '').split('\n');
const sectionTextAt = (lineNo) => { let a = lineNo - 1; while (a > 0 && !/^## /.test(revisedForClosure[a] || '')) a--; let b = lineNo; while (b < revisedForClosure.length && !/^## /.test(revisedForClosure[b] || '')) b++; return revisedForClosure.slice(a, b).join(' '); };
let ledgerForClosure = '';
try { ledgerForClosure = $('Build Evidence').first().json.research_ledger || ''; } catch (e) {}
const closureOf = (u, f) => {
  const p = presence[u.unit + '|' + f.id];
  if (!p) return null;
  if (p.present === true) return { present: true };
  const problems = [];
  if (p.reason.length < 25) problems.push('it gives no reason');
  else {
    if (PRESENT_TEXT.test(p.reason)) problems.push('its reason says the problem is in the passage, which contradicts its verdict');
    const about = new Set(wordsOf(f.check + ' ' + f.problem + ' ' + (f.quote || '')));
    if (wordsOf(p.reason).filter((w) => about.has(w)).length < 2) problems.push('its reason does not address this finding');
  }
  const q = flat(p.quote);
  if (q.length < 12) problems.push('it quotes nothing from the passage, its section, or the ledger');
  else if (!flat(u.text).includes(q) && !flat(sectionTextAt(u.line || u.start)).includes(q) && !flat(ledgerForClosure).replace(/\\"/g, '"').includes(q)) problems.push('the words it quotes are not in the passage, its section, or the ledger');
  return problems.length ? { present: null, problems } : { present: false };
};
const autoNow = (cc.det_issues || []).map(fromAuto);
// An automated finding that is still reported keeps the ID it had in the first review.
autoNow.forEach((n) => { const o = first.find((f) => f.source === 'Automated check' && f.check === n.check && (f.problem === n.problem || (f.quote && f.quote === n.quote))); if (o) n.id = o.id; });
// An automated finding that is still reported on a passage whose replacement was refused is a required correction
// that was not made. It is marked, so the report cannot read as though the revision dealt with it.
autoNow.forEach((n) => { const u = (rev.unchanged_units || []).find((x) => x.kind === 'rejected' && (x.issues || []).includes(n.id)); if (u) { n.correction_not_applied = true; n.not_applied_units = [u.unit]; n.problem = n.problem + ' (REQUIRED CORRECTION NOT APPLIED: the replacement for ' + u.unit + ' at L' + u.line + ' was refused by code: ' + u.why + ')'; } });
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
  if (f.severity === 'MINOR') { if (!mine.length || unchanged.some((u) => u.kind === 'rejected' && (u.issues || []).includes(f.id))) findings.push(f); return; }
  // An original finding keeps its ID. Code decides the verdict when nothing was edited; QA decides it when something was.
  const occ = f.occurrences || [];
  const edited = (o) => o.located && mine.some((e) => o.located >= e.start && o.located <= e.end);
  // An occurrence the reviser left unchanged is neither fixed nor cleared by that. The verification pass read the
  // passage and said whether the root problem is in it. Only "not present" clears it; no answer leaves it open.
  const leftAlone = (o) => o.located ? unchanged.find((u) => (u.issues || []).includes(f.id) && o.located >= u.start && o.located <= u.end) : null;
  // A replacement that code refused is a correction that was required and not made. The verifier's reading of the
  // passage does not close it: the finding stays open, with its original severity, until the passage is corrected.
  const judged = (o) => { const u = leftAlone(o); return u && u.kind !== 'rejected' ? closureOf(u, f) : null; };
  const refused = unchanged.filter((u) => u.kind === 'rejected' && (u.issues || []).includes(f.id));
  const editedOcc = occ.filter(edited).length;
  const clearedOcc = occ.filter((o) => !edited(o) && judged(o) && judged(o).present === false).length;
  const stillThere = occ.filter((o) => !edited(o) && judged(o) && judged(o).present === true);
  const unjustified = occ.filter((o) => !edited(o) && judged(o) && judged(o).present === null);
  const v = verdict[f.id];
  let status, note;
  if (!mine.length) {
    // Nothing was edited. A blocking finding is never closed on the verifier's word alone; a person has to look.
    if (occ.length && clearedOcc === occ.length && f.severity !== 'BLOCKING') { status = 'FIXED'; note = 'CLOSED WITHOUT AN EDIT: verification found that the passage' + (occ.length === 1 ? ' does' : 's do') + ' not contain the problem. ' + occ.map((o) => { const u = leftAlone(o); const p = u ? presence[u.unit + '|' + f.id] : null; return p ? 'L' + o.located + ': ' + p.reason + ' Quoted: "' + p.quote.slice(0, 160) + '"' : ''; }).filter(Boolean).join(' '); }
    else { status = 'NOT_FIXED'; note = 'No edit was applied for this finding.' + (clearedOcc ? ' Verification found the problem absent from ' + clearedOcc + ' of ' + occ.length + ' passages.' : ''); }
  }
  else if (v && ['FIXED', 'PARTLY_FIXED', 'NOT_FIXED'].includes(v.status)) { status = v.status; note = v.note; }
  else { status = 'NOT_VERIFIED'; note = 'An edit was applied but QA gave no verdict on it.'; }
  if (mine.length && status === 'FIXED' && editedOcc + clearedOcc < occ.length) { status = 'PARTLY_FIXED'; note = editedOcc + ' of ' + occ.length + ' occurrences were edited' + (clearedOcc ? ' and ' + clearedOcc + ' left unchanged did not contain the problem' : '') + '. ' + (stillThere.length ? 'The problem is still at L' + stillThere.map((o) => o.located).join(', L') + '. ' : 'The rest were not verified. ') + note; }
  else if (mine.length && status === 'FIXED' && clearedOcc) note = note + ' ' + clearedOcc + ' passage' + (clearedOcc === 1 ? '' : 's') + ' left unchanged did not contain the problem.';
  // UNDATED-SOURCE FINDINGS ARE DECIDED BY CODE. The reviewer wrote such a finding against the sources a section cited
  // in the draft. The revision may have removed some of them. Whether a note is still missing is a fact about the
  // revised section: which sources it cites now, which of them are undated, and which a note covers. Code knows all
  // three, so it decides, in both directions, and the verifier's reading of the old source list is not used.
  const datesNow = /undated sources? without a note|undated sources? (?:are )?not flagged/i.test(f.check + ' ' + f.problem) ? (cc.section_dates || []).find((d) => d.no === ((String((occ[0] || {}).section || '').match(/^(\d+)\./) || String(f.problem || '').match(/\bSection (\d+)\b/) || [])[1] || '')) : null;
  if (datesNow) {
    const named = [...new Set(String(f.problem || '').match(/\b[SW]\d+\b/g) || [])];
    const gone = named.filter((id) => !datesNow.used.includes(id));
    const basis = 'Decided by code against the revised plan: Section ' + datesNow.no + ' now cites ' + (datesNow.used.join(', ') || 'no source') + '; undated among them: ' + (datesNow.undated.join(', ') || 'none') + '; date notes at ' + (datesNow.note_lines.map((n) => 'L' + n).join(', ') || 'no line') + '.' + (gone.length ? ' ' + gone.join(', ') + ' ' + (gone.length === 1 ? 'is' : 'are') + ' named in the finding and no longer cited in this section, so no note is owed for ' + (gone.length === 1 ? 'it' : 'them') + '.' : '');
    if (datesNow.missing.length) { status = 'NOT_FIXED'; note = basis + ' Still with no note: ' + datesNow.missing.join(', ') + '.'; }
    else if (!refused.length) { status = 'FIXED'; note = basis + ' Every undated source the section cites is covered by a note in it.' + (v && v.status !== 'FIXED' ? ' The verifier answered ' + v.status.replace('_', ' ').toLowerCase() + ' ("' + String(v.note || '').slice(0, 160) + '"), which was judged against the earlier source list.' : ''); }
  }
  if (unjustified.length) note = note + ' The verifier said the problem is absent from L' + unjustified.map((o) => o.located).join(', L') + ', and that answer closes nothing: ' + [...new Set(unjustified.flatMap((o) => judged(o).problems))].join('; ') + '.';
  // THE VERIFIER'S TWO ANSWERS HAVE TO AGREE. For a passage nobody edited it may say, with a checked justification, that
  // the problem is not there, and in its verdict on the finding say that the finding is not fully fixed because of that
  // same passage. Every edited passage is fixed and every unedited one is cleared, yet the finding is called open. That
  // is not a confirmed defect and not a clean result: the finding is held as an unresolved check for a person to read.
  const conflicted = mine.length > 0 && status !== 'FIXED' && !refused.length && !stillThere.length && !unjustified.length && clearedOcc > 0 && editedOcc + clearedOcc === occ.length;
  if (conflicted) note = 'THE VERIFIER DISAGREES WITH ITSELF. It judged every edited passage for this finding and called the finding ' + status.replace('_', ' ').toLowerCase() + ' ("' + String((v && v.note) || '').slice(0, 200) + '"). For the passage nobody edited (L' + occ.filter((o) => !edited(o)).map((o) => o.located).join(', L') + ') it answered, with a justification code accepted, that the problem is not there. Both cannot hold. A person has to read that passage.';
  if (refused.length) {
    if (status === 'FIXED') status = 'PARTLY_FIXED';
    note = 'REQUIRED CORRECTION NOT APPLIED: the replacement for ' + refused.map((u) => u.unit + ' at L' + u.line).join(', ') + ' was refused by code (' + refused.map((u) => u.why).join(' ') + '), so that passage is unchanged and this finding stands with its original severity. ' + note;
  }
  verification.push({ id: f.id, severity: f.severity, source: f.source, check: f.check, occurrences: occ.length, status, note, ...(refused.length ? { correction_not_applied: true } : {}), ...(unjustified.length ? { closure_unjustified: true } : {}), ...(!mine.length && status === 'FIXED' && !datesNow ? { closed_without_edit: true } : {}), ...(datesNow ? { decided_by_code: true } : {}) });
  if (status !== 'FIXED') findings.push({ ...f, status, ...(conflicted ? { unresolved: true, verifier_conflict: true } : {}), ...(unjustified.length ? { closure_unjustified: true } : {}), ...(refused.length ? { correction_not_applied: true, not_applied_units: refused.map((u) => u.unit) } : {}), problem: f.problem + ' (After revision: ' + status.replace('_', ' ').toLowerCase() + '. ' + note + ')' });
});
// A new defect is only something the revision added. If a finding on the same edit unit is still open, the problem belongs to that finding.
const openIds = new Set(verification.filter((x) => x.status !== 'FIXED').map((x) => x.id));
const unitOf = (id) => log.find((e) => e.unit === s(id).toUpperCase());
// NEW DEFECTS: THE VERIFIER'S CONTRACT. The verifier gives one entry per edit unit it was shown, with an explicit
// verdict: NEW_DEFECT or NO_NEW_DEFECT. Only a NEW_DEFECT whose explanation describes a defect is counted. An entry
// that is missing, malformed, or contradicts itself (a NEW_DEFECT that explains there is no defect, or the reverse)
// is neither a confirmed defect nor a clean result: the edit stays unresolved and a person has to look at it.
const NO_DEFECT_TEXT = /\bno new (?:defect|problem|issue|error)s?\b|\bno (?:defect|problem|issue|error)s? (?:is|are|was|were|has been|have been) introduced\b|\bnot a new (?:defect|problem|issue)\b|\b(?:does|do|did) not introduce (?:a |any )?(?:new )?(?:defect|problem|issue|error)s?\b/i;
const shownUnits = [...new Set(log.filter((e) => (e.issues || []).some((id) => first.some((f) => f.id === id && f.source === 'QA review' && f.severity !== 'MINOR'))).map((e) => e.unit))];
const claimed = [];
const unresolved_checks = [];
const leaveOpen = (unit, why, said) => unresolved_checks.push({ unit, why, said: s(said).slice(0, 400) });
if (verOk) {
  const checks = Array.isArray(qa.edit_checks) ? qa.edit_checks : null;
  if (checks) shownUnits.forEach((uid) => {
    const mine = checks.filter((c) => c && s(c.unit).toUpperCase() === uid);
    if (mine.length !== 1) return leaveOpen(uid, mine.length ? 'the verifier gave more than one verdict for this edit' : 'the verifier gave no verdict for this edit', '');
    const c = mine[0];
    const v = s(c.verdict).toUpperCase().replace(/[\s-]+/g, '_');
    const describes = s(c.problem) && !NO_DEFECT_TEXT.test(s(c.problem));
    if (v === 'NO_NEW_DEFECT') { if (describes && SEV.includes(s(c.severity).toUpperCase())) leaveOpen(uid, 'the verdict is NO_NEW_DEFECT, but the entry describes a ' + s(c.severity).toUpperCase() + ' defect', c.problem); return; }
    if (v !== 'NEW_DEFECT') return leaveOpen(uid, 'the verdict is not NEW_DEFECT or NO_NEW_DEFECT', c.verdict);
    if (!s(c.problem)) return leaveOpen(uid, 'the verdict is NEW_DEFECT, but no problem is described', '');
    if (!describes) return leaveOpen(uid, 'the verdict is NEW_DEFECT, but its own explanation says no new defect was introduced', c.problem);
    claimed.push(c);
  });
  else if (shownUnits.length) leaveOpen(shownUnits.join(', '), 'the verifier returned no per-edit verdicts ("edit_checks"), so no edit has an explicit result', '');
  // The earlier output shape, a bare list of new defects, carries no explicit verdict. Its entries are read the same way.
  (Array.isArray(qa.new_defects) ? qa.new_defects : []).forEach((c) => {
    if (!c || !s(c.problem)) return leaveOpen(s(c && c.unit).toUpperCase(), 'a new defect was listed with no problem described', '');
    if (NO_DEFECT_TEXT.test(s(c.problem))) return leaveOpen(s(c.unit).toUpperCase(), 'the entry is listed as a new defect, but its own explanation says no new defect was introduced', c.problem);
    claimed.push(c);
  });
}
const new_defects = claimed
  .filter((f) => { const e = unitOf(f.unit); return !(e && e.issues.some((id) => openIds.has(id))); })
  .map((f, i) => { const e = unitOf(f.unit); return { ...fromQa(f, 'Introduced by revision', 'MAJOR'), id: 'REV-' + String(i + 1).padStart(3, '0'), unit: s(f.unit).toUpperCase(), line: e ? e.line : null, problem: s(f.problem), quote: s(f.quote) }; });
new_defects.forEach((f) => findings.push(f));
// A required check that did not complete holds the plan. It is not a defect that was found: it is marked "unresolved"
// so that the gate and the report keep it apart from confirmed defects and from ordinary findings with a clear result.
unresolved_checks.forEach((u, i) => { const e = unitOf(u.unit); findings.push({ id: 'UNV-' + String(i + 1).padStart(3, '0'), severity: 'BLOCKING', unresolved: true, source: 'Revision check', check: 'REVISION CHECK DID NOT COMPLETE', section: '', line: e ? e.line : null, quote: '', occurrences: [], unit: u.unit, problem: 'The required check of edit ' + u.unit + ' for new defects did not complete: ' + u.why + '.' + (u.said ? ' The verifier wrote: "' + u.said + '"' : '') + ' This is not a confirmed defect and not a clean result, so the plan is held until a person has read the edited passage.', fix: '' }); });

// THE SAME CLAIM ELSEWHERE. When an edit removed or reworded a sentence to fix a finding, a sentence that makes the
// same statement somewhere else in the plan was not corrected by it. Each one is reported with its line.
const contentOf = (v) => [...new Set(String(v || '').toLowerCase().replace(/\[[sw]\d+\]/g, ' ').replace(/[^a-z0-9$%]+/g, ' ').split(' ').filter((w) => w.length >= 4))];
const sentencesOf = (v) => String(v || '').split('\n').flatMap((l) => (/^\s*\|.*\|\s*$/.test(l) ? l.trim().replace(/^\||\|$/g, '').split('|') : [l]).flatMap((c) => c.split(/(?<=[.!?;])\s+|,\s+but\s+/))).map((x) => x.trim()).filter(Boolean);
const shares = (x, y) => { const X = contentOf(x); const Y = new Set(contentOf(y)); return X.length ? X.filter((w) => Y.has(w)).length / X.length : 0; };
const computedText = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
const revisedLines = String(rev.text || '').split('\n');
const same_claim_elsewhere = [];
const RANK_OF = { BLOCKING: 0, MAJOR: 1, MINOR: 2 };
const quotedIn = (v) => [...String(v || '').matchAll(/(?:^|[\s(])['‘“"]([^'’”"]{3,90})['’”"](?=[\s,.;:)]|$)/g)].map((m) => m[1].trim());
const removalsIn = (v) => [...String(v || '').matchAll(/\bremove (?:the (?:word|words|phrase|claim) )?['‘“"]([^'’”"]{2,90}?)[,.]?['’”"]/gi)].map((m) => m[1].trim());
log.forEach((e) => {
  const ids = (e.issues || []).filter((id) => first.some((f) => f.id === id && f.source === 'QA review' && f.severity !== 'MINOR'));
  if (!ids.length) return;
  const kept = sentencesOf(e.after);
  const correctedWords = new Set(contentOf(e.after));
  const span = String(e.after || '').split('\n').length;
  // A removed disclaimer ("it is not evidence of ...", "this is untested") is not an unsupported claim, and a sentence
  // elsewhere that denies or qualifies is not a repeat of one. Only an assertion can be repeated as a defect.
  const DISCLAIMS = /\b(?:not|no|never|cannot|without|unvalidated|untested|unverified|unknown|hypothes[ie]s)\b/i;
  sentencesOf(e.before).filter((b) => contentOf(b).length >= 8 && !DISCLAIMS.test(b) && !kept.some((k) => shares(b, k) >= 0.7)).forEach((removed) => {
    // The words the reviewer quoted as the problem, kept only when they are in this statement. For each, the words
    // that the corrected text no longer has are the ones that carried the defect; all of them must be asserted.
    const terms = ids.flatMap((id) => { const f = first.find((q) => q.id === id); return quotedIn(f.problem).concat(removalsIn(f.fix)); })
      .map((t) => contentOf(t)).filter((w) => w.length > 0 && w.every((x) => new Set(contentOf(removed)).has(x)))
      .map((w) => { const distinct = w.filter((x) => !correctedWords.has(x)); return distinct.length ? distinct : w; });
    revisedLines.forEach((l, i) => {
      const n = i + 1;
      if ((e.line && n >= e.line && n < e.line + span) || !l.trim() || l.trim().startsWith('#') || computedText.has(l.trim())) return;
      // A sentence that repeats most of the removed statement is the same claim. One that shares about half of it may be: that is a warning.
      // Shared words do not make a sentence defective. What was wrong is what the edit took out: the words of the
      // removed statement that are not in the corrected text. A sentence elsewhere repeats the defect only when it
      // still carries those words, in a passage that also shares the statement as a whole. A sentence that shares
      // only the part that was kept is not a repeat at all.
      // Examples in brackets ("(blogs, communities, self-serve tools)") are not the claim. When the statement stands
      // without them, it is compared without them, so dropping the examples does not hide a repeat.
      const bare = removed.replace(/\([^)]*\)/g, ' ');
      const core = contentOf(bare).length >= 6 ? bare : removed;
      if (shares(core, l) < 0.6) return;
      // Word overlap only locates a candidate passage. Whether it repeats the defect is decided on the proposition:
      // 1. What made the claim defective is what the reviewer named: the words it quoted from this statement
      //    ("paid", "widely available"). A sentence that does not assert them is not a repeat, however similar.
      // 2. A sentence that denies or qualifies the point ("whether those services are charged for is not
      //    established") states the corrected proposition, not the defective one.
      // 3. With no quoted words to go on, the defect is taken to be what the edit removed, and the same two tests apply.
      const wholeSentences = (/^\s*\|.*\|\s*$/.test(l) ? l.trim().replace(/^\||\|$/g, '').split('|') : [l]).flatMap((c) => c.split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter(Boolean);
      const clausesOf = (x) => x.split(/;\s+|,\s+(?:but|though|although|however|yet|while)\s+/);
      const asserts = (clause, words) => { const there = new Set(contentOf(clause)); return words.length > 0 && words.every((w) => there.has(w)) && !DISCLAIMS.test(clause); };
      let confirmed = false, found = '';
      if (terms.length) {
        // The reviewer named the defect. A sentence of this passage repeats it only if one of its clauses asserts
        // those words without denying or qualifying them. Otherwise the passage is not a repeat and is not listed.
        wholeSentences.forEach((x) => { if (!confirmed && clausesOf(x).some((c) => terms.some((t) => asserts(c, t)))) { confirmed = true; found = x; } });
        if (!confirmed) return;
      } else {
        // No quoted words: the defect is taken to be what the edit removed. A clause that carries most of those words
        // and does not deny or qualify them repeats it. A sentence that only resembles the statement is listed apart.
        const gone = contentOf(core).filter((w) => !correctedWords.has(w));
        if (gone.length < 3) return;
        const carried = (c) => { const there = new Set(contentOf(c)); return gone.filter((w) => there.has(w)).length / gone.length; };
        wholeSentences.forEach((x) => {
          if (confirmed) return;
          if (shares(core, l) >= 0.7 && clausesOf(x).some((c) => carried(c) >= 0.6 && !DISCLAIMS.test(c))) { confirmed = true; found = x; return; }
          if (!found && shares(core, x) >= 0.6 && carried(x) >= 0.5 && !clausesOf(x).some((c) => DISCLAIMS.test(c))) found = x;
        });
        if (!confirmed && !found) return;
      }
      const scored = { x: found };
      const prior = same_claim_elsewhere.findIndex((x) => x.line === n);
      if (prior >= 0) { if (same_claim_elsewhere[prior].certain || !confirmed) return; same_claim_elsewhere.splice(prior, 1); }
      const worst = ids.map((id) => first.find((f) => f.id === id).severity).sort((p, q) => RANK_OF[p] - RANK_OF[q])[0];
      same_claim_elsewhere.push({ line: n, unit: e.unit, issues: ids, certain: confirmed, severity: confirmed ? worst : null, removed: removed.slice(0, 240), found: scored.x.slice(0, 240) });
    });
  });
});
// A confirmed repeat is a finding, with the severity of the finding it repeats: a claim judged blocking at one line is
// blocking at every line. An uncertain match is not a finding of any severity. It is listed apart, for a person to read.
const possible_repeats = same_claim_elsewhere.filter((d) => !d.certain).map((d) => ({ line: d.line, unit: d.unit, issues: d.issues, removed: d.removed, found: d.found }));
same_claim_elsewhere.filter((d) => d.certain).forEach((d, i) => findings.push({ id: 'DUP-' + String(i + 1).padStart(3, '0'), severity: d.severity, source: 'Revision check', check: 'SAME CLAIM STILL PRESENT ELSEWHERE', section: '', line: d.line, quote: d.found, occurrences: [{ line: d.line, section: '', quote: d.found }], unit: d.unit, problem: 'Edit ' + d.unit + ' corrected ' + d.issues.join(', ') + ' by removing or rewording this statement: "' + d.removed + '". A sentence that makes the same statement, including the part that was removed, is still at L' + d.line + ', which was not edited. Correcting one place does not correct the other, and the finding applies here with the same severity.', fix: '' }));
// ---------- THE WHOLE REVISED PLAN ----------
// Citation Check lists every line of the revised plan that cites a source, names a company, or speaks about
// competitors, the market, or research: edited or not. The verifier owes one verdict for each. Code does not take the
// verdict on trust where it can check it:
// - SUPPORTED has to name ledger entries that exist, and each source the line cites has to be the source of one of them.
// - LABELLED needs a label on the line. NO_EXTERNAL_CLAIM cannot be said of a line that cites a source.
// - UNSUPPORTED is a confirmed finding, BLOCKING, at that line.
// A line with no verdict, two verdicts, or a verdict that fails these checks is not reviewed. That is a required
// check that did not complete: the plan is held, and the lines are listed.
// What code decides without the model: a source-only row states nothing, and a date note is checked against the source
// record by Citation Check. Every other listed line needs a verdict.
const listedLines = claimContract ? [] : (cc.review_lines || []);
const required = listedLines.filter((r) => r.kind !== 'source_row' && r.kind !== 'date_note');
// THREE OUTCOMES, KEPT APART.
// - unsupported: the reviewer said so. A confirmed defect at that line.
// - contradicted: the reviewer's own verdict, checked by code, shows the defect. It said the statement is labelled
//   and the line has no label: so by its own account the statement is not in the ledger, and it is not labelled.
//   Or it named the entries that support the line and none of them is from any source the line cites: so the
//   citation points at the wrong page. These are confirmed defects, not incomplete verification.
// - unusable: no verdict, two verdicts, a verdict that is not one of the five, or one code cannot check either way.
//   The line has not been reviewed. That is a required check that did not complete.
const plan_review = { listed: listedLines.length, required: required.length, supported: 0, from_intake: 0, labelled: 0, no_external_claim: 0, source_rows: listedLines.filter((r) => r.kind === 'source_row').length, date_notes_checked_by_code: listedLines.filter((r) => r.kind === 'date_note').map((r) => ({ line: r.line, ok: r.date_note_ok !== false })), unsupported: [], contradicted: [], unresolved: [], added_by_reviewer: [], judged: [], coverage: cc.review_coverage || null };
// The verdict the final review gave for a line, kept only when it passed the checks below.
const verdictAt = {};
if (verOk && required.length) {
  const entries = (Array.isArray(qa.plan_review) ? qa.plan_review : []).slice();
  // Lines with nothing to judge may be given together as numbers.
  (Array.isArray(qa.no_external_claim) ? qa.no_external_claim : []).forEach((n) => { if (Number(n) > 0 && !entries.some((e) => e && Number(e.line) === Number(n))) entries.push({ line: Number(n), verdict: 'NO_EXTERNAL_CLAIM' }); });
  let ledgerList = [];
  try { const p = JSON.parse(ledgerForClosure); if (Array.isArray(p)) ledgerList = p; } catch (e) {}
  const intakeText = flat(ctx.founder_context);
  const LABEL_ON_LINE = /\bhypothes|\bnot (?:yet )?(?:been )?(?:established|known|verified|confirmed|shown|stated|captured)\b|\bwhether\b|\bassum|\buntested\b|\bunvalidated\b|\bIdeaToPlan(?:'s)? (?:reads?|recommends?|hypothesis|assumes?|inference|reading|notes)\b|\bmay\b|\bmight\b|\bcould\b|\bif\b/i;
  required.forEach((r) => {
    const text = revisedForClosure[r.line - 1] || '';
    const mine = entries.filter((e) => e && Number(e.line) === r.line);
    const open = (why) => plan_review.unresolved.push({ line: r.line, edited: r.edited, why });
    if (mine.length !== 1) return open(mine.length ? 'more than one verdict was given' : 'no verdict was given');
    const e = mine[0];
    const v = s(e.verdict).toUpperCase().replace(/[\s-]+/g, '_');
    const cited = [...new Set(text.match(/\b[SW]\d+\b/g) || [])];
    if (v === 'UNSUPPORTED') { plan_review.unsupported.push({ line: r.line, edited: r.edited, quote: s(e.quote), problem: s(e.problem) }); verdictAt[r.line] = { verdict: 'UNSUPPORTED' }; return; }
    if (v === 'SUPPORTED') {
      const ids = [...new Set((Array.isArray(e.claim_ids) ? e.claim_ids : []).map((x) => s(x).toUpperCase()).filter(Boolean))];
      if (!ids.length) return open('the verdict is SUPPORTED and names no ledger entry');
      const unknown = ids.filter((id) => !ledgerList.some((c) => c.claim_id === id));
      if (unknown.length) return open('the verdict names ' + unknown.join(', ') + ', which is not in the ledger');
      const sourcesNamed = [...new Set(ids.flatMap((cid) => ledgerList.find((c) => c.claim_id === cid).source_ids || []))];
      const uncovered = cited.filter((id) => !sourcesNamed.includes(id));
      if (cited.length && uncovered.length === cited.length) {
        plan_review.contradicted.push({ line: r.line, edited: r.edited, kind: 'cited source does not carry the support', quote: '', problem: 'The final review named ' + ids.join(', ') + ' as the support for this line. ' + (ids.length === 1 ? 'That entry was' : 'Those entries were') + ' verified on ' + sourcesNamed.join(', ') + '. The line cites ' + cited.join(', ') + ', and none of the entries named comes from there. The citation points at a page that does not carry the statement: cite the source of the entry, or remove the statement.' });
        verdictAt[r.line] = { verdict: 'UNSUPPORTED' };
        return;
      }
      if (uncovered.length) return open('the line cites ' + uncovered.join(', ') + ', and no entry named for it comes from that source');
      plan_review.supported++;
      verdictAt[r.line] = { verdict: 'SUPPORTED', claim_ids: ids };
      return;
    }
    if (v === 'FROM_INTAKE') {
      const q = flat(e.quote);
      if (q.length < 12) return open('the verdict is FROM_INTAKE and quotes nothing from the founder context');
      if (!intakeText.includes(q)) return open('the verdict is FROM_INTAKE and the words it quotes are not in the founder context');
      plan_review.from_intake++;
      verdictAt[r.line] = { verdict: 'FROM_INTAKE' };
      return;
    }
    if (v === 'LABELLED') {
      if (!LABEL_ON_LINE.test(text)) {
        plan_review.contradicted.push({ line: r.line, edited: r.edited, kind: 'called labelled, and the line has no label', quote: s(e.quote), problem: 'The final review judged this line LABELLED: by its own account the line states something the ledger does not state, excused by a label. The line carries no hypothesis, assumption, or not-established wording at all. So the statement is unsupported and unlabelled.' + (s(e.problem) ? ' The reviewer wrote: "' + s(e.problem).slice(0, 200) + '"' : '') });
        verdictAt[r.line] = { verdict: 'UNSUPPORTED' };
        return;
      }
      plan_review.labelled++; verdictAt[r.line] = { verdict: 'LABELLED' }; return;
    }
    if (v === 'NO_EXTERNAL_CLAIM') { if (cited.length) return open('the verdict is NO_EXTERNAL_CLAIM and the line cites ' + cited.join(', ')); plan_review.no_external_claim++; return; }
    open('the verdict is not SUPPORTED, FROM_INTAKE, LABELLED, UNSUPPORTED, or NO_EXTERNAL_CLAIM');
  });
  // The list of lines is built by code and can miss one. The reviewer may report an unsupported statement on a line
  // that was not listed. Such a line is real when it exists and is not empty.
  const listed = new Set(listedLines.map((r) => r.line));
  entries.filter((e) => e && !listed.has(Number(e.line)) && s(e.verdict).toUpperCase() === 'UNSUPPORTED' && String(revisedForClosure[Number(e.line) - 1] || '').trim()).forEach((e) => {
    if (plan_review.unsupported.some((u) => u.line === Number(e.line))) return;
    plan_review.unsupported.push({ line: Number(e.line), edited: '', quote: s(e.quote), problem: s(e.problem), unlisted: true });
    plan_review.added_by_reviewer.push(Number(e.line));
  });
  // COMPARISONS CODE COULD NOT DECIDE. Code found that the words of a line are not in the entries it cites. That is a
  // question, not an answer. The reviewer's verdict for the line answers it: SUPPORTED or LABELLED closes the question,
  // UNSUPPORTED turns it into the confirmed finding below, and no usable verdict leaves it open, which holds the plan.
  for (let k = findings.length - 1; k >= 0; k--) {
    const f = findings[k];
    if (!f.needs_judgment || !f.line) continue;
    const v = verdictAt[f.line];
    if (!v) continue;
    plan_review.judged.push({ line: f.line, check: f.check, verdict: v.verdict, claim_ids: v.claim_ids || [] });
    findings.splice(k, 1);
  }
  plan_review.contradicted.forEach((u, i) => findings.push({ id: 'FC-' + String(i + 1).padStart(3, '0'), severity: 'BLOCKING', source: 'Final review', check: u.kind === 'cited source does not carry the support' ? 'CITED SOURCE DOES NOT CARRY THE STATEMENT' : 'UNSUPPORTED AND NOT LABELLED', section: '', line: u.line, quote: u.quote, occurrences: [{ line: u.line, section: '', quote: u.quote }], problem: u.problem, fix: '' }));
  plan_review.unsupported.forEach((u, i) => findings.push({ id: 'FR-' + String(i + 1).padStart(3, '0'), severity: 'BLOCKING', source: 'Final review', check: 'UNSUPPORTED CLAIM IN THE REVISED PLAN', section: '', line: u.line, quote: u.quote, occurrences: [{ line: u.line, section: '', quote: u.quote }], problem: (u.unlisted ? 'This line was not on the list code built for the final review; the reviewer reported it. ' : u.edited ? 'This line was written or changed by edit ' + u.edited + '. ' : 'This line was not edited, and no earlier finding covered it. ') + (u.problem || 'The final review found a statement of fact that the ledger does not support and the line does not label.'), fix: '' }));
  if (plan_review.unresolved.length) findings.push({ id: 'FR-OPEN', severity: 'BLOCKING', unresolved: true, source: 'Final review', check: 'FINAL REVIEW OF THE REVISED PLAN IS INCOMPLETE', section: '', line: plan_review.unresolved[0].line, quote: '', occurrences: [], problem: plan_review.unresolved.length + ' of the ' + required.length + ' lines of the revised plan that state something about sources, companies, the market, or research have no usable verdict from the final review: ' + plan_review.unresolved.slice(0, 25).map((u) => 'L' + u.line + ' (' + u.why + ')').join('; ') + (plan_review.unresolved.length > 25 ? '; and ' + (plan_review.unresolved.length - 25) + ' more' : '') + '. This is a required check that did not complete, not a defect that was found. The plan is held until those lines have been read.', fix: '' });
}
// ---------- THE CLAIM REVIEW ----------
// Three lists, kept apart: confirmed defects (one finding each, at the sentence), claims that were not reviewed (one
// incomplete check that holds the plan), and what was settled. A line code could not judge by its words is decided by
// the claims on that line: all settled closes the question, a defect replaces it, anything open leaves it open.
let claim_review = null;
if (attempt && claimContract) {
  if (!claimReview || claimReview.empty) {
    findings.push(claimOpen('CLAIM REVIEW DID NOT RUN', 'The sentence-by-sentence review of the revised plan against its evidence returned nothing. No claim has been classified or linked to its support. Check the Build Claim Review, Review Claims, and Combine Claim Review nodes in this execution.'));
  } else {
    const cr = claimReview;
    const state = {};
    (cr.records || []).forEach((r) => { const st = state[r.line] = state[r.line] || { settled: 0, defect: 0, open: 0 }; st[r.status] = (st[r.status] || 0) + 1; });
    const judged = [];
    for (let k = findings.length - 1; k >= 0; k--) {
      const f = findings[k];
      if (!f.needs_judgment || !f.line) continue;
      const st = state[f.line];
      if (!st || st.open) continue;
      judged.push({ line: f.line, check: f.check, verdict: st.defect ? 'DEFECT' : 'SETTLED', claims: st.settled + st.defect });
      findings.splice(k, 1);
    }
    (cr.defects || []).forEach((d, i) => findings.push({ id: 'CL-' + String(i + 1).padStart(3, '0'), severity: 'BLOCKING', source: 'Claim review', check: d.check, section: '', line: d.line, quote: d.text, occurrences: [{ line: d.line, section: '', quote: d.text }], claim_id: d.id, problem: 'Claim ' + d.id + (d.company ? ', in the profile of ' + d.company : '') + ': ' + d.why, fix: '' }));
    const open = cr.open || [], unclassified = cr.unclassified_lines || [], failed = (cr.failed_batches || []).filter((b) => !b.partial);
    if (open.length || unclassified.length || failed.length) {
      const parts = [];
      if (open.length) parts.push(open.length + ' of the ' + cr.claims + ' claims in the revised plan have no usable verdict (' + (cr.missing || []).length + ' with no verdict at all, ' + (cr.contradictory || []).length + ' with verdicts that disagree): ' + open.slice(0, 12).map((o) => o.id + ' L' + o.line + ' (' + o.why + ')').join('; ') + (open.length > 12 ? '; and ' + (open.length - 12) + ' more, listed in the review report' : ''));
      if (failed.length) parts.push(failed.length + ' of the ' + cr.batches + ' review requests returned nothing usable: ' + failed.map((b) => 'batch ' + b.batch + ' (' + b.claims + ' claims, ' + b.why + ')').join('; '));
      if (unclassified.length) parts.push(unclassified.length + ' lines of the plan produced no claim and have no stated reason for it: L' + unclassified.join(', L'));
      findings.push(claimOpen('CLAIM REVIEW IS INCOMPLETE', parts.join('. ') + '. These are required checks that did not complete. They are not confirmed defects and not a clean result.', open.length ? open[0].line : (unclassified[0] || null)));
    }
    claim_review = { claims: cr.claims, batches: cr.batches, settled: cr.settled, settled_by_class: cr.settled_by_class || {}, defects: cr.defects || [], open, missing: cr.missing || [], duplicates: cr.duplicates || [], contradictory: cr.contradictory || [], stray: cr.stray || [], failed_batches: cr.failed_batches || [], unclassified_lines: unclassified, coverage: cr.coverage || {}, usage: cr.usage || null, judged };
  }
}
order(findings);
if (!verOk) findings.unshift({ id: 'AUTO-VER', severity: 'BLOCKING', unresolved: true, source: 'Automated check', check: 'VERIFICATION DID NOT RUN', section: '', line: null, quote: '', occurrences: [], problem: 'The verification pass did not return a readable result, so the revision has not been checked. Check the Final QA node in this execution.', fix: 'Review the plan by hand.' });
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
  unresolved_checks,
  // The final review of the whole revised plan: how many lines it owed a verdict for, and what became of them.
  plan_review,
  // The sentence-by-sentence review: counts, confirmed defects, claims not reviewed, and coverage. The full record of
  // every claim, with its links and the evidence text beside it, is in the output of Combine Claim Review.
  claim_review,
  // Findings of the first review closed on the verifier's justified answer, with no edit, and answers that closed nothing.
  closed_without_edit: verification.filter((v) => v.closed_without_edit).map((v) => ({ id: v.id, severity: v.severity, check: v.check, note: v.note })),
  unjustified_closures: verification.filter((v) => v.closure_unjustified).map((v) => ({ id: v.id, severity: v.severity, check: v.check, note: v.note })),
  // Findings whose correction was refused by code. They are open, each with the severity it had in the first review.
  unapplied_corrections: findings.filter((f) => f.correction_not_applied === true).map((f) => ({ id: f.id, severity: f.severity, check: f.check, line: f.line || null, units: f.not_applied_units || [] })),
  same_claim_elsewhere,
  possible_repeats,
  qa_summary: qa ? s(qa.summary) : '',
  revise_payload: '',
};
