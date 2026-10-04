// Citation Check: deterministic checks on the current plan, each with a severity, then builds the QA request.
// Pass 1 (first review) asks QA for a full review. Pass 2 (after a revision) asks QA only to verify the revision.
const ctx = $('Founder Context').first().json;
const fin = $('Compute Financials').first().json;
const G = ctx.tier === 'Growth';

let plan = '', attempt = 0, rev = null;
try { const r = $('Apply Revisions').first().json; if (r && typeof r.text === 'string' && r.text) { plan = r.text; attempt = 1; rev = r; } } catch (e) {}
let assembly = [];
try { const asm = $('Assemble Plan').first().json; if (!plan) plan = asm.text || ''; assembly = asm.assembly_notes || []; } catch (e) {}

let sources = [], ledger = '', gaps = '', unmatched = 0, truncated = false, entitiesJson = '[]', integrity = null;
if (G) {
  try { const ev = $('Build Evidence').first().json; sources = JSON.parse(ev.sources || '[]'); ledger = ev.research_ledger || ''; gaps = ev.research_gaps || ''; unmatched = ev.unmatched_markers || 0; entitiesJson = ev.entities || '[]'; try { integrity = JSON.parse(ev.source_integrity || 'null'); } catch (e2) {} } catch (e) {}
  try { truncated = $('Growth Plan Generator1').first().json.choices[0].finish_reason === 'length'; } catch (e) {}
}
const known = new Set(sources.map((s) => s.id));
const issues = [];
const short = (l) => l.trim().slice(0, 200);
const add = (severity, type, detail, quote, line) => issues.push({ severity, type, detail, quote: quote || '', line: line || null });

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
  if (/\[W\d+\]/.test(t) && numRe.test(t) && !/\[S\d+\]/.test(t)) add('MAJOR', 'NUMBER SUPPORTED ONLY BY SEARCH SNIPPET', 'A figure is supported only by a search listing.', short(t), L);
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
const qualified = /directional|unverified|not (?:been )?independently|undated|no publication date|absence of a publication date|treat (?:this|these|it|them)|vendor blog|one source estimates|estimates? (?:the|that)|according to/i;
const segmentsOf = (t) => /^\|.*\|$/.test(t) ? [t] : t.split(/(?<=[.!?;])\s+/);
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
  segmentsOf(t).forEach((seg) => {
    const cited = [...new Set(seg.match(/\b[SW]\d+\b/g) || [])].filter((id) => srcById[id]);
    if (!cited.length) return;
    const sp = spaced(seg);
    const named = entities.filter((e) => sp.includes(' ' + e.name_words + ' '));
    const about = rowEntity && !named.includes(rowEntity) ? named.concat([rowEntity]) : named;
    // 1. The text is about one company but cites another company's page.
    if (about.length) cited.forEach((id) => {
      const own = entityOfSource[id];
      const tied = about.some((e) => (e.source_ids || []).includes(id) || evClaims.some((c) => (c.source_ids || []).includes(id) && spaced(c.claim).includes(' ' + e.name_words + ' ')));
      if (tied) return;
      if (own) add('BLOCKING', 'CITATION ATTACHED TO THE WRONG COMPANY', 'This text is about ' + about.map((e) => e.name).join(' and ') + ', but it cites ' + id + ', which is the page of ' + own.name + ' (' + srcById[id].domain + '). The ledger ties ' + about[0].name + ' to ' + (about[0].source_ids || []).join(', ') + '.', short(seg), L);
      else if (isRow) add('BLOCKING', 'CITATION NOT TIED TO THIS COMPANY', 'This row is about ' + about.map((e) => e.name).join(' and ') + ', but it cites ' + id + ' (' + srcById[id].domain + '), and no ledger entry ties that source to this company. The ledger ties ' + about[0].name + ' to ' + (about[0].source_ids || []).join(', ') + '.', short(seg), L);
    });
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
    if (yr && /\b(source|entry|page|report|listing)\b/i.test(seg) && !cited.some((id) => String(srcById[id].published || '').startsWith(yr[1]))) add('BLOCKING', 'SOURCE DATE NOTE ON THE WRONG SOURCE', 'The text says its source is dated ' + yr[1] + ', but ' + cited.map((id) => id + ' is recorded as published ' + srcById[id].published).join('; ') + '.', short(seg), L);
    // 4. Warning, not a blocker: a figure from a weak source stated with no qualifier. Repeating it does not make it established.
    if (!qualified.test(seg) && statsIn(seg).some((tok) => !ownStats.has(tok))) cited.forEach((id) => {
      const why = weakSource(id);
      if (why && statsIn(seg).some((tok) => statOwners[tok] && statOwners[tok].has(id))) add('MAJOR', 'UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION', id + ' is ' + (why === 'undated' ? 'an undated source' : 'a ' + why) + '. Its figure is stated here as fact' + (sectionNo === 1 ? ', in the Executive Summary' : '') + '. Say whose estimate it is and that it has not been verified, every time it appears.', short(seg), L);
    });
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
- BLOCKING: a defect that makes the plan materially unreliable to deliver. Only these: a fabricated fact or an invented source; an incorrect material figure (one that contradicts FINANCIAL FACTS, the ledger, or another part of the plan); a broken or missing source reference on a material factual claim; a source ID attached to a claim the ledger does not link to that source; a citation attached to the wrong company; a cited price or statistic given with a different amount, currency, scope, geography, or year than its ledger entry, or with one of those left out so that it reads as broader than the source; a note about a source's date placed on a different source; a founder fact stated wrongly; a required section missing; a critical contradiction that makes the plan materially unreliable.
- MAJOR: should be fixed before delivery, but does not make the plan false. An unsupported conclusion. Evidence overstated (for example "suggests sustained demand", or a gap or opportunity stated as a finding), unless it creates a materially false factual claim. An important assumption presented as a fact, including feasibility language with no evidence behind it. An unsupported comparative claim. A strategic inconsistency between sections. Stale or undated evidence used without qualification. A search listing used as substantive evidence. A recommendation built on an unknown fact treated as known. Unknown information written as none or zero. A channel recommendation or rejection resting on an age or demographic stereotype. Adjacent-market pricing presented as evidence of what this offer should cost. Scenario wording that could lead the reader to take the Base scenario for the year-one result. A figure from an undated source, a vendor blog, or a list article stated as fact without saying whose estimate it is.
- MINOR: repetition, wording, organization, formatting, and clarity issues that are not material.
When unsure between BLOCKING and MAJOR, choose MAJOR.`;

const LINE_NOTE = 'Every non-empty line of the plan starts with a line ID such as [L12]. The IDs are not part of the plan; they are how you point at a line. A line marked computed, such as [L40 computed], was produced by code and cannot be edited: never point a finding at a computed line. If a computed table conflicts with the prose, point the finding at the prose line.';

const reviewSystem = `You are the final quality reviewer for IdeaToPlan business plans. A plan with unsupported claims must not reach a client. You do not rewrite the plan. You find real problems and say exactly how to fix each one. Report only problems that need a change. Never list something you checked and found correct.

${SEVERITY}

CHECKS
1. Unsupported claims: statements about the market, customers, competitors, prices, costs, benchmarks, trends, regulation, tax, or statistics with no source ID. In a Starter plan no research was done, so any such statement is unsupported.
2. Citations: a source ID on a claim the EVIDENCE LEDGER does not link to that source; a claim stated more strongly or more broadly than the ledger; detail added that the ledger entry does not state; any source name, study, author, URL, or date not in SOURCES. One source ID at the end of a paragraph or table row covers the claims in it.
3. Research interpretation: analysis presented as a finding. "None of the competitors reviewed does X" does not establish that X is underserved or that customers want X. Flag "underserved", "gap", or "opportunity" stated as fact without ledger evidence of demand, and say how to reword it as IdeaToPlan analysis that requires validation.
4. Known and unknown: any statement that the founder lacks something (no audience, no website, no customers, starting from zero) that the FOUNDER CONTEXT does not state. A blank revenue answer described as "not provided" when the form defines it as pre-revenue. A recommendation that silently assumes an unknown fact instead of reasoning conditionally. Advice to create something the founder already has, or to repeat work the founder has already done. Internal labels such as UNKNOWN or NOT PROVIDED printed in the plan.
5. Financial consistency: do not recompute the financial tables; code produced them. Check that every financial figure in the prose, the Executive Summary, and the callouts matches FINANCIAL FACTS exactly, and that no figure appears that is in neither FINANCIAL FACTS, the FOUNDER CONTEXT, nor the ledger. Flag any assumption described as verified, validated, typical, standard, realistic, or conservative. Flag a price from a different kind of service presented as evidence of what this offer should cost, rather than as a reference point for an untested assumption.
6. Budget: the ceiling treated as a spending target. A cost shown as "Amount not yet established" that the plan gives a figure for, calls free, or leaves out where it discusses costs, profit, or viability. A recommendation that depends on paid advertising when the Paid acquisition line in FINANCIAL FACTS says the model contains no committed advertising cost, or a paid channel recommended as part of the strategy with no matching Budget item. The COST REVIEW printed in the plan as a list.
7. Channels: a channel recommended by default, or ruled in or out by an age or demographic stereotype, or a verdict where the evidence only supports a test. Founder-reported traction or assets that the recommendation ignores.
8. Stale data: prices, rules, features, or market figures from a source more than 24 months old or undated, not flagged as such.
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
20. Source quality: a W source (search listing) used as substantive evidence for anything beyond a company's or page's existence and self-description. A market figure or trend resting on a source whose kind or domain shows a vendor blog, list article, or directory. A material claim whose ledger entry is itself vague about what the source states. You cannot open the source pages, so do not report "could not confirm the page" as a finding. Judge only the sources the plan cites. A source that was retrieved but is never cited is not part of the delivered plan and is not printed in its Sources section: never report it, and never report a claim as possibly resting on it.
21. Attribution: for every cited claim, find the EVIDENCE LEDGER entry it rests on. The source ID must be one of that entry's source_ids, and any company the sentence names must be the company that entry is about. A source ID that exists in SOURCES but belongs to a different company, or to a ledger entry that says something else, is BLOCKING: a real ID on the wrong claim is as serious as an invented one. A price must keep its currency, what it buys, and whether it is a fixed price, a starting price, or a range, exactly as the ledger entry states. A statistic must keep the population, geography, and year the ledger entry states. A note about a source's age must sit on the source it describes: check it against that source's published value in SOURCES. A figure from a source that is undated, a vendor blog, or a list article must be worded as that source's estimate every time it appears, including in the Executive Summary and the Viability Assessment; repeating a figure does not make it established. Ledger entries marked attribution remapped were moved by code to the page of the company they name: the source_ids they carry now are the correct ones.
The user message lists LINES FLAGGED BY CODE FOR WORDING, with the matched words in brackets. Judge every one of those lines under checks 1, 4, 16 and 17. Report the ones that are unsupported; ignore the ones that are already framed as an assumption, a hypothesis, a test, or a recommendation, or that sit inside a quoted founder answer.

You can check citations only against the EVIDENCE LEDGER. You cannot see the source pages.
${LINE_NOTE}

OUTPUT
One JSON object and nothing else, with no code fence:
{"findings":[{"severity":"BLOCKING or MAJOR or MINOR","check":"short name of the check","root_problem":"one sentence stating the underlying defect","occurrences":[{"line":the number from the line ID,"section":"the section header","quote":"a short quote copied from that line, 5 to 20 words, without the line ID"}],"fix":"the correction to apply at every occurrence"}],"summary":"one sentence on the overall state of the plan"}
GROUP BY ROOT PROBLEM. Report one finding for each underlying defect. When the same unsupported proposition, the same claim, or the same mistake appears in several places, that is one finding with several occurrences: list every line where it appears, in any section, and do not report it again as a separate finding. Do not merge different problems because they share a category: two different unsupported claims are two findings. Each occurrence names one line. Grouping changes how findings are counted, not how strictly you review: report every line that needs to change. If there are no problems, return {"findings":[],"summary":"..."}. Never use em dashes.`;

const verifySystem = `You are verifying an automated revision of an IdeaToPlan business plan. This is not a new review. Do exactly two things and nothing else.

1. Each item gives an original finding, its root problem, and every edit made for it. Decide whether the root problem is gone from the edited passages. Read the whole After text of each edit, not only the words that changed: if the same unsupported proposition survives in another sentence of the passage, in different words, the finding is PARTLY_FIXED. FIXED means the root problem no longer appears in any of the edited passages. Status is FIXED, PARTLY_FIXED, or NOT_FIXED, with a note of at most 25 words that names what remains. Judge against the root problem and against FINANCIAL FACTS, the FOUNDER CONTEXT, and the EVIDENCE LEDGER. A passage that was removed no longer has the problem. Give exactly one verdict for every finding id listed. Occurrences that were not edited are counted by code.

2. For each edit, look only at its After text for a new BLOCKING defect, or a clearly material MAJOR defect, that the edit itself introduced and that was not in its Before text: a new factual claim, figure, or source ID that the EVIDENCE LEDGER or FINANCIAL FACTS do not support; a new absolute, comparative, or predictive claim stated as fact; a founder fact stated wrongly; a broken sentence or table row. Report nothing else. Do not report style, repetition, actionability, stale sources, or anything that was already in the Before text. Never report an original finding as a new defect: if an edit did not fully fix its finding, say so in that finding's verdict. Edits that were not applied, required sections, source IDs, and financial figures are checked by code and are not your concern.

${SEVERITY}

${LINE_NOTE}

OUTPUT
One JSON object and nothing else, with no code fence:
{"verifications":[{"id":the finding id,"status":"FIXED or PARTLY_FIXED or NOT_FIXED","note":"one sentence"}],"new_defects":[{"unit":"the unit ID of the edit that introduced it, for example U3","severity":"BLOCKING or MAJOR","check":"short name","quote":"a short quote from the After text","problem":"one sentence","fix":"the exact change to make"}],"summary":"one sentence on the state of the plan after revision"}
If the edits introduced nothing new, "new_defects" is an empty list. Never use em dashes.`;

const citedInPlan = new Set(plan.match(/\b[SW]\d+\b/g) || []);
const shared = [
  '', 'GOAL BRIEF', fin.goal_brief,
  '', 'SECTIONS (the only correct structure)', ctx.section_list,
  '', fin.financial_model,
  '', 'SOURCES CITED IN THE PLAN (retrieved sources that the plan does not cite are not part of it and are not listed)', JSON.stringify(sources.filter((x) => citedInPlan.has(x.id)).map(({ id, kind, title, domain, published }) => ({ id, kind, title, domain, published })), null, 1),
  '', 'EVIDENCE LEDGER', ledger || 'None. No research was done for this plan.',
  '', 'RESEARCH GAPS', gaps || 'None recorded.',
];

let qaUser;
if (!attempt) {
  qaUser = [
    'PLAN TIER: ' + (G ? 'Growth (researched)' : 'Starter (no research was done)'),
    ...shared,
    '', 'AUTOMATED CHECK RESULTS', qcReport,
    '', 'LINES FLAGGED BY CODE FOR WORDING (matched words in brackets; report only the real problems)', claimLines,
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
    pairs.length ? pairs.map((f) => 'id ' + f.id + ' | ' + f.severity + ' | ' + f.check + '\n   Root problem: ' + f.problem + (f.fix ? '\n   Requested fix: ' + f.fix : '') + editLog.filter((e) => (e.issues || []).includes(f.id)).map((e) => '\n   Edit ' + e.unit + (e.issues.length > 1 ? ' (one replacement that also serves ' + e.issues.filter((x) => x !== f.id).join(', ') + ')' : '') + '\n     Before: ' + e.before + '\n     After: ' + (e.after || '(passage removed)')).join('')).join('\n') : 'None. Return empty lists.',
  ].join('\n');
}

return {
  attempt,
  t_ms: Date.now(),
  det_issues: issues,
  qc_report: qcReport,
  numbered_plan: numbered,
  derived_figures: derived,
  qa_payload: JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', max_tokens: attempt ? 3000 : 8000, temperature: 0, messages: [{ role: 'system', content: attempt ? verifySystem : reviewSystem }, { role: 'user', content: qaUser }] }),
};
