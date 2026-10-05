// Citation Check: deterministic checks on the current plan, each with a severity, then builds the QA request.
// Pass 1 (first review) asks QA for a full review. Pass 2 (after a revision) asks QA only to verify the revision.
const ctx = $('Founder Context').first().json;
const fin = $('Compute Financials').first().json;
const G = ctx.tier === 'Growth';
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

let plan = '', attempt = 0, rev = null;
try { const r = $('Apply Revisions').first().json; if (r && typeof r.text === 'string' && r.text) { plan = r.text; attempt = 1; rev = r; } } catch (e) {}
let assembly = [];
try { const asm = $('Assemble Plan').first().json; if (!plan) plan = asm.text || ''; assembly = asm.assembly_notes || []; } catch (e) {}

let sources = [], ledger = '', gaps = '', unmatched = 0, truncated = false, entitiesJson = '[]', integrity = null, excludedJson = '[]', verificationIncomplete = 0, verificationRan = false, verificationProblems = [];
if (G) {
  try { const ev = $('Build Evidence').first().json; sources = JSON.parse(ev.sources || '[]'); ledger = ev.research_ledger || ''; gaps = ev.research_gaps || ''; unmatched = ev.unmatched_markers || 0; entitiesJson = ev.entities || '[]'; try { integrity = JSON.parse(ev.source_integrity || 'null'); } catch (e2) {} excludedJson = ev.excluded_claims || '[]'; verificationIncomplete = ev.verification_incomplete || 0; verificationRan = typeof ev.verified_claims === 'number'; verificationProblems = (integrity && integrity.verification && integrity.verification.verifier_problems) || []; } catch (e) {}
  try { truncated = $('Growth Plan Generator1').first().json.choices[0].finish_reason === 'length'; } catch (e) {}
}
const known = new Set(sources.map((s) => s.id));
const issues = [];
const short = (l) => l.trim().slice(0, 200);
const add = (severity, type, detail, quote, line, extra) => issues.push({ severity, type, detail, quote: quote || '', line: line || null, ...(extra || {}) });

if (!plan) add('BLOCKING', 'NO PLAN TEXT', 'The plan text is empty.');
if (truncated) add('BLOCKING', 'TRUNCATED', 'The writer hit its token limit. The plan is incomplete.');
(fin.fin_issues || []).forEach((i) => add('BLOCKING', 'FINANCIAL MODEL', i));
(fin.fin_reviews || []).forEach((i) => add('MAJOR', 'FINANCIAL MODEL', 'A person has to review this before the plan is sent. The reviser cannot change it; it is settled at the financial-assumptions step or by the founder. ' + i));
(fin.language_flags || []).forEach((i) => add('MAJOR', 'COMPUTED CONTENT WORDING', 'Wording inside the computed financial content needs fixing at the financial-assumptions step. The reviser cannot edit computed content. ' + i));
assembly.forEach((n) => add(n.severity, 'TABLE PLACEMENT', n.detail));
if (unmatched) add('MAJOR', 'UNMATCHED MARKERS', unmatched + ' research citation markers had no matching source URL.');
ctx.section_names.forEach((s, i) => { if (!plan.includes('## ' + (i + 1) + '. ' + s)) add('BLOCKING', 'MISSING SECTION', 'Expected the header "## ' + (i + 1) + '. ' + s + '".'); });
if (fin.forecast_block && !plan.includes('They are not predictions or guarantees')) add('BLOCKING', 'MISSING FORECAST', 'The 12-month forecast and its planning-estimate statement are not in the plan.');

const calloutCount = (plan.match(/^>>/gm) || []).length;
if (calloutCount > 8) add('MINOR', 'TOO MANY CALLOUTS', calloutCount + ' callouts; the limit is 8.');
['DO THIS FIRST', 'BIGGEST RISK', 'FIRST REVENUE MILESTONE'].forEach((k) => { const c = plan.split('>> ' + k + ':').length - 1; if (c !== 1) add('MINOR', 'CALLOUT COUNT', k + ' appears ' + c + ' times; expected once.'); });

// Every dollar figure must come from the computed model, the founder's answers, or the research ledger.
const normMoney = (s) => s.replace(/[\s,]/g, '').replace(/\.00$/, '');
const moneyRe = /\$\s?\d[\d,]*(?:\.\d+)?[kKmM]?/g;
const allowed = new Set((fin.allowed_money || []).map(normMoney));
[ctx.founder_context, ledger].forEach((t) => (String(t || '').match(moneyRe) || []).forEach((m) => allowed.add(normMoney(m))));
const seenFig = new Set();

// VERIFIED DERIVED FIGURES. A dollar figure that is not in the model word for word is accepted only when simple arithmetic
// on verified values reproduces it. Dollar amounts combine only with other dollar amounts, with counts from the model
// (customers, leads, hours), with the model's conversion percentages, or with the period lengths 3, 4, and 12. Anything else stays an UNVERIFIED FIGURE.
const toNum = (v) => { const m = String(v).replace(/[\s,$]/g, '').match(/^(\d+(?:\.\d+)?)([kKmM]?)$/); if (!m) return null; return parseFloat(m[1]) * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1); };
const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const dollars = [...new Set([...(fin.allowed_money || []).map(toNum), ...(String(ctx.founder_context || '').match(moneyRe) || []).map(toNum)].filter(pos))];
const modelCounts = [...new Set((fin.model_counts || []).filter(pos))];
const modelPercents = [...new Set((fin.model_percents || []).filter(pos))];
const usd = (v) => '$' + String(Math.round(v * 100) / 100);
const derived = [];
const derive = (fig) => {
  const x = toNum(fig);
  if (x === null) return '';
  // Exact matches only, except that dividing by a period length (3, 4, 12) may be rounded to the whole dollar.
  const exact = (v) => Math.abs(v - x) < 0.005;
  const rounded = (v) => exact(v) || (Number.isInteger(x) && Math.abs(v - x) < 0.5);
  for (const a of dollars) for (const k of [3, 4, 12]) {
    if (rounded(a / k)) return usd(a) + ' / ' + k;
    if (exact(a * k)) return usd(a) + ' x ' + k;
  }
  for (const a of dollars) for (const b of dollars) {
    if (exact(a + b)) return usd(a) + ' + ' + usd(b);
    if (a > b && exact(a - b)) return usd(a) + ' - ' + usd(b);
  }
  for (const a of dollars) for (const c of modelCounts) {
    if (exact(a * c)) return usd(a) + ' x ' + c;
    if (exact(a / c)) return usd(a) + ' / ' + c;
  }
  for (const a of dollars) for (const p of modelPercents) {
    if (exact(a * p / 100)) return p + '% of ' + usd(a);
  }
  return '';
};

const banned = [
  ['research shows', /research shows/i], ['studies show', /studies show/i], ['industry standard', /industry standard/i],
  ['typical', /\btypical(ly)?\b/i], ['on average', /\bon average\b/i], ['the average is', /the average (is|was)/i],
  ['market rates', /market rates? (is|are)/i], ['market confirms', /market confirms/i], ['confirmed gap', /confirmed (market )?gap/i],
  ['not speculation', /not speculation/i], ['viable verdict', /\b(highly |not )viable\b/i],
  ['conservative/realistic', /\b(conservative|realistic) (estimate|projection|assumption|forecast|scenario)/i],
];
const noneClaims = /\b(no|zero|without an?|lacks? an?|starting (from|with) (zero|scratch|no)) (existing )?(audience|following|followers|website|email list|customers|clients|content|track record)\b/i;
const numRe = /(\$\s?\d|\d[\d,.]*\s?%|\b\d[\d,.]*\s?(k|m|million|billion|thousand)\b)/i;
// FINANCIAL PROSE CHECK. A sentence that states a computed financial value for one named scenario or forecast period must agree with the model.
// Code compares the statement with the computed values. The AI is not asked to recalculate anything.
const M = fin.model || null;
const computedLines = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
const usd0 = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const PERIODS = [
  { key: 0, re: /\bmonths?\s*1\s*(?:-|to|through)\s*3\b|\bfirst\s+(?:three|3)\s+months\b|\bfirst\s+quarter\b|\bquarter\s+(?:one|1)\b|\bQ1\b/i },
  { key: 1, re: /\bmonths?\s*4\s*(?:-|to|through)\s*6\b|\bsecond\s+quarter\b|\bquarter\s+(?:two|2)\b|\bQ2\b/i },
  { key: 2, re: /\bmonths?\s*7\s*(?:-|to|through)\s*9\b|\bthird\s+quarter\b|\bquarter\s+(?:three|3)\b|\bQ3\b/i },
  { key: 3, re: /\bmonths?\s*10\s*(?:-|to|through)\s*12\b|\bfourth\s+quarter\b|\bquarter\s+(?:four|4)\b|\bQ4\b/i },
  { key: 'year', re: /\byear[- ]one\b|\bfirst\s+year\b|\bfirst\s+(?:12|twelve)\s+months\b/i },
];
const SCEN = [['base', /\bBase\b(?!\s+(?:customer|market|audience|group|profile|price))/], ['target', /\bTarget\b(?!\s+(?:customer|market|audience|group|profile|price))/], ['stretch', /\bStretch\b/]];
const NUMWORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const checkFinancialProse = (t, L) => {
  if (!M || computedLines.has(t)) return;
  t.split(/(?<=[.!?])\s+/).forEach((sentence) => {
    // (a) A claim of zero for a forecast period. Spending before validation is a budget figure and is left alone.
    const zeroRe = /(\$0\b(?![.,]\d)|\bno\s+(?:expenses?|costs?|spending|outlay)\b|\bzero\s+(?:expenses?|costs?|spending|dollars)\b)([^.;,]{0,70})/gi;
    let z;
    while ((z = zeroRe.exec(sentence)) !== null) {
      zeroRe.lastIndex = z.index + z[1].length;
      const tail = z[2];
      if (/before validation/i.test(tail)) continue;
      const p = PERIODS.find((x) => x.re.test(tail));
      if (!p) continue;
      const concept = /\brevenue\b/i.test(tail) ? 'revenue' : /\bprofit\b/i.test(tail) ? 'profit' : 'expenses';
      const row = p.key === 'year' ? M.year : M.periods[p.key];
      const label = p.key === 'year' ? 'year one' : M.periods[p.key].label;
      const actual = row ? row[concept] : null;
      if (actual !== null && actual !== undefined && Math.round(actual) !== 0) add('MAJOR', 'FINANCIAL PROSE DOES NOT MATCH THE MODEL', 'The plan says "' + (z[1] + tail).trim() + '", but the computed ' + concept + ' for ' + label + ' is ' + usd0(actual) + '. Spending before validation is a budget figure; forecast expenses are a different figure.', short(sentence), L);
    }
    // (b) and (c) need exactly one scenario or period in the sentence, so the statement can be tied to one row of the model.
    const refs = [];
    SCEN.forEach(([k, re]) => { if (re.test(sentence)) refs.push({ scenario: k }); });
    PERIODS.forEach((x) => { if (x.re.test(sentence)) refs.push({ period: x.key }); });
    if (refs.length !== 1) return;
    const ref = refs[0];
    const row = ref.scenario ? M.scenarios[ref.scenario] : ref.period === 'year' ? M.year : M.periods[ref.period];
    if (!row) return;
    const label = ref.scenario ? 'the ' + ref.scenario.charAt(0).toUpperCase() + ref.scenario.slice(1) + ' scenario' : ref.period === 'year' ? 'year one' : M.periods[ref.period].label;
    // (b) A dollar total stated for revenue, expenses, or profit.
    const valRe = /\$([\d,]+)(?:\.\d+)?\s+(?:in\s+|of\s+)?(?:monthly\s+|quarterly\s+|annual\s+|total\s+|three-month\s+)?(revenue|expenses|operating profit|profit)\b/gi;
    let m;
    while ((m = valRe.exec(sentence)) !== null) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      const concept = /profit/i.test(m[2]) ? 'profit' : m[2].toLowerCase();
      const base = row[concept];
      if (base === null || base === undefined) continue;
      const ok = ref.scenario ? [base, base * 3, base * 12] : ref.period === 'year' ? [base] : [base, base / 3];
      if (!ok.some((o) => Math.abs(o - v) < 0.5)) add('MAJOR', 'FINANCIAL PROSE DOES NOT MATCH THE MODEL', 'The plan says "' + m[0] + '" for ' + label + ', but the computed ' + concept + ' is ' + usd0(base) + (ref.scenario ? ' per month' : '') + '.', short(sentence), L);
    }
    // (c) A monthly customer or lead volume.
    const volRe = /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:new\s+|paying\s+|warm\s+)*(clients?|customers?|leads?|prospects?)\s+(?:per|a|each)\s+month\b/gi;
    while ((m = volRe.exec(sentence)) !== null) {
      const word = m[1].toLowerCase();
      const v = NUMWORDS[word] !== undefined ? NUMWORDS[word] : parseFloat(word);
      const concept = /lead|prospect/i.test(m[2]) ? 'leads' : 'customers';
      const base = row[concept];
      if (base === null || base === undefined || !Number.isFinite(v)) continue;
      if (Math.abs(base - v) > 0.05) add('MAJOR', 'FINANCIAL PROSE DOES NOT MATCH THE MODEL', 'The plan says "' + m[0] + '" for ' + label + ', but the model has ' + base + ' ' + concept + ' per month.', short(sentence), L);
    }
  });
};

// A stated weekly, daily, or yearly rate of customers or leads must agree with a scenario or forecast period in the financial model.
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const rateRe = /\b(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s+(?:new\s+|paying\s+|more\s+)*(clients?|customers?|sessions?|sales?|bookings?|leads?|prospects?)\s+(?:per|a|each|every)\s+(week|day|year)\b/gi;
const lines = plan.split('\n');
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t)) return;
  (t.match(/\[\[[A-Z_]+\]\]/g) || []).forEach((m) => add('BLOCKING', 'LEFTOVER TABLE MARKER', m, short(t), L));
  (t.match(/https?:\/\/[^\s)\]]+/g) || []).forEach((u) => add('BLOCKING', 'URL WRITTEN BY MODEL', u, short(t), L));
  [...new Set(t.match(/\b[SW]\d+\b/g) || [])].forEach((id) => {
    if (!known.has(id)) add('BLOCKING', G ? 'UNKNOWN SOURCE ID' : 'SOURCE TAG IN UNRESEARCHED PLAN', 'The plan cites ' + id + ', which is not in the source list.', short(t), L);
  });
  (t.match(moneyRe) || []).forEach((m) => {
    const n = normMoney(m);
    if (allowed.has(n) || seenFig.has(n)) return;
    seenFig.add(n);
    const how = derive(m);
    if (how) { derived.push({ figure: m.trim(), how, line: L }); return; }
    add('BLOCKING', 'UNVERIFIED FIGURE', m.trim() + ' is not in the computed financial model, the founder context, or the research ledger.', short(t), L);
  });
  checkFinancialProse(t, L);
  let rm;
  rateRe.lastIndex = 0;
  while ((rm = rateRe.exec(t)) !== null) {
    const word = rm[1].toLowerCase();
    const v = WORDS[word] !== undefined ? WORDS[word] : parseFloat(word);
    const kind = /lead|prospect/i.test(rm[2]) ? 'leads' : 'customers';
    const per = rm[3].toLowerCase();
    const factor = per === 'week' ? 12 / 52 : per === 'day' ? 12 / 365 : 12;
    const options = (((fin.rate_basis || {})[kind]) || []).map((m) => m * factor);
    if (!Number.isFinite(v) || !options.length) continue;
    if (!options.some((o) => Math.abs(o - v) / o <= 0.2)) add('MAJOR', 'RATE DOES NOT MATCH THE FINANCIAL MODEL', '"' + rm[0] + '" does not match any scenario or forecast period. Per ' + per + ', the model gives ' + options.map((o) => Math.round(o * 10) / 10).join(', ') + ' ' + kind + '. Use the weekly rates in FINANCIAL FACTS or keep the monthly figure.', short(t), L);
  }
  if (/NOT PROVIDED|\bUNKNOWN\b/.test(t)) add('MAJOR', 'INTERNAL LABEL PRINTED', 'An internal intake label appears in the plan.', short(t), L);
  // Search listings are checked with every other source below: a W ID needs a verified ledger entry like any S ID.
});
// ---------- CITATION INTEGRITY ----------
// Deterministic checks that a cited source is the right source for what the text says. Every one of them blocks delivery
// except the last, which is a warning. They read the source records and the ledger exactly as Build Evidence produced
// them. Source IDs are never renumbered here or anywhere after Build Evidence.
let evClaims = [];
try { const p = JSON.parse(ledger); if (Array.isArray(p)) evClaims = p; } catch (e) {}
let entities = [];
try { const p = JSON.parse(entitiesJson); if (Array.isArray(p)) entities = p; } catch (e) {}
const srcById = {};
sources.forEach((x) => { srcById[x.id] = x; });
const spaced = (v) => ' ' + String(v || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const entityOfSource = {};
entities.forEach((e) => (e.source_ids || []).forEach((id) => { entityOfSource[id] = e; }));
const statRe = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|b|bn|million|billion|thousand)?\b|\b\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*(?:\.\d+)?\s?(?:million|billion|thousand)\b/gi;
const normStat = (v) => v.toLowerCase().replace(/[\s,$]/g, '').replace(/billion|bn/, 'b').replace(/million/, 'm').replace(/thousand/, 'k').replace(/\.00(?=\D|$)/, '');
const statsIn = (v) => [...new Set((String(v || '').match(statRe) || []).map(normStat))];
// Which sources the ledger gives for each figure.
const statOwners = {};
evClaims.forEach((c) => statsIn(c.claim).forEach((tok) => { const set = statOwners[tok] = statOwners[tok] || new Set(); (c.source_ids || []).forEach((id) => set.add(id)); }));
// Figures that belong to the plan itself: the computed model, the founder's answers, and figures derived from them.
const ownStats = new Set();
[fin.financial_model, ctx.founder_context, fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].forEach((t) => statsIn(t).forEach((tok) => ownStats.add(tok)));
(fin.allowed_money || []).forEach((m) => statsIn(m).forEach((tok) => ownStats.add(tok)));
(fin.model_percents || []).forEach((p) => ownStats.add(String(p) + '%'));
derived.forEach((x) => statsIn(x.figure).forEach((tok) => ownStats.add(tok)));
// Sources whose figures need a qualifier every time: undated, or a vendor blog, list article, or forum.
const weakKind = /vendor blog|listicle|directory|community|forum/i;
const weakSource = (id) => { const x = srcById[id]; if (!x || x.kind !== 'research') return ''; if (/^not provided|date not shown/i.test(String(x.published || ''))) return 'undated'; const c = evClaims.find((k) => (k.source_ids || []).includes(id) && weakKind.test(k.source_type || '')); return c ? c.source_type : ''; };
const qualified = /directional|unverified|not (?:been )?independently|undated|no publication date|absence of a publication date|treat (?:this|these|it|them)|vendor blog|one source estimates|estimates? (?:the|that)|according to|(?:website|page|site) (?:states|says|lists)|states (?:that )?it charges|as of the date retrieved|may not reflect current/i;
const segmentsOf = (t) => /^\|.*\|$/.test(t) ? [t] : t.split(/(?<=[.!?;])\s+/);
// SHORT NAMES. A plan often shortens a company's name: "Kismet Travels" for "Kismet Travels & Tours". A short name is
// accepted only when it is the leading words of the verified name, with a generic ending or the part after "&"
// dropped, has at least two words, and belongs to one company only: if another company's name starts with the same
// words, the short name is not used for either. It is matched with its capital letters, as a name, never as a
// substring, so "expat financial planners" is not a mention of "Expat Financial Solutions".
const GENERIC_ENDING = /^(?:tours?|travels?|relocations?|group|consulting|consultants?|solutions|services|inc|llc|ltd|co|company|international|global|worldwide|partners|associates|advisors|advisers)$/i;
const JOINER = /^(?:&|and)$/i;
const shortNamesOf = (e) => {
  const tk = String(e.name || '').split(/\s+/).filter(Boolean);
  const out = [];
  const amp = tk.findIndex((w) => JOINER.test(w));
  if (amp >= 2) out.push(tk.slice(0, amp).join(' '));
  let end = tk.length;
  while (end > 2 && GENERIC_ENDING.test(tk[end - 1].replace(/[.,]/g, ''))) { end--; while (end > 2 && JOINER.test(tk[end - 1])) end--; out.push(tk.slice(0, end).join(' ')); }
  return [...new Set(out)].filter((s) => s.split(' ').length >= 2 && s !== tk.join(' '));
};
const shortNames = {};
entities.forEach((e) => shortNamesOf(e).forEach((s) => { (shortNames[s] = shortNames[s] || []).push(e); }));
const aliasesOf = (e) => Object.keys(shortNames).filter((s) => shortNames[s].length === 1 && shortNames[s][0] === e && !entities.some((o) => o !== e && (String(o.name || '') + ' ').startsWith(s + ' ')));
let rowEntity = null;
let sectionNo = 0;
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t) { rowEntity = null; return; }
  const sec = t.match(/^## (\d+)\./);
  if (sec) sectionNo = parseInt(sec[1], 10);
  const isRow = /^\|.*\|$/.test(t);
  if (!isRow) rowEntity = null;
  if (t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t)) return;
  if (isRow) {
    // A profile table names its company in a row of its own: | **Company** | |. Every row under it is about that company.
    const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length === 2 && cells[1] === '' && cells[0]) { rowEntity = entities.find((e) => spaced(cells[0]).includes(' ' + e.name_words + ' ')) || null; return; }
  }
  // 1. The text is about one company but cites another company's page. A citation belongs to the company named just
  //    before it. "A [x], B [y]" is two bindings, so swapped sources block even though both companies and both
  //    sources are in the sentence. Names listed together with nothing between them ("A, B and C [x][y]") share the
  //    citations that follow the list. A citation with no company before it in its clause takes the companies named
  //    later in that clause, and failing that the row's label or the profile table's company. A table row is not one
  //    claim: cells, numbered items, sentences and clauses are separate.
  const mentionsIn = (text) => {
    const found = [];
    entities.forEach((e) => {
      if (!e.name_words) return;
      const re = new RegExp('(?:^|[^a-z0-9])(' + e.name_words.split(' ').map((w) => w === 'and' ? '(?:and|&)' : w).join("(?:['’]s)?[^a-z0-9]+") + ')(?![a-z0-9])', 'gi');
      let m;
      while ((m = re.exec(text)) !== null) { const start = m.index + m[0].length - m[1].length; found.push({ e, start, end: start + m[1].length }); re.lastIndex = start + 1; }
      aliasesOf(e).forEach((alias) => {
        const ar = new RegExp('(?:^|[^A-Za-z0-9])(' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + ')(?![A-Za-z0-9])', 'g');
        let a;
        while ((a = ar.exec(text)) !== null) { const start = a.index + a[0].length - a[1].length; found.push({ e, start, end: start + a[1].length }); ar.lastIndex = start + 1; }
      });
    });
    // "Move One" inside "Move One Relocations" is one mention, the longer one.
    return found.filter((x) => !found.some((y) => y !== x && y.start <= x.start && y.end >= x.end && (y.end - y.start) > (x.end - x.start))).sort((p, q) => p.start - q.start);
  };
  const rowCells = isRow ? t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()) : [t];
  const rowLabel = isRow && rowCells.length > 1 && rowCells[0].length <= 80 && !/\b[SW]\d+\b/.test(rowCells[0]) ? mentionsIn(rowCells[0]).map((x) => x.e) : [];
  const rowContext = rowLabel.concat(rowEntity && !rowLabel.includes(rowEntity) ? [rowEntity] : []);
  const NOT_THE_SUBJECT = /\b(?:unlike|than|versus|vs\.?|compared (?:with|to)|against)\s+(?:the\s+)?$/i;
  rowCells.forEach((cell) => cell.split(/\s+(?=\d{1,2}\.\s+\S)/).forEach((item) => item.split(/(?<=[.!?])\s+/).forEach((sentence) => sentence.split(/;\s+|,\s+(?:while|whereas|but|although|though)\s+/).forEach((clause) => {
    const mentions = mentionsIn(clause).filter((x) => !NOT_THE_SUBJECT.test(clause.slice(Math.max(0, x.start - 24), x.start)));
    const runRe = /(?:\[?\b[SW]\d+\b\]?[\s,]*)+/g;
    let run;
    while ((run = runRe.exec(clause)) !== null) {
      const ids = [...new Set(run[0].match(/[SW]\d+/g) || [])].filter((id) => srcById[id]);
      if (!ids.length) continue;
      const before = mentions.filter((x) => x.end <= run.index);
      let about = [];
      if (before.length) {
        let k = before.length - 1;
        about = [before[k].e];
        while (k > 0 && /^[\s,]*(?:and|or|&)?[\s,]*$/i.test(clause.slice(before[k - 1].end, before[k].start))) { k--; about.push(before[k].e); }
      } else {
        // Companies named after the citation count only when they have no citation of their own
        // ("... [S2], according to X"). A company followed by its own source is bound to that source, not to this one.
        const after = mentions.filter((x) => x.start >= run.index + run[0].length);
        const later = [...new Set(after.filter((x, n) => !/\b[SW]\d+\b/.test(clause.slice(x.end, n + 1 < after.length ? after[n + 1].start : clause.length))).map((x) => x.e))];
        about = later.length ? later : rowContext;
      }
      if (!about.length) continue;
      ids.forEach((id) => {
        const own = entityOfSource[id];
        const tied = about.some((e) => (e.source_ids || []).includes(id) || evClaims.some((c) => (c.source_ids || []).includes(id) && spaced(c.claim).includes(' ' + e.name_words + ' ')));
        if (tied) return;
        if (own) add('BLOCKING', 'CITATION ATTACHED TO THE WRONG COMPANY', 'This text is about ' + about.map((e) => e.name).join(' and ') + ', but it cites ' + id + ', which is the page of ' + own.name + ' (' + srcById[id].domain + '). The ledger ties ' + about[0].name + ' to ' + (about[0].source_ids || []).join(', ') + '.', short(clause), L);
        else if (isRow) add('BLOCKING', 'CITATION NOT TIED TO THIS COMPANY', 'This text is about ' + about.map((e) => e.name).join(' and ') + ', but it cites ' + id + ' (' + srcById[id].domain + '), and no ledger entry ties that source to this company. The ledger ties ' + about[0].name + ' to ' + (about[0].source_ids || []).join(', ') + '.', short(clause), L);
      });
    }
  }))));
  segmentsOf(t).forEach((seg) => {
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (!cited.length) return;
    // 2. A figure the ledger gives for one source is cited to another, or a statistic is cited to a source with no ledger entry for it.
    statsIn(seg).forEach((tok) => {
      if (ownStats.has(tok)) return;
      const owners = statOwners[tok];
      if (owners) { if (!cited.some((id) => owners.has(id))) add('BLOCKING', 'FIGURE CITED TO THE WRONG SOURCE', 'The ledger gives the figure ' + tok + ' for ' + [...owners].join(', ') + ', but this text cites ' + cited.join(', ') + '.', short(seg), L); return; }
      if (/^\d/.test(tok) && !/^\d[\d.]*$/.test(tok)) add('BLOCKING', 'UNSUPPORTED STATISTIC', 'The statistic ' + tok + ' sits on text that cites ' + cited.join(', ') + ', but no ledger entry states it for any source.', short(seg), L);
    });
    // 2b. Two figures that the ledger gives together for one source identify that source's claim, even when the plan's
    //     own model happens to use the same amounts. A price range is the usual case.
    const together = {};
    statsIn(seg).forEach((tok) => { if (ownStats.has(tok) && statOwners[tok]) statOwners[tok].forEach((id) => { (together[id] = together[id] || []).push(tok); }); });
    Object.keys(together).forEach((id) => {
      if (together[id].length < 2 || cited.includes(id) || cited.some((c) => together[c] && together[c].length >= together[id].length)) return;
      add('BLOCKING', 'FIGURE CITED TO THE WRONG SOURCE', 'The ledger gives the figures ' + together[id].join(' and ') + ' together for ' + id + ', but this text cites ' + cited.join(', ') + '.', short(seg), L);
    });
    // 3. A note about a source's date must describe the source that is cited.
    const yr = seg.match(/\b(?:dated|published in|as of)\s+((?:19|20)\d{2})\b/i);
    if (yr && /\b(source|entry|page|report|listing)\b/i.test(seg) && !cited.some((id) => String(srcById[id].published || '').includes(yr[1]))) add('BLOCKING', 'SOURCE DATE NOTE ON THE WRONG SOURCE', 'The text says its source is dated ' + yr[1] + ', but ' + cited.map((id) => id + ' is recorded as published ' + srcById[id].published).join('; ') + '.', short(seg), L);
    // 4. Warning, not a blocker: a figure from a weak source stated with no qualifier. Repeating it does not make it established.
    // The qualifier may sit in another clause of the same sentence ("...[S5]; the page carries no publication date").
    const wholeSentence = t.split(/(?<=[.!?])\s+/).find((x) => x.includes(seg.trim().slice(0, 60))) || seg;
    if (!qualified.test(seg) && !qualified.test(wholeSentence) && statsIn(seg).some((tok) => !ownStats.has(tok))) cited.forEach((id) => {
      const why = weakSource(id);
      if (why && statsIn(seg).some((tok) => statOwners[tok] && statOwners[tok].has(id))) add('MAJOR', 'UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION', id + ' is ' + (why === 'undated' ? 'an undated source' : 'a ' + why) + '. Its figure is stated here as fact' + (sectionNo === 1 ? ', in the Executive Summary' : '') + '. Say whose estimate it is and that it has not been verified, every time it appears.', short(seg), L);
    });
  });
});
// ---------- UNRESOLVED COSTS AND THE CONDITIONAL CONCLUSION ----------
// When costs are unresolved, Compute Financials writes the condition the conclusion depends on: the costs, the outcome
// tested, the break-even threshold and its assumptions. Finalize Plan places that paragraph in the Viability Assessment
// after revision. Here the text around it is checked: a plan that states viability unconditionally, or says every cost
// is known, is blocked, and the reviser is asked to correct it.
const costCondition = String(fin.cost_condition || '');
if (costCondition) {
  const plainText = (v) => String(v).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  const isHeader = (l) => /^##\s/.test(l.trim());
  const sectionOf = (re) => { const a = lines.findIndex((l) => isHeader(l) && re.test(l)); if (a < 0) return null; const b = lines.findIndex((l, i) => i > a && isHeader(l)); return { start: a, end: b < 0 ? lines.length : b }; };
  const viability = sectionOf(/Viability/i);
  const summary = sectionOf(/Executive Summary/i);
  // The paragraph itself is placed by Finalize Plan after revision, so its absence here is not a finding. What the
  // writer and the reviser control is the text around it, which is checked now so that it can be corrected.
  const VIABLE = /\b(?:is|are|looks?|appears?|remains?|proves?) (?:financially |commercially |clearly |already )?(?:viable|profitable|sustainable|self-sustaining|worth pursuing|financially sound)\b|\bwill (?:be profitable|break even|cover its costs|turn a profit|make a profit)\b|\b(?:profitable|cash[- ]positive) (?:from|in|by) (?:month|year|the first)\b|\bthe (?:business|model|numbers?) works?\b/i;
  const CONDITIONAL = /\b(?:if|provided|as long as|unless|only|conditional|depends?|subject to|assum\w*|would|could|may|might|not|whether|until)\b/i;
  // Statements that deny the condition: that every cost is known or included, or that the threshold is a budget or an estimate.
  const DENIES = /\ball (?:the )?(?:costs|expenses) (?:are|have been) (?:included|accounted for|known|covered|captured)\b|\bno (?:other|further|additional|hidden|unknown|unresolved) costs\b|\b(?:costs|expenses) are fully (?:known|covered|accounted for)\b|\b(?:every|each) cost (?:is|has been) (?:included|accounted for|known)\b|\b(?:budget|allowance) (?:of|for) (?:each|every) (?:of these )?costs?\b|\bthreshold (?:is|as) (?:an? )?(?:estimate|budget|forecast) of\b/i;
  [viability, summary].filter(Boolean).forEach((sec) => {
    for (let i = sec.start + 1; i < sec.end; i++) {
      const t = lines[i].trim();
      if (!t || t.startsWith('#')) continue;
      (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?;])\s+/)).forEach((sentence) => {
        if (VIABLE.test(sentence) && !CONDITIONAL.test(sentence)) add('BLOCKING', 'UNCONDITIONAL VIABILITY CLAIM WITH UNRESOLVED COSTS', 'This sentence states that the business works, with no condition, while these costs are unresolved: ' + (fin.unresolved_costs || []).join('; ') + '. Word it as conditional on those costs, using the threshold in the cost condition paragraph.', short(sentence), i + 1);
        else if (DENIES.test(sentence) && !/\bnot\b/i.test(sentence)) add('BLOCKING', 'COST CONDITION CONTRADICTED', 'This sentence says that costs are fully known or included, or treats the break-even threshold as a budget or an estimate, while these costs are unresolved: ' + (fin.unresolved_costs || []).join('; ') + '. Remove it or reword it so that it agrees with the cost condition.', short(sentence), i + 1);
      });
    }
  });
  // Startup budget, checked on every line the model wrote. The funding the included costs need is a computed figure;
  // whether the founder's budget covers all costs is not known while costs are unresolved, and the plan must not say it is.
  const BUDGET_ENOUGH = /\b(?:budget|ceiling|funds?|funding|capital|savings)\b[^.;]{0,80}?\b(?:sufficient|enough|adequate|ample|covers? (?:the|all|every|everything|what|launch)|will cover|can cover|fully funds?|is (?:not a|no) constraint)\b|\b(?:sufficient|enough|adequate|ample)\b[^.;]{0,40}?\b(?:budget|funds?|funding|capital|to (?:launch|start|get started|begin|open|fund|cover))\b|\bno (?:additional|further|outside|external|extra|more) (?:funding|capital|investment|money) (?:is |will be )?(?:needed|required|necessary)\b|\b(?:fully|comfortably|easily|well) (?:funded|within (?:the |your )?budget|under (?:the |your )?(?:budget|ceiling))\b|\bcan (?:launch|start|be launched|be started) (?:within|on|under|for) (?:the |your |this )?(?:budget|ceiling)\b/i;
  // Acceptable: the sentence limits itself to the included costs, or says that cover of all costs is not established.
  const BUDGET_QUALIFIED = /\b(?:unresolved|included costs?|costs? (?:that are )?included|costs? in the (?:model|figures|forecast)|included in (?:the|these) (?:model|figures|forecast)|not (?:yet )?(?:established|resolved|known|confirmed)|whether|cannot (?:yet )?be|until the|not (?:sufficient|enough|adequate)|insufficient)\b/i;
  // Profit wording, checked on every line the model wrote. A statement that the business reaches profit describes the
  // model's included costs and assumptions. With costs unresolved it has to say so in the same sentence.
  const PROFIT_CLAIM = /\breach(?:es|ed|ing)? (?:operating )?(?:profit|profitability|break-?even)\b|\b(?:is|becomes?|turns?) (?:operating[- ])?profitable\b|\bturns? (?:a |an )?(?:operating )?profit\b|\bprofitable (?:quickly|immediately|early|from)\b|\b(?:generates?|produces?|makes?|earns?) (?:a |an )?(?:operating )?profit (?:quickly|immediately|from the first)\b/i;
  // Acceptable: the sentence says the figure is for the included costs, or that the result depends on the unresolved costs.
  const PROFIT_QUALIFIED = /\b(?:unresolved|included costs?|costs? (?:that are )?included|costs? in the (?:model|figures|forecast)|included in (?:the|these) (?:model|figures|forecast))\b/i;
  const computedLines = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || computedLines.has(t) || plainText(t) === plainText(costCondition)) return;
    (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?;])\s+/)).forEach((sentence) => {
      if (BUDGET_ENOUGH.test(sentence) && !BUDGET_QUALIFIED.test(sentence)) add('BLOCKING', 'UNCONDITIONAL BUDGET CLAIM WITH UNRESOLVED COSTS', 'This sentence says the startup budget is sufficient, with no condition, while these costs are unresolved: ' + (fin.unresolved_costs || []).join('; ') + '. Two things are different: the funding the included costs need, which FINANCIAL FACTS give, and whether the budget covers all costs, which is not established until the unresolved costs are known. State the first as a figure for the included costs only, and say the second is not established.', short(sentence), i + 1);
      if (PROFIT_CLAIM.test(sentence) && !PROFIT_QUALIFIED.test(sentence)) add('BLOCKING', 'UNCONDITIONAL PROFIT CLAIM WITH UNRESOLVED COSTS', 'This sentence says the business reaches profit, with no condition, while these costs are unresolved: ' + (fin.unresolved_costs || []).join('; ') + '. The figure describes the costs included in the model and its assumptions. Say that in this sentence, and say that actual profitability depends on the unresolved costs.', short(sentence), i + 1);
    });
  });
}

// ---------- EXCLUDED CLAIMS ----------
// Build Evidence checked every research claim against its fetched page. Claims that failed are not evidence.
// The plan is blocked when it still presents one of them as evidence, and when verification did not finish.
let excludedClaims = [];
try { const p = JSON.parse(excludedJson); if (Array.isArray(p)) excludedClaims = p; } catch (e) {}
if (G && !verificationRan) add('BLOCKING', 'SOURCE VERIFICATION DID NOT RUN', 'The evidence for this plan was not checked against its source pages. No research claim may be treated as verified.');
// INCOMPLETE SOURCE VERIFICATION, AND WHAT DEPENDS ON IT. A check that produced no usable answer is not a defect that
// was found. Its claims stay out of the ledger either way. Whether the plan is held depends on whether anything in
// the plan could rest on those claims:
// - HOLD when the plan cites the page for something no verified claim covers, names the company the claim is about
//   (in full or by a short form), states a figure only that claim gives, or has a sentence that says most of what the
//   claim says. HOLD also when this cannot be worked out: the failed check names no claim, or the claim's text is gone.
// - Otherwise the claims were candidates the plan never used. That is a research warning for the reviewer, not a hold.
if (verificationIncomplete > 0) {
  let exAll = [];
  try { const p = JSON.parse(excludedJson); if (Array.isArray(p)) exAll = p; } catch (e) {}
  let ledgerNow = [];
  try { const p = JSON.parse(ledger); if (Array.isArray(p)) ledgerNow = p; } catch (e) {}
  const longWords = (v) => [...new Set(String(v || '').toLowerCase().replace(/\[[sw]\d+\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 5))];
  const planSentences = plan.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).flatMap((l) => (/^\s*\|.*\|\s*$/.test(l) ? l.trim().replace(/^\||\|$/g, '').split('|') : [l]).flatMap((c) => c.split(/(?<=[.!?])\s+/)));
  const planFigures = statsIn(plan);
  const affected = [...new Set(verificationProblems.flatMap((v) => v.claim_ids || []))];
  const pagesHit = [...new Set(verificationProblems.map((v) => v.source_id).filter(Boolean))];
  const depends = [];
  const names = [];
  if (!affected.length) depends.push('the failed check does not say which claims it covered, so their use cannot be ruled out');
  pagesHit.forEach((id) => { if (new RegExp('\\b' + id + '\\b').test(plan) && !ledgerNow.some((c) => (c.source_ids || []).includes(id))) depends.push('the plan cites ' + id + ', and no verified claim exists on that page'); });
  affected.forEach((id) => {
    if (ledgerNow.some((c) => c.claim_id === id)) return;          // verified on another page: this claim has a completed check
    const x = exAll.find((c) => c.claim_id === id);
    const text = x ? String(x.claim || '').trim() : '';
    if (!text) { depends.push(id + ': its text is not available, so its use cannot be ruled out'); return; }
    const name = x.entity || ((text.match(/^(?:ADJACENT\s*:\s*)?(.{2,70}?)\s+(?:says?|offers?|provides?|lists?|helps?|is|serves?|states?)\b/) || [])[1] || '');
    if (name) names.push(name);
    const tk = name.split(/\s+/).filter(Boolean);
    const forms = [...new Set([name, tk.slice(0, 2).join(' '), tk[0] || ''].filter((n) => n.length >= 6))];
    const namedAs = forms.find((n) => new RegExp('(?:^|[^A-Za-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9])').test(plan));
    // Naming the company is a dependency in itself only when nothing else is verified about it: then anything the plan
    // says about it may rest on this claim. When other claims about the company are verified, the plan depends on
    // this one where it says, about that company, something those claims do not state and this one does.
    const sameCompany = x.entity ? ledgerNow.filter((c) => c.entity === x.entity) : [];
    if (namedAs && !sameCompany.length) depends.push(id + ': the plan names ' + namedAs + ', and no verified claim about it exists');
    else if (namedAs) {
      const stem = (w) => w.replace(/(?:ies|es|s)$/, '').slice(0, 7);
      const wordsIn = (v) => [...new Set(String(v || '').toLowerCase().replace(/\[[sw]\d+\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4).map(stem))];
      const GENERIC = new Set(['need', 'support', 'servic', 'help', 'offer', 'provid', 'includ', 'compan', 'people', 'that', 'with', 'from', 'their', 'which', 'paid']);
      const known = new Set(sameCompany.flatMap((c) => wordsIn(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))).concat(wordsIn(name)));
      const only = wordsIn(text).filter((w) => !known.has(w) && !GENERIC.has(w));
      const ownSources = [...new Set(sameCompany.flatMap((c) => c.source_ids || []))];
      const planLines = plan.split('\n');
      let owner = null;
      let found = null;
      planLines.forEach((raw, k) => {
        const t = raw.trim();
        if (!/^\|.*\|$/.test(t)) owner = null;
        else { const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); if (cells.length === 2 && cells[1] === '' && cells[0]) { owner = cells[0].replace(/\*/g, '').trim(); return; } }
        if (found || !t || t.startsWith('#')) return;
        const about = t.includes(namedAs) || (owner && owner === x.entity) || ownSources.some((sid) => new RegExp('\\b' + sid + '\\b').test(t));
        if (!about) return;
        const there = new Set(wordsIn(t));
        const w = only.filter((o) => there.has(o));
        if (w.length) found = { line: k + 1, words: w };
      });
      if (found) depends.push(id + ': L' + found.line + ' says something about ' + namedAs + ' that no verified claim about it states and this unverified claim does (' + found.words.join(', ') + ')');
    }
    const figure = statsIn(text).find((tok) => !ownStats.has(tok) && !statOwners[tok] && planFigures.includes(tok));
    if (figure) depends.push(id + ': the plan states ' + figure + ', a figure only this claim gives');
    const said = longWords(name ? text.replace(name, ' ') : text);
    const echo = said.length >= 5 ? planSentences.find((s) => { const there = new Set(longWords(s)); return said.filter((w) => there.has(w)).length / said.length >= 0.6; }) : null;
    if (echo) depends.push(id + ': a sentence of the plan says most of what this claim says ("' + echo.trim().slice(0, 100) + '")');
    if (!name && said.length < 5) depends.push(id + ': too little of this claim is known to rule out its use');
  });
  const what = 'The verifier output could not be read for ' + verificationIncomplete + ' page or claim check' + (verificationIncomplete === 1 ? '' : 's') + ' (' + verificationProblems.slice(0, 4).map((v) => v.source_id + ': ' + v.problem).join('; ') + ')' + (affected.length ? ', covering claim' + (affected.length === 1 ? ' ' : 's ') + affected.join(', ') : '') + '. Those claims were kept out of the ledger.';
  if (depends.length) add('BLOCKING', 'SOURCE VERIFICATION INCOMPLETE', what + ' The plan depends on these checks, or may: ' + depends.join('; ') + '. This is a required check that did not complete, not a defect that was found; the plan is held until verification is rerun.');
  else add('MAJOR', 'SOURCE VERIFICATION INCOMPLETE FOR UNUSED CLAIMS', what + ' Nothing in the plan rests on them: the plan does not cite ' + pagesHit.join(', ') + ' for anything unverified' + ([...new Set(names)].length ? ', does not name ' + [...new Set(names)].join(' or ') : '') + ', states no figure from these claims, and has no sentence that says what they say. The claims stay excluded and the plan is not held for this. It is a research warning: the plan was written without them, so rerun verification if that part of the research matters.');
}
const unverifiedEntities = entities.filter((e) => e.verified_claims === 0);
const exclusionSeen = new Set();
let exRowEntity = null;
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t) { exRowEntity = null; return; }
  const isRow = /^\|.*\|$/.test(t);
  if (!isRow) exRowEntity = null;
  if (t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t)) return;
  if (isRow) {
    const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length === 2 && cells[1] === '' && cells[0]) { exRowEntity = entities.find((e) => spaced(cells[0]).includes(' ' + e.name_words + ' ')) || null; if (exRowEntity && exRowEntity.verified_claims === 0 && !exclusionSeen.has(L + '|' + exRowEntity.name)) { exclusionSeen.add(L + '|' + exRowEntity.name); add('MAJOR', 'UNVERIFIED COMPANY DESCRIBED', 'The plan profiles ' + exRowEntity.name + ', but no claim about it could be verified on a source page. Remove the profile or say plainly that nothing about it was verified.', short(t), L); } return; }
  }
  segmentsOf(t).forEach((seg) => {
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    const sp = spaced(seg);
    const segToks = statsIn(seg);
    excludedClaims.forEach((x) => {
      const candidates = x.candidate_source_ids || [];
      // Figures that only the excluded claim gives for its source. A figure that a verified ledger entry also gives for that source is fine.
      const only = statsIn(x.claim).filter((tok) => !(statOwners[tok] && candidates.some((id) => statOwners[tok].has(id))));
      if (!only.length || !only.every((tok) => segToks.includes(tok))) return;
      const aboutIt = !!x.entity_words && (sp.includes(' ' + x.entity_words + ' ') || (exRowEntity && exRowEntity.name_words === x.entity_words));
      const citesIt = cited.some((id) => candidates.includes(id));
      const foreignStat = only.some((tok) => !ownStats.has(tok));
      if (!aboutIt && !citesIt && !foreignStat) return;
      const key = L + '|' + x.claim_id;
      if (exclusionSeen.has(key)) return;
      exclusionSeen.add(key);
      add('BLOCKING', 'EXCLUDED CLAIM USED AS EVIDENCE', 'This text gives ' + only.join(' and ') + (aboutIt ? ' for ' + x.entity : '') + (cited.length ? ', citing ' + cited.join(', ') : '') + '. That is research claim ' + x.claim_id + ', which was excluded from the evidence (' + x.status.replace('_', ' ') + '): ' + String(x.reason || '').slice(0, 260) + '. Remove the statement, or keep the figure only as a clearly labeled planning assumption with no source and no company attached.', short(seg), L);
    });
    // A company with no verified claim at all: any cited statement about it rests on excluded material.
    unverifiedEntities.forEach((e) => {
      const aboutIt = sp.includes(' ' + e.name_words + ' ') || exRowEntity === e;
      if (!aboutIt) return;
      const key = L + '|' + e.name;
      if (exclusionSeen.has(key)) return;
      exclusionSeen.add(key);
      if (cited.length) add('BLOCKING', 'EXCLUDED CLAIM USED AS EVIDENCE', 'This text describes ' + e.name + ' and cites ' + cited.join(', ') + ', but no claim about ' + e.name + ' could be verified on a source page. Every research claim about it was excluded.', short(seg), L);
      // A sentence that only says the company could not be verified is the plain statement this check asks for.
      else if (!(/\b(?:could not|cannot|can not|was not|were not|not) (?:be )?(?:independently )?verified\b|\bnot used as evidence\b|\bno verified (?:evidence|claims?|information)\b|\bnothing (?:about (?:it|them) )?(?:was|could be) verified\b/i.test(seg) && !/\b(?:offers?|provides?|charges?|serves?|sells?|speciali[sz]\w+|focus\w*|prices?)\b/i.test(seg))) add('MAJOR', 'UNVERIFIED COMPANY DESCRIBED', 'This text describes ' + e.name + ', but no claim about it could be verified on a source page. Remove it or say plainly that nothing about it was verified.', short(seg), L);
    });
  });
});

// ---------- VERIFIED CLAIMS, NOT VERIFIED SOURCES ----------
// A source ID may be cited only for what a ledger entry on that source states. A page that was fetched, or that has
// some other verified claim, does not make a new statement about it sourced. Search listings are sources only
// through a verified ledger entry, the same as any other page.
const ledgerBySource = {};
evClaims.forEach((c) => (c.source_ids || []).forEach((id) => { (ledgerBySource[id] = ledgerBySource[id] || []).push(c); }));
const wordStem = (w) => w.replace(/(?:ing|ed|es|s)$/, '');
const COMMON_WORDS = new Set('that this with from have been were they their them there which what when where will would could should about into than then also such some more most only other over under each every your yours ours note source sources entry page listed shown dated undated according says said state states stated offer offers offering offered service services include includes including provide provides company companies competitor competitors customer customers business plan planning help helps people person'.split(' '));
const contentWords = (v) => [...new Set(String(v || '').toLowerCase().replace(/\[[sw]\d+\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4 && !COMMON_WORDS.has(w)).map(wordStem))];
const cellsAndSentences = (t) => (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?;])\s+/)).map((x) => x.trim()).filter(Boolean);
// Demand wording. Competitors existing shows competing offers, not buyers, sales, or willingness to pay.
const DEMAND_FLAT = /\b(?:has|have|with) (?:real |paying |active |existing )?buyers\b|\bbuyers exist\b|\bpaying customers exist\b|\bcustomers (?:are|will be) (?:willing to pay|paying)\b|\bpeople (?:are paying|will pay)\b|\baudience willing\b|\b(?:real |paying )?customer base exists\b|\b(?:proven|validated|confirmed|established|sustained|demonstrated) (?:customer |market )?demand\b|\bdemand (?:exists|is real|is proven|is confirmed|is established|has been (?:confirmed|proven|validated|established))\b|\bmarket (?:is|has been) validated\b/i;
const DEMAND_VERB = /\b(?:confirm(?:s|ed|ing)?|prov(?:es|en|ed|ing)|demonstrat(?:es|ed|ing)|establish(?:es|ed|ing)|validat(?:es|ed|ing)|show(?:s|ed|n|ing)?)\b/i;
const DEMAND_NOUN = /\b(?:demand|willingness to pay|buyers|paying customers)\b/i;
const DEMAND_HEDGE = /\b(?:no|not|none|never|without|neither|nor|cannot|unvalidated|untested|unproven|unknown|unconfirmed|hypothes[ie]s|assum\w*|whether|if|until|before|once|test(?:s|ed|ing)?|validate|to be (?:confirmed|validated|tested)|requires? validation|remains?|question|would|could|might|may)\b/i;
const paysEvidence = (id) => (ledgerBySource[id] || []).some((c) => /^M3\b/.test(c.question || ''));
// ---------- COMMERCIAL CLAIMS: PRICE, PAYMENT, MARKET, AND WHO A SOURCE SPEAKS FOR ----------
// Evidence that a price or a payment exists on a page: a verified ledger entry on that source that states an amount of money.
const MONEY_IN = /(?:US\$|\$|€|£)\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP)\b/;
const priceEvidence = (id) => (ledgerBySource[id] || []).some((c) => MONEY_IN.test(String(c.claim || '') + ' ' + String(c.page_excerpt || '')));
const ledgerHasPrice = evClaims.some((c) => MONEY_IN.test(String(c.claim || '') + ' ' + String(c.page_excerpt || '')));
// A price said to rest on sources: "informed by", "based on", "benchmarked against", and the like.
const PRICE_BASIS = /(?:\$\s?\d[\d,]*|\bprice(?:s|d)?\b|\bpricing\b|\bfees?\b)[^.]{0,200}?\b(?:informed by|based on|benchmark(?:ed)?(?: against)?|reference point|derived from|drawn from|supported by|consistent with|in line with|anchored (?:to|on|in)|reflect(?:s|ing))\b|\b(?:informed by|based on|benchmark(?:ed)?(?: against)?|derived from|drawn from|supported by|anchored (?:to|on|in))\b[^.]{0,200}?(?:\$\s?\d[\d,]*|\bprice(?:s|d)?\b|\bpricing\b)/i;
const PRICE_VALIDATED = /\b(?:market[- ]validated|validated by (?:the )?market|market[- ]tested|proven price|price (?:point )?(?:is|has been) (?:validated|proven|confirmed|established)|(?:in line|consistent|competitive) with (?:what )?(?:the )?(?:market|competitors?)|(?:the )?(?:market|going) rate|competitively priced|what the market (?:pays|will bear|accepts))\b/i;
const PRICE_EQUIVALENT = /\b(?:equivalent|the same (?:kind|type|service|offer|session)|like[- ]for[- ]like|directly comparable|identical|same as (?:this|our|your))\b/i;
// A comparison with other services' prices that gives no number still claims pricing evidence.
const PRICE_REFERENCE = /\b(?:reference points?|benchmarks?|ballpark|general range|typical range|usual range|price range|pricing range|going rate|market rate|industry (?:standard|norm|average)|typical(?:ly)? (?:charge|cost|price|fee)s?|(?:usually|commonly|generally) (?:charge|cost|priced)|in line with (?:comparable|similar|other|adjacent))\b/i;
const PRICE_COMPARATOR = /\b(?:comparable|similar|adjacent|competing|other|equivalent|typical|competitors?|providers?|market|industry|categor(?:y|ies)|services)\b/i;
const PRICE_DENIED = /\b(?:no|not|none|never|without|neither|nor|cannot)\b/i;
const PRICE_CONTEXT = /\$\s?\d|\bprice[ds]?\b|\bpricing\b|\bfees?\b|\bcharg(?:e|es|ed|ing)\b/i;
const PRICE_UNTESTED = /\b(?:untested|unvalidated|not (?:yet )?(?:been )?(?:tested|validated))\b/i;
// WHAT A VERIFIED PRICE ESTABLISHES. A ledger entry states one page's words about a price. It does not establish that
// the market, a category, established firms, or customers pay that price, that there is room for this offer, or what
// this offer should cost. It establishes that the page charges that price itself only when the page says so.
const isPriceClaim = (c) => MONEY_IN.test(String(c.claim || '') + ' ' + String(c.page_excerpt || '')) && /\b(?:price[ds]?|pricing|costs?|fees?|charg\w*|packages?|rates?|subscriptions?|rang(?:e|es|ed|ing) from|per (?:session|hour|month|call|transferee|person|client))\b/i.test(String(c.claim || '')) && !/\b(?:earn\w*|incomes?|salar(?:y|ies)|making more than|net worth)\b/i.test(String(c.claim || ''));
const ledgerPriceEntries = evClaims.filter(isPriceClaim);
const ledgerPriceAmounts = new Set(ledgerPriceEntries.flatMap((c) => (String(c.claim || '') + ' ' + String(c.page_excerpt || '')).match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []).map((m) => m.replace(/[\s,$]/g, '').replace(/\.00$/, '')));
const PRICE_TOPIC = /\b(?:adjacent|comparable|competitor|competing|market|category|vendor|provider)\b[^.;]{0,40}\bpric(?:e|es|ing)\b|\bpric(?:e|ing) (?:data|evidence|points?)\b|\bpricing data\b|\breference point\b/i;
const PRICE_INFER = /\b(?:suggest|indicat|show|support|confirm|demonstrat|prov|establish|validat|impl|signal|reflect)\w*\b[^.;]{0,160}?\b(?:categor(?:y|ies)|market|industry|sector|segment|customers?|buyers?|clients?|people|willingness|room|price points?|pricing power|headroom|demand|premium)\b/i;
const PRICE_WHO = /\b(?:established|leading|major|reputable|top|well-known|experienced) (?:firms?|providers?|compan(?:y|ies)|competitors?|players?|consultanc(?:y|ies)|consultants?)\b/i;
const PRICE_OWN = /\b(?:its|their) own\b[^.;]{0,60}\b(?:packages?|prices?|pricing|fees?|rates?)\b|\b(?:provider|vendor|firm|company|consultant|competitor)(?:'s|’s) (?:own |stated |published |listed )*(?:pricing|prices?|packages?|rates?|fees?)\b|(?:'s|’s|s'|s’) own (?:pricing|prices?|packages?|rates?|fees?)\b/i;
// WHOSE PRICE IT IS. A verified price is a named company's own price when the ledger entry says so: the entry is
// about that company, its claim opens with that company and states what it charges for an offer of its own, and
// the claim was verified on the page it cites. The page may be the company's own site or someone else's: a directory
// or a review page can state "X charges $Y for Z" as plainly as X's own site can. What does not establish a company's
// own price, wherever the page is hosted: a "typical" or market range, what partners, competitors or other providers
// charge, and a price in an entry that is about no company or about a different one.
const NOT_ITS_OWN = /\btypical(?:ly)?\b|\busual(?:ly)?\b|\bgeneral(?:ly)?\b|\baverages?\b|\bindustry\b|\bmarket\b|\bpartners?\b|\bthird[- ]part(?:y|ies)\b|\bother (?:providers?|compan(?:y|ies)|firms?|consultants?|planners?)\b|\bcompetitors?\b/i;
const STATES_ITS_PRICE = /\b(?:charg(?:es|ed|ing)|priced? at|prices? (?:its|their|the)|costs?|sells?|lists?|offers?)\b/i;
const ownerOfPrice = (c) => {
  if (!isPriceClaim(c) || !c.entity) return null;
  const e = entities.find((x) => x.name === c.entity);
  if (!e || !spaced(c.claim).startsWith(' ' + e.name_words + ' ')) return null;
  if (!STATES_ITS_PRICE.test(String(c.claim || ''))) return null;
  return NOT_ITS_OWN.test(String(c.claim || '') + ' ' + String(c.page_excerpt || '')) ? null : e;
};
// "Paid" needs evidence of charging. A page that describes a service does not show that the service is charged for.
const PAID_CLAIM = /\bpaid (?:relocation|lifestyle|consulting|coaching|guidance|planning|services?|help|support|sessions?|offers?|offerings?|programs?|advice|providers?)\b|\bcharg(?:e|es|ing) (?:for|clients|customers|a fee|fees)\b|\b(?:customers|clients|people|buyers) (?:pay|are paying|have paid|paid) for\b/i;
const ABOUT_OTHERS = /\b(?:competitors?|providers?|compan(?:y|ies)|firms?|players?|rivals?|incumbents?|market|category|industry|sector|space|research)\b/i;
// "A market exists" is a demand claim. Offers being available is not demand being shown.
const MARKET_CLAIM = /\b(?:a |the )?market (?:for [^.,;]{0,120}? )?(?:exists|is real|is established|is proven|has been (?:established|proven|confirmed))\b|\bconfirm\w* (?:that )?(?:there is )?(?:a |the )?market\b|\bmarket (?:demand|need) (?:exists|is (?:real|proven|established|confirmed))\b/i;
// One company's page cannot carry a claim about competitors in general.
const MANY = /\b(?:competitors|providers|companies|firms|players|rivals|incumbents)\b/i;
const EXEMPLAR = /\b(?:such as|including|for example|for instance|e\.g\.|like|one of|among)\b/i;
// Source-date notes. They are checked as date statements (right source, right date, right age), not as commercial claims.
const MONTH3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_TEXT = '(?:(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?(?:19|20)\\d{2}|(?:19|20)\\d{2}-\\d{2}-\\d{2})';
const DATED_NOTE = new RegExp('\\b(?:last\\s+)?(?:updated|published|dated)\\b\\s+(?:in\\s+|on\\s+|as\\s+of\\s+)?' + DATE_TEXT, 'i');
const UNDATED_NOTE = /\bundated\b|\b(?:no|without a) (?:publication )?date\b/i;
const statedDates = (s) => { const out = []; let m; const a = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?((?:19|20)\d{2})\b/gi; while ((m = a.exec(s)) !== null) out.push({ y: +m[4], mo: MONTH3.indexOf(m[2].toLowerCase()) }); const b = /\b((?:19|20)\d{2})-(\d{2})-\d{2}\b/g; while ((m = b.exec(s)) !== null) out.push({ y: +m[1], mo: +m[2] - 1 }); return out; };
// The date-note wording is removed before a sentence is compared with the verified claims, so a note about a source's
// age is not mistaken for an unsupported claim. Whatever else the sentence says is still compared.
const stripDateNotes = (s) => String(s)
  .replace(/\((?:sources?|note)\b[^)]*\)/gi, ' ')
  .replace(new RegExp('\\b(?:was|is|were|are)?\\s*(?:last\\s+)?(?:updated|published|dated)\\b\\s+(?:in\\s+|on\\s+|as\\s+of\\s+)?' + DATE_TEXT, 'gi'), ' ')
  .replace(/,?\s*\b(?:which is\s+)?(?:more|less) than \d+ months (?:before|old|ago)[^.;]*/gi, ' ')
  .replace(/\b(?:all\s+)?(?:competitor\s+)?sources?(?:\s+cited\s+(?:below|above|here))?\s+(?:are|is)\s+undated\b/gi, ' ')
  .replace(/\bsources?\s+undated\b|\bundated\b/gi, ' ')
  .replace(/\bverify currency[^.;]*/gi, ' ')
  .replace(/\bservice details may have changed\b/gi, ' ')
  .replace(/^\s*note:\s*/i, ' ');
const claimSeen = new Set();
// The company a profile-table row belongs to. | **Company** | | opens the block; every row under it is about that company.
const profileOwner = {};
{ let cur = null; lines.forEach((line, i) => { const t = line.trim(); if (!/^\|.*\|$/.test(t)) { cur = null; return; } if (/^\|?\s*:?-{2,}/.test(t)) return; const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); if (cells.length === 2 && cells[1] === '' && cells[0]) { cur = entities.find((e) => spaced(cells[0]).includes(' ' + e.name_words + ' ')) || null; return; } if (cur) profileOwner[i + 1] = cur.name; }); }
// In a company's own row, "companies" are usually its customers ("global companies and their employees"). The row
// still makes a general claim when it speaks of competitors or providers, or of most, all, or other companies.
const GENERAL_MANY = /\b(?:competitors|providers|rivals|incumbents|players)\b|\b(?:most|all|other|many|several|few|these|such|every|competing|rival|similar)\s+(?:[a-z-]+\s+){0,2}(?:companies|firms)\b/i;
// Payment needs its own evidence: a price, a fee, a charge, an invoice, or a purchase step in the verified passage.
// A numeric price is not required. "Clear pricing" is not evidence that anything is charged.
const chargeIn = (v) => /(?:US\$|\$|€|£)\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|dollars|euros|pounds)\b|\bfees?\b|\bcharg(?:e|es|ed|ing)\b|\bpriced? (?:at|from)\b|\bprices? (?:start|from|range)\b|\bstart(?:s|ing)? (?:at|from) \S*\d|\bbuy now\b|\badd to cart\b|\bcheckout\b|\border now\b|\bsubscriptions?\b|\binvoic\w+\b|\bbilled\b|\bpaid (?:plan|tier|membership|consultation|session)s?\b/i.test(String(v || '').replace(/\b(?:clear|transparent|simple|fair|honest|upfront|competitive|flexible|affordable|straightforward) pricing\b/gi, ' ').replace(/\b(?:no|without|zero|free of) (?:fees?|charges?|costs?)\b/gi, ' '));
const paymentEvidence = (id) => priceEvidence(id) || (ledgerBySource[id] || []).some((c) => !c.payment_not_established && chargeIn(c.page_excerpt));
// A payment statement with no source ID is about other providers when it says so, or stands in a row about them.
const OTHERS_CONTEXT = /\b(?:alternatives?|substitutes?|competitive|competing|competition|existing (?:services|options|offers|providers)|other (?:services|options|offers))\b/i;
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t)) return;
  cellsAndSentences(t).forEach((seg) => {
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    // 1. A cited source with no verified claim at all.
    cited.filter((id) => !ledgerBySource[id]).forEach((id) => {
      if (claimSeen.has(L + '|' + id)) return;
      claimSeen.add(L + '|' + id);
      add('BLOCKING', 'SOURCE CITED WITHOUT A VERIFIED CLAIM', id + ' (' + srcById[id].domain + (srcById[id].kind === 'search_snippet' ? ', a page found by web search' : '') + ') is cited here, but the evidence ledger has no verified claim from that page. A source ID may be cited only for a claim that was verified on its page. Remove the citation and any fact that rests on it.', short(seg), L);
    });
    // 2. Heuristic, a warning: the sentence shares almost no content with the claims verified on the pages it cites.
    const backed = cited.filter((id) => ledgerBySource[id]);
    if (backed.length) {
      const evidence = new Set(backed.flatMap((id) => ledgerBySource[id].flatMap((c) => contentWords(c.claim + ' ' + (c.page_excerpt || '') + ' ' + (c.entity || '')))));
      // Date-note wording is checked separately (check 5) and is left out of this comparison; the rest of the sentence is not.
      const said = contentWords(stripDateNotes(seg));
      const missing = said.filter((w) => !evidence.has(w));
      if (said.length >= 8 && (said.length - missing.length) / said.length < 0.25 && !claimSeen.has(L + '|beyond|' + backed.join())) {
        claimSeen.add(L + '|beyond|' + backed.join());
        add('MAJOR', 'CITED STATEMENT GOES BEYOND THE VERIFIED CLAIM', 'This text cites ' + backed.join(', ') + ', but little of what it says is in the claims verified on ' + (backed.length === 1 ? 'that page' : 'those pages') + ' (' + backed.flatMap((id) => ledgerBySource[id].map((c) => c.claim_id)).join(', ') + '). A verified source is not a verified claim: keep the source ID only on what the ledger entry states, and word any conclusion as IdeaToPlan\'s inference with no source ID.', short(seg), L);
      }
    }
    // 3. Demand stated as confirmed with no evidence that customers pay.
    if (!cited.some(paysEvidence)) seg.split(/,\s*(?:but|though|although|however|yet|while)\b|\s+but\s+|;/i).forEach((clause) => {
      if (!(DEMAND_FLAT.test(clause) || (DEMAND_VERB.test(clause) && DEMAND_NOUN.test(clause))) || DEMAND_HEDGE.test(clause) || claimSeen.has(L + '|demand')) return;
      claimSeen.add(L + '|demand');
      add('BLOCKING', 'DEMAND STATED AS CONFIRMED', 'This text states that buyers, demand, or willingness to pay exist, and no cited ledger entry reports customers paying, spending, or survey evidence. Competitors existing shows that competing offers exist; it does not show buyers, sales, or willingness to pay. Reword it as a hypothesis that requires validation.', short(clause), L);
    });
    // 5. A source-date note must name the right source, the right date, and the right age.
    if (cited.length && (DATED_NOTE.test(seg) || UNDATED_NOTE.test(seg))) {
      const wrong = [];
      const stated = DATED_NOTE.test(seg) ? statedDates(seg) : [];
      cited.forEach((id) => {
        const src = srcById[id];
        const iso = String(src.published_iso || '');
        if (!stated.length) { if (!/date not shown/i.test(String(src.published || ''))) wrong.push(id + ' is called undated, but its page shows "' + src.published + '"'); return; }
        if (!iso) { if (cited.length === 1) wrong.push('the text gives ' + id + ' a date, but no date was verified on its page'); return; }
        const y = +iso.slice(0, 4), mo = +iso.slice(5, 7) - 1;
        if (!stated.some((d) => d.y === y && (d.mo < 0 || d.mo === mo))) wrong.push('the text dates ' + id + ' differently from its page, which shows "' + src.published + '"');
        const age = seg.match(/\b(more|less) than (\d+) months\b/i);
        if (age) { const months = (runDate.ms - Date.parse(iso + 'T00:00:00Z')) / (30.4375 * 86400000); const n = +age[2]; if ((/more/i.test(age[1]) && !(months > n)) || (/less/i.test(age[1]) && !(months < n))) wrong.push('the text says ' + id + ' is ' + age[0].toLowerCase() + ' before the plan date, but its page date ' + iso + ' is ' + Math.round(months) + ' months before the run date ' + runDate.iso); }
      });
      if (wrong.length && !claimSeen.has(L + '|datenote')) { claimSeen.add(L + '|datenote'); add('BLOCKING', 'SOURCE DATE NOTE IS WRONG', 'A note about a source date does not match the record: ' + wrong.join('; ') + '. Correct the note or remove it.', short(seg), L); }
    }
    seg.split(/,\s*(?:but|though|although|however|yet|while)\b|\s+but\s+|;/i).forEach((clause) => {
      const hedged = DEMAND_HEDGE.test(clause);
      const cl = [...new Set(clause.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
      const citedHere = cl.length ? cl : cited;
      // 6. A price said to rest on sources that state no price.
      if (PRICE_BASIS.test(clause) && citedHere.length) {
        const hollow = citedHere.filter((id) => !priceEvidence(id));
        if (hollow.length && !claimSeen.has(L + '|pricebasis')) { claimSeen.add(L + '|pricebasis'); add('BLOCKING', 'PRICE CITED TO SOURCES WITHOUT PRICES', 'This text ties a price to ' + hollow.join(', ') + ', but no verified claim from ' + (hollow.length === 1 ? 'that page' : 'those pages') + ' states a price. A page with no price cannot support an amount. Keep the price as a clearly labeled planning assumption with no source ID, and cite those pages only for the service descriptions they support.', short(clause), L); }
      }
      // 7. A price presented as validated by the market.
      if (PRICE_VALIDATED.test(clause) && !hedged && /\$\s?\d|\bprice|\bpricing|\bpriced\b/i.test(clause) && !claimSeen.has(L + '|pricevalid')) { claimSeen.add(L + '|pricevalid'); add('BLOCKING', 'PRICE STATED AS MARKET-VALIDATED', 'This text presents a price as validated by the market or in line with competitors. Nothing in the evidence validates this offer\'s price. State it as a planning assumption that has not been tested.', short(clause), L); }
      // 7b. A comparison with other services' prices, with no number: "a reference point for the general range".
      //     It implies pricing evidence. It is acceptable only on a verified price cited in the same clause.
      if (PRICE_REFERENCE.test(clause) && PRICE_COMPARATOR.test(clause) && !PRICE_DENIED.test(clause) && PRICE_CONTEXT.test(t) && !citedHere.some(priceEvidence) && !claimSeen.has(L + '|priceref')) { claimSeen.add(L + '|priceref'); add('BLOCKING', 'PRICE COMPARISON WITHOUT A VERIFIED PRICE', 'This text compares the price with what other services charge (a reference point, a range, a benchmark, or a going rate) and cites no verified price. ' + (ledgerHasPrice ? 'Cite the ledger entry that states the price, with its amount and what it buys, or remove the comparison.' : 'The evidence ledger holds no verified price at all, so there is nothing to compare with. Remove the comparison and say that the price is an untested planning assumption.'), short(clause), L); }
      // 7c. A verified price stretched beyond what its page establishes. Applies wherever the sentence rests on a
      //     ledger price: by citing it, by repeating its amounts, or by referring to "the pricing data".
      let priceSources = citedHere.filter((id) => (ledgerBySource[id] || []).some(isPriceClaim));
      // "This is that company's own price" often sits in a clause after the citation. It is judged against the price
      // sources cited on the line.
      if (!priceSources.length && PRICE_OWN.test(clause)) priceSources = [...new Set(t.match(/\b[SW]\d+\b/g) || [])].filter((id) => (ledgerBySource[id] || []).some(isPriceClaim));
      const onPrice = priceSources.length > 0 || PRICE_TOPIC.test(clause) || (ledgerPriceAmounts.size > 0 && (clause.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []).filter((m) => ledgerPriceAmounts.has(m.replace(/[\s,$]/g, '').replace(/\.00$/, ''))).length >= 2);
      // "Its own price" said of a dollar amount on a line whose cited pages have no verified price claim at all.
      const ownWithNoPrice = PRICE_OWN.test(clause) && !priceSources.length && /\$\s?\d/.test(t) && (t.match(/\b[SW]\d+\b/g) || []).some((id) => srcById[id]);
      if (((onPrice && ledgerPriceEntries.length) || ownWithNoPrice) && !claimSeen.has(L + '|pricestretch')) {
        const backingEntries = priceSources.length ? priceSources.flatMap((id) => ledgerBySource[id].filter(isPriceClaim)) : ledgerPriceEntries;
        const backing = backingEntries.map((c) => String(c.claim || '') + ' ' + String(c.page_excerpt || '')).join(' ');
        // The line may say "its own price" about a company whose own price the ledger does establish.
        const amountsIn = (v) => (String(v || '').match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []).map((m) => m.replace(/[\s,$]/g, '').replace(/\.00$/, ''));
        const lineAmounts = amountsIn(t);
        const ownEstablished = backingEntries.some((c) => { const e = ownerOfPrice(c); return !!e && amountsIn(String(c.claim || '') + ' ' + String(c.page_excerpt || '')).some((a) => lineAmounts.includes(a)) && (spaced(t).includes(' ' + e.name_words + ' ') || aliasesOf(e).some((s) => t.includes(s))); });
        const why = [];
        if (PRICE_INFER.test(clause) && !PRICE_DENIED.test(clause)) why.push('it draws a conclusion about the market, the category, customers, or the room for this offer');
        const who = clause.match(PRICE_WHO);
        if (who && !backing.toLowerCase().includes(who[0].toLowerCase().split(' ')[0])) why.push('it says the price is charged by "' + who[0] + '", which the verified claim does not state');
        if (PRICE_OWN.test(clause) && !ownEstablished) why.push('it presents the figure as that provider\'s own pricing or packages, and the ledger does not establish that: no verified entry states what that company itself charges for an offer of its own');
        if (why.length) { claimSeen.add(L + '|pricestretch'); add('BLOCKING', 'PRICE EVIDENCE STRETCHED BEYOND ITS SOURCE', 'This text rests on a verified price (' + (ledgerPriceEntries.map((c) => c.claim_id + ' on ' + (c.source_ids || []).join(', ')).join('; ') || 'none is in the ledger for the pages cited here') + ') and goes beyond it: ' + why.join('; ') + '. The entry establishes only what that one page states. Say what the page states, with its source ID and whose page it is as the ledger gives it, and stop there. It is not evidence of market prices, of who charges them, of willingness to pay, or of a price for this offer.', short(clause), L); }
      }
      // 7d. A scenario or forecast result presented as validating the price. The result is arithmetic on the assumed price.
      if (/\b(?:forecast|scenarios?|model|projections?|projected|net cash|operating profit|results?|figures|numbers|margins?)\b[^.;]{0,140}?\b(?:validat|confirm|prov|justif|vindicat)\w*\b[^.;]{0,80}?\b(?:price|pricing)\b|\bprice\b[^.;]{0,80}?\b(?:is|was|has been) (?:validated|confirmed|justified|proven|supported) by (?:the )?(?:forecast|scenarios?|model|projections?|results?|figures|numbers)\b/i.test(clause) && !PRICE_DENIED.test(clause) && !claimSeen.has(L + '|priceresult')) { claimSeen.add(L + '|priceresult'); add('BLOCKING', 'SCENARIO RESULT PRESENTED AS VALIDATING THE PRICE', 'This text says a forecast, scenario, or model result validates or supports the price. Those results are calculated from the price, so they cannot show that customers will pay it. State the price as ' + ((fin.price_record || {}).founder_supplied ? 'the founder\'s price' : 'an untested scenario assumption') + ' and the result as conditional on it.', short(clause), L); }
      // 8. A competitor's price treated as the price of an equivalent offer.
      if (PRICE_EQUIVALENT.test(clause) && !hedged && citedHere.some(priceEvidence) && /\$\s?\d/.test(clause) && !claimSeen.has(L + '|priceequiv')) { claimSeen.add(L + '|priceequiv'); add('BLOCKING', 'COMPETITOR PRICE TREATED AS EQUIVALENT', 'This text treats a competitor\'s price as the price of an equivalent offer. A cited price is the price of that competitor\'s own offer, with its own length and scope. Say what it buys and call it an adjacent reference point, not an equivalent.', short(clause), L); }
      // 8b. A price cited to a page must be a price that was verified on that page. The existing figure check lets an
      //     amount through when it can be derived from the plan's own model, so cited prices are checked here as well.
      if (citedHere.length && citedHere.every(priceEvidence)) {
        const verifiedAmounts = new Set(citedHere.flatMap((id) => ledgerBySource[id].flatMap((c) => (String(c.claim || '') + ' ' + String(c.page_excerpt || '')).match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || [])).map((m) => m.replace(/[\s,$]/g, '').replace(/\.00$/, '')));
        const strange = [...new Set((clause.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []).filter((m) => !verifiedAmounts.has(m.replace(/[\s,$]/g, '').replace(/\.00$/, '')) && !allowed.has(normMoney(m))))];
        if (strange.length && !claimSeen.has(L + '|citedprice')) { claimSeen.add(L + '|citedprice'); add('BLOCKING', 'CITED PRICE NOT IN THE VERIFIED CLAIM', 'This text gives ' + strange.join(' and ') + ' and cites ' + citedHere.join(', ') + ', but the prices verified on ' + (citedHere.length === 1 ? 'that page' : 'those pages') + ' are ' + ([...verifiedAmounts].map((v) => '$' + v).join(', ') || 'none') + '. Give the price exactly as the ledger entry states it.', short(clause), L); }
      }
      // 9. "Paid" stated about other providers with no evidence that anything is charged. A source ID is not needed
      //    for the statement to be a claim: "paid relocation services" in a list of the customer's alternatives is one.
      const firstCell = /^\|.*\|$/.test(t) ? t.replace(/^\|/, '').split('|')[0] : '';
      // "A substitute for a paid planning session" names this offer as the paid thing, not the other providers.
      const paidIsOwn = /\b(?:substitutes?|alternatives?|replacements?) (?:for|to) (?:a |an |the |your |this )?paid\b|\binstead of (?:a |an |the |your |this )?paid\b|\b(?:your|this) paid\b/i.test(clause);
      const aboutOthers = !paidIsOwn && (ABOUT_OTHERS.test(clause) || OTHERS_CONTEXT.test(clause) || OTHERS_CONTEXT.test(firstCell));
      // "A positioning could distinguish QYLAT from the logistics-focused paid services" is a hypothesis about the
      // positioning. It still says, as a fact, that those services are paid. A hedge covers what it is attached to: it
      // excuses "paid" only when the payment itself is what is in question ("whether they charge is not established").
      //  The adjective is read as a fact about other providers only when the phrase points at them ("the logistics-focused
      //  paid services", "these paid providers", "paid relocation services"), and not in a sentence that says what the
      //  evidence does not show ("does not confirm demand for paid planning services").
      const paidAsFact = /\b(?:the|these|those|their|existing|competing|other|[a-z]+-focused)\s+(?:[a-z-]+\s+){0,2}paid (?:relocation|lifestyle|consulting|coaching|guidance|planning|services?|help|support|sessions?|offers?|offerings?|programs?|advice|providers?)\b|\bpaid relocation (?:services?|providers?|support)\b/i.test(clause) && !/\b(?:does not|do not|did not|no research|not) (?:establish|confirm|show|found|find)\b|\bno research was found\b/i.test(clause);
      const paymentInQuestion = /\bwhether\b[^.;]{0,120}\b(?:paid|charg\w*|fees?)\b|\b(?:paid|charg\w*|fees?)\b[^.;]{0,80}\b(?:not (?:been )?established|unknown|not known)\b/i.test(clause);
      if (PAID_CLAIM.test(clause) && (paidAsFact ? !paymentInQuestion : !hedged) && (citedHere.length || aboutOthers)) {
        const lineIds = [...new Set(t.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
        const shown = citedHere.length ? citedHere.every(paymentEvidence) : lineIds.some(paymentEvidence);
        if (!shown && !claimSeen.has(L + '|paid')) { claimSeen.add(L + '|paid'); add('BLOCKING', 'PAYMENT STATED WITHOUT EVIDENCE', 'This text says the services are paid for or charged for' + (citedHere.length ? ', citing ' + citedHere.join(', ') + ', but no verified claim from ' + citedHere.filter((id) => !paymentEvidence(id)).join(', ') + ' shows a price, a fee, or a charge' : ', and cites nothing that shows a price, a fee, or a charge') + '. A page that describes a service does not show that it is paid for, and "Clear pricing" is not a price. Describe what the providers offer, without "paid", or cite a verified claim that shows the charge.', short(clause), L); }
      }
      // 10. "A market exists" stated as confirmed. Available offers are not demonstrated demand.
      if (MARKET_CLAIM.test(clause) && !hedged && !citedHere.some(paysEvidence) && !claimSeen.has(L + '|demand')) { claimSeen.add(L + '|demand'); add('BLOCKING', 'DEMAND STATED AS CONFIRMED', 'This text says a market exists or is confirmed. The evidence shows that offers are available; it does not show demand, buyers, or sales. Say that competing offers exist, and state demand as a hypothesis that requires validation.', short(clause), L); }
      // 11. One company's page cited for a statement about competitors in general.
      if (MANY.test(clause) && !EXEMPLAR.test(clause) && citedHere.length) {
        const owners = [...new Set(citedHere.map((id) => entityOfSource[id]).filter(Boolean).map((e) => e.name))];
        const named = entities.some((e) => spaced(clause).includes(' ' + e.name_words + ' '));
        const labelCell = /^\|.*\|$/.test(t) ? t.replace(/^\|/, '').split('|')[0] : '';
        const ownRow = owners.length === 1 && (profileOwner[L] === owners[0] || entities.some((e) => e.name === owners[0] && spaced(labelCell).includes(' ' + e.name_words + ' ')));
        if (owners.length === 1 && citedHere.every((id) => entityOfSource[id]) && !named && !(ownRow && !GENERAL_MANY.test(clause)) && !claimSeen.has(L + '|many')) { claimSeen.add(L + '|many'); add('BLOCKING', 'ONE SOURCE CITED FOR A CLAIM ABOUT MANY', 'This text makes a statement about competitors in general and cites only ' + citedHere.join(', ') + ', the page of ' + owners[0] + '. One company\'s page supports a statement about that company only. Name the company and say what its page states, or remove the general claim.', short(clause), L); }
      }
    });
    // 4. A source date that is on or before the run date is not anomalous, and the plan must not say it is.
    const lineCited = [...new Set(t.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (/\b(?:anomal\w+|future-dated|dated in the future|in the future)\b/i.test(seg) && /\b(?:date|dated|published|publication)\b/i.test(seg) && !lineCited.some((id) => srcById[id].future_date_shown) && !claimSeen.has(L + '|date')) {
      claimSeen.add(L + '|date');
      add('MAJOR', 'SOURCE DATE WRONGLY CALLED ANOMALOUS', 'This text calls a source date anomalous or future-dated. The run date is ' + runDate.iso + ', and no cited source shows a date after it. Remove the remark.', short(seg), L);
    }
  });
});

// THE RECORDED PRICE. Compute Financials decides the price once. The Executive Summary's Launch price row must carry it.
if (fin.price_record && typeof fin.price_record.amount === 'number') lines.forEach((l, i) => {
  if (!/^\|\s*Launch price\s*\|/i.test(l.trim())) return;
  const want = String(fin.price_record.amount);
  if (!(l.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []).some((m) => m.replace(/[\s,$]/g, '').replace(/\.00$/, '') === want)) add('BLOCKING', 'PRICE DIFFERS FROM THE RECORDED PRICE', 'The Launch price row does not give the price recorded for this submission, $' + want + ' per ' + fin.price_record.unit + ' (' + fin.price_record.label + '). The price is decided once and every section uses that value.', short(l), i + 1);
});
// With no verified price anywhere, a plan of either tier must say that its own price is an untested planning assumption.
// A Starter plan has no ledger, so it never has a verified price: the same rules apply to it.
if (!ledgerHasPrice && !lines.some((l) => cellsAndSentences(l.trim()).some((x) => /\bassum/i.test(x) && PRICE_UNTESTED.test(x) && /\bprice[ds]?\b|\bpricing\b|\$\s?\d[\d,]*(?:\.\d+)? per (?:session|sale|customer|client|unit|order)\b/i.test(x)))) add('BLOCKING', 'PRICE NOT STATED AS AN UNTESTED ASSUMPTION', 'No verified price exists in the evidence ledger, and no line of the plan says that its price is an untested planning assumption. State the price once as a planning assumption that has not been tested, with no source ID.');

// ---------- COMPETITIVE GAPS ----------
// A gap, an unmet need, or "no competitor does X" is a finding only when a verified claim cited on the sentence states
// it. Otherwise the sentence that makes the claim must itself say it is a hypothesis, or be conditional on a test.
// A label in another sentence of the paragraph does not cover it. "IdeaToPlan analysis" says who wrote the sentence;
// it is not evidence and it does not make a claim conditional. Reviewing a few pages cannot show that nobody serves a need.
const GAP_CLAIM = /\b(?:gap in the market|market gap|positioning gap|competitive gap|unmet (?:need|demand)|under-?served|untapped|white ?space|unaddressed|unoccupied|no (?:one|competitor|provider|company|service|other (?:competitor|provider|company|service)) (?:currently |yet |explicitly |directly )?(?:offers|serves|does|addresses|provides|focuses|positions|targets|covers)|no (?:pages?|sites?|sources?|providers?|competitors?|compan(?:y|ies)) (?:reviewed|examined|identified|found|listed)(?: (?:for|in) this plan)? (?:(?:currently|yet|explicitly|directly) )*(?:offers?|serves?|addresses|provides?|focus(?:es)?|positions?|targets?|covers?)|none of (?:the |these |those |its |their )?(?:[a-z-]+ ){0,3}?(?:competitors?|providers?|compan(?:y|ies)|pages?|alternatives|firms?|services|sources?|rivals?|players?|them)(?: (?:reviewed|identified|listed|found|examined)(?: (?:for|in) this plan)?)?,? (?:(?:currently|yet|explicitly|directly|appears? to|was identified that|were identified that) )*(?:offers?|serves?|addresses|provides?|focus(?:es)?|positions?|targets?|covers?)\b|(?:competitors|providers|companies) (?:do not|don't|fail to) (?:offer|serve|address|provide|cover|target)|(?:unique|distinct|clear|real|meaningful|key|strong|potential) (?:positioning )?(?:differentiator|advantage|distinction|opening|opportunity)|sets? (?:it|the business|this offer) apart)\b/i;
const GAP_CONDITIONAL = /\b(?:if|whether|could|may|might)\b/i;
// "None offers ..." with no "of the competitors" is a competitor claim only in a sentence that is about competitors.
// "None of these is modeled here" and "none covers the first sale" are statements about the model.
const GAP_BARE_NONE = /\bnone,? (?:(?:currently|yet|explicitly|directly|appears? to|was identified that|were identified that) )*(?:offers?|serves?|addresses|provides?|focus(?:es)?|positions?|targets?|covers?)\b/i;
const ABOUT_COMPETITORS = /\b(?:competitors?|providers?|compan(?:y|ies)|rivals?|alternatives|pages reviewed|sources reviewed|firms?)\b/i;
// A contrast says the same thing as a gap: "the competitors focus on execution rather than on the decision stage".
// The verified entries list services. None of them states what a company focuses on, or which stage it leaves out.
const GAP_CONTRAST = /\b(?:competitors?|providers?|compan(?:y|ies)|alternatives|firms?)\b[^.;]{0,140}?\b(?:focus(?:es|ed)?|position(?:s|ed)?|concentrat\w+|orient(?:ed)?|built|designed|geared|aimed)\b[^.;]{0,200}?\b(?:rather than|instead of|and not on|but not on|not on)\b/i;
const gapAt = (v) => { const a = v.search(GAP_CLAIM); if (a >= 0) return a; const c = v.search(GAP_CONTRAST); if (c >= 0) return c; return ABOUT_COMPETITORS.test(v) ? v.search(GAP_BARE_NONE) : -1; };
const GAP_LABEL = /\b(?:hypothes[ie]s|hypothesi[sz]ed|untested|unvalidated|not (?:an? )?established|does not (?:establish|show|confirm|mean)|requires? validation|worth testing|to be tested)\b/i;
// "Not a confirmed gap in the market" denies the gap. The denial has to stand directly in front of the gap words:
// "not only a gap in the market" and "a confirmed gap in the market" are still claims.
const GAP_DENIED = /\b(?:not|no|never|nor|without|rather than)\s+(?:(?:an?|any|the|yet|necessarily|evidence of|proof of|a sign of|to be read as|to be taken as)\s+)*(?:(?:confirmed|established|proven|verified|demonstrated|real|actual|known|genuine|documented)\s+)*$/i;
const gapSeen = new Set();
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || gapSeen.has(L)) return;
  // Whole sentences: a clause after a semicolon belongs to the sentence it is in.
  (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter(Boolean).forEach((seg) => {
    if (gapAt(seg) < 0 || gapSeen.has(L)) return;
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (cited.some((id) => (ledgerBySource[id] || []).some((c) => GAP_CLAIM.test(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))))) return;
    // A conditional counts only when it governs the claim, so it has to come before it in the sentence.
    if (GAP_LABEL.test(seg) || GAP_CONDITIONAL.test(seg.slice(0, gapAt(seg)).split(/;\s+|,\s+(?:and|but)\s+/).pop()) || GAP_DENIED.test(seg.slice(0, gapAt(seg)))) return;
    gapSeen.add(L);
    add('BLOCKING', 'COMPETITIVE GAP STATED AS A FINDING', 'This text states a competitive gap, an unmet need, or that no competitor does something, as a finding. No verified claim cited here states it, and this sentence does not say it is a hypothesis. A label in another sentence does not cover it, and "IdeaToPlan analysis" names the author without making the claim conditional. The pages reviewed show what those companies describe; they do not show that nobody serves this need. Reword this sentence as a hypothesis to test.', short(seg), L);
  });
});

// ---------- UNDATED SOURCES, SECTION BY SECTION ----------
// A source with no date on its page has to be called undated where it is used. One note covers the section it stands
// in: "All sources reviewed for this plan are undated" at the start of Section 4 covers every row of Section 4. It
// does not cover Section 3 or Section 6. A general note has to be true of the sources that section cites.
const isUndatedSource = (id) => { const x = srcById[id]; return !!x && /date not shown|^not provided/i.test(String(x.published || '')); };
const UNDATED_SAID = /\bundated\b|\bno publication date\b|\bshows? no (?:publication )?dates?\b|\bno dates? (?:is |are )?shown\b|\bdate (?:is |was )?not shown\b|\bwithout a (?:publication )?date\b|\bcarr(?:y|ies) no (?:publication )?date\b/i;
const NOTE_FOR_ALL = /\ball (?:of )?(?:the )?(?:[a-z-]+ ){0,3}?sources\b|\bevery source\b|\b(?:the )?sources (?:reviewed|cited|used)[^.;]{0,40}\bare undated\b|\bnone of the (?:sources|pages)\b[^.;]{0,30}\b(?:shows?|carr(?:y|ies)|gives?) a (?:publication )?date\b/i;
const sectionsOfPlan = [];
lines.forEach((l, i) => { const m = l.trim().match(/^## (\d+)\.\s*(.*)$/); if (m) sectionsOfPlan.push({ no: m[1], title: m[2], start: i, end: lines.length }); });
sectionsOfPlan.forEach((s, n) => { if (n + 1 < sectionsOfPlan.length) s.end = sectionsOfPlan[n + 1].start; });
const sectionAt = (lineNo) => sectionsOfPlan.find((s) => lineNo - 1 > s.start && lineNo - 1 < s.end) || null;
const dateNotesIn = (s) => { const out = []; for (let i = s.start + 1; i < s.end; i++) if (UNDATED_SAID.test(lines[i])) out.push({ line: i + 1, text: lines[i].trim() }); return out; };
sectionsOfPlan.forEach((s) => {
  const firstUse = {};
  for (let i = s.start + 1; i < s.end; i++) (lines[i].match(/\b[SW]\d+\b/g) || []).forEach((id) => { if (srcById[id] && !(id in firstUse)) firstUse[id] = i + 1; });
  const used = Object.keys(firstUse);
  const undated = used.filter(isUndatedSource);
  if (!undated.length) return;
  const notes = dateNotesIn(s);
  // "The competitor sources cited in this section (S1, S4, S10, S15) are undated" names its sources. It is a note about
  // those four, and it is not made wrong by a dated source elsewhere in the section. "All sources ... are undated" is general.
  const general = notes.filter((n) => NOTE_FOR_ALL.test(n.text) && (!/\b[SW]\d+\b/.test(n.text) || /\b(?:all|every|none of)\b/i.test(n.text)));
  // A note that says every source is undated is wrong when this section cites one whose page shows a date.
  const dated = used.filter((id) => !isUndatedSource(id));
  if (general.length && dated.length) add('BLOCKING', 'SOURCE DATE NOTE IS WRONG', 'Section ' + s.no + ' says its sources are undated, and it cites ' + dated.map((id) => id + ' (' + srcById[id].published + ')').join(', ') + ', whose page shows a date. Correct the note so that it names the undated sources only.', short(general[0].text), general[0].line);
  const covered = (id) => general.length > 0 || notes.some((n) => new RegExp('\\b' + id + '\\b').test(n.text));
  const missing = undated.filter((id) => !covered(id));
  if (!missing.length) return;
  const at = Math.min(...missing.map((id) => firstUse[id]));
  add('MAJOR', 'UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION', 'Section ' + s.no + ' (' + s.title + ') uses ' + missing.join(', ') + ' from L' + at + ' on. Their pages show no date, and nothing in this section says so' + (notes.length ? ' for these sources' : '') + '. A note in another section does not cover this one. Say at their first use here that these sources are undated and that the descriptions may have changed.', short(lines[at - 1]), at);
});

// ---------- DEMAND INFERRED FROM SUPPLY ----------
// Providers describing their services, and resources being available, establish supply. They do not establish that
// customers seek, want, need, or pay for such help. A sentence that draws customer behaviour or demand from supply
// is unsupported however it is hedged: "suggests", "indicates" and "is consistent with" add no evidence. It passes
// only when it denies the inference, labels it as a hypothesis, or cites a verified claim that reports customer
// behaviour (a survey finding, purchases, searches).
const SUPPLY = /\b(?:existence|presence|availability|number|range) of (?:[a-z-]+ ){0,5}?(?:providers?|competitors?|offers?|services?|resources?|tools?|alternatives|substitutes|compan(?:y|ies)|guides?|content|communit(?:y|ies))\b|\b(?:providers?|competitors?|competing offers|offers|services|resources|tools|alternatives|substitutes)\b[^.;]{0,40}?\b(?:exist|are available|are active|are operating|describ\w+)\b|\bthe (?:research|evidence|sources|pages reviewed|landscape)\b/i;
const INFERS = /\b(?:suggests?|indicat\w+|shows?|confirms?|demonstrat\w+|impl(?:y|ies)|means?|points? to|signals?|reflects?|(?:is|are) consistent with|supports?|tells? us|evidence that)\b/i;
const CUSTOMER_BEHAVIOUR = /\b(?:people|customers?|buyers?|clients?|consumers?|adults|individuals|they)\b[^.;]{0,50}?\b(?:do |actively |already |also )*(?:seek|seeks|seeking|want|wants|need|needs|look for|looks for|looking for|search for|searching for|pay|pays|paying|are willing|buy|buys|buying|use|uses|value|values)\b|\b(?:demand|interest|appetite|need) (?:exists|is real|is there|for (?:this|such|these))\b|\bunderlying (?:behavior|behaviour|need|demand)\b/i;
const DENIES_OR_LABELS = /\b(?:not|no|never|cannot|whether|unknown|unvalidated|untested|hypothes[ie]s|hypothesi[sz]ed|assum\w*)\b/i;
const BEHAVIOUR_EVIDENCE = /\b(?:survey\w*|respondents?|polled|study found|data shows?|search volume|searches|bookings|purchases|sales|customers? (?:paid|pay|spent|spend)|reported paying)\b/i;
const demandComputed = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  let seen = false;
  (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?])\s+/)).forEach((sentence) => {
    if (seen || !SUPPLY.test(sentence)) return;
    sentence.split(/,\s+(?:but|though|although|however|yet|while)\b|;/i).forEach((clause) => {
      if (seen || !INFERS.test(clause) || !CUSTOMER_BEHAVIOUR.test(clause) || DENIES_OR_LABELS.test(clause)) return;
      const cited = [...new Set(sentence.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
      if (cited.some((id) => (ledgerBySource[id] || []).some((c) => /^M3\b/.test(c.question || '') || BEHAVIOUR_EVIDENCE.test(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))))) return;
      seen = true;
      add('BLOCKING', 'DEMAND INFERRED FROM SUPPLY', 'This text draws customer behaviour or demand from the existence of providers, offers, or resources. Those establish supply: what is offered. They do not show that customers seek, want, or pay for it, and a hedge such as "suggests" or "is consistent with" does not supply the missing evidence. Say what the sources establish (which offers exist), and state customer behaviour as a hypothesis to test, or cite a verified claim that reports it.', short(clause), L);
    });
  });
});

// ---------- COMPETITORS RANKED ----------
// "The most comprehensive provider reviewed" ranks companies. The ledger holds what each page says about itself;
// it does not compare them.
const RANKED = /\b(?:most|least) (?:comprehensive|established|complete|credible|popular|advanced|experienced|trusted|expensive|affordable|capable|direct|relevant|extensive)\b[^.;]{0,50}?\b(?:providers?|competitors?|compan(?:y|ies)|firms?|options?|alternatives?|services?)\b|\bthe (?:best|largest|biggest|leading|top|cheapest|strongest|broadest|widest|closest)(?:[- ][a-z]+)? (?:providers?|competitors?|compan(?:y|ies)|firms?|options?|alternatives?)\b/i;
// A ranking or a superlative passes unsupported only when the sentence itself says it is not established. A stray
// "no" or "not" elsewhere in the sentence ("... and no other comes close") is not a label.
const RANK_LABEL = /\b(?:hypothes[ie]s|hypothesi[sz]ed?|untested|unvalidated|unverified|unknown|whether|not (?:yet )?(?:been )?(?:established|verified|confirmed|known|shown)|assum(?:e|es|ed|ption|ptions))\b/i;
// ---------- PROVIDER FOCUS AND STAGE ----------
// The ledger entries list services in each company's own words. None of them says which stage of a customer's
// decision a provider works at. "Services oriented toward logistics and execution after a relocation decision is
// made" assigns providers a post-decision focus that no entry states. It is a factual claim about competitors, and
// it is unsupported unless every source cited on the sentence states it, or the sentence says it is not established.
const FOCUS_SUBJECT = /\b(?:competitors?|providers?|compan(?:y|ies)|firms?|alternatives|pages reviewed|relocation services|services|offers|consultanc(?:y|ies)|agenc(?:y|ies))\b/i;
const FOCUS_VERB = /\b(?:focus\w*|orient\w*|position\w*|concentrat\w+|geared|aimed|designed|built|speciali[sz]\w+|cater\w*|target\w*|serv(?:e|es|ing)|begins?|starts?|work(?:s|ing)?|operat\w+|steps? in|comes? in)\b/i;
const STAGE_POST = /\bafter (?:a |an |the |that |their )?(?:[a-z-]+ ){0,2}?decision\b|\bonce (?:a |the |that )?(?:[a-z-]+ ){0,2}?decision (?:is|has been|was) made\b|\bpost-?decision\b|\bdecision (?:is|has been|was) (?:already )?made\b|\b(?:have|has|had) already (?:decided|committed)\b|\b(?:have|has|had) (?:already )?made (?:the|a|that|their|this) decision\b|\balready made (?:the|a|that|their|this) decision\b|\balready decided to\b|\bafter (?:the |a )?commitment\b/i;
const FOCUS_LABEL = /\b(?:hypothes[ie]s|hypothesi[sz]ed|untested|unvalidated|whether|not (?:an? )?(?:established|known|shown|stated)|(?:does|do|did) not (?:establish|show|state|say))\b/i;
const OWN_OFFER = /\b(?:your|this business|this offer)\b/i;
const sentencesOfLine = (t) => (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter(Boolean);
const clausesOfSentence = (x) => x.split(/;\s+|,\s+(?:but|though|although|however|yet|while)\s+/);
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  const hit = sentencesOfLine(t).find((seg) => {
    const at = seg.search(STAGE_POST);
    if (at < 0) return false;
    const head = seg.slice(0, at);
    // The subject is providers in general, or companies named in the sentence.
    const aboutProviders = FOCUS_SUBJECT.test(head) || entities.some((e) => e.name_words && spaced(head).includes(' ' + e.name_words + ' '));
    // "A customer who has already decided to relocate would find Expat US's support hard to replicate" assigns the
    // stage to a named company without any focus verb, and with the name after the stage words.
    const namedAnywhere = entities.some((e) => e.name_words && spaced(seg).includes(' ' + e.name_words + ' '));
    if (!((aboutProviders && FOCUS_VERB.test(head)) || namedAnywhere) || OWN_OFFER.test(head) || FOCUS_LABEL.test(seg)) return false;
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => (ledgerBySource[id] || []).length > 0);
    return !(cited.length && cited.every((id) => ledgerBySource[id].some((c) => STAGE_POST.test(String(c.claim || '') + ' ' + String(c.page_excerpt || '')))));
  });
  if (hit) add('BLOCKING', 'PROVIDER FOCUS STATED WITHOUT EVIDENCE', 'This text says that providers focus on, or work at, the stage after a decision has been made. The verified entries list the services each page names. None of them states which stage a provider works at, or that it leaves the earlier stage out, so this is an unsupported statement of fact about competitors. Say what the pages list, with their source IDs, and say that whether any provider works before a decision is not established by these pages.', short(hit), i + 1);
});

// ---------- WHAT A CITED SENTENCE SAYS HAS TO BE IN THE ENTRIES IT CITES ----------
// These compare words with evidence. They do not recognise a claim by its phrasing alone.
const stemOf = (w) => w.replace(/(?:ies|es|s)$/, '').slice(0, 7);
const wordsOfText = (v) => String(v || '').toLowerCase().replace(/\[[sw]\d+\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4).map(stemOf);
const ledgerWordsOf = (id) => new Set((ledgerBySource[id] || []).flatMap((c) => wordsOfText(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))));
const citedWithLedger = (seg) => [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => (ledgerBySource[id] || []).length > 0);
// (a) A characterisation. "Services oriented toward logistics and compliance [S1] [S4] [S10] [S15]" says what four
//     pages are about. Each cited page's entries must use those words, or the sentence says more than they do.
const CHARACTERISED = /\b(?:oriented|focused|focus(?:es)?|geared|aimed|centred|centered|concentrated|speciali[sz](?:es|ed|ing)) (?:toward|towards|on|at|around|in) ([^.;\[\]]{3,90})/i;
const CHAR_STOP = new Set(['their', 'those', 'these', 'which', 'people', 'servic', 'custome', 'client', 'support', 'providi', 'helping', 'such']);
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  let detail = '';
  const hit = sentencesOfLine(t).find((seg) => {
    const m = seg.match(CHARACTERISED);
    if (!m || FOCUS_LABEL.test(seg) || OWN_OFFER.test(seg.slice(0, m.index))) return false;
    const cited = citedWithLedger(seg);
    const terms = [...new Set(wordsOfText(m[1]).filter((w) => w.length >= 5 && !CHAR_STOP.has(w)))];
    if (!cited.length || !terms.length) return false;
    const lacking = cited.map((id) => ({ id, gone: terms.filter((w) => !ledgerWordsOf(id).has(w)) })).filter((x) => x.gone.length);
    if (!lacking.length) return false;
    detail = '"' + m[0].trim().slice(0, 90) + '", and the verified entries of ' + lacking.map((x) => x.id).join(', ') + ' do not say that';
    return true;
  });
  // DIFFERENT WORDS ARE NOT A DEFECT. "Focused on finding a home" may be a fair paraphrase of an entry that says
  // "home search". Code compares words and cannot tell a paraphrase from an expansion, so it never confirms a defect
  // here. It reports that it could not find the support: a required check with no result, which holds the plan until
  // the final review has judged the line (SUPPORTED with the entries named, or UNSUPPORTED).
  if (hit) add('BLOCKING', 'CHARACTERISATION NOT FOUND IN THE CITED ENTRIES', 'This text characterises the pages it cites: ' + detail + ' in those words. That is not proof of a defect: the entries may say the same thing differently. Code cannot judge meaning, so this needs the final review\'s verdict on this line. If it is an expansion, say what each page lists, with its source ID, or state the characterisation as IdeaToPlan\'s reading with no source ID.', short(hit), i + 1, { needs_judgment: true });
});
// (b) A list. "Temporary housing, airport pickup, home search, visa guidance [S1] [S3] [S6]" is checked item by
//     item: an item none of whose words is in the entries of the pages cited was not verified on those pages.
const ITEM_STOP = new Set(['such', 'includ', 'like', 'other', 'more', 'with', 'from', 'that', 'this', 'their', 'also', 'servic', 'support', 'help', 'offer', 'list', 'item', 'page']);
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  let loose = [];
  let ids = [];
  const hit = sentencesOfLine(t).find((seg) => {
    const cited = citedWithLedger(seg);
    if (!cited.length || [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].length !== cited.length) return false;
    // Only an enumeration is read as a list: what follows "including", "lists", or "covers", in a sentence or a
    // profile row about one company. Ordinary prose with commas in it is not split into items.
    const about = entities.filter((e) => e.name_words && spaced(seg).includes(' ' + e.name_words + ' ')).length;
    if (!(profileOwner[i + 1] || about === 1)) return false;
    const en = seg.match(/\b(?:including|includes?|lists?|covers?)\b:?\s+(?:items |services )?(?:such as )?/i);
    if (!en) return false;
    const items = seg.slice(en.index + en[0].length).replace(/\[[SW]\d+\]/g, ' ').split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
    if (items.length < 4) return false;
    const have = new Set(cited.flatMap((id) => [...ledgerWordsOf(id)]));
    loose = items.filter((it) => { const w = wordsOfText(it).filter((x) => !ITEM_STOP.has(x)); return w.length > 0 && w.length <= 3 && !w.some((x) => have.has(x)); });
    ids = cited;
    return loose.length > 0;
  });
  if (hit) add('BLOCKING', 'LISTED ITEM NOT FOUND IN THE CITED ENTRIES', 'This list cites ' + ids.join(', ') + ' and includes ' + loose.map((x) => '"' + x.slice(0, 40) + '"').join(', ') + '. None of the words of ' + (loose.length === 1 ? 'that item' : 'those items') + ' is in the verified claims from ' + (ids.length === 1 ? 'that page' : 'those pages') + '. That is not proof of a defect: an entry may name the same thing in other words. Code cannot judge meaning, so this needs the final review\'s verdict on this line. If no entry names the item, remove it or cite the entry that does.', short(hit), i + 1, { needs_judgment: true });
});
// (c) A date. A date given for a source has to be the date in that source's record.
const NUM_DATE = /\b(\d{1,2})[\/.](\d{1,2})[\/.]((?:19|20)\d{2})\b/g;
const datesStated = (v) => { const out = statedDates(v); let m; NUM_DATE.lastIndex = 0; while ((m = NUM_DATE.exec(v)) !== null) { const a = +m[1], b = +m[2]; out.push({ y: +m[3], mo: a > 12 ? b - 1 : b > 12 ? a - 1 : -1, day: a > 12 ? a : b > 12 ? b : 0, raw: m[0] }); } return out; };
const DATE_SAID = /\b(?:dated?|published|updated|publication)\b/i;
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t) || claimSeen.has(L + '|datenote')) return;
  let detail = '';
  const hit = sentencesOfLine(t).find((seg) => {
    if (!DATE_SAID.test(seg) || /\b(?:retrieved|accessed|date retrieved|run date|plan date)\b/i.test(seg)) return false;
    const stated = datesStated(seg);
    if (!stated.length) return false;
    let ids = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (!ids.length) ids = [...new Set(t.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (!ids.length) return false;
    const agrees = ids.some((id) => { const iso = String(srcById[id].published_iso || ''); return !!iso && stated.some((d) => d.raw ? (String(srcById[id].published || '').includes(d.raw) || (d.mo >= 0 && d.y === +iso.slice(0, 4) && d.mo === +iso.slice(5, 7) - 1 && d.day === +iso.slice(8, 10))) : (d.y === +iso.slice(0, 4) && (d.mo < 0 || d.mo === +iso.slice(5, 7) - 1))); });
    // The record has this date. Calling it the publication date needs the record to say what kind of date it is.
    const saysPublished = /\b(?:published|posted|publication date)\b/i.test(seg);
    const kinds = ids.filter((id) => srcById[id].published_iso).map((id) => String(srcById[id].published_kind || ''));
    if (agrees && !(saysPublished && kinds.length && kinds.every((k) => k === 'kind not established'))) return false;
    if (agrees) { detail = ids.map((id) => id + ': "' + srcById[id].published + '" is shown on the page, and nothing next to it says it is the date of publication').join('; '); return true; }
    detail = ids.map((id) => id + ': ' + (srcById[id].published_iso ? '"' + srcById[id].published + '"' : 'no date (' + (srcById[id].published_basis || srcById[id].published || 'none recorded') + ')')).join('; ');
    return true;
  });
  if (hit) add('BLOCKING', 'DATE NOT IN THE SOURCE RECORD', 'This text gives a date for a source, and the source record does not carry it. The record holds: ' + detail + '. A date may be stated only as the record gives it. Remove the date, or say that the source is undated.', short(hit), L);
});

// ---------- A STAGE IMPLIED, NOT STATED ----------
// "A tool for people managing an active move", "services that address active relocation logistics": the sentence
// does not say "after the decision", and it still places the provider at a stage. Whether the entries bear that out is
// a question of meaning. Code does not confirm a defect here and does not pass it either: the line needs the final
// review's verdict, and holds the plan until it has one.
const STAGE_IMPLIED = /\b(?:managing|handling|executing|carrying out|during|in the middle of|undergoing) (?:an? |their |the )?(?:active |ongoing )?(?:move|relocation)\b|\bactive (?:move|relocation)s?\b|\bexecution (?:stage|phase)\b|\balready (?:moving|relocating)\b/i;
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t) || issues.some((x) => x.line === L && x.type === 'PROVIDER FOCUS STATED WITHOUT EVIDENCE')) return;
  const hit = sentencesOfLine(t).find((seg) => {
    if (!STAGE_IMPLIED.test(seg) || STAGE_POST.test(seg) || FOCUS_LABEL.test(seg)) return false;
    const aboutProviders = !!profileOwner[L] || FOCUS_SUBJECT.test(seg) || entities.some((e) => e.name_words && spaced(seg).includes(' ' + e.name_words + ' '));
    if (!aboutProviders || /\b(?:your|you)\b/i.test(seg.slice(0, seg.search(STAGE_IMPLIED)))) return false;
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => (ledgerBySource[id] || []).length > 0);
    return !(cited.length && cited.every((id) => ledgerBySource[id].some((c) => STAGE_IMPLIED.test(String(c.claim || '') + ' ' + String(c.page_excerpt || '')))));
  });
  if (hit) add('BLOCKING', 'PROVIDER CHARACTERISATION NEEDS VERIFICATION', 'This text places a provider, or the providers reviewed, at a stage of the customer\'s move ("' + (hit.match(STAGE_IMPLIED) || [''])[0] + '"). The verified entries list services and do not use those words. That may be a fair reading of what the entries list, or more than they say: code cannot judge it, so this line needs the final review\'s verdict. If the entries do not bear it out, say what the page lists and that the stage it serves is not established.', short(hit), L, { needs_judgment: true });
});

// ---------- WHAT SUBSTITUTES CANNOT DO ----------
// "The free substitutes address the information need but not the personalized planning need" says what blogs and
// forums fail to give a customer. Nothing in the ledger reports that. It is a hypothesis unless the sentence says so.
const SUBSTITUTE_LIMIT = /\b(?:substitutes|alternatives|free content|blogs|forums|resource lists?|communities|guides)\b[^.;]{0,140}?\b(?:but (?:do |does )?not|cannot|can not|do not|does not|fail to|fails to|lacks?|falls? short)\b/i;
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  const hit = sentencesOfLine(t).find((seg) => SUBSTITUTE_LIMIT.test(seg) && !RANK_LABEL.test(seg) && !/\b(?:may|might|could|if)\b/i.test(seg) && !/\b(?:does|do) not (?:show|establish|confirm|mean|state)\b/i.test(seg));
  if (hit) add('BLOCKING', 'SUBSTITUTE LIMITATION STATED WITHOUT EVIDENCE', 'This text says what free or alternative options do not give the customer. No verified claim reports what customers get or miss from them, so this is IdeaToPlan\'s hypothesis, not a finding. Word it in this sentence as a hypothesis to test, or remove it.', short(hit), i + 1);
});

// ---------- A PROBLEM SAID TO BE REAL ----------
// "The problem you are addressing is real and reported" confirms the founder's problem. A survey of 600 travelers
// about paperwork does not establish it. The sentence passes when it carries the sample, denies the inference, or
// calls it a hypothesis.
const PROBLEM_REAL = /\b(?:problem|need|pain|friction|demand|struggle|barrier)s?\b[^.;]{0,160}?\bis (?:a |an )?(?:real|proven|confirmed|well[- ]documented|genuine|widespread|established)\b/i;
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  const hit = sentencesOfLine(t).find((seg) => {
    const m = seg.match(PROBLEM_REAL);
    if (!m || RANK_LABEL.test(seg) || /\b(?:surveyed|respondents?|sampled?|polled|participants)\b|\bof (?:the )?\d[\d,]* \b/i.test(seg)) return false;
    // A negation counts only when it governs "is real": "does not confirm that the problem is real".
    return !/\b(?:not|never|whether|if)\b[^,;]{0,60}$/i.test(seg.slice(0, m.index + m[0].search(/\bis (?:a |an )?(?:real|proven|confirmed|well|genuine|widespread|established)/i)));
  });
  if (hit) add('BLOCKING', 'PROBLEM STATED AS CONFIRMED', 'This text says the problem, the need, or the friction is real or confirmed. No verified claim establishes that for this customer: a survey finding is what its sample said, and it is about the people surveyed. State the finding with its sample and scope, and state the problem as the founder\'s hypothesis that the first conversations test.', short(hit), i + 1);
});

// ---------- UNKNOWN IS NOT NONE ----------
// "An audience that does not yet exist" is a statement about the founder. When the intake did not say what the
// founder already has, the plan cannot say there is nothing.
const UNKNOWN_NONE = /\b(?:audience|email list|following|followers|subscriber base|customer base|client base)\b[^.;]{0,50}?\b(?:does|do) not (?:yet )?exist\b|\b(?:you|the founder|the business) (?:has|have) no (?:audience|email list|following|website|customers|clients|subscribers)\b|\bno existing (?:audience|email list|following|customers|clients|website)\b|\bwithout an? (?:existing )?audience\b/i;
if (String(ctx.assets_state || '').toLowerCase() === 'unknown') lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  const hit = sentencesOfLine(t).find((seg) => { const m = seg.match(UNKNOWN_NONE); return !!m && !/\b(?:if|whether|unless|in case)\b/i.test(seg.slice(0, m.index)) && !/\bnot (?:captured|provided|known|stated)\b/i.test(seg); });
  if (hit) add('BLOCKING', 'UNKNOWN STATED AS NONE', 'This text says the founder has no audience, list, customers, or website, or that one does not exist. The intake did not say what the founder already has, so that is not known. Say that it was not captured in the intake, or make the sentence conditional ("if you do not yet have an audience").', short(hit), i + 1);
});

// ---------- SURVEY FINDINGS KEEP THEIR SCOPE ----------
// A survey finding is what was asked, of whom, and how many answered. "One survey finding confirms that logistical
// friction is a real experience for travelers" turns a sample into a fact about a population. A sentence that says a
// survey confirms, proves, or shows something has to carry the sample in that sentence, or deny the inference.
const SURVEY_REF = /\b(?:surveys?|polls?|stud(?:y|ies)|index|respondents)\b/i;
const SURVEY_CERTAIN = /\b(?:confirms?|confirmed|proves?|proved|proven|establish(?:es|ed)?|demonstrat(?:es|ed)|shows? that|showed that|makes? clear|verif(?:y|ies|ied))\b/i;
// "It shows that a survey of expats was conducted" says what the entry is. It does not generalise the finding.
const SURVEY_ITSELF = /\b(?:shows?|confirms?|establish(?:es)?) that (?:a |the |one |this )?(?:[a-z-]+ ){0,2}?(?:survey|study|poll)\b/i;
const SAMPLE_KEPT = /\b(?:surveyed|respondents?|sampled?|polled|participants)\b|\bof (?:the )?\d[\d,]* \b/i;
const SHARE_OF_PEOPLE = /\b(?:most|the majority|a majority|many|half|two-thirds|three-quarters|a (?:third|quarter)|one in (?:two|three|four|five|ten)|\d+(?:\.\d+)?\s?%|\d+ percent)\b[^.;]{0,60}\b(?:travelers|travellers|people|expats?|nomads|professionals|customers|adults|workers|buyers|clients)\b|\b(?:travelers|travellers|people|expats?|nomads|professionals|customers|adults|workers|buyers|clients)\b[^.;]{0,30}\b(?:say|said|find|found|report|reported|struggle|struggled)\b/i;
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  const hit = sentencesOfLine(t).flatMap(clausesOfSentence).find((clause) => SURVEY_REF.test(clause) && SURVEY_CERTAIN.test(clause) && !SAMPLE_KEPT.test(clause) && !SURVEY_ITSELF.test(clause) && !DENIES_OR_LABELS.test(clause));
  //  The same loss without the word "survey": a share of a population, cited to a source whose ledger entry is a
  //  survey finding, with the sample gone ("Most travelers find that paperwork takes longer than expected [S28]").
  //  The sample counts as kept when it is in the sentence or in the one before it.
  const sentences = sentencesOfLine(t);
  const loose = hit ? null : sentences.find((x, k) => (x.match(/\b[SW]\d+\b/g) || []).some((id) => (ledgerBySource[id] || []).some((c) => /\b(?:surveyed|respondents|polled|survey of)\b/i.test(String(c.claim || '')))) && SHARE_OF_PEOPLE.test(x) && !SAMPLE_KEPT.test(x) && !SAMPLE_KEPT.test(sentences[k - 1] || '') && !DENIES_OR_LABELS.test(x));
  if (loose) add('BLOCKING', 'SURVEY FINDING GENERALISED', 'This sentence cites a survey and states its finding as a fact about a whole group, without the sample. A survey finding is what was asked, of whom, and how many answered. State it as the ledger entry gives it, with its population and its sample size, and say what it does not cover.', short(loose), i + 1);
  if (hit) add('BLOCKING', 'SURVEY FINDING GENERALISED', 'This text says a survey or study confirms, proves, or shows something, without the sample it comes from. A survey finding is what was asked, of whom, and how many answered; it is not a fact about travelers, customers, or people in general, and it does not confirm anything about this customer. State the finding as the ledger entry gives it, with its question, its population, and its sample size, and say what it does not cover.', short(hit), i + 1);
});

// ---------- SUPERLATIVES NEED COMPARATIVE EVIDENCE ----------
// "The most common substitute" compares one thing with all the others. That is a statement of fact about the market,
// whatever it ranks: substitutes, channels, barriers, reasons. It needs a cited verified claim that makes the
// comparison. Company rankings have their own check below. Figures of the plan's own model are not market claims.
const SUPERLATIVE = /\b(?:most|least) (?:common|commonly used|popular|widely used|frequent|frequently used|prevalent|typical|usual|used|chosen|preferred|sought-after|in-demand)\b|\bthe (?:biggest|largest|fastest[- ]growing|dominant|number one|cheapest|commonest)\b (?:[a-z-]+ ){0,2}?(?:substitutes?|alternatives?|competitors?|providers?|channels?|platforms?|markets?|segments?|reasons?|barriers?|obstacles?|objections?|destinations?|choices?|options?|groups?|communit(?:y|ies))\b/i;
const OWN_FIGURES = /\b(?:model|forecast|scenarios?|budget|cost lines?|expenses?|line items?|revenue streams?|your (?:plan|costs?|time|list|audience|calendar)|in this plan|of this plan)\b/i;
// What the founder hears in their own conversations is theirs to rank: "the most common objection you heard".
const OWN_DATA = /\byou (?:heard|hear|saw|see|get|got|receive|received|collect|collected|record|recorded|notice|noticed)\b|\byour (?:conversations|interviews|calls|notes|responses|replies)\b|\?\s*$/i;
// A share of a sample ("two-thirds of 600") is not a comparison with the alternatives. The entry has to rank.
const COMPARATIVE_EVIDENCE = /\b(?:most|majority|more than half|top|largest|biggest|leading|ranked|ranks)\b/i;
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  const hit = sentencesOfLine(t).flatMap((seg) => clausesOfSentence(seg).map((clause) => ({ seg, clause }))).find(({ seg, clause }) => {
    if (!SUPERLATIVE.test(clause) || RANKED.test(clause) || OWN_FIGURES.test(clause) || OWN_DATA.test(clause) || RANK_LABEL.test(clause)) return false;
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => (ledgerBySource[id] || []).length > 0);
    return !cited.some((id) => ledgerBySource[id].some((c) => COMPARATIVE_EVIDENCE.test(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))));
  });
  if (hit) add('BLOCKING', 'SUPERLATIVE STATED WITHOUT COMPARATIVE EVIDENCE', 'This text says that something is the most common, the most popular, the biggest, or the like. That compares it with every alternative, and no verified claim cited here makes that comparison. Say that it is one substitute, channel, barrier, or reason, and that how it compares with the others is not established, or cite a verified claim that states the comparison.', short(hit.clause), i + 1);
});

// ---------- COMPETITORS RANKED, CONTINUED ----------
// A RANKING COVERS EVERYONE IT RANKS. "The most comprehensive provider reviewed" places one company above every
// company reviewed, so it needs a stated criterion and a verified claim, cited in the sentence, for each of them.
// Evidence for two companies supports a comparison between those two and nothing wider: "A lists more services than
// B". A superlative is limited to fewer companies only when the sentence says so ("of the two", "between A and B").
// A verified claim that states the ranking itself, cited on the sentence, also supports it.
const RANK_CRITERION = /\b(?:by|in|on|counting|comparing) (?:the )?(?:number|range|breadth|count|list|variety|length) of\b|\bin terms of\b|\bmeasured by\b|\bjudged by\b|\bon the basis of\b/i;
const COMPARED = /\bmore (?:comprehensive|established|complete|credible|popular|advanced|experienced|trusted|expensive|affordable|capable|direct|relevant|extensive)\b[^.;]{0,80}?\bthan\b/i;
const LIMITED_SCOPE = /\bof the (?:two|three|four)\b|\bof these (?:two|three|four)\b|\bbetween\b[^.;]{0,120}?\band\b/i;
// The companies reviewed: those with a verified claim under a competitor question.
const reviewedCompanies = entities.filter((e) => evClaims.some((c) => c.entity === e.name && /^C\d/.test(c.question || '')));
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  let detail = '';
  const hit = (/^\|.*\|$/.test(t) ? t.replace(/^\||\|$/g, '').split('|') : [t]).flatMap((c) => c.split(/(?<=[.!?])\s+/)).find((seg) => {
    const superlative = RANKED.test(seg);
    if ((!superlative && !COMPARED.test(seg)) || RANK_LABEL.test(seg)) return false;
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => (ledgerBySource[id] || []).length > 0);
    if (cited.some((id) => ledgerBySource[id].some((c) => RANKED.test(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))))) return false;
    const named = reviewedCompanies.filter((e) => spaced(seg).includes(' ' + e.name_words + ' ') || aliasesOf(e).some((s) => seg.includes(s)));
    // Who is being ranked: everyone reviewed, unless this is a comparison between named companies.
    const scope = (superlative && !LIMITED_SCOPE.test(seg)) ? reviewedCompanies : named;
    const without = scope.filter((e) => !cited.some((id) => (e.source_ids || []).includes(id)));
    const problems = [];
    if (!RANK_CRITERION.test(seg)) problems.push('it does not say what is being compared');
    if (scope.length < 2) problems.push('it does not name the companies being compared');
    else if (without.length) problems.push('it cites no verified claim for ' + without.map((e) => e.name).join(', ') + (superlative && scope === reviewedCompanies ? ', and a ranking of the ' + scope.length + ' companies reviewed needs evidence for every one of them' : ''));
    if (!problems.length) return false;
    detail = problems.join('; ');
    return true;
  });
  if (hit) add('BLOCKING', 'COMPETITOR RANKED WITHOUT EVIDENCE', 'This text ranks or compares companies, and ' + detail + '. A ranking needs a stated criterion (for example the number of services each page lists) and a source ID with a verified claim for every company it covers. Evidence for two companies supports a comparison between those two only. Give the criterion and the evidence for all of them, narrow the statement to the companies the evidence covers, word it as a hypothesis, or remove it.', short(hit), i + 1);
});

// A RANKING OFFERED AS A HYPOTHESIS STAYS ONE. "It is a hypothesis that A is the most comprehensive provider" may
// stand. Another sentence that then treats A's lead as a fact ("A's breadth advantage", "A leads on scope") presents
// the hypothesis as established, and is unsupported for the same reason the ranking would be.
const ADVANTAGE = /\b(?:advantages?|leads?|leader|leading|ahead of|outperforms?|superior|strongest|broadest|widest|dominant|dominates|edge over|sets the (?:standard|benchmark)|the benchmark)\b/i;
const namesCompany = (e, seg) => spaced(seg).includes(' ' + e.name_words + ' ') || aliasesOf(e).some((s) => seg.includes(s));
const hypotheticalRank = [];
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t)) return;
  sentencesOfLine(t).forEach((seg) => { if ((RANKED.test(seg) || COMPARED.test(seg)) && RANK_LABEL.test(seg)) entities.filter((e) => e.name_words && namesCompany(e, seg)).forEach((e) => hypotheticalRank.push({ e, line: i + 1 })); });
});
if (hypotheticalRank.length) lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || demandComputed.has(t)) return;
  let about = null;
  const hit = sentencesOfLine(t).find((seg) => {
    if (RANK_LABEL.test(seg) || RANKED.test(seg) || COMPARED.test(seg) || !ADVANTAGE.test(seg)) return false;
    about = hypotheticalRank.find((h) => namesCompany(h.e, seg)) || null;
    return !!about;
  });
  if (hit) add('BLOCKING', 'HYPOTHETICAL RANKING PRESENTED AS ESTABLISHED', 'L' + about.line + ' ranks ' + about.e.name + ' as a hypothesis. This text treats that standing as a fact. A hypothesis is not evidence, here or anywhere else in the plan. Say what the page of ' + about.e.name + ' lists, or repeat that the comparison is a hypothesis.', short(hit), i + 1);
});

// ---------- PREVALENCE ----------
// A page that describes its own tool, and a blog post, are two examples. They do not establish that substitutes,
// alternatives, or competitors are widely available, common, or numerous. Such a statement needs a verified claim
// that says so, cited on the sentence. Otherwise the plan can say that examples exist and name them.
const PREVALENT = /\b(?:widely|readily|freely|commonly|broadly|easily) (?:available|accessible|used|found)\b|\b(?:abundant|plentiful|numerous|countless|ubiquitous|commonplace)\b|\bmany (?:free |paid |other |established )?(?:substitutes|alternatives|competitors|providers|tools|options|resources|communities|services)\b|\b(?:crowded|saturated) (?:market|space|field|category)\b/i;
const PREVALENT_SUBJECT = /\b(?:substitutes?|alternatives?|competitors?|providers?|tools?|options?|resources?|communit(?:y|ies)|services?|content|blogs?|guides?|market|space|field|category)\b/i;
const PREVALENT_HEDGE = /\b(?:no|not|never|without|whether|unknown|unvalidated|untested|hypothes[ie]s|cannot|how (?:widely|commonly|many))\b/i;
const prevalenceComputed = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || prevalenceComputed.has(t)) return;
  let seen = false;
  cellsAndSentences(t).flatMap((x) => x.split(/,\s+(?:but|though|although|however|yet|while)\b/i)).forEach((seg) => {
    if (seen || !PREVALENT.test(seg) || !PREVALENT_SUBJECT.test(seg) || PREVALENT_HEDGE.test(seg)) return;
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (cited.some((id) => (ledgerBySource[id] || []).some((c) => PREVALENT.test(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))))) return;
    seen = true;
    add('BLOCKING', 'PREVALENCE STATED WITHOUT EVIDENCE', 'This text says that substitutes, alternatives, or competitors are widely available, common, or numerous' + (cited.length ? ' and cites ' + cited.join(', ') + ', whose verified claims do not say so' : ', with no verified claim that says so') + '. A few pages that describe their own offers are examples; they do not show how common such offers are. Say that examples exist and name them with their source IDs, and say that how widely they are used is not established.', short(seg), L);
  });
});

// ---------- POPULATION, COMMUNITY AND DEMAND ----------
// The number of people a survey asked is the size of its sample. It does not show that a population, a community,
// or a market is large, active, or growing, and it is not evidence of demand for this offer. A sentence that asserts
// such a thing needs a verified claim that states it, cited on that sentence, or has to be worded as a hypothesis.
const SIZE_CLAIM = /\b(?:large|sizeable|sizable|substantial|significant|growing|thriving|active|strong|robust|huge|vast|big|broad)\b(?:,? (?:and )?(?:large|sizeable|sizable|active|growing|engaged))?(?: [a-z-]+){0,5}? (?:communit(?:y|ies)|populations?|markets?|audiences?|customer base|segments?|demand|interest|cohorts?|followings?)\b/i;
const SIZE_ASSERTED = /\b(?:existence of|there (?:is|are)|shows?|suggests?|indicat\w+|demonstrat\w+|confirms?|reflects?|points? to|evidence of|represents?|reveals?)\b/i;
const SIZE_HEDGE = /\b(?:no|not|never|without|whether|unknown|unvalidated|untested|hypothes[ie]s|assum\w*|cannot|if)\b/i;
const sizeComputed = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || sizeComputed.has(t)) return;
  let seen = false;
  cellsAndSentences(t).flatMap((x) => x.split(/,\s+(?:but|though|although|however|yet|while)\b/i)).forEach((seg) => {
    if (seen || !SIZE_CLAIM.test(seg) || !SIZE_ASSERTED.test(seg) || SIZE_HEDGE.test(seg)) return;
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (cited.some((id) => (ledgerBySource[id] || []).some((c) => SIZE_CLAIM.test(String(c.claim || '') + ' ' + String(c.page_excerpt || ''))))) return;
    seen = true;
    add('BLOCKING', 'POPULATION OR DEMAND STATED WITHOUT EVIDENCE', 'This text states that a community, a population, a market, or demand is large, active, or growing' + (cited.length ? ' and cites ' + cited.join(', ') + ', whose verified claim does not say so' : ', with no verified claim that says so') + '. A survey\'s number of respondents is the size of its sample: it does not show how many such people exist or that they want this offer. State only what the ledger entry says, or word this as a hypothesis to test.', short(seg), L);
  });
});

if (integrity && Array.isArray(integrity.calls)) integrity.calls.forEach((c) => { if (c.marker_order === 'unreliable') add('MINOR', 'RESEARCH MARKERS WERE OUT OF ORDER', 'In ' + c.node + ' the research tool numbered its citation markers out of order. ' + (c.remapped || 0) + ' claims were moved to the page of the company they name and ' + (c.dropped || 0) + ' were discarded. No action is needed in the plan; this is recorded for review.'); });

// Lines whose wording may assert feasibility, a comparison, an unsourced generalization, or that something does not exist.
// They are passed to QA to judge, with the matched words shown. They are not findings by themselves.
const protectedText = new Set([fin.scenario_block, fin.forecast_block, fin.budget_block, fin.loan_block].join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
const claimRe = /\b(realistic(ally)?|achievable|attainable|plausibl[ey]|likely|unlikely|faster|fastest|cheaper|cheapest|easier|easiest|quicker|quickest|stronger|strongest|safer|safest|simpler|simplest|better|best|superior|(?:higher|lower|highest|lowest)[- ](?:converting|cost|risk|quality|margin|value|effort)|(?:more|most|less|least) (?:effective|efficient|profitable|reliable|valuable|scalable|credible|trusted|powerful|successful|productive|affordable|compelling|persuasive|direct)|only confirmed|the only|proven|will (generate|produce|convert|attract|refer))\b/i;
const hintOf = (l) => {
  const hits = [];
  // Every comparative or superlative on the line, except a plain comparison of numbers such as "lower than $189".
  [...l.matchAll(new RegExp(claimRe.source, 'gi'))].forEach((c) => { if (!/^\s*than\s+\$?\d/i.test(l.slice(c.index + c[0].length, c.index + c[0].length + 14))) hits.push(c[0]); });
  const n = l.match(noneClaims); if (n) hits.push(n[0]);
  const sc = l.match(/\bat (base|target|stretch)\b[^.]*\b(can|will)\b/i); if (sc) hits.push(sc[0].slice(0, 60));
  banned.forEach(([, re]) => { const b = l.match(re); if (b) hits.push(b[0]); });
  return [...new Set(hits.map((h) => h.toLowerCase()))];
};
// Lines that make a commercial claim. Code cannot judge meaning, so the reviewer is given each one to judge.
const commercialRe = /\b(demand|buyers?|paying|paid|pays?|willing(?:ness)? to pay|market|price[ds]?|pricing|charg(?:e|es|ing)|sales|revenue|audiences?|customer base|track records?|established)\b/gi;
const commercialLines = lines.map((l, i) => {
  const t = l.trim();
  if (!t || t.startsWith('#') || /^\|?\s*:?-{2,}/.test(t) || /computed\]/.test(t)) return '';
  const words = [...new Set((t.match(commercialRe) || []).map((w) => w.toLowerCase()))];
  if (!words.length || !(/\b[SW]\d+\b/.test(t) || /\b(?:confirm|prov|establish|validat|show|demonstrat|indicat|suggest)\w*/i.test(t))) return '';
  return '[L' + (i + 1) + '] [' + words.join(', ') + '] ' + t.slice(0, 420);
}).filter(Boolean).slice(0, 60).join('\n');
const claimLines = lines.map((l, i) => {
  const t = l.trim();
  if (!t || t.startsWith('#') || protectedText.has(t)) return '';
  const h = hintOf(t);
  return h.length ? '[L' + (i + 1) + '] (' + h.join(', ') + ') ' + t.slice(0, 300) : '';
}).filter(Boolean).join('\n') || 'None.';

const qcReport = issues.length ? issues.map((i) => '- ' + i.severity + ' | ' + i.type + (i.line ? ' | L' + i.line : '') + ': ' + i.detail + (i.quote ? ' | Text: ' + i.quote : '')).join('\n') : 'No automated issues found.';

// The plan with a line ID on every non-empty line. QA and the reviser point at lines, not at quoted text.
const numbered = lines.map((l, i) => l.trim() ? '[L' + (i + 1) + (protectedText.has(l.trim()) ? ' computed' : '') + '] ' + l : '').join('\n');

const SEVERITY = `SEVERITY
- BLOCKING: a defect that makes the plan materially unreliable to deliver. Only these: a fabricated fact or an invented source; an incorrect material figure (one that contradicts FINANCIAL FACTS, the ledger, or another part of the plan); a broken or missing source reference on a material factual claim; a source ID attached to a claim the ledger does not link to that source; a citation attached to the wrong company; a cited price or statistic given with a different amount, currency, scope, geography, or year than its ledger entry, or with one of those left out so that it reads as broader than the source; a note about a source's date placed on a different source; a founder fact stated wrongly; a required section missing; a critical contradiction that makes the plan materially unreliable; a competitive gap, an unmet need, an underserved segment, or a positioning opportunity stated as a finding with no ledger entry that states it and no hypothesis label; a comparison of the price with what other services charge when no verified price is cited; a statement that the startup budget is sufficient while costs are unresolved.
- MAJOR: should be fixed before delivery, but does not make the plan false. An unsupported conclusion. Evidence overstated (for example "suggests sustained demand"), unless it creates a materially false factual claim. An important assumption presented as a fact, including feasibility language with no evidence behind it. An unsupported comparative claim. A strategic inconsistency between sections. Stale or undated evidence used without qualification. A cited statement that goes beyond what its ledger entry states. A recommendation built on an unknown fact treated as known. Unknown information written as none or zero. A channel recommendation or rejection resting on an age or demographic stereotype. Adjacent-market pricing presented as evidence of what this offer should cost. Scenario wording that could lead the reader to take the Base scenario for the year-one result. A figure from an undated source, a vendor blog, or a list article stated as fact without saying whose estimate it is.
- MINOR: repetition, wording, organization, formatting, and clarity issues that are not material.
When unsure between BLOCKING and MAJOR, choose MAJOR.`;

const LINE_NOTE = 'Every non-empty line of the plan starts with a line ID such as [L12]. The IDs are not part of the plan; they are how you point at a line. A line marked computed, such as [L40 computed], was produced by code and cannot be edited: never point a finding at a computed line. If a computed table conflicts with the prose, point the finding at the prose line.';

const reviewSystem = `You are the final quality reviewer for IdeaToPlan business plans. A plan with unsupported claims must not reach a client. You do not rewrite the plan. You find real problems and say exactly how to fix each one. Report only problems that need a change. Never list something you checked and found correct.

${SEVERITY}

CHECKS
1. Unsupported claims: statements about the market, customers, competitors, prices, costs, benchmarks, trends, regulation, tax, or statistics with no source ID. In a Starter plan no research was done, so any such statement is unsupported.
2. Citations: a source ID on a claim the EVIDENCE LEDGER does not link to that source; a claim stated more strongly or more broadly than the ledger; detail added that the ledger entry does not state; any source name, study, author, URL, or date not in SOURCES. One source ID at the end of a paragraph or table row covers the claims in it.
3. Research interpretation: analysis presented as a finding. "None of the competitors reviewed does X" does not establish that X is underserved or that customers want X. A competitive gap, an unmet need, an underserved segment, a positioning opportunity, or a statement that no competitor does something is BLOCKING when it is presented as a finding, unless a ledger entry cited on that sentence states it. It is acceptable only when the sentence that makes the claim is itself clearly worded as a hypothesis to test. Judge each sentence alone: a hypothesis label in another sentence of the paragraph does not cover a sentence that reads as a finding. A contrast is the same claim: "all five competitors focus on executing a move rather than on the decision stage" asserts what the competitors do not do. The ledger entries list services in each company's own words; none states what a company focuses on or leaves out. Check such a sentence against every entry it covers and allow only what those entries state, with the scope said in the sentence ("the pages reviewed list ..."). A ranking of the companies reviewed ("the most comprehensive provider") is an unsupported comparison unless the sentence states what is being compared and cites a verified claim for every company the ranking covers. "The most comprehensive provider reviewed" covers every company reviewed: evidence for two of five supports a comparison between those two only, worded as that. Without the criterion and the full evidence, ask for the statement to be narrowed to what the evidence covers, or removed. An unsupported ranking of companies is BLOCKING, like any other unsupported superlative. A ranking that the sentence itself calls a hypothesis may stand, and then no other sentence may rely on it as a fact ("because A is the most comprehensive provider", "A's breadth advantage"): report each such sentence as BLOCKING. "IdeaToPlan analysis" identifies who wrote the sentence; it is not evidence and it does not make a factual claim conditional, so a finding labelled only that way is still BLOCKING. Say how to reword it. Four more statements of fact that the ledger rarely supports, each BLOCKING when no ledger entry cited on the sentence states it: (a) a focus or stage assigned to providers ("services oriented toward logistics and execution after a relocation decision is made"): the entries list services and say nothing about the stage a provider works at; (b) "paid", "charges", or "sells" said of a provider, with or without a source ID, when no entry for that provider shows a price, a fee, or a charge ("Clear pricing" is not one, and an entry marked payment_not_established does not support it); (c) a survey finding stated without what was asked, of whom, and how many, or said to confirm, prove, or show something about travelers, customers, or people in general; (d) a superlative about the market ("the most common substitute", "the biggest barrier", "the most popular channel") with no entry that makes the comparison. CLASSIFY BY SUBSTANCE. A statement of fact about competitors, customers, or the market that no cited ledger entry states is an unsupported claim and is BLOCKING, however carefully it is phrased and wherever it stands, including a table cell or a list of alternatives. It is not a wording, style, or specificity finding, and it is never MINOR. A hypothesis label covers the assertion it is attached to and nothing else: "a positioning could distinguish QYLAT from the logistics-focused paid services" still states as fact that those services are paid and logistics-focused. "Our read:" names the author and labels nothing. A survey finding does not make the founder's problem "real" or "confirmed". What free substitutes fail to give a customer is a hypothesis unless an entry reports it. A detail about the founder, the audience, or the offer that the FOUNDER CONTEXT does not state ("an audience that does not yet exist", "the offer involves financial advice") is a finding unless the plan calls it a proposed assumption or says it was not captured. In a company profile, check every row against that company's entries, including strengths and "why a customer might choose" rows. AN OCCURRENCE IS A LINE THAT HAS TO CHANGE: never list a line that your own fix says is acceptable as written. A sentence that reports the customer's doubt ("they do not know whether it is realistic") is not the plan asserting feasibility.
4. Known and unknown: any statement that the founder lacks something (no audience, no website, no customers, starting from zero) that the FOUNDER CONTEXT does not state. A blank revenue answer described as "not provided" when the form defines it as pre-revenue. A recommendation that silently assumes an unknown fact instead of reasoning conditionally. Advice to create something the founder already has, or to repeat work the founder has already done. Internal labels such as UNKNOWN or NOT PROVIDED printed in the plan.
5. Financial consistency: do not recompute the financial tables; code produced them. Check that every financial figure in the prose, the Executive Summary, and the callouts matches FINANCIAL FACTS exactly, and that no figure appears that is in neither FINANCIAL FACTS, the FOUNDER CONTEXT, nor the ledger. Flag any assumption described as verified, validated, typical, standard, realistic, or conservative. Flag a price from a different kind of service presented as evidence of what this offer should cost, rather than as a reference point for an untested assumption.
6. Budget: the ceiling treated as a spending target. A cost shown as "Amount not yet established" that the plan gives a figure for, calls free, or leaves out where it discusses costs, profit, or viability. A recommendation that depends on paid advertising when the Paid acquisition line in FINANCIAL FACTS says the model contains no committed advertising cost, or a paid channel recommended as part of the strategy with no matching Budget item. The COST REVIEW printed in the plan as a list.
7. Channels: a channel recommended by default, or ruled in or out by an age or demographic stereotype, or a verdict where the evidence only supports a test. Founder-reported traction or assets that the recommendation ignores.
8. Stale data: prices, rules, features, or market figures from a source dated more than 24 months before the RUN DATE, or undated, not flagged as such. An undated source has to be called undated in each section that uses it. One note covers the section it stands in, when it is true of the sources that section cites; it does not cover other sections. Report the first use in every section that has no such note, as its own occurrence, and never list a line that is already covered by a note in its own section. Judge every date against the RUN DATE given at the top of the user message, never against your own sense of the current year. A source date on or before the RUN DATE is not anomalous, future-dated, or suspicious, and a plan sentence that says so is a MAJOR defect to remove. Only a date after the RUN DATE is a future date.
9. Structure: compare the plan's headers with SECTIONS. SECTIONS is the only correct structure and numbering. Never flag numbering that matches SECTIONS. A Sources section is added later and is not expected here.
10. Required content: the Executive Summary table; the scenario table and the 12-month forecast with its planning-estimate statement; the 90-day roadmap table and a Done when for every action, where the plan has that section; the Critical Assumptions and Viability Assessment content.
11. Repetition: the same risk, assumption, insight, or disclaimer explained at length more than once. Name both places and say which to cut to a one-clause reference.
12. Specificity and actionability: a paragraph that could appear unchanged in another customer's plan; evidence with no interpretation or recommendation; a recommendation with no test or next step.
13. Contradictions: one section conflicting with another, including the Executive Summary against the body.
14. Research gaps: a gap in RESEARCH GAPS that the plan fills with unsourced material; a place where the plan says evidence was not found although the ledger has a relevant claim.
15. AUTOMATED CHECK RESULTS are already recorded as findings by code. Do not repeat them.
16. Assumptions presented as conclusions: feasibility or outcome language with no evidence behind it, such as "can realistically reach", "is achievable", "is realistic", "likely", "more likely", or "will generate". Each such statement needs a source ID or a founder fact, or must be explicitly framed as an assumption, a hypothesis, or an IdeaToPlan recommendation. Say which framing to use. This includes a scenario explained as a certainty ("At Base, direct outreach alone can supply the leads" must be "The Base scenario assumes..."), and test thresholds: a success metric, pass mark, or target number (for example "two bookings from ten conversations" or "a 10% booking rate") that is not labeled as an IdeaToPlan-defined test criterion or planning threshold, or that is presented as a benchmark or as an indicator of viability without a source.
17. Unsupported comparative or absolute claims. A comparative or superlative needs evidence when it asserts a factual advantage of one strategy, channel, offer, competitor, customer behavior, or business choice over another. This is not limited to particular words. Faster, cheaper, easier, better, stronger, more effective, more efficient, more profitable, higher-converting, lower-cost, lower-risk, best, fastest, cheapest, most effective, most efficient, highest-quality, only confirmed, the only, most likely, more likely, realistic, and achievable are examples. A plain numerical comparison of figures in the plan, such as "$100 is lower than $189", is not a claim: never flag it. Do not flag a word just because it appears; judge the statement in context. Allow it when a source ID or a founder fact supports the comparison, or when it is already framed as an assumption, a test, or a recommendation. Flag it when an opinion, an assumption, or a recommendation is stated as an established fact. The fix is usually to recast it as an IdeaToPlan recommendation with its reason, not to make it vaguer. Examples: change "A referral from a satisfied client is the highest-quality lead available." to "IdeaToPlan recommends testing referrals from satisfied clients because they require no advertising spend and come with an existing trust connection." Change "Direct outreach is the only confirmed channel at this stage." to "IdeaToPlan recommends direct outreach as the initial channel to test because it can be started immediately without paid acquisition." Change "An existing audience is a faster and cheaper lead source than cold outreach." to "Because you already have access to this audience, IdeaToPlan recommends testing it before building a new acquisition channel." The goal is not excessively cautious writing. It is to stop assumptions, recommendations, and opinions being presented as established evidence.
18. Strategic consistency: read the validation strategy, the Budget, the 90-Day Action Plan, and the Viability Assessment against each other. Flag any recommendation that conflicts with another. Examples: the plan says the offer can be validated without a website or booking tool, while the Budget table puts that infrastructure in the Before validation stage, or the action plan buys it before the stage the Budget table gives it; a statement that nothing should be spent before validation while a cost is listed before validation; an action plan target the scenarios do not support; a first step in one section that differs from the first step in another. Compare every major spending recommendation across the Budget, the 90-Day Action Plan, the Revenue & Financial Model, and the Viability Assessment. A timing conflict that could cause unnecessary spending is MAJOR. Name both lines in the problem.
19. Scenario terms: the Base, Target, and Stretch scenarios describe one month once the offer is running. The 12-month forecast is a ramp toward Base. Year-one totals come only from the forecast. Flag any wording that could lead the reader to take a Base monthly figure as the year-one average, or Base times twelve as the year-one expectation, and any place that puts a Base monthly figure next to an annual figure without saying which is which. Say how to reword it using FINANCIAL FACTS.
20. Source quality: W sources are pages found by web search. A search listing is not evidence. A W ID is usable only through a ledger entry verified on that page, exactly like an S ID; a W ID with no ledger entry is BLOCKING. A market figure or trend resting on a source whose kind or domain shows a vendor blog, list article, or directory. A material claim whose ledger entry is itself vague about what the source states. You cannot open the source pages, so do not report "could not confirm the page" as a finding. Judge only the sources the plan cites. A source that was retrieved but is never cited is not part of the delivered plan and is not printed in its Sources section: never report it, and never report a claim as possibly resting on it.
21. Attribution: for every cited claim, find the EVIDENCE LEDGER entry it rests on. A verified source is not a verified claim: the ledger lists what was verified on each page, and nothing else about that page or company is sourced. A sentence may carry a source ID only for what one ledger entry's claim and page_excerpt state. A conclusion drawn from an entry (demand, buyers, market size, a trend, a gap) must be worded as IdeaToPlan's inference and must not read as if the source said it; when it reads as sourced, it is BLOCKING. The source ID must be one of that entry's source_ids, and any company the sentence names must be the company that entry is about. A source ID that exists in SOURCES but belongs to a different company, or to a ledger entry that says something else, is BLOCKING: a real ID on the wrong claim is as serious as an invented one. A price must keep its currency, what it buys, and whether it is a fixed price, a starting price, or a range, exactly as the ledger entry states. A statistic must keep the population, geography, and year the ledger entry states. A note about a source's age must sit on the source it describes: check it against that source's published value in SOURCES. A figure from a source that is undated, a vendor blog, or a list article must be worded as that source's estimate every time it appears, including in the Executive Summary and the Viability Assessment; repeating a figure does not make it established. Every ledger entry was checked by code against the text of the page in its source_ids, and its page_excerpt is the passage that supports it: those source_ids are the correct ones.
22. Excluded claims: the user message lists EXCLUDED CLAIMS. Each was reported by the research tool and then failed verification against its source page: the page contradicted it, did not state it, could not be read, or is not credible evidence for it. None of them is evidence. Any plan statement that presents an excluded claim, its figures, or a conclusion drawn from it as fact or as sourced is BLOCKING, with or without a source ID, and in any wording. A company listed there with no verified claim must not be profiled, priced, or compared. A figure the plan uses as its own planning assumption is acceptable only when the sentence labels it as an assumption, gives no source ID, and attributes it to no company or study. A plan statement that goes beyond what a ledger entry's claim and page_excerpt say, for example turning a starting price into a fixed price or a range, or a monthly cost into a service price, is BLOCKING.
23. Demand: the existence of competitors shows that competing offers exist. A market existing means offers are available; it is not demonstrated demand. It does not show buyers, sales, or willingness to pay. A statement that demand, buyers, paying customers, a customer base, or willingness to pay exists or is confirmed, proven, or established needs a ledger entry that reports customers paying, spending, survey, or search-behavior evidence, cited on that sentence. Without one it is BLOCKING, including when it is softened with suggests or indicates. The acceptable wording is a hypothesis that requires validation. A survey's number of respondents is the size of its sample and nothing more. "A survey asked about 7,800 expats" does not establish that a population, a community, or a market is large, active, or growing, that the underlying behavior is common, or that there is demand for this offer. A sentence that draws any of those from a sample size, with or without a source ID, is BLOCKING. Supply is not demand. Providers describing their services, and guides or tools being available, establish what is offered. They do not establish that people seek, want, need, or pay for such help. A sentence that draws customer behaviour or demand from the existence of providers, offers, or resources is BLOCKING, and a hedge does not rescue it: "suggests that people do seek help", "confirms that people seek information", and "is consistent with a space where people seek this kind of help" are all unsupported. The acceptable forms are a denial ("this does not show that customers seek it"), a clearly labelled hypothesis, or a verified claim that reports customer behaviour, cited on the sentence.
24. Prices and payment. The offer's own price is a planning assumption unless the founder reports sales at it; it must be labeled as an assumption and carry no source ID. A page that states no price cannot support, inform, or benchmark a price, and a sentence that ties the price to such pages is BLOCKING. A competitor price in the ledger is the price of that competitor's own offer: the sentence must keep its amount, currency, what it buys, its length, and any qualifier exactly as the ledger entry and its page_excerpt state them, must keep separate offers separate, and must not call it equivalent to this offer or say it validates this offer's price. Saying that providers are paid, charge, or sell needs a ledger entry that states a price or a charge for those providers; a service description alone does not show it. Any statement that this offer's price is validated by the market is BLOCKING. A comparison with what other services charge that gives no number (a reference point, a general range, a benchmark, a going rate, comparable or adjacent services) still claims pricing evidence: without a verified price cited on that sentence it is BLOCKING. When the ledger holds no verified price, the plan must say that its price is an untested planning assumption, and must not suggest that any comparison informs it. What a verified price establishes: one page's own words, and nothing wider. A page that reports a typical range does not establish that the page's owner charges it, that established firms charge it, that a market or category supports it, that customers will pay it, or that there is room for this offer. A sentence that draws any of those from a ledger price, in any wording and with or without a source ID, is BLOCKING. The acceptable form states what the page says, with its source ID, and says what it is not evidence of. A positive scenario or forecast result is arithmetic on the assumed price: a sentence that says a result validates, confirms, or supports the price is BLOCKING. The price itself is decided once: any other value given as this offer's price is BLOCKING.
25. Who a source speaks for. One company's page supports statements about that company only. Two or three pages that describe their own offers are examples: they do not establish that substitutes, alternatives, or competitors are widely available, common, numerous, or sufficient for this customer. A sentence that says so, with or without those source IDs, is BLOCKING. The acceptable form names the examples with their source IDs and says that how widely they are used is not established. A statement about competitors, providers, or the market in general that cites one company's page, or adds detail the page does not state (for example audiences, track records, or reputation), is BLOCKING.
26. Meaning, not keywords. The user message lists LINES THAT MAKE COMMERCIAL CLAIMS. Read each one for what it asserts. Decide whether it claims demand, buyers, sales, payment, a market, or a validated price, in any wording, and whether a ledger entry cited on that line states it. Report every line that asserts more than its evidence, under the check it breaks. A line that only says offers exist, or that labels demand or price as an assumption or hypothesis, is acceptable.
27. Cost condition. When FINANCIAL FACTS contain a COST CONDITION, some costs are unresolved and the conclusion depends on them. Code places that paragraph at the start of the Viability Assessment after revision, so do not report it as missing. No sentence in the Executive Summary or the Viability Assessment may say the business is viable, profitable, or sustainable without that condition, or say that all costs are known or included. A break-even threshold must not be described as an estimate of the costs, as a budget for them, or as evidence that the business works, and it must not be given to each cost separately when several share it. A regulatory check (registration, licensing, insurance, taxes) must not be dismissed on financial grounds. Each of these is BLOCKING. Startup budget: while costs are unresolved, no sentence anywhere in the plan, in any wording, may say that the budget, the ceiling, or the funding is sufficient, enough, or adequate, or that it covers launch. Two things are different and must be kept apart: the funding requirement of the included costs, which FINANCIAL FACTS give as a figure, and whether the founder's budget covers all costs, which is not established until the unresolved costs are known. A sentence that merges them is BLOCKING. Profit: while costs are unresolved, a sentence that says the business reaches profit, is profitable, or breaks even must say in that sentence that the figure covers the costs included in the model and that actual profitability depends on the unresolved costs. Without that it is BLOCKING.
The user message lists LINES FLAGGED BY CODE FOR WORDING, with the matched words in brackets. Judge every one of those lines under checks 1, 4, 16 and 17. Report the ones that are unsupported; ignore the ones that are already framed as an assumption, a hypothesis, a test, or a recommendation, or that sit inside a quoted founder answer.

You can check citations only against the EVIDENCE LEDGER. You cannot see the source pages; each ledger entry's page_excerpt is the passage of its page that code confirmed.
${LINE_NOTE}

OUTPUT
One JSON object and nothing else, with no code fence:
{"findings":[{"severity":"BLOCKING or MAJOR or MINOR","check":"short name of the check","root_problem":"one sentence stating the underlying defect","occurrences":[{"line":the number from the line ID,"section":"the section header","quote":"a short quote copied from that line, 5 to 20 words, without the line ID"}],"fix":"the correction to apply at every occurrence"}],"summary":"one sentence on the overall state of the plan"}
EVERY PLACE. Before you report a defect, search the whole plan for the same proposition in any wording, including a paraphrase, a summary of it in another section, and a table cell. List every such line as an occurrence. A correction made at one line must not leave the same unsupported statement standing at another.
GROUP BY ROOT PROBLEM. Report one finding for each underlying defect. When the same unsupported proposition, the same claim, or the same mistake appears in several places, that is one finding with several occurrences: list every line where it appears, in any section, and do not report it again as a separate finding. Do not merge different problems because they share a category: two different unsupported claims are two findings. Each occurrence names one line, and that line must contain the words that are wrong: quote them from that line. List an occurrence only for a line that has to change. Never list a line you judge acceptable; if you want to mention one, do it in the fix text. Grouping changes how findings are counted, not how strictly you review: report every line that needs to change. If there are no problems, return {"findings":[],"summary":"..."}. Never use em dashes.`;

const verifySystem = `You are verifying an automated revision of an IdeaToPlan business plan. This is not a new review. Do exactly the numbered tasks below and nothing else.

1. Each item gives an original finding, its root problem, and every edit made for it. Decide whether the root problem is gone from the edited passages. Read the whole After text of each edit, not only the words that changed: if the same unsupported proposition survives in another sentence of the passage, in different words, the finding is PARTLY_FIXED. FIXED means the root problem no longer appears in any of the edited passages. Status is FIXED, PARTLY_FIXED, or NOT_FIXED, with a note of at most 25 words that names what remains. Judge against the root problem and against FINANCIAL FACTS, the FOUNDER CONTEXT, and the EVIDENCE LEDGER. A passage that was removed no longer has the problem. Give exactly one verdict for every finding id listed. Occurrences that were not edited are counted by code.

2. For each edit, look only at its After text for a new BLOCKING defect, or a clearly material MAJOR defect, that the edit itself introduced and that was not in its Before text: a new factual claim, figure, or source ID that the EVIDENCE LEDGER or FINANCIAL FACTS do not support; a new absolute, comparative, or predictive claim stated as fact; a founder fact stated wrongly; a broken sentence or table row. Give exactly one entry in "edit_checks" for every edit unit shown, with an explicit verdict. The verdict is NEW_DEFECT only when the After text contains such a defect; then give its severity, a quote, the problem, and the fix. The verdict is NO_NEW_DEFECT in every other case, including when you considered a concern and concluded that the edit is consistent with the ledger and the financial facts; then leave severity, quote, problem, and fix empty. Never give NEW_DEFECT with an explanation that concludes there is no defect: an entry whose verdict and explanation disagree is discarded and the edit is treated as not verified. Do not report style, repetition, actionability, stale sources, or anything that was already in the Before text. Never report an original finding as a new defect: if an edit did not fully fix its finding, say so in that finding's verdict. Edits that were not applied, required sections, source IDs, and financial figures are checked by code and are not your concern.

3. PASSAGES LEFT UNCHANGED lists passages the reviser was asked to correct that stand as they were: the reviser returned them unchanged, gave no edit, or gave a replacement that code refused. Nothing was edited there. For each one, read the passage and decide whether the finding's root problem is in that passage as it stands: "present" is true when it is, false when the passage does not contain the problem (for example it is already worded as a labelled hypothesis). Do not assume the passage is acceptable because it was left alone, and do not assume it is defective because it was listed. Each passage is shown with its section and with any note about source dates that stands in that section. Read the passage in that context: when the finding is that a source is undated and not flagged, a note in the same section that accurately covers the passage's sources answers it, and the problem is not present in that passage. A note in a different section does not count, and a note that does not cover the passage's sources does not count. Give one answer for every unit and finding id listed. An answer of "present": false closes a finding that nobody edited, so it has to be justified: "reason" says, in one or two sentences about this finding, why the root problem is not in the passage; "basis" names what you rely on, "passage", "section_note", or "ledger"; and "quote" copies, exactly, the words you rely on from the passage, from a line of the same section, or from the evidence ledger entry. A false answer with no reason, with a reason that describes the problem as being there, or with a quote that is not in the passage, its section, or the ledger is discarded and the finding stays open. When you are not sure, answer true. For "present": true, give the reason and leave "quote" empty. Where a finding is about undated or dated sources, judge it against SOURCE DATES BY SECTION OF THE REVISED PLAN: what the section cites now, not the sources the finding listed when it was written.

4. WHOLE-PLAN REVIEW. The edits are not the whole plan. LINES TO REVIEW lists every line of the revised plan that cites a source, names a company, or speaks about competitors, the market, or research, whether or not it was edited. Read each one in the REVISED PLAN and give exactly one "plan_review" entry for it. Verdicts: SUPPORTED when every external statement on the line is stated by the ledger entries you name in "claim_ids", with the same subject, the same qualifiers (from, about, nearly, per month), the same date, the same population and sample, and no wider scope than the entry (one company is not all providers; a sample is not a population; two companies are not a ranking of five). LABELLED when every statement the ledger does not state is, in its own sentence, worded as a hypothesis, an assumption, a recommendation or reading of IdeaToPlan, or as not established; a label in a neighbouring sentence does not cover it. UNSUPPORTED when any statement of fact on the line is neither: quote the words and say what is missing. FROM_INTAKE when what the line says about the founder, the audience, or the offer is what the FOUNDER CONTEXT says: copy the words of the FOUNDER CONTEXT you rely on into "quote". A detail about the founder, the audience, or the offer that the FOUNDER CONTEXT does not state is UNSUPPORTED unless the line presents it as a proposed assumption or as not captured in the intake ("an audience that does not yet exist" is UNSUPPORTED when the intake does not say so). NO_EXTERNAL_CLAIM when the line states no fact about anyone: an instruction, a question, a test criterion, or arithmetic of this plan's own model. Lines with that verdict may be given together as line numbers in "no_external_claim" instead of one entry each. A statement that something is absent ("no page reviewed positions around X") is a statement of fact. A date given for a source must be the date SOURCES gives it. A line with a source ID is never NO_EXTERNAL_CLAIM. When you are not sure, answer UNSUPPORTED. A line you leave out holds the plan. The list is built by code from source IDs, company names, and a few topic words, so it can miss a line: if any other line of the REVISED PLAN states an external fact that is neither supported nor labelled, add an UNSUPPORTED entry for that line as well. FOUR RULES THAT WERE BROKEN IN AN EARLIER REVIEW. (1) A hypothesis label covers the assertion it is attached to and nothing else. "If interviews confirm it, a positioning could distinguish QYLAT from the logistics-focused paid services" is a hypothesis about the positioning; it still states as fact that those services are paid and logistics-focused, and that needs ledger entries or it is UNSUPPORTED. "Our read:" in front of "Expat US is focused on people who have already made the decision" is not a label: it names the author. (2) A survey finding keeps its population, its sample, and its scope. "The problem you are addressing is real and reported [S28]" is UNSUPPORTED when S28 is a survey of 600 travelers about paperwork: the entry does not say the founder's problem is real. (3) What substitutes cannot give the customer ("free content addresses the information need but not the planning need") is UNSUPPORTED unless an entry reports it or the sentence itself calls it a hypothesis. (4) In a company's profile, every row is about that company: judge it against the entries listed for that profile. A strength, a customer type, or a stage the entries do not state ("established firm", "people who have already decided", "a tool for people managing an active move") is UNSUPPORTED unless that sentence is labelled. Do not confuse the customer's own doubt with the plan's assurance: "they do not know whether it is realistic" reports what the customer wonders and asserts nothing about feasibility.

${SEVERITY}

${LINE_NOTE}

OUTPUT
One JSON object and nothing else, with no code fence:
{"verifications":[{"id":the finding id,"status":"FIXED or PARTLY_FIXED or NOT_FIXED","note":"one sentence"}],"unchanged":[{"unit":"the unit ID","id":the finding id,"present":true or false,"reason":"one or two sentences about this finding","basis":"passage or section_note or ledger","quote":"exact words relied on, or empty"}],"edit_checks":[{"unit":"the unit ID of the edit, for example U3","verdict":"NEW_DEFECT or NO_NEW_DEFECT","severity":"BLOCKING or MAJOR, or empty for NO_NEW_DEFECT","check":"short name, or empty","quote":"a short quote from the After text, or empty","problem":"one sentence, or empty","fix":"the exact change to make, or empty"}],"plan_review":[{"line":57,"verdict":"SUPPORTED or FROM_INTAKE or LABELLED or UNSUPPORTED or NO_EXTERNAL_CLAIM","claim_ids":["E2"],"quote":"the unsupported words, or the FOUNDER CONTEXT words relied on, or empty","problem":"one sentence, or empty"}],"no_external_claim":[12,15],"summary":"one sentence on the state of the plan after revision"}
There is one "edit_checks" entry for every edit unit shown, whether or not it introduced anything. Never use em dashes.`;

// What each section of this text cites, which of those sources are undated, and which of them no note covers.
const sectionDates = sectionsOfPlan.map((s) => {
  const usedHere = [];
  for (let i = s.start + 1; i < s.end; i++) (lines[i].match(/\b[SW]\d+\b/g) || []).forEach((id) => { if (srcById[id] && !usedHere.includes(id)) usedHere.push(id); });
  const undatedHere = usedHere.filter(isUndatedSource);
  const notes = dateNotesIn(s);
  const general = notes.filter((n) => NOTE_FOR_ALL.test(n.text) && (!/\b[SW]\d+\b/.test(n.text) || /\b(?:all|every|none of)\b/i.test(n.text)));
  return { no: s.no, title: s.title, used: usedHere, undated: undatedHere, dated: usedHere.filter((id) => !isUndatedSource(id)).map((id) => id + ' (' + srcById[id].published + ')'), note_lines: notes.map((n) => n.line), missing: undatedHere.filter((id) => !(general.length > 0 || notes.some((n) => new RegExp('\\b' + id + '\\b').test(n.text)))) };
});
// THE LINES A FINAL REVIEW HAS TO COVER. After a revision the verifier used to see the edited passages only, so a
// defect in a passage nobody edited was never read again. Every line of the revised plan that cites a source, names a
// company, or speaks about competitors, the market, or research has to be read, edited or not.
const EXTERNAL_CUE = /\b(?:competitors?|providers?|market|demand|surveys?|surveyed|stud(?:y|ies)|research|pages? reviewed|substitutes?|alternatives|industry|travelers|travellers|expats?|nomads?|benchmarks?|typical(?:ly)?|on average|trends?|communit(?:y|ies)|forums?|platforms?|LinkedIn|Facebook|Reddit|YouTube)\b/i;
// A general statement about how customers behave is an external assertion even with no topic word in it.
const BEHAVIOUR_CUE = /\b(?:people|customers?|professionals?|clients?|adults|buyers|prospects)\b[^.;]{0,90}\b(?:often|usually|tend to|generally|commonly|rarely|are (?:more |less |un)?likely|is (?:more |less |un)?likely|will (?:not )?(?:want|pay|buy|trust|need)|seek out|prefer)\b/i;
// What the plan says the founder has, lacks, or offers has to trace to the intake.
const FOUNDER_CUE = /\b(?:audience|email list|subscribers|followers|following|existing customers|paying customers|your (?:website|experience|background|network|revenue|clients|content)|the offer (?:involves|includes|covers|is)|(?:does|do) not (?:yet )?exist|starting from (?:zero|nothing|scratch)|you (?:already )?have (?:described|built|launched|published|no|an?)|firsthand experience|years in (?:business|operation))\b/i;
const isSourceRow = (l) => /^\|\s*(?:\*\*)?(?:Sources?|Source IDs?)(?:\*\*)?\s*\|\s*(?:\[?[SW]\d+\]?[\s,]*)+\|$/i.test(l);
//  A date note is decided by code, so it may hold nothing else. Every sentence of it has to say that sources are undated,
//  give a source a date, or carry the usual caveat. One sentence that says anything more, and the line needs a verdict.
const NOTE_CAVEAT = /\b(?:may|might|could) (?:have changed|no longer be (?:current|accurate|available)|be out of date|not reflect)\b|\bat the time of retrieval\b|\bsince retrieval\b/i;
const NOTE_DATING = /\b(?:dated|published|posted|updated|dates? from|(?:is|are) from)\b/i;
const noteSentences = (l) => l.replace(/^note:\s*/i, '').split(/(?<=[.!?;])\s+(?=[A-Za-z])/).map((x) => x.trim()).filter(Boolean);
const onlyAboutDates = (l) => noteSentences(l).every((x) => UNDATED_SAID.test(x) || (NOTE_DATING.test(x) && /\b(?:19|20)\d{2}\b/.test(x)) || (NOTE_CAVEAT.test(x) && x.split(/\s+/).length <= 24));
const isDateNote = (l) => (/\b[SW]\d+\b/.test(l) && /^(?:note:\s*)?(?:all |the )?(?:competitor |research )?(?:sources?|pages?)\b/i.test(l) && (UNDATED_SAID.test(l) || DATED_NOTE.test(l)) || /^note:/i.test(l) && /\b[SW]\d+\b/.test(l) && (UNDATED_SAID.test(l) || NOTE_DATING.test(l))) && onlyAboutDates(l);
const editedAt = {};
if (rev) (rev.edit_log || []).forEach((e) => { const span = String(e.after || '').split('\n').length; for (let k = 0; k < span; k++) editedAt[e.line + k] = e.unit; if (e.section_note_line) editedAt[e.section_note_line] = e.unit; });
const proseLines = attempt ? lines.map((l, i) => ({ l: l.trim(), n: i + 1 })).filter(({ l }) => l && !l.startsWith('#') && !/^\|?\s*:?-{2,}/.test(l) && !protectedText.has(l)) : [];
const kindOfLine = (l, n) => {
  if (isSourceRow(l)) return 'source_row';
  if (isDateNote(l)) return 'date_note';
  if (profileOwner[n]) return 'profile_row';
  if (/\b[SW]\d+\b/.test(l)) return 'cited';
  if (entities.some((e) => e.name_words && spaced(l).includes(' ' + e.name_words + ' '))) return 'company';
  if (EXTERNAL_CUE.test(l) || BEHAVIOUR_CUE.test(l)) return 'external';
  if (FOUNDER_CUE.test(l)) return 'founder';
  if (editedAt[n]) return 'edited';
  return '';
};
// Every listed line, with what the reviewer needs beside it. A source-only row states nothing, and a date note is
// checked by code against the source record (SOURCE DATE NOTE IS WRONG, DATE NOT IN THE SOURCE RECORD): neither needs
// a verdict from the model, and both are reported as covered by code.
const reviewLines = proseLines.map(({ l, n }) => ({ line: n, edited: editedAt[n] || '', kind: kindOfLine(l, n) })).filter((r) => r.kind).map((r) => {
  if (r.kind === 'profile_row' || profileOwner[r.line]) { r.company = profileOwner[r.line]; r.entries = evClaims.filter((c) => c.entity === profileOwner[r.line]).map((c) => c.claim_id); }
  if (r.kind === 'date_note') r.date_note_ok = !issues.some((x) => x.line === r.line && /SOURCE DATE NOTE IS WRONG|DATE NOT IN THE SOURCE RECORD/.test(x.type));
  return r;
});
const reviewCoverage = { prose_lines: proseLines.length, listed: reviewLines.length, needing_a_verdict: reviewLines.filter((r) => r.kind !== 'source_row' && r.kind !== 'date_note').length, by_kind: reviewLines.reduce((a, r) => { a[r.kind] = (a[r.kind] || 0) + 1; return a; }, {}), not_listed: proseLines.filter(({ n }) => !reviewLines.some((r) => r.line === n)).map(({ n }) => n) };
const citedInPlan = new Set(plan.match(/\b[SW]\d+\b/g) || []);
const shared = [
  '', 'GOAL BRIEF', fin.goal_brief,
  '', 'SECTIONS (the only correct structure)', ctx.section_list,
  '', fin.financial_model,
  '', 'SOURCES CITED IN THE PLAN (retrieved sources that the plan does not cite are not part of it and are not listed)', JSON.stringify(sources.filter((x) => citedInPlan.has(x.id)).map(({ id, kind, title, domain, published }) => ({ id, kind, title, domain, published })), null, 1),
  '', 'EVIDENCE LEDGER', ledger || 'None. No research was done for this plan.',
  '', 'RESEARCH GAPS', gaps || 'None recorded.',
  '', 'EXCLUDED CLAIMS (failed source-page verification; none of these is evidence)', excludedClaims.length ? excludedClaims.map((x) => x.claim_id + ' | ' + x.status.replace('_', ' ') + ' | ' + x.claim + ' | Reason: ' + String(x.reason || '').slice(0, 200)).join('\n') : 'None.',
];

let qaUser;
if (!attempt) {
  qaUser = [
    'PLAN TIER: ' + (G ? 'Growth (researched)' : 'Starter (no research was done)'),
    ...shared,
    '', 'AUTOMATED CHECK RESULTS', qcReport,
    '', 'LINES FLAGGED BY CODE FOR WORDING (matched words in brackets; report only the real problems)', claimLines,
    '', 'LINES THAT MAKE COMMERCIAL CLAIMS (matched words in brackets; judge the meaning of each under checks 21, 23, 24, 25 and 26)', commercialLines || 'None.',
    '', 'PLAN TO REVIEW', numbered,
  ].join('\n');
} else {
  const toVerify = (rev.first_findings || []).filter((f) => f.source === 'QA review' && f.severity !== 'MINOR');
  qaUser = [
    'PLAN TIER: ' + (G ? 'Growth (researched)' : 'Starter (no research was done)'),
    ...shared,
    '', 'ORIGINAL FINDINGS (verify each one)',
    toVerify.length ? toVerify.map((f) => 'id ' + f.id + ' | ' + f.severity + ' | ' + f.check + (f.section ? ' | ' + f.section : '') + '\n   Problem: ' + f.problem + (f.quote ? '\n   Original text: ' + f.quote : '') + (f.fix ? '\n   Requested fix: ' + f.fix : '')).join('\n') : 'None.',
    '', 'EDITS APPLIED (check only these lines for new defects)',
    (rev.edit_log || []).length ? rev.edit_log.map((e) => 'Finding ' + e.issue + ' | now at L' + e.line + '\n   Before: ' + e.before + '\n   After: ' + (e.after || '(line removed)')).join('\n') : 'None.',
    '', 'EDITS NOT APPLIED', (rev.unresolved || []).length ? rev.unresolved.map((u) => '- ' + u).join('\n') : 'None.',
    '', 'REVISED PLAN', numbered,
  ].join('\n');
}

if (attempt) {
  // Verification is narrow: only findings whose edit was applied, each with its Before and After text. The full plan is not sent.
  const byFinding = {};
  (rev.first_findings || []).forEach((f) => { byFinding[f.id] = f; });
  const editLog = rev.edit_log || [];
  const pairs = (rev.first_findings || []).filter((f) => f.source === 'QA review' && f.severity !== 'MINOR' && editLog.some((e) => (e.issues || []).includes(f.id)));
  qaUser = [
    'PLAN TIER: ' + (G ? 'Growth (researched)' : 'Starter (no research was done)'),
    '', ctx.founder_context,
    '', (fin.financial_model.split('SCENARIO TABLE')[0] || '').trim(),
    '', 'EVIDENCE LEDGER', ledger || 'None. No research was done for this plan.',
    '', 'FINDINGS AND THEIR EDITS (give one verdict per id)',
    pairs.length ? pairs.map((f) => 'id ' + f.id + ' | ' + f.severity + ' | ' + f.check + '\n   Root problem: ' + f.problem + (f.fix ? '\n   Requested fix: ' + f.fix : '') + editLog.filter((e) => (e.issues || []).includes(f.id)).map((e) => '\n   Edit ' + e.unit + (e.issues.length > 1 ? ' (one replacement that also serves ' + e.issues.filter((x) => x !== f.id).join(', ') + ')' : '') + '\n     Before: ' + e.before + '\n     After: ' + (e.after || '(passage removed)') + (e.section_note ? '\n     Note placed above this table by the same edit: ' + e.section_note : '')).join('')).join('\n') : 'None. Return empty lists.',
    '', 'PASSAGES LEFT UNCHANGED (say for each unit and finding id whether the root problem is present in the passage)',
    (rev.unchanged_units || []).some((u) => (u.issues || []).some((id) => byFinding[id] && byFinding[id].source === 'QA review')) ? (rev.unchanged_units || []).flatMap((u) => (u.issues || []).filter((id) => byFinding[id] && byFinding[id].source === 'QA review').map((id) => 'unit ' + u.unit + ' | id ' + id + ' | ' + byFinding[id].severity + ' | ' + byFinding[id].check + '\n   Root problem: ' + byFinding[id].problem + '\n   Section: ' + (sectionAt(u.line || u.start) ? sectionAt(u.line || u.start).no + '. ' + sectionAt(u.line || u.start).title : 'not found') + '\n   Notes about source dates in that section: ' + (sectionAt(u.line || u.start) && dateNotesIn(sectionAt(u.line || u.start)).length ? dateNotesIn(sectionAt(u.line || u.start)).map((n) => '[L' + n.line + '] ' + n.text.slice(0, 260)).join(' | ') : 'none') + '\n   Passage, unchanged: ' + u.text)).join('\n') : 'None.',
    '', 'SOURCE DATES BY SECTION OF THE REVISED PLAN (judge every finding about undated or dated sources against this list, not against the sources named in the finding: a source the section no longer cites needs no note there)',
    sectionDates.filter((d) => d.used.length).map((d) => 'Section ' + d.no + '. ' + d.title + ' | cites ' + d.used.join(', ') + ' | undated: ' + (d.undated.join(', ') || 'none') + ' | dated: ' + (d.dated.join(', ') || 'none') + ' | date notes at: ' + (d.note_lines.map((n) => 'L' + n).join(', ') || 'none') + ' | undated sources with no note: ' + (d.missing.join(', ') || 'none')).join('\n') || 'No section cites a source.',
    '', 'SOURCES CITED IN THE REVISED PLAN', JSON.stringify(sources.filter((x) => citedInPlan.has(x.id)).map(({ id, kind, title, domain, published }) => ({ id, kind, title, domain, published })), null, 1),
    '', 'LINES TO REVIEW (' + reviewCoverage.needing_a_verdict + ' lines need a verdict; what each one is about is in brackets)',
    reviewLines.filter((r) => r.kind !== 'source_row' && r.kind !== 'date_note').map((r) => 'L' + r.line + ' [' + (r.company ? 'profile of ' + r.company + (r.entries.length ? '; its ledger entries: ' + r.entries.join(', ') : '; no ledger entry is about it') : r.kind === 'founder' ? 'about the founder, the audience, or the offer: check it against FOUNDER CONTEXT' : r.kind === 'external' ? 'uncited statement about customers, channels, or the market' : r.kind === 'company' ? 'names a company' : r.kind === 'cited' ? 'cites a source' : 'edited') + (r.edited ? '; edited by ' + r.edited : '') + ']').join('\n') || 'None.',
    '', 'NOT ON THE LIST (' + reviewCoverage.not_listed.length + ' other lines of the plan; code found no source, company, or cue on them, and you may still report any of them)', reviewCoverage.not_listed.map((n) => 'L' + n).join(', ') || 'None.',
    '', 'COMPARISONS CODE COULD NOT DECIDE (the words of these lines are not in the entries they cite; that may be a paraphrase or an expansion, and your plan_review verdict for the line decides it)',
    issues.filter((x) => x.needs_judgment && x.line).map((x) => 'L' + x.line + ' | ' + x.type + ' | ' + x.detail.slice(0, 300)).join('\n') || 'None.',
    '', 'REVISED PLAN (complete, for the whole-plan review)', numbered,
  ].join('\n');
}

return {
  attempt,
  t_ms: Date.now(),
  det_issues: issues,
  qc_report: qcReport,
  numbered_plan: numbered,
  derived_figures: derived,
  section_dates: sectionDates,
  review_lines: reviewLines,
  review_coverage: reviewCoverage,
  qa_payload: JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', max_tokens: attempt ? 16000 : 8000, temperature: 0, messages: [{ role: 'system', content: attempt ? verifySystem : reviewSystem }, { role: 'user', content: runDate.line + '\n\n' + qaUser }] }),
};
