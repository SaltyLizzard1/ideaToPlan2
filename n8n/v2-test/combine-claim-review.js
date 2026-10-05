// Combine Claim Review: reads the answers to the claim batches and decides what each one is worth.
//
// THREE OUTCOMES PER CLAIM, KEPT APART.
// - settled: the answer names its support and code could check every reference it gives.
// - defect: a confirmed finding. Either the reviewer said the claim is unsupported, or its own answer shows it: an
//   aspect it marked "no", a label that is not in the sentence, an entry about another company, a cited source that
//   none of the named entries comes from.
// - open: not reviewed. No answer, two answers that disagree, a batch that failed or was cut off, a reference code
//   cannot find, a number or date that is not in the entry text. This is an incomplete check, never a finding and
//   never a pass. Any open claim holds the plan.
//
// WHAT CODE CHECKS, AND WHAT IT DOES NOT. Code checks that entries exist, that quoted words are where the answer says
// they are, that entries are about the claim's company and from a source the sentence cites, and that numbers and dates
// are in the entry text. It does not compare the wording of a claim with the wording of an entry: whether a paraphrase
// is faithful is the reviewer's answer on the seven aspects, and code only requires that every aspect was answered.
const batchItems = $('Build Claim Review').all().map((i) => i.json);
const responses = $input.all().map((i) => i.json || {});
const first = batchItems[0] || {};
const map = first.claim_map || { claims: [], coverage: {} };
const qaResponse = first.qa_response || {};
const ctx = $('Founder Context').first().json;
const fin = $('Compute Financials').first().json;
const ev = $('Build Evidence').first().json;
const parse = (v, d) => { try { const p = typeof v === 'string' ? JSON.parse(v) : v; return p === null || p === undefined ? d : p; } catch (e) { return d; } };
const ledger = parse(ev.research_ledger, []).filter((c) => c && c.claim_id);
const sources = parse(ev.sources, []);
const byId = {};
ledger.forEach((c) => { byId[c.claim_id] = c; });
const srcById = {};
sources.forEach((x) => { if (x && x.id) srcById[x.id] = x; });

const s = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const flat = (v) => String(v || '').replace(/\*\*|__|`/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const letters = (v) => flat(v).replace(/\[[sw]\d+\]/g, '').replace(/[^a-z0-9]/g, '');
const numsIn = (v) => [...new Set((String(v || '').replace(/\[[SW]\d+\]/g, ' ').replace(/\bL\d+\b/g, ' ').replace(/^\s*\d+[.)]\s+/, '').match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => x.replace(/,/g, '').replace(/\.0+$/, '')))];
const intake = flat(ctx.founder_context);
// Figures that are the plan's own: the intake and the computed financial model. They need no ledger entry.
const ownNumbers = new Set(numsIn([ctx.founder_context, fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block, JSON.stringify(fin.allowed_money || '')].join(' ')));
const LABEL = /\bhypothes|\bassum|\bnot (?:yet )?(?:been )?(?:established|known|verified|confirmed|shown|stated|captured|validated)\b|\bwhether\b|\buntested\b|\bunvalidated\b|\bto (?:be )?test(?:ed)?\b|\bIdeaToPlan(?:'s)? (?:reads?|recommends?|hypothesis|assumes?|inference|reading|notes|suggests)\b|\b(?:may|might|could|would|if)\b|\bscenario\b|\bmodel(?:s|ed)?\b|\bforecast\b|\bprojection\b|\bplanning (?:assumption|threshold|figure)\b|\btest criterion\b|\bproposed\b|\bestimate[ds]?\b/i;
const NOT_A_LABEL = /^(?:our read|our view|we think|in our view)[:,.]?$/i;
const ASPECTS = ['subject', 'meaning', 'qualifiers', 'numbers', 'dates', 'population', 'scope'];
const CLASSES = ['FOUNDER', 'EXTERNAL', 'ASSUMPTION', 'RECOMMENDATION', 'NONE'];

// ---------- 1. read every batch ----------
const usage = { requests: batchItems.length, answered: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0, cost_known: true, model: map.model || '' };
const failed = [];          // batches with no usable answer
const answersFor = {};      // claim id -> the answers given for it, inside its own batch
const stray = [];           // answers for an ID that is not in the batch that gave them
const batchOf = {};
batchItems.forEach((b) => (b.ids || []).forEach((id) => { batchOf[id] = b.batch; }));
batchItems.forEach((b, k) => {
  const r = responses[k];
  const why = (text) => failed.push({ batch: b.batch, claims: (b.ids || []).length, why: text });
  if (!r || r.error) return why('the request failed' + (r && r.error ? ': ' + s(r.error.message || r.error).slice(0, 160) : ': no response'));
  if (r.usage) { usage.prompt_tokens += Number(r.usage.prompt_tokens) || 0; usage.completion_tokens += Number(r.usage.completion_tokens) || 0; if (typeof r.usage.cost === 'number') usage.cost += r.usage.cost; else usage.cost_known = false; } else usage.cost_known = false;
  const choice = (r.choices || [])[0] || {};
  const raw = s(choice.message && choice.message.content);
  let o = null;
  try { o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) {}
  if (!o || typeof o !== 'object') return why(choice.finish_reason === 'length' ? 'the answer was cut off at the output limit and cannot be read' : 'the answer is not readable JSON');
  usage.answered++;
  const list = [];
  (Array.isArray(o.claims) ? o.claims : []).forEach((a) => { if (a && s(a.id)) list.push(a); });
  (Array.isArray(o.recommendation) ? o.recommendation : []).forEach((id) => { if (s(id)) list.push({ id: s(id), class: 'RECOMMENDATION' }); });
  (Array.isArray(o.none) ? o.none : []).forEach((id) => { if (s(id)) list.push({ id: s(id), class: 'NONE' }); });
  list.forEach((a) => {
    const id = s(a.id);
    if (!(b.ids || []).includes(id)) { stray.push({ id, batch: b.batch, belongs_to: batchOf[id] || null }); return; }
    (answersFor[id] = answersFor[id] || []).push(a);
  });
  if (choice.finish_reason === 'length') failed.push({ batch: b.batch, claims: (b.ids || []).filter((id) => !answersFor[id]).length, why: 'the answer was cut off at the output limit; the claims it did not reach have no verdict', partial: true });
});

// ---------- 2. judge one answer ----------
// Returns { status: 'settled' | 'defect' | 'open', cls, check, why, links }.
const judge = (c, a, text) => {
  const cls = s(a.class).toUpperCase();
  const open = (why) => ({ status: 'open', cls, why });
  const defect = (check, why, links) => ({ status: 'defect', cls, check, why, links: links || {} });
  if (!CLASSES.includes(cls)) return open('the class is not FOUNDER, EXTERNAL, ASSUMPTION, RECOMMENDATION, or NONE');
  const own = [...new Set((text.match(/\[[SW]\d+\]/g) || []).map((x) => x.slice(1, -1)))];
  if (cls === 'RECOMMENDATION' || cls === 'NONE') {
    // A sentence that cites a source, sits in a company's profile, or names a company says something about the world.
    // Classing it as advice or as nothing would take it out of the review, so that answer is not accepted.
    if (own.length) return open('it is classed ' + cls + ' and the sentence cites ' + own.join(', ') + ': a cited sentence states something');
    if (c.company) return open('it is classed ' + cls + ' and it is in the profile of ' + c.company + ': a sentence in a company profile states something or is a labelled assumption');
    if ((c.names || []).length) return open('it is classed ' + cls + ' and it names ' + c.names.join(', ') + ': a sentence about a company states something or is a labelled assumption');
    return { status: 'settled', cls, links: {} };
  }
  if (cls === 'ASSUMPTION') {
    const label = s(a.label);
    if (!LABEL.test(text)) return defect('ASSUMPTION NOT LABELLED IN THE TEXT', 'The review classed this sentence as an assumption or hypothesis. The sentence carries no hypothesis, assumption, or not-established wording of its own' + (label ? ' (the review pointed to "' + label.slice(0, 80) + '")' : '') + '. A label in a neighbouring sentence does not cover it.', { label });
    if (!label) return open('it is classed ASSUMPTION and the answer does not quote the labelling words');
    if (!flat(text).includes(flat(label))) return open('it is classed ASSUMPTION and the label it quotes is not in the sentence');
    if (NOT_A_LABEL.test(label.trim())) return defect('ASSUMPTION NOT LABELLED IN THE TEXT', 'The review gave "' + label + '" as the label. That names the author; it does not say the statement is a hypothesis or an assumption.', { label });
    return { status: 'settled', cls, links: { label } };
  }
  const supported = a.supported === true || s(a.supported).toLowerCase() === 'true';
  const unsupported = a.supported === false || s(a.supported).toLowerCase() === 'false';
  if (!supported && !unsupported) return open('the answer does not say whether the claim is supported');
  if (cls === 'FOUNDER') {
    if (unsupported) return defect('FOUNDER DETAIL NOT IN THE INTAKE', 'The review found that the founder context does not state this.' + (s(a.missing) ? ' Missing: ' + s(a.missing).slice(0, 240) : ''), {});
    const q = flat(a.intake_quote);
    if (q.length < 12) return open('it is classed FOUNDER and quotes nothing from the founder context');
    if (!intake.includes(q)) return open('it is classed FOUNDER and the words it quotes are not in the founder context');
    const foreign = numsIn(text).filter((x) => !ownNumbers.has(x));
    if (foreign.length) return open('the number ' + foreign.join(', ') + ' is not in the founder context or the financial model');
    return { status: 'settled', cls, links: { intake_quote: s(a.intake_quote) } };
  }
  // EXTERNAL
  if (unsupported) return defect('EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY', 'The review found no ledger entry that supports this.' + (s(a.missing) ? ' Missing: ' + s(a.missing).slice(0, 240) : ''), { entries: (Array.isArray(a.entries) ? a.entries : []).map(s) });
  const ids = [...new Set((Array.isArray(a.entries) ? a.entries : []).map(s).filter(Boolean))];
  if (!ids.length) return open('it is classed EXTERNAL and supported, and names no ledger entry');
  const unknown = ids.filter((id) => !byId[id]);
  if (unknown.length) return open('it names ' + unknown.join(', ') + ', which is not in the ledger');
  const links = { entries: ids, evidence: ids.map((id) => ({ id, entity: byId[id].entity || '', source_ids: byId[id].source_ids || [], claim: s(byId[id].claim), page_excerpt: s(byId[id].page_excerpt) })), entry_quote: s(a.entry_quote), aspects: a.aspects || null };
  const asp = a.aspects && typeof a.aspects === 'object' ? a.aspects : {};
  const val = (k) => { const v = s(asp[k]).toLowerCase(); return v === 'n/a' || v === 'none' ? 'na' : v; };
  const absent = ASPECTS.filter((k) => !['yes', 'no', 'na'].includes(val(k)));
  if (absent.length) return open('the answer does not say whether the entry supports the ' + absent.join(', ') + ' of the claim; a source match alone is not support');
  const no = ASPECTS.filter((k) => val(k) === 'no');
  if (no.length) return defect('ENTRY DOES NOT SUPPORT THE CLAIM', 'The review called this supported by ' + ids.join(', ') + ', and by its own account the entry does not support the ' + no.join(', ') + ' of the claim.', links);
  if (val('subject') !== 'yes' || val('meaning') !== 'yes') return open('the answer does not confirm that the entry is about the same subject and says the same thing');
  // Attribution: a profile row is about its company.
  const about = ids.map((id) => byId[id].entity).filter(Boolean);
  if (c.company && about.length === ids.length && !about.includes(c.company)) return defect('ENTRY IS ABOUT ANOTHER COMPANY', 'This sentence is in the profile of ' + c.company + '. The review named ' + ids.join(', ') + ' as its support, and ' + (ids.length === 1 ? 'that entry is' : 'those entries are') + ' about ' + [...new Set(about)].join(', ') + '.', links);
  // Citation: the sentence's own citation has to be where the support comes from.
  const from = [...new Set(ids.flatMap((id) => byId[id].source_ids || []))];
  if (own.length) {
    const uncovered = own.filter((id) => !from.includes(id));
    if (uncovered.length === own.length) return defect('CITED SOURCE DOES NOT CARRY THE STATEMENT', 'The review named ' + ids.join(', ') + ' as the support. ' + (ids.length === 1 ? 'That entry was' : 'Those entries were') + ' verified on ' + from.join(', ') + '. The sentence cites ' + own.join(', ') + ', and none of the entries named comes from there.', links);
    if (uncovered.length) return open('the sentence cites ' + uncovered.join(', ') + ', and no entry named for it comes from that source');
  }
  const hay = ids.map((id) => s(byId[id].claim) + ' ' + s(byId[id].page_excerpt)).join(' ');
  const q = flat(a.entry_quote);
  if (q.length < 6) return open('the answer does not quote the words of the entry that carry the support');
  if (!flat(hay).includes(q)) return open('the words it quotes as support are not in the entry it names');
  // Numbers and dates, where code can tell: each has to be in the entry text or its source record.
  const record = from.map((id) => (srcById[id] ? [srcById[id].title, srcById[id].published, srcById[id].published_iso].join(' ') : '')).join(' ');
  const known = new Set(numsIn(hay + ' ' + record));
  const foreign = numsIn(text).filter((x) => !known.has(x));
  if (foreign.length) return open('the number or date ' + foreign.join(', ') + ' is not in the text of ' + ids.join(', ') + ' or its source record');
  return { status: 'settled', cls, links };
};

// ---------- 3. one result per claim ----------
const signature = (a) => (Array.isArray(a.split) ? 'SPLIT:' + a.split.map((p) => s(p && p.class).toUpperCase() + '/' + s(p && p.supported)).join(',') : s(a.class).toUpperCase() + '/' + s(a.supported));
const records = [];
const duplicates = [], contradictory = [];
const failedWhy = {};
failed.forEach((f) => { failedWhy[f.batch] = f.why; });
(map.claims || []).forEach((c) => {
  const rec = { id: c.id, line: c.line, cell: c.cell, part: c.part, section: c.section, heading: c.heading, company: c.company, row: c.row, text: c.text, cites: c.cites, batch: batchOf[c.id] || null };
  const got = answersFor[c.id] || [];
  if (!got.length) { records.push({ ...rec, status: 'open', missing: true, why: failedWhy[rec.batch] ? 'no verdict: batch ' + rec.batch + ', ' + failedWhy[rec.batch] : 'no verdict was given' }); return; }
  if (got.length > 1) {
    if (new Set(got.map(signature)).size > 1) { contradictory.push(c.id); records.push({ ...rec, status: 'open', why: got.length + ' verdicts were given and they disagree (' + got.map(signature).join(' and ') + ')' }); return; }
    duplicates.push(c.id);
  }
  const a = got[0];
  if (Array.isArray(a.split)) {
    const parts = a.split.filter((p) => p && s(p.text));
    if (parts.length < 2) { records.push({ ...rec, status: 'open', why: 'the split has fewer than two parts' }); return; }
    const whole = flat(c.text);
    const off = parts.filter((p) => !whole.includes(flat(p.text)));
    if (off.length) { records.push({ ...rec, status: 'open', why: 'a part of the split is not the words of the sentence: "' + s(off[0].text).slice(0, 80) + '"' }); return; }
    if (parts.reduce((n, p) => n + letters(p.text).length, 0) < 0.85 * letters(c.text).length) { records.push({ ...rec, status: 'open', why: 'the parts of the split leave out words of the sentence' }); return; }
    const judged = parts.map((p, k) => ({ id: c.id + '.' + String.fromCharCode(97 + k), text: s(p.text), ...judge(c, p, s(p.text)) }));
    const worst = judged.some((j) => j.status === 'open') ? 'open' : judged.some((j) => j.status === 'defect') ? 'defect' : 'settled';
    records.push({ ...rec, status: worst, cls: 'SPLIT', parts: judged, why: judged.filter((j) => j.status !== 'settled').map((j) => j.id + ': ' + j.why).join(' | '), check: (judged.find((j) => j.status === 'defect') || {}).check });
    return;
  }
  records.push({ ...rec, ...judge(c, a, c.text) });
});

const cov = map.coverage || {};
const count = (f) => records.filter(f).length;
const classCount = {};
records.forEach((r) => { const list = r.parts ? r.parts : [r]; list.forEach((x) => { if (x.status === 'settled') classCount[x.cls] = (classCount[x.cls] || 0) + 1; }); });
const claim_review = {
  claims: records.length,
  batches: batchItems.length,
  settled: count((r) => r.status === 'settled'),
  settled_by_class: classCount,
  defects: records.filter((r) => r.status === 'defect').map((r) => ({ id: r.id, line: r.line, cell: r.cell, company: r.company, text: r.text, check: r.check, why: r.why, parts: r.parts ? r.parts.filter((p) => p.status === 'defect').map((p) => ({ id: p.id, text: p.text, check: p.check, why: p.why })) : undefined, evidence: r.links && r.links.evidence })),
  open: records.filter((r) => r.status === 'open').map((r) => ({ id: r.id, line: r.line, cell: r.cell, text: r.text.slice(0, 160), why: r.why, missing: r.missing === true })),
  missing: records.filter((r) => r.missing).map((r) => r.id),
  duplicates,
  contradictory,
  stray,
  failed_batches: failed,
  coverage: cov,
  // Lines of the plan that produced no claim and have no stated reason for it. Each is an incomplete check.
  unclassified_lines: cov.unclassified || [],
  usage,
  // The full record: every claim, its place, its class, what it is linked to, and the evidence text beside it.
  records,
};
return [{ json: { ...qaResponse, claim_review } }];
