// Build Evidence: decides which candidate claims enter the evidence ledger, using the fetched pages and the
// verifier's answers, and writes the ledger, the source list and the research gaps.
//
// A claim enters the ledger only when ALL of these hold for one of its candidate sources:
//  - the page was fetched and has readable text;
//  - the verifier's answer for that page is readable and well formed, and its verdict is "supported";
//  - the supporting excerpt is found in the fetched page text;
//  - every number the claim states is in that excerpt;
//  - the price checks pass: a starting price is not a fixed price, a range must be stated as a range, a per-month
//    or living-cost figure is not a service price, and the currency matches;
//  - a company the claim names is named on the page;
//  - none of the verifier's reported checks is a mismatch or missing;
//  - the source is credible for this kind of claim, with the basis recorded.
// Anything else is excluded with its reason and reported as a research gap. A fetch failure, an empty page, or an
// unreadable verifier answer never counts as verified. Source and claim IDs are the ones Collect Evidence issued.
//
// EXCERPT MATCHING: the only normalization is whitespace. Runs of spaces, tabs, line breaks, non-breaking spaces
// and zero-width characters become one space, in both the excerpt and the page text. Letter case, punctuation,
// quotes and dashes must match exactly. An excerpt may join passages with " ... "; each passage is matched alone.
const ce = $('Collect Evidence').first().json;
const fp = $('Fetch Source Pages').first().json;
const sources = JSON.parse(ce.sources || '[]');
const candidates = JSON.parse(ce.candidates || '[]');
const entityList = JSON.parse(ce.entities || '[]');
const gaps = JSON.parse(ce.gaps || '[]');
const pages = JSON.parse(fp.pages || '[]');
let requests = [];
try { requests = $('Build Verification Request').all().map((i) => i.json); } catch (e) {}
let responses = [];
try { responses = $('Verify Claims').all().map((i) => i.json); } catch (e) {}

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

const byId = (id) => sources.find((s) => s.id === id);
const pageOf = {};
pages.forEach((p) => { pageOf[p.source_id] = p; });
const ws = (v) => String(v === undefined || v === null ? '' : v).replace(/[\s ​‌‍﻿]+/g, ' ').trim();
const spaced = (v) => ' ' + String(v || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

// ---------- 1. Read the verifier's answers. One answer per page. ----------
const VERDICTS = ['supported', 'contradicted', 'unverifiable'];
const CHECKS = ['entity', 'amount', 'currency', 'scope', 'qualifier', 'period', 'population', 'geography', 'date'];
const CHECK_VALUES = ['match', 'mismatch', 'not_stated', 'not_applicable'];
const RATINGS = ['high', 'medium', 'low'];
const answers = {};
const pageMeta = {};
const verifierProblems = [];
let verifyCost = 0;
const readBatch = (reqs, resps) => reqs.forEach((req, i) => {
  if (!req || req.none || !req.source_id) return;
  const res = resps[i];
  const fail = (why) => { verifierProblems.push({ source_id: req.source_id, claim_ids: req.claim_ids, problem: why }); (req.claim_ids || []).forEach((cid) => { answers[cid + '|' + req.source_id] = { malformed: why }; }); };
  if (!res) return fail('the verifier returned nothing for this page');
  if (res.usage && typeof res.usage.cost === 'number') verifyCost += res.usage.cost;
  if (res.error) return fail('the verifier call failed: ' + String((res.error && res.error.message) || res.error).slice(0, 160));
  const content = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
  if (typeof content !== 'string' || !content.trim()) return fail('the verifier returned no text');
  let obj = null;
  const a = content.indexOf('{');
  const b = content.lastIndexOf('}');
  if (a >= 0 && b > a) { try { obj = JSON.parse(content.slice(a, b + 1)); } catch (e) {} }
  if (!obj || !Array.isArray(obj.claims)) return fail('the verifier output is not the required JSON');
  if (obj.source_id !== req.source_id) return fail('the verifier output names source ' + String(obj.source_id).slice(0, 20) + ' instead of ' + req.source_id);
  pageMeta[req.source_id] = { date_shown: typeof obj.date_shown === 'string' ? obj.date_shown : '', publisher: typeof obj.publisher === 'string' ? obj.publisher : '', injection_suspected: obj.injection_suspected === true };
  (req.claim_ids || []).forEach((cid) => {
    const mine = obj.claims.filter((x) => x && x.claim_id === cid);
    const bad = (why) => { verifierProblems.push({ source_id: req.source_id, claim_ids: [cid], problem: why }); answers[cid + '|' + req.source_id] = { malformed: why }; };
    if (mine.length !== 1) return bad(mine.length ? 'the verifier answered this claim more than once' : 'the verifier did not answer this claim');
    const x = mine[0];
    if (!VERDICTS.includes(x.verdict)) return bad('the verdict is not one of supported, contradicted, unverifiable');
    if (typeof x.excerpt !== 'string' || typeof x.reasoning !== 'string' || !x.reasoning.trim()) return bad('the excerpt or the reasoning is missing');
    if (!x.checks || typeof x.checks !== 'object' || CHECKS.some((k) => !CHECK_VALUES.includes(x.checks[k]))) return bad('the checks are missing or have an unknown value');
    const cr = x.credibility;
    if (!cr || typeof cr !== 'object' || !RATINGS.includes(cr.rating) || typeof cr.first_party !== 'boolean' || typeof cr.origin_stated !== 'boolean' || typeof cr.basis !== 'string' || cr.basis.trim().length < 15) return bad('the credibility assessment is missing or has no stated basis');
    answers[cid + '|' + req.source_id] = x;
  });
});
readBatch(requests, responses);

// Corrections. A contradicted claim may come with a proposal of what the page says instead. Build Recheck Request
// turned each proposal into a new candidate claim, and a second, separate verifier call checked it. Those answers are
// read exactly like the first ones, and the new claims then pass through the same code checks below. Nothing is
// accepted because the first verifier proposed it.
let recheckRequests = [];
try { recheckRequests = $('Build Recheck Request').all().map((i) => i.json).filter((r) => r && !r.none && r.source_id); } catch (e) {}
let recheckResponses = [];
try { recheckResponses = $('Verify Corrections').all().map((i) => i.json); } catch (e) {}
readBatch(recheckRequests, recheckResponses);
// The company a claim opens with, as the claim writes it: the capitalised words before the first verb ("Reelo says",
// "Move One Relocations offers"). Empty when the claim does not open with a name.
const NAME_STOP = /^(?:says?|said|states?|stated|offers?|provides?|serves?|is|are|was|were|has|have|lists?|publishes|describes?|charges?|helps?|sells?|positions?|focuse?s|targets?|runs?|operates?|reports?|notes?|claims?|advertises?|markets?|speciali[sz]es?|delivers?|supports?|covers?|does|gives?|includes?|calls?|presents?|bills?|prices?|combines?|assists?|creates?|guides?|handles?|works?|shows?|uses?|which|that|who)$/i;
const leadName = (text) => {
  const tokens = String(text || '').trim().replace(/^ADJACENT\s*:\s*/i, '').replace(/^the\s+/i, '').split(/\s+/);
  const out = [];
  let stopped = false;
  for (let i = 0; i < Math.min(tokens.length, 7); i++) {
    if (NAME_STOP.test(tokens[i].replace(/[.,;:]+$/, ''))) { stopped = true; break; }
    out.push(tokens[i]);
    if (/[,;:]$/.test(tokens[i])) break;
  }
  if (!stopped || !out.length || out.length > 5) return '';
  const name = out.join(' ').replace(/['’]s$/, '').replace(/[.,;:]+$/, '');
  return /^[A-Z0-9]/.test(name) ? name : '';
};
// COMPANY IDENTITY. A claim about a company (a competitor question, or a source the research tool called a company
// page) that opens with a company name always carries that company. It is never left without one, because a claim
// with no company is not checked against the page for who it is about, and its source is not tied to anyone.
// - Collect Evidence sets the company when a source key spells it. Anything it left empty is resolved here.
// - A recovered claim takes its company from its own text, never from the claim it replaces: the original may have
//   named the wrong company, which is often why it was contradicted.
// - The name is then checked against the fetched page like every other: the page must name it, and the page must not
//   be the site of a different known company. Otherwise the claim is excluded, with the reason.
// A claim that does not open with a company name (a market figure, a search listing) is not a company claim.
const squashName = (v) => spaced(v).replace(/ /g, '');
const isCompanyClaim = (c) => /company/i.test(c.source_type || '') || /^C\d/.test(c.question || '');
// Words a claim can open with that are not a company: the subject is a group, a thing, or the page's own "we".
const NOT_A_NAME = /^(?:it|its|they|their|this|these|those|our|we|services?|customers?|clients?|people|many|most|some|all|each|pricing|prices?|plans?|packages?|companies|providers?|competitors?|users?|members?|relocation|digital|remote|expats?|nomads?|founders?|research|studies|surveys?|reports?|data)$/i;
// Returns { entity } when the company is established, { unestablished: name } when the claim names a company whose
// identity the page does not carry, and null when the claim does not open with a company name.
const entityFor = (claimText, sid) => {
  const lead = spaced(String(claimText || '').replace(/^ADJACENT\s*:\s*/i, '').replace(/^the\s+/i, ''));
  const known = entityList.filter((e) => e.name_words && lead.startsWith(' ' + e.name_words + ' ')).sort((a, b) => b.name_words.length - a.name_words.length)[0];
  if (known) return { entity: { key: known.key, name: known.name, name_words: known.name_words } };
  const name = leadName(claimText);
  const nameWords = spaced(name).trim();
  if (nameWords.length < 2 || NOT_A_NAME.test(nameWords.split(' ')[0])) return null;
  // A name no source key spelled. It is accepted only when the page itself carries it: the site name, the page title,
  // or the publisher the verifier read on the page. A mention somewhere in the text of someone else's page is not enough.
  const key = squashName(name);
  const src = byId(sid) || {};
  const page = pageOf[sid] || {};
  const site = squashName(src.site);
  const carried = (key.length >= 5 && site.length >= 5 && (site.startsWith(key) || key.startsWith(site))) || spaced((page.title || '') + ' ' + (src.title || '')).includes(' ' + nameWords + ' ') || spaced((pageMeta[sid] || {}).publisher).includes(' ' + nameWords + ' ');
  return carried ? { entity: { key: key.length >= 5 ? key : '', name, name_words: nameWords } } : { unestablished: name };
};
// A known company, other than the one named, whose own site a source is on. Null when the named company is one of the site's owners.
const siteOwner = (sid, name) => { const site = (byId(sid) || {}).site; const owners = site ? entityList.filter((e) => (e.sites || []).includes(site)) : []; return owners.length && !owners.some((e) => e.name === name) ? owners[0] : null; };
const firstPass = {};
candidates.forEach((c) => { firstPass[c.claim_id] = c; });
recheckRequests.forEach((r) => (r.corrections || []).forEach((k) => {
  const o = firstPass[k.corrects];
  if (!o || !k.claim_id || firstPass[k.claim_id]) return;
  candidates.push({ claim_id: k.claim_id, call: o.call, question: o.question, claim: k.claim, source_type: o.source_type, reported_published: 'date not shown', url_given: '', markers: [], entity: null, candidate_source_ids: [r.source_id], candidate_basis: [k.kind === 'payment_wording_removed' ? 'research claim ' + k.corrects + ' without "paid"' : 'the fetched page, after research claim ' + k.corrects + ' was contradicted'], corrects: k.corrects, ...(k.kind ? { correction_kind: k.kind } : {}) });
}));
// Every company claim that has no company yet, first-pass or recovered, gets the one it names.
const identityResolved = [];
candidates.forEach((c) => {
  if (!(c.corrects || (!c.entity && isCompanyClaim(c)))) return;
  const r = entityFor(c.claim, (c.candidate_source_ids || [])[0]);
  c.entity = r && r.entity ? r.entity : null;
  if (r && r.entity) identityResolved.push(c.claim_id);
  if (r && r.unestablished) c.identity_unestablished = r.unestablished;
});

// ---------- 2. Deterministic checks. ----------
const CUR = { '$': 'USD', 'us$': 'USD', usd: 'USD', dollars: 'USD', dollar: 'USD', '€': 'EUR', eur: 'EUR', euros: 'EUR', euro: 'EUR', '£': 'GBP', gbp: 'GBP', pounds: 'GBP', cad: 'CAD', aud: 'AUD', thb: 'THB', baht: 'THB' };
const UNIT = { k: 'k', thousand: 'k', m: 'm', million: 'm', b: 'b', bn: 'b', billion: 'b', trillion: 't' };
const figRe = /(US\$|USD|EUR|GBP|CAD|AUD|THB|\$|€|£)?\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|m|bn|b|million|billion|thousand|trillion)\b)?(\s?%)?(?:\s(USD|EUR|GBP|CAD|AUD|THB|dollars?|euros?|pounds|baht)\b)?/gi;
const figures = (text) => {
  const out = [];
  const t = String(text || '');
  let m;
  figRe.lastIndex = 0;
  while ((m = figRe.exec(t)) !== null) {
    if (m.index === figRe.lastIndex) figRe.lastIndex++;
    const num = m[2].replace(/,/g, '');
    if (!/\d/.test(num)) continue;
    const start = m.index + (m[0].length - m[0].trimStart().length);
    const cur = CUR[String(m[1] || m[5] || '').toLowerCase()] || '';
    out.push({ key: String(parseFloat(num)) + (m[3] ? UNIT[m[3].toLowerCase()] : '') + (m[4] ? '%' : ''), cur, start, end: m.index + m[0].length, raw: m[0].trim() });
  }
  return out;
};
const START_BEFORE = /(?:\bfrom|\bstarting(?:\s+(?:at|from))?|\bstarts?\s+(?:at|from)|\bas low as|\bbeginning at|\bminimum(?:\s+of)?|\bat least)\s*:?\s*$/i;
const START_AFTER = /^\s*(?:\+|and up|or more|and above|upwards?)/i;
const RANGE_TAIL = /^\s*(?:-|–|—|to)\s*(?:US\$|\$|€|£)?\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m)?\b/i;
const PERIOD_AFTER = /^\s*(?:(?:\/|per\s+|a\s+|an\s+|each\s+)\s*(month|mo|year|yr|annum|week|day|hour|hr|night)\b|(monthly|annually|yearly|weekly|daily|hourly)\b)/i;
const PERIOD_NAME = { mo: 'month', monthly: 'month', yr: 'year', annum: 'year', annually: 'year', yearly: 'year', weekly: 'week', daily: 'day', hr: 'hour', hourly: 'hour' };
const startQualified = (t, f) => START_BEFORE.test(t.slice(Math.max(0, f.start - 30), f.start)) || START_AFTER.test(t.slice(f.end, f.end + 12));
const periodOf = (t, f) => { const m = t.slice(f.end, f.end + 60).replace(RANGE_TAIL, '').match(PERIOD_AFTER); if (!m) return ''; const p = (m[1] || m[2]).toLowerCase(); return PERIOD_NAME[p] || p; };
const PERIODS = ['month', 'year', 'week', 'day', 'hour', 'night'];
const periodsNear = (t, f) => { const near = t.slice(Math.max(0, f.start - 45), f.end + 45).toLowerCase(); return PERIODS.filter((p) => new RegExp('\\b' + p + '(?:ly|s)?\\b|\\bper ' + p + '|\\/' + p.slice(0, 2)).test(near) || (p === 'year' && /annual|annum/.test(near))); };
const sentenceAround = (t, f) => { const a = Math.max(t.lastIndexOf('. ', f.start), t.lastIndexOf('? ', f.start), t.lastIndexOf('! ', f.start)); const nexts = ['. ', '? ', '! '].map((d) => t.indexOf(d, f.end)).filter((x) => x >= 0); return t.slice(a < 0 ? 0 : a + 2, nexts.length ? Math.min(...nexts) + 1 : t.length); };
const LIVING = /cost of living|living costs?|living expenses|\blive\b|lifestyle|\bbudget\b|\brent\b|\bsalary\b|\bearning\b|\bincome\b/i;
const PRICE_CLAIM = /\b(package|priced?|prices|pricing|fees?|charges?|lists?|sells?|offers?|program|session|call|service|plan)\b/i;
const LIVING_CLAIM = /cost of living|living costs?|living expenses|budget|income|salary|earn/i;
const rangePairs = (t, figs) => { const out = []; for (let i = 0; i + 1 < figs.length; i++) { const between = t.slice(figs[i].end, figs[i + 1].start); if (/^\s*(?:-|–|—|to)\s*$/i.test(between) || (/^\s*and\s*$/i.test(between) && /\bbetween\s*$/i.test(t.slice(Math.max(0, figs[i].start - 12), figs[i].start)))) out.push([figs[i], figs[i + 1]]); } return out; };

// Returns the list of reasons the excerpt fails to support the claim. An empty list means every check passed.
const deterministic = (claim, entity, excerpt, page) => {
  const reasons = [];
  const pageText = ws(page.text);
  const passages = ws(excerpt).split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/).map((s) => s.trim()).filter(Boolean);
  if (!passages.length || passages.join(' ').length < 15) { reasons.push('the verifier gave no supporting excerpt'); return reasons; }
  const missing = passages.filter((p) => !pageText.includes(p));
  if (missing.length) {
    // Known limitation, kept on purpose: only whitespace is normalized. When the passage would match if quote marks
    // and dashes were also normalized, the exclusion is recorded as punctuation-related so it can be counted.
    const loose = (v) => v.replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"').replace(/[‐-―−]/g, '-').replace(/…/g, '...');
    const punctuationOnly = missing.every((p) => loose(pageText).includes(loose(p)));
    reasons.push('the supporting excerpt is not in the fetched page text' + (punctuationOnly ? ' (PUNCTUATION ONLY: it matches once quote marks and dashes are normalized, which is not allowed)' : '') + ': "' + missing[0].slice(0, 80) + '"');
    return reasons;
  }
  const ex = passages.join(' ... ');
  const cl = ws(claim);
  const cf = figures(cl);
  const ef = figures(ex);
  const absent = [...new Set(cf.filter((f) => !ef.some((e) => e.key === f.key)).map((f) => f.raw))];
  if (absent.length) reasons.push('the excerpt does not contain the figure' + (absent.length > 1 ? 's ' : ' ') + absent.join(', ') + ' that the claim states');
  const priced = PRICE_CLAIM.test(cl) && !LIVING_CLAIM.test(cl);
  const seen = new Set();
  cf.forEach((f, idx) => {
    const money = f.cur || (idx > 0 && cf[idx - 1].cur && /^\s*(?:-|–|—|to|and)\s*$/i.test(cl.slice(cf[idx - 1].end, f.start)));
    const hits = ef.filter((e) => e.key === f.key);
    if (!money || !hits.length || seen.has(f.key)) return;
    seen.add(f.key);
    if (hits.every((e) => startQualified(ex, e)) && !startQualified(cl, f)) reasons.push('the page gives ' + f.raw + ' as a starting price ("' + ws(ex.slice(Math.max(0, hits[0].start - 18), hits[0].end + 2)) + '"), and the claim states it without that qualifier');
    const pagePeriods = hits.map((e) => periodOf(ex, e));
    if (pagePeriods.every(Boolean) && !pagePeriods.some((p) => periodsNear(cl, f).includes(p))) reasons.push('the page gives ' + f.raw + ' per ' + pagePeriods[0] + ', and the claim does not');
    if (priced && hits.every((e) => LIVING.test(sentenceAround(ex, e)) && !/\b(session|package|concierge|program|course|consult)/i.test(sentenceAround(ex, e)))) reasons.push('the page gives ' + f.raw + ' as a living cost, budget or income, not as the price of a service');
    if (f.cur && hits.every((e) => e.cur && e.cur !== f.cur)) reasons.push('the claim gives ' + f.raw + ' in ' + f.cur + ', and the page gives it in ' + hits[0].cur);
  });
  rangePairs(cl, cf).filter((p) => p[0].cur || p[1].cur).forEach((p) => {
    if (!rangePairs(ex, ef).some((q) => q[0].key === p[0].key && q[1].key === p[1].key)) reasons.push('the claim states the range ' + p[0].raw + ' to ' + p[1].raw + ', and the excerpt does not state those two amounts as a range');
  });
  // The company must be named in the page's own title or text, as words or run together (digitalnomads.world). The address alone does not count.
  if (entity && entity.name_words) { const where = (page.title || '') + ' ' + page.text; if (!spaced(where).includes(' ' + entity.name_words + ' ') && !(entity.key && where.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(entity.key))) reasons.push('the page does not name ' + entity.name); }
  return reasons;
};

// PAYMENT. Calling a service "paid", or saying a company charges or sells, asserts that money changes hands. The
// passage quoted from the page has to show that: a price, a fee, a charge, an invoice, or a purchase step. A numeric
// price is not required. "Clear pricing" and a description of the service do not show it. When the passage does not
// show it, the claim is excluded. Its other facts are not lost and are not assumed either: Build Recheck Request
// proposes the claim without "paid" as a new claim, and that claim is accepted only if the separate check supports
// it and it passes the same code checks as every other claim. Removing a word is never what puts a claim in the ledger.
const PAYMENT_ASSERTED = /\bpaid(?:-for)?\b|\bcharg(?:es|ed|ing)\b|\bcharge (?:for|clients|customers|a fee|fees)\b|\bfor a fee\b|\b(?:customers|clients|people|buyers|users|members) (?:pay|are paying|have paid)\b|\bsells?\b/i;
const chargeShown = (excerpt) => {
  const v = String(excerpt || '').replace(/\b(?:clear|transparent|simple|fair|honest|upfront|competitive|flexible|affordable|straightforward) pricing\b/gi, ' ').replace(/\b(?:no|without|zero|free of) (?:fees?|charges?|costs?)\b/gi, ' ');
  return /(?:US\$|\$|€|£)\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|dollars|euros|pounds)\b|\bfees?\b|\bcharg(?:e|es|ed|ing)\b|\bpriced? (?:at|from)\b|\bprices? (?:start|from|range)\b|\bstart(?:s|ing)? (?:at|from) \S*\d|\bbuy now\b|\badd to cart\b|\bcheckout\b|\border now\b|\bsubscriptions?\b|\binvoic\w+\b|\bbilled\b|\bpaid (?:plan|tier|membership|consultation|session)s?\b/i.test(v);
};

// A claim is a statistic when it states a count, a share or a market value about a population or market, as
// opposed to a company describing its own offer. Statistics need a traceable origin, not just a page that repeats them.
const isStatistic = (c) => /^M\d/.test(c.question || '') || figures(c.claim).some((f) => /[mbt%]$/.test(f.key));

const evaluate = (c, sid) => {
  const page = pageOf[sid];
  const base = { source_id: sid, model_verdict: '', excerpt: '', reasoning: '', checks: null, credibility: null };
  if (!page) return { ...base, status: 'unverifiable', kind: 'not_fetched', reasons: ['the page was not fetched'] };
  if (page.outcome !== 'ok' || !page.text) return { ...base, status: 'unverifiable', kind: 'fetch_' + page.outcome, reasons: ['the page could not be read (' + page.outcome + (page.detail ? ': ' + page.detail : '') + ')'] };
  const x = answers[c.claim_id + '|' + sid];
  if (!x) return { ...base, status: 'unverifiable', kind: 'verifier_missing', reasons: ['no verifier answer exists for this claim and page'] };
  if (x.malformed) return { ...base, status: 'unverifiable', kind: 'verifier_malformed', reasons: ['the verifier answer could not be used: ' + x.malformed] };
  const rec = { ...base, model_verdict: x.verdict, excerpt: ws(x.excerpt), reasoning: ws(x.reasoning).slice(0, 500), checks: x.checks, credibility: { rating: x.credibility.rating, first_party: x.credibility.first_party, origin_stated: x.credibility.origin_stated, basis: ws(x.credibility.basis).slice(0, 400) } };
  if (x.verdict === 'contradicted') return { ...rec, status: 'contradicted', kind: 'model', reasons: ['the page states something different: ' + rec.reasoning] };
  if (x.verdict === 'unverifiable') return { ...rec, status: 'unverifiable', kind: 'model', reasons: ['the page does not state it: ' + rec.reasoning] };
  if (c.identity_unestablished) return { ...rec, status: 'unverifiable', kind: 'identity', reasons: ['the claim names ' + c.identity_unestablished + ', but nothing on the fetched page establishes that company: not its site name, its title, or its publisher. A claim about a company whose identity is not established is not evidence'] };
  const det = deterministic(c.claim, c.entity, x.excerpt, page);
  if (det.length) return { ...rec, status: 'unverifiable', kind: det.some((r) => /PUNCTUATION ONLY/.test(r)) ? 'deterministic_punctuation' : det.every((r) => /^the page does not name /.test(r)) ? 'identity' : 'deterministic', reasons: det.map((r) => /^the page does not name /.test(r) ? 'the claim names ' + c.entity.name + ', but the fetched page does not name ' + c.entity.name + ' in its title or text, so the company the statement belongs to is not established' : r) };
  // The page is the site of a different known company. Who the statement belongs to is then not established.
  const owner = c.entity ? siteOwner(sid, c.entity.name) : null;
  if (owner) return { ...rec, status: 'unverifiable', kind: 'identity', reasons: ['the claim names ' + c.entity.name + ', but the page it was checked on is on the site of ' + owner.name + ' (' + (byId(sid) || {}).domain + '), so the company the statement belongs to is not established'] };
  const off = CHECKS.filter((k) => x.checks[k] === 'mismatch' || x.checks[k] === 'not_stated');
  if (off.length) return { ...rec, status: 'unverifiable', kind: 'model_checks', reasons: ['the verifier marked it supported but reported ' + off.map((k) => k + ' ' + x.checks[k].replace('_', ' ')).join(', ')] };
  if (x.credibility.rating === 'low') return { ...rec, status: 'not_credible', kind: 'credibility', reasons: ['the page states it, but the source is not credible evidence for it: ' + rec.credibility.basis] };
  if (isStatistic(c) && !x.credibility.first_party && !x.credibility.origin_stated) return { ...rec, status: 'not_credible', kind: 'credibility', reasons: ['the page states it, but gives no traceable origin for the figure: ' + rec.credibility.basis] };
  if (PAYMENT_ASSERTED.test(c.claim) && !chargeShown(x.excerpt)) return { ...rec, status: 'unverifiable', kind: 'payment', reasons: ['the claim says the service is paid, charged for, or sold, and the passage quoted from the page shows no price, fee, charge, or purchase step. A description of a service, or wording such as "Clear pricing", does not show that it is paid for'] };
  return { ...rec, status: 'supported', kind: 'verified', reasons: [] };
};

// ---------- 3. Decide each claim. ----------
const RANK = { supported: 0, contradicted: 1, not_credible: 2, unverifiable: 3 };
const claims = [];
const excluded = [];
const log = [];
const moved = [];
candidates.forEach((c) => {
  const pairs = (c.candidate_source_ids || []).map((sid) => evaluate(c, sid));
  log.push({ claim_id: c.claim_id, claim: c.claim, pairs: pairs.map((p) => ({ source_id: p.source_id, status: p.status, kind: p.kind, reasons: p.reasons, model_verdict: p.model_verdict, excerpt: p.excerpt, checks: p.checks, credibility: p.credibility })) });
  const win = pairs.find((p) => p.status === 'supported');
  if (win) {
    const page = pageOf[win.source_id];
    const basis = c.candidate_basis[c.candidate_source_ids.indexOf(win.source_id)];
    if (c.candidate_source_ids[0] !== win.source_id) moved.push({ claim_id: c.claim_id, first_candidate: c.candidate_source_ids[0], verified_on: win.source_id, why: 'the first candidate page did not support it and this page did' });
    const entry = {
      claim_id: c.claim_id,
      question: c.question,
      claim: c.claim,
      claim_type: 'external_research',
      adjacent: /^ADJACENT\s*:/i.test(c.claim),
      source_ids: [win.source_id],
      source_type: c.source_type,
      published: 'set below',
      anecdotal: /community|forum|reddit|social/i.test(c.source_type),
      attribution: 'verified on the fetched page (candidate from ' + basis + ')',
      verification: 'supported',
      page_excerpt: win.excerpt.slice(0, 400),
      credibility: win.credibility.rating,
      credibility_basis: win.credibility.basis,
      retrieved_at: page.retrieved_at,
    };
    if (c.entity) entry.entity = c.entity.name;
    if (c.corrects) { entry.derived_from = c.corrects; entry.attribution = 'extracted from the fetched page after research claim ' + c.corrects + ' was contradicted, then verified by a separate check'; }
    if (c.corrects && c.correction_kind === 'payment_wording_removed') {
      entry.attribution = 'research claim ' + c.corrects + ' called this service paid, which the page passage did not show. This is that claim without "paid", verified by a separate check';
      entry.claim_as_researched = (firstPass[c.corrects] || {}).claim || '';
      entry.payment_not_established = true;
      entry.limits = 'This entry does not support saying the service is paid, charged for, or sold: no price, fee, or charge was shown for it.';
    }
    claims.push(entry);
    return;
  }
  const worst = pairs.slice().sort((a, b) => RANK[a.status] - RANK[b.status])[0] || { status: 'unverifiable', kind: 'no_source', reasons: ['the research tool gave no retrievable source for it'], source_id: '' };
  excluded.push({ claim_id: c.claim_id, question: c.question, claim: c.claim, entity: c.entity ? c.entity.name : '', entity_words: c.entity ? c.entity.name_words : '', status: worst.status, kind: worst.kind, reason: worst.reasons.join('; '), candidate_source_ids: c.candidate_source_ids, figures: [...new Set(figures(c.claim).map((f) => f.key))], corrects: c.corrects || '' });
});
// Correction history: each rejected original keeps the list of claims extracted in its place and what became of them.
const correctionHistory = candidates.filter((c) => c.corrects).map((c) => ({ original: c.corrects, claim_id: c.claim_id, claim: c.claim, ...(c.correction_kind ? { kind: c.correction_kind } : {}), outcome: claims.some((k) => k.claim_id === c.claim_id) ? 'verified' : 'excluded', reason: (excluded.find((x) => x.claim_id === c.claim_id) || {}).reason || '' }));
excluded.forEach((x) => { const mine = correctionHistory.filter((h) => h.original === x.claim_id); if (mine.length) x.corrections = mine.map((h) => ({ claim_id: h.claim_id, outcome: h.outcome })); });

// The latest calendar date written in a string, as a UTC timestamp, or null when none can be read.
const MONTH_NO = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const latestDate = (text) => {
  const t = String(text || '');
  const found = [];
  const push = (y, m, d) => { const v = Date.UTC(+y, m, +d || 1); if (!isNaN(v) && +y > 1900 && +y < 2200) found.push(v); };
  const M = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  let m;
  const iso = /(\d{4})-(\d{2})-(\d{2})/g;
  while ((m = iso.exec(t)) !== null) push(m[1], +m[2] - 1, m[3]);
  // 31/03/2016 or 03/31/2016. Read only when the order is certain: exactly one of the first two numbers is above 12.
  const num = /\b(\d{1,2})[\/.](\d{1,2})[\/.]((?:19|20)\d{2})\b/g;
  while ((m = num.exec(t)) !== null) { const a = +m[1], b = +m[2]; if (a > 12 && b <= 12) push(m[3], b - 1, a); else if (b > 12 && a <= 12) push(m[3], a - 1, b); }
  const mdy = new RegExp(M + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})', 'gi');
  while ((m = mdy.exec(t)) !== null) push(m[3], MONTH_NO[m[1].toLowerCase()], m[2]);
  const dmy = new RegExp('(\\d{1,2})(?:st|nd|rd|th)?\\s+' + M + ',?\\s+(\\d{4})', 'gi');
  while ((m = dmy.exec(t)) !== null) push(m[3], MONTH_NO[m[2].toLowerCase()], m[1]);
  const my = new RegExp('(?:^|[^\\d\\s]\\s*|\\s)' + M + '\\s+(\\d{4})', 'gi');
  while ((m = my.exec(t)) !== null) push(m[2], MONTH_NO[m[1].toLowerCase()], 1);
  return found.length ? Math.max(...found) : null;
};

// ---------- 4. Source records: what was requested, what answered, and the date the page itself shows. ----------
sources.forEach((s) => {
  // A page found by web search that was fetched and read is recorded like any other page: the date its own text
  // shows is the source's date. Until execution 63226 only research sources were given one, so W5 stayed
  // "date not shown" although the verifier read 31/03/2016 on the page.
  if (s.kind !== 'research' && !pageOf[s.id]) return;
  const p = pageOf[s.id];
  if (!p) { s.fetch = { outcome: 'not_requested' }; s.published = 'date not shown'; s.published_basis = 'page not fetched: no claim was tied to it'; return; }
  s.fetch = { requested_url: p.requested_url, final_url: p.final_url, redirected: p.redirects.length > 0, retrieved_at: p.retrieved_at, http_status: p.http_status, outcome: p.outcome, detail: p.detail, text_chars: p.text_chars };
  const meta = pageMeta[s.id];
  const date = meta ? ws(meta.date_shown) : '';
  const shown = p.outcome === 'ok' && date && /\d/.test(date) && !/©|\(c\)|copyright/i.test(date) && !/^\d{4}$/.test(date) && ws(p.text).includes(date);
  const when = shown ? latestDate(date) : null;
  if (shown && when !== null && when > runDate.ms + 36 * 3600 * 1000) {
    // A date after the run date cannot be a publication date. It is kept for the record and not used.
    s.published = 'date not shown';
    s.published_basis = 'the page shows "' + date + '", which is after the run date ' + runDate.iso + ', so it is not recorded as a publication date';
    s.future_date_shown = date;
  } else if (shown) {
    s.published = date;
    s.published_basis = 'shown on the fetched page' + (when === null ? ' (not parsed, so not compared with the run date)' : ', on or before the run date ' + runDate.iso);
    if (when !== null) s.published_iso = new Date(when).toISOString().slice(0, 10);
  } else { s.published = 'date not shown'; s.published_basis = p.outcome === 'ok' ? 'no publication date found on the fetched page' : 'page could not be read (' + p.outcome + ')'; }
  const n = claims.filter((c) => c.source_ids[0] === s.id).length;
  s.identity = p.outcome !== 'ok' ? 'not read (' + p.outcome + ')' : n ? 'page read; ' + n + ' claim' + (n === 1 ? '' : 's') + ' verified against its text' : 'page read; no claim verified against it';
  if (meta && meta.injection_suspected) s.injection_suspected = true;
});
claims.forEach((c) => { c.published = byId(c.source_ids[0]).published; });

// ---------- 5. Entities: a company is tied to its own pages and to any page that verifiably states a claim about it. ----------
// A company first named by a recovered claim is added, so its verified claim keeps its company downstream.
claims.forEach((c) => { if (c.entity && !entityList.some((e) => e.name === c.entity)) { const k = candidates.find((x) => x.claim_id === c.claim_id); entityList.push({ name: k.entity.name, name_words: k.entity.name_words, key: k.entity.key, sites: [], own_source_ids: [] }); } });
const entities = entityList.map((e) => {
  const mine = claims.filter((c) => c.entity === e.name);
  const ids = (e.own_source_ids || []).slice();
  mine.forEach((c) => { if (!ids.includes(c.source_ids[0])) ids.push(c.source_ids[0]); });
  return { name: e.name, name_words: e.name_words, key: e.key, site: (e.sites || [])[0] || '', source_ids: ids, verified_claims: mine.length };
});

// ---------- 6. Research gaps. An excluded claim's text and figures are withheld, so nothing from a claim that failed
// verification can be copied into the plan. The writer is told only that a claim on that topic was excluded and why.
// Search listings are not research questions: they get one summary line and no detail.
const LABEL = { contradicted: 'the source page contradicts it', not_credible: 'its source is not credible evidence for it', unverifiable: 'it could not be verified on its source page' };
const fromSearch = (x) => /^W /.test(x.question || '');
excluded.filter((x) => !fromSearch(x) && !x.corrects).forEach((x) => gaps.push((x.question ? x.question + ': ' : '') + 'Excluded claim ' + x.claim_id + ' (' + LABEL[x.status] + ')' + (x.entity && entityList.some((e) => e.name === x.entity) ? ', about ' + x.entity : '') + '. It is not evidence. Its content is withheld. Do not state anything this research question would have answered unless a ledger entry states it.'));
const listingsExcluded = excluded.filter(fromSearch).length;
if (listingsExcluded) gaps.push(listingsExcluded + ' page' + (listingsExcluded === 1 ? '' : 's') + ' found by web search could not be verified. They are not evidence and are not listed.');
entities.filter((e) => !e.verified_claims).forEach((e) => gaps.push('No verified evidence exists about ' + e.name + '. Do not describe its offer, price, customers or history, and do not cite a source for it.'));
let failedCalls = [];
try { failedCalls = JSON.parse(ce.failed_calls || '[]'); } catch (e) {}

const count = (st) => excluded.filter((x) => x.status === st).length;
const incomplete = verifierProblems.length;
const verification = {
  candidate_claims: candidates.length,
  verified: claims.length,
  excluded: excluded.length,
  contradicted: count('contradicted'),
  not_credible: count('not_credible'),
  unverifiable: count('unverifiable'),
  excluded_by_code_after_model_said_supported: excluded.filter((x) => /^deterministic/.test(x.kind)).length,
  excluded_for_punctuation_only: excluded.filter((x) => x.kind === 'deterministic_punctuation').length,
  excluded_for_company_identity: excluded.filter((x) => x.kind === 'identity').length,
  excluded_for_payment_not_shown: excluded.filter((x) => x.kind === 'payment').length,
  payment_wording_removed: claims.filter((c) => c.payment_not_established).map((c) => c.claim_id),
  company_identity_resolved_here: identityResolved,
  pages_requested: pages.length,
  pages_read: pages.filter((p) => p.outcome === 'ok').length,
  verifier_calls: requests.filter((r) => r && !r.none).length + recheckRequests.length,
  corrections_proposed: correctionHistory.length,
  corrections_verified: correctionHistory.filter((h) => h.outcome === 'verified').length,
  verifier_problems: verifierProblems,
  fetch_ms: fp.fetch_ms || 0,
  verify_ms: requests.length && requests[0].t_ms ? Date.now() - requests[0].t_ms : 0,
  verify_cost_usd: Math.round(verifyCost * 10000) / 10000,
  verify_calls_without_cost: responses.concat(recheckResponses).filter((r) => !(r && r.usage && typeof r.usage.cost === 'number')).length,
  run_date: runDate.iso,
};

return {
  sources: JSON.stringify(sources),
  research_ledger: claims.length
    ? JSON.stringify(claims, null, 1)
    : 'No research claim passed source-page verification. Treat every research question as not researched.',
  research_gaps: gaps.join('\n'),
  snippets: '',
  run_date: runDate.iso,
  entities: JSON.stringify(entities),
  excluded_claims: JSON.stringify(excluded),
  source_integrity: JSON.stringify({ calls: JSON.parse(ce.calls || '[]'), failed_calls: failedCalls, verification, verified_on_another_candidate: moved, corrections: correctionHistory }, null, 1),
  verification_log: JSON.stringify(log),
  verified_claims: claims.length,
  excluded_claim_count: excluded.length,
  verification_incomplete: incomplete,
  remapped_claims: moved.length,
  dropped_claims: excluded.length,
  unmatched_markers: ce.unmatched_markers || 0,
  t_ms: Date.now(),
};
