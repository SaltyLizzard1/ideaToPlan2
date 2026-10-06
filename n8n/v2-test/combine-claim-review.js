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
// WHAT THIS CANNOT DO. A well-formed and wrong judgment can still pass. When the reviewer calls a sentence advice, or
// says it asserts nothing and gives a plausible reason, or answers "yes" on all seven aspects and quotes real words of
// the entry, code has nothing to check it against. Those are counted (on_judgment) and reported, not verified.
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
const bare = (v) => String(v || '').replace(/\*\*|__|`/g, '').replace(/\[[SW]\d+\]/g, ' ').replace(/\s+/g, ' ').trim();
const letters = (v) => flat(v).replace(/\[[sw]\d+\]/g, '').replace(/[^a-z0-9]/g, '');
const numsIn = (v) => [...new Set((String(v || '').replace(/\[[SW]\d+\]/g, ' ').replace(/\bL\d+\b/g, ' ').replace(/^\s*\d+[.)]\s+/, '').match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => x.replace(/,/g, '').replace(/\.0+$/, '')))];
const intake = flat(ctx.founder_context);
// Figures that are the plan's own: the intake and the computed financial model. They need no ledger entry.
const ownNumbers = new Set(numsIn([ctx.founder_context, fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block, JSON.stringify(fin.allowed_money || '')].join(' ')));
// A LABEL SAYS THE STATEMENT IS NOT A FACT. These words label the sentence they are in.
const LABEL = /\bhypothes|\bassum|\bnot (?:yet )?(?:been )?(?:established|known|verified|confirmed|shown|stated|captured|validated)\b|\bwhether\b|\buntested\b|\bunvalidated\b|\bto (?:be )?test(?:ed)?\b|\bIdeaToPlan(?:'s)? (?:reads?|recommends?|hypothesis|assumes?|inference|reading|notes|suggests)\b|\bscenario\b|\bmodel(?:s|ed)?\b|\bforecast\b|\bprojection\b|\bplanning (?:assumption|threshold|figure)\b|\btest criterion\b|\bproposed\b|\bestimate[ds]?\b/i;
// A MODAL LABELS ONLY THE CLAUSE IT GOVERNS. "A positioning could win customers from the three established paid
// providers" is a hypothesis about the positioning, and it still states as fact that there are three providers, that
// they are established, and that they charge. With no other label, a modal covers the sentence only when the sentence
// states nothing code can see beside it: no source, no company, no figure from outside the plan, no "the ... services".
const MODAL = /\b(?:may|might|could|would|if)\b/i;
const THIRD_PARTY = /\b(?:the|these|those|their|existing|other|competing|both)\s+(?:[a-z-]+\s+){0,3}(?:services?|providers?|competitors?|companies|firms?|platforms?|alternatives|substitutes|tools?|agencies|consultants|coaches|customers|travelers|travellers|market)\b/i;
// A GENERAL STATEMENT ABOUT PEOPLE OR CHANNELS IS A STATEMENT ABOUT THE WORLD. It is not advice and it is not nothing.
const GENERAL = /\b(?:people|customers?|professionals?|clients?|adults|buyers|prospects|travelers|travellers|expats?|nomads)\b[^.;]{0,90}\b(?:often|usually|typically|tend to|generally|commonly|rarely|are (?:more |less |un)?likely|seek out|prefer|want|expect|struggle)\b|\b(?:Facebook|Reddit|LinkedIn|YouTube|Instagram|forums?|communities|groups)\b[^.;]{0,80}\b(?:are|is|have|has|offer|provide|reach|attract)\b|\b(?:most|the majority of|many|few)\s+(?:[a-z-]+\s+){0,2}(?:people|customers|professionals|clients|adults|buyers|travelers|travellers|expats?|nomads|providers|competitors)\b/i;
// An instruction, a condition, or a labelled sentence may mention people or channels without asserting anything
// general about them ("Identify three communities where your customer is likely to be", "If ten messages produce no
// conversation, stop"). The refusal below is for the plain statement.
const DIRECTIVE = /^(?:[^:.]{2,40}:\s*)?(?:if|when|once|until|you (?:need|should|must|can|will|have)|do not|don't|identify|write|ask|track|test|use|avoid|confirm|check|review|start|begin|reach|deliver|post|share|send|book|record|measure|decide|revisit|add|choose|run|talk|contact|prepare|draft|publish|synthesize|rewrite|validate|offer|set|keep|treat|plan|build|focus|wait|participat\w*|answer\w*)\b/i;
const ADVICE = /\b(?:should|recommends?|consider|need(?:s)? to|must|do not|don't|start|begin|ask|write|identify|track|test|use|avoid|offer|set|reach|deliver|confirm|check|review|keep|treat|plan|build|focus|wait|post|share|send|book|record|measure|decide|revisit|add|raise|lower|choose|run|talk|contact|prepare|draft|publish|synthesize|rewrite|validate)\b|\byou(?:r)?\b/i;
// "NOT ESTABLISHED" IS A QUALIFICATION, NOT A CLAIM ABOUT THE COMPANY. In a profile, "Price | Not established from the
// sources reviewed" says what the evidence lacks. It may be classed as asserting nothing. Where code can test it, it
// does: a price called not established when an entry about that company gives an amount is not accepted.
const NOT_ESTABLISHED = /\bnot (?:yet )?(?:been )?(?:established|known|stated|shown|verified|confirmed)\b/i;
// A FIGURE IS THE PLAN'S OWN WHEN THE SENTENCE SAYS SO. "Your specific 40-60 age group", "the model's $500 price":
// the figure is in the intake or the financial model, and the words before it point at the founder or the plan. Such
// a figure needs no ledger entry. The same digits attributed to a source ("6,000 surveyed travelers") do.
const OWN_CUE = /\b(?:your|you|this plan|the plan|the model|the forecast|the budget|scenario|our|IdeaToPlan)\b[^.;,]{0,45}$/i;
const outsideFigures = (v) => {
  const txt = String(v || '').replace(/\[[SW]\d+\]/g, ' ').replace(/\bL\d+\b/g, ' ').replace(/^\s*\d+[.)]\s+/, '');
  const out = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const n = m[0].replace(/,/g, '').replace(/\.0+$/, '');
    if (ownNumbers.has(n) && OWN_CUE.test(txt.slice(Math.max(0, m.index - 70), m.index))) continue;
    out.push(n);
  }
  return [...new Set(out)];
};
// A LABEL COVERS THE CLAUSE IT IS IN. "They depend on an audience that does not yet exist and their revenue is not yet
// estimable": "not yet estimable" qualifies the revenue, and the audience clause is stated flat. A clause with no label
// and no modal of its own holds the sentence when it states something code can see: a citation, an absolute ("does
// not exist", "there is no"), other providers, or a figure from outside the plan.
const CLAUSE = /;\s+|\s+because\s+|,\s+(?:and|but|while|whereas|so)\s+|\s+and\s+(?=(?:their|they|it|its|the|this|these|those|there)\b)/i;
const ABSOLUTE = /\b(?:does|do|did) not (?:yet )?exist\b|\bthere (?:is|are) no\b|\bno (?:existing )?(?:audience|customers|clients|competitors?|providers?|alternatives)\b/i;
const unlabelledClause = (text) => {
  const clauses = String(text).split(CLAUSE).map((x) => String(x || '').trim()).filter(Boolean);
  if (clauses.length < 2) return null;
  for (const cl of clauses) {
    if (LABEL.test(cl) || MODAL.test(cl)) continue;
    const cites = cl.match(/\[[SW]\d+\]/g), ab = cl.match(ABSOLUTE), tp = cl.match(THIRD_PARTY);
    const figs = outsideFigures(cl).filter((x) => !ownNumbers.has(x));
    const why = cites ? 'cites ' + cites.join(' ') : ab ? 'states "' + ab[0] + '"' : tp ? 'refers to "' + tp[0] + '"' : figs.length ? 'carries the figure ' + figs.join(', ') : '';
    if (why) return { clause: cl, why };
  }
  return null;
};
const NONE_KINDS = { question: (x) => /\?/.test(x), label: (x) => x.replace(/\[[SW]\d+\]/g, ' ').trim().split(/\s+/).length <= 8, criterion: (x) => /\d/.test(x) || /\b(?:test|criterion|threshold|target|pass|fail|metric|measure|done when|complete)\b/i.test(x), reference: (x) => /\b(?:see|section|above|below|following|table|listed|earlier|later)\b/i.test(x), other: () => true };
const NOT_A_LABEL = /^(?:our read|our view|we think|in our view)[:,.]?$/i;
const ASPECTS = ['subject', 'meaning', 'qualifiers', 'numbers', 'dates', 'population', 'scope'];
const CLASSES = ['FOUNDER', 'EXTERNAL', 'ASSUMPTION', 'RECOMMENDATION', 'NONE'];

// ---------- 1. read every response ----------
// A RESPONSE IS MATCHED BY WHAT IT SAYS, NEVER BY WHERE IT ARRIVED. It has to give back the review token of this run
// and the number of a batch of this run, and then only its verdicts for claim IDs of that batch count. The position of
// a response among the others means nothing: a failed request, a missing item, or a different order moves positions
// and changes no result. A response with another token was made for another text or another ledger and settles
// nothing. A batch that no accepted response names is unreviewed.
const expected = s(map.review);
const usage = { requests: batchItems.length, responses: responses.length, answered: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0, cost_known: true, model: map.model || '' };
const failed = [];          // batches with no usable answer
const rejected = [];        // responses that could not be used, each with the reason
const answersFor = {};      // claim id -> the verdicts given for it by responses that named its batch
const stray = [];           // verdicts for a claim ID that is not in the batch the response named
const batchOf = {};
const idsOf = {};
batchItems.forEach((b) => { idsOf[b.batch] = b.ids || []; (b.ids || []).forEach((id) => { batchOf[id] = b.batch; }); });
const accepted = {};        // batch number -> how many responses were accepted for it
const cutOff = {};
responses.forEach((r, pos) => {
  if (r && r.usage) { usage.prompt_tokens += Number(r.usage.prompt_tokens) || 0; usage.completion_tokens += Number(r.usage.completion_tokens) || 0; if (typeof r.usage.cost === 'number') usage.cost += r.usage.cost; else usage.cost_known = false; }
  if (!r || r.error || !Array.isArray(r.choices)) { rejected.push({ arrived: pos + 1, batch: null, why: r && r.not_sent ? 'the request was not sent: ' + s(r.why) : 'the request failed' + (r && r.error ? ': ' + s(r.error.message || r.error.description || (typeof r.error === 'string' ? r.error : JSON.stringify(r.error))).slice(0, 160) : ': it returned no answer') }); return; }
  if (!r.usage) usage.cost_known = false;
  const choice = r.choices[0] || {};
  const raw = s(choice.message && choice.message.content);
  const cut = choice.finish_reason === 'length';
  let o = null;
  try { o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) {}
  // A cut-off answer may not parse. The token and the batch come first in it, so they can still be read.
  const said = o && typeof o === 'object' ? { review: s(o.review), batch: Number(o.batch) } : { review: s((raw.match(/"review"\s*:\s*"([^"]+)"/) || [])[1]), batch: Number((raw.match(/"batch"\s*:\s*(\d+)/) || [])[1]) };
  if (!said.review) { rejected.push({ arrived: pos + 1, batch: said.batch || null, why: 'the answer does not give the review token' + (o ? '' : ' and is not readable JSON') }); return; }
  if (said.review !== expected) { rejected.push({ arrived: pos + 1, batch: said.batch || null, stale: true, why: 'the answer carries the review token ' + said.review + ', and this run is ' + expected + ': it was made for another text, another ledger, or another pass' }); return; }
  if (!idsOf[said.batch]) { rejected.push({ arrived: pos + 1, batch: said.batch || null, why: 'the answer names batch ' + (said.batch || 'none') + ', which is not a batch of this run' }); return; }
  if (!o || typeof o !== 'object') { cutOff[said.batch] = cut ? 'the answer was cut off at the output limit and cannot be read' : 'the answer is not readable JSON'; rejected.push({ arrived: pos + 1, batch: said.batch, why: cutOff[said.batch] }); return; }
  usage.answered++;
  accepted[said.batch] = (accepted[said.batch] || 0) + 1;
  const list = [];
  (Array.isArray(o.claims) ? o.claims : []).forEach((a) => { if (a && s(a.id)) list.push(a); });
  (Array.isArray(o.recommendation) ? o.recommendation : []).forEach((x) => { const id = s(x && typeof x === 'object' ? x.id : x); if (id) list.push({ ...(x && typeof x === 'object' ? x : {}), id, class: 'RECOMMENDATION' }); });
  (Array.isArray(o.none) ? o.none : []).forEach((x) => { const id = s(x && typeof x === 'object' ? x.id : x); if (id) list.push({ ...(x && typeof x === 'object' ? x : {}), id, class: 'NONE' }); });
  list.forEach((a) => {
    const id = s(a.id);
    if (!idsOf[said.batch].includes(id)) { stray.push({ id, batch: said.batch, belongs_to: batchOf[id] || null }); return; }
    (answersFor[id] = answersFor[id] || []).push(a);
  });
  if (cut) failed.push({ batch: said.batch, claims: idsOf[said.batch].filter((id) => !answersFor[id]).length, why: 'the answer was cut off at the output limit; the claims it did not reach have no verdict', partial: true });
});
batchItems.forEach((b) => { if (!accepted[b.batch]) failed.push({ batch: b.batch, claims: (b.ids || []).length, why: cutOff[b.batch] || 'no usable answer came back for this batch' + (rejected.some((x) => !x.batch) ? ' (' + rejected.filter((x) => !x.batch).length + ' response(s) could not be matched to any batch)' : '') }); });
failed.sort((a, b) => a.batch - b.batch);
const repeated = Object.keys(accepted).filter((k) => accepted[k] > 1).map(Number);

// ---------- 2. judge one answer ----------
// Returns { status: 'settled' | 'defect' | 'open', cls, check, why, links }.
const judge = (c, a, text) => {
  const cls = s(a.class).toUpperCase();
  const open = (why) => ({ status: 'open', cls, why });
  const defect = (check, why, links) => ({ status: 'defect', cls, check, why, links: links || {} });
  if (!CLASSES.includes(cls)) return open('the class is not FOUNDER, EXTERNAL, ASSUMPTION, RECOMMENDATION, or NONE');
  const own = [...new Set((text.match(/\[[SW]\d+\]/g) || []).map((x) => x.slice(1, -1)))];
  const whole = text === c.text;
  if (cls === 'RECOMMENDATION' || cls === 'NONE') {
    // A sentence that cites a source, sits in a company's profile, or names a company says something about the world.
    // Classing it as advice or as nothing would take it out of the review, so that answer is not accepted.
    if (own.length) return open('it is classed ' + cls + ' and the sentence cites ' + own.join(', ') + ': a cited sentence states something');
    const qualification = NOT_ESTABLISHED.test(text);
    if (qualification && c.company && /\b(?:price|fee|cost|rate)s?\b/i.test(s(c.row))) {
      const priced = ledger.filter((e) => e.entity === c.company && /[$]\s?\d|\b(?:USD|EUR|GBP)\s?\d/.test(s(e.claim) + ' ' + s(e.page_excerpt))).map((e) => e.claim_id);
      if (priced.length) return open('it says the ' + s(c.row).toLowerCase() + ' of ' + c.company + ' is not established, and ' + priced.join(', ') + ' gives an amount');
    }
    if (c.company && !qualification) return open('it is classed ' + cls + ' and it is in the profile of ' + c.company + ': a sentence in a company profile states something or is a labelled assumption');
    if ((c.names || []).length && !qualification) return open('it is classed ' + cls + ' and it names ' + c.names.join(', ') + ': a sentence about a company states something or is a labelled assumption');
    const g = LABEL.test(text) || MODAL.test(text) || DIRECTIVE.test(bare(text)) ? null : text.match(GENERAL);
    if (g) return open('it is classed ' + cls + ' and it generalises about people, customers, or channels ("' + g[0].slice(0, 70) + '"): that is a statement about the world');
    if (cls === 'RECOMMENDATION') {
      if (!ADVICE.test(text)) return open('it is classed RECOMMENDATION and nothing in it advises or instructs the founder');
      return { status: 'settled', cls, links: {}, on_judgment: 'recommendation' };
    }
    // "No assertion" needs a reason tied to the passage, and the kind it gives has to fit the words.
    const kind = s(a.kind).toLowerCase(), reason = s(a.reason);
    if (!NONE_KINDS[kind]) return open('it is classed NONE and gives no kind (question, label, criterion, reference, other)');
    if (reason.length < 12) return open('it is classed NONE and gives no reason tied to the passage');
    if (!NONE_KINDS[kind](bare(text))) return open('it is classed NONE as a ' + kind + ', and the words are not one' + (kind === 'question' ? ': there is no question in them' : kind === 'label' ? ': they are a full sentence' : ''));
    return { status: 'settled', cls, links: { kind, reason }, ...(kind === 'other' ? { on_judgment: 'no assertion, on the reason given' } : {}) };
  }
  if (cls === 'ASSUMPTION') {
    const label = s(a.label);
    if (!LABEL.test(text) && !MODAL.test(text)) return defect('ASSUMPTION NOT LABELLED IN THE TEXT', 'The review classed this sentence as an assumption or hypothesis. The sentence carries no hypothesis, assumption, or not-established wording of its own' + (label ? ' (the review pointed to "' + label.slice(0, 80) + '")' : '') + '. A label in a neighbouring sentence does not cover it.', { label });
    if (!label) return open('it is classed ASSUMPTION and the answer does not quote the labelling words');
    if (!flat(text).includes(flat(label))) return open('it is classed ASSUMPTION and the label it quotes is not in the sentence');
    if (NOT_A_LABEL.test(label.trim())) return defect('ASSUMPTION NOT LABELLED IN THE TEXT', 'The review gave "' + label + '" as the label. That names the author; it does not say the statement is a hypothesis or an assumption.', { label });
    if (LABEL.test(text)) {
      const loose = unlabelledClause(text);
      if (loose) return open('the label "' + (label || (text.match(LABEL) || [''])[0]) + '" qualifies its own clause, and the clause "' + loose.clause.slice(0, 120) + '" carries no label and ' + loose.why + ': it has to be split off and judged');
      return { status: 'settled', cls, links: { label } };
    }
    // Only a modal. It covers its own clause, so anything else the sentence states has to be split off and judged.
    const beside = [];
    if (own.length) beside.push('cites ' + own.join(', '));
    if (whole && c.company) beside.push('is in the profile of ' + c.company);
    const named = whole ? (c.names || []) : (c.names || []).filter((nm) => flat(text).includes(nm.toLowerCase()));
    if (named.length) beside.push('names ' + named.join(', '));
    const tp = text.match(THIRD_PARTY);
    if (tp) beside.push('refers to "' + tp[0] + '"');
    const figures = numsIn(text).filter((x) => !ownNumbers.has(x));
    if (figures.length) beside.push('carries the figure ' + figures.join(', '));
    if (beside.length) return open('its only label is "' + (text.match(MODAL) || [''])[0] + '", which covers the clause it governs and nothing else, and the sentence ' + beside.join(', ') + ': the hypothesis has to be split from what is stated inside it');
    return { status: 'settled', cls, links: { label }, on_judgment: 'assumption labelled by a modal alone' };
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
  const foreign = outsideFigures(text).filter((x) => !known.has(x));
  if (foreign.length) return open('the number or date ' + foreign.join(', ') + ' is not in the text of ' + ids.join(', ') + ' or its source record');
  return { status: 'settled', cls, links };
};

// ---------- 3. one result per claim ----------
// Two verdicts for one claim are the same verdict when they give the same class and, where the class has one, the same
// answer on support. "Supported" means nothing for an assumption, a recommendation, or no assertion, so it is not
// compared there: the same recommendation listed twice is one verdict, not a contradiction.
const sigOf = (p) => { const k = s(p && p.class).toUpperCase(); return k + (k === 'FOUNDER' || k === 'EXTERNAL' ? '/' + s(p && p.supported) : ''); };
const signature = (a) => (Array.isArray(a.split) ? 'SPLIT:' + a.split.map(sigOf).join(',') : sigOf(a));
const records = [];
const duplicates = [], contradictory = [];
const failedWhy = {};
failed.forEach((f) => { if (!f.partial) failedWhy[f.batch] = f.why; });
(map.claims || []).forEach((c) => {
  const rec = { id: c.id, line: c.line, cell: c.cell, part: c.part, section: c.section, heading: c.heading, company: c.company, row: c.row, text: c.text, cites: c.cites, batch: batchOf[c.id] || null };
  const got = answersFor[c.id] || [];
  if (!rec.batch) { records.push({ ...rec, status: 'open', missing: true, not_sent: true, why: 'not sent for review in this run' }); return; }
  if (!got.length) { const wrong = stray.find((x) => x.id === c.id); records.push({ ...rec, status: 'open', missing: true, why: failedWhy[rec.batch] ? 'no verdict: batch ' + rec.batch + ', ' + failedWhy[rec.batch] : wrong ? 'no verdict in its own batch: one was given in the answer for batch ' + wrong.batch + ', where this claim was not asked' : 'no verdict was given' }); return; }
  if (got.length > 1) {
    if (new Set(got.map(signature)).size > 1) { contradictory.push(c.id); records.push({ ...rec, status: 'open', why: got.length + ' verdicts were given and they disagree (' + got.map(signature).join(' and ') + ')' }); return; }
    duplicates.push(c.id);
  }
  const a = got[0];
  if (Array.isArray(a.split)) {
    const parts = a.split.filter((p) => p && s(p.text));
    // A split of one part is that part's verdict, and only when the part is the whole claim. A part that covers less
    // leaves the rest with no verdict, which the coverage test below reports.
    if (!parts.length) { records.push({ ...rec, status: 'open', why: 'the split has no parts' }); return; }
    const whole = flat(c.text);
    const off = parts.filter((p) => !whole.includes(flat(p.text)));
    if (off.length) { records.push({ ...rec, status: 'open', why: 'a part of the split is not the words of the sentence: "' + s(off[0].text).slice(0, 80) + '"' }); return; }
    if (parts.reduce((n, p) => n + letters(p.text).length, 0) < 0.85 * letters(c.text).length) { records.push({ ...rec, status: 'open', why: parts.length === 1 ? 'the split has one part and it is not the whole sentence: the rest has no verdict' : 'the parts of the split leave out words of the sentence' }); return; }
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
  not_sent: records.filter((r) => r.not_sent).map((r) => r.id),
  duplicates,
  contradictory,
  stray,
  failed_batches: failed,
  rejected_responses: rejected,
  repeated_batches: repeated,
  review: expected,
  // Settled with nothing for code to check: the reviewer's judgment alone. A well-formed and wrong answer passes here.
  on_judgment: records.flatMap((r) => (r.parts ? r.parts : [r])).filter((x) => x.status === 'settled' && x.on_judgment).reduce((m, x) => { m[x.on_judgment] = (m[x.on_judgment] || 0) + 1; return m; }, {}),
  coverage: cov,
  // Lines of the plan that produced no claim and have no stated reason for it. Each is an incomplete check.
  unclassified_lines: cov.unclassified || [],
  usage,
  // The full record: every claim, its place, its class, what it is linked to, and the evidence text beside it.
  records,
};
return [{ json: { ...qaResponse, claim_review } }];
