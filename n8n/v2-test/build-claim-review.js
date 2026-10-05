// Build Claim Review: the sentence-level claim-to-evidence contract, pass 2 only.
//
// WHAT IT DOES. Splits the revised plan into claims: one per substantive sentence, and one per substantive sentence of
// each table cell. Every claim gets a stable ID, its place in the plan, the company heading it sits under, and the exact
// text of the ledger entries that could support it. The claims are sent to the model in bounded batches, so no single
// response has to hold the whole review. Combine Claim Review reads the answers.
//
// WHAT IT DOES NOT DO. It decides nothing about meaning. It records what has to be decided, and what code can already
// say: a source-only row states nothing, a date note is checked against the source record by Citation Check, and
// computed financial content is produced by code. Every other line of the plan has to yield at least one claim, or be
// listed here with the reason it did not. A line with neither is reported as unclassified, and that holds the plan.
//
// Input: the Final QA response. On pass 1, and whenever the claim contract is off, it is passed through untouched
// with claim_skip set, and the request for claims is not made.
const qaIn = $input.first().json || {};
const cc = $('Citation Check').first().json;
const attempt = cc.attempt || 0;
if (!attempt || cc.claim_contract !== true) return [{ json: { ...qaIn, claim_skip: true } }];

const ctx = $('Founder Context').first().json;
const ev = $('Build Evidence').first().json;
const rev = $('Apply Revisions').first().json;
const parse = (v, d) => { try { const p = typeof v === 'string' ? JSON.parse(v) : v; return p === null || p === undefined ? d : p; } catch (e) { return d; } };
const ledger = parse(ev.research_ledger, []).filter((c) => c && c.claim_id);
const sources = parse(ev.sources, []);
const entities = parse(ev.entities, []);
const srcById = {};
sources.forEach((x) => { if (x && x.id) srcById[x.id] = x; });

const BATCH_MAX = 40;      // claims in one request
const BATCH_SOFT = 28;     // past this, a batch ends at the next section heading
const MODEL = 'anthropic/claude-sonnet-4.6';

// ---------- text helpers ----------
const isRow = (t) => /^\|.*\|$/.test(t);
const isSep = (t) => /^\|?\s*:?-{2,}/.test(t);
const stripMd = (t) => String(t || '').replace(/\*\*|__|`/g, '');
const citesIn = (t) => [...new Set((String(t || '').match(/\[[SW]\d+\]/g) || []).map((x) => x.slice(1, -1)))];
const bare = (t) => stripMd(t).replace(/\[[SW]\d+\]/g, ' ').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
const norm = (t) => bare(t).toLowerCase();
const spaced = (t) => ' ' + String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
// A fragment is substantive when it could assert something: it has letters, and it is more than a single bare word.
const substantive = (t) => {
  const b = bare(t);
  if (!/[A-Za-z]/.test(b)) return false;
  if (b.split(/\s+/).length < 2 && !/\d/.test(b)) return false;
  return !/^(?:no source|none|n\/a|not applicable|tbd)\.?$/i.test(b);
};
// "**Competitive Interpretation.**" names what follows. It is context for the sentences after it, not a claim.
const isLeadIn = (t) => /^\*\*[^*]{1,70}\*\*[.:]?$/.test(t.trim());
const ABBR = /(?:^|[\s(])(?:e\.g|i\.e|vs|etc|approx|est|inc|ltd|co|corp|mr|mrs|ms|dr|st|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|u\.s|u\.k)\.$/i;
const words = (t) => bare(t).split(/\s+/).filter(Boolean).length;
// Sentences of a passage, then clauses at semicolons. A citation that follows the full stop belongs to the sentence
// before it. An abbreviation or a bare list number does not end a sentence.
const sentencesOf = (text) => {
  const raw = String(text || '').split(/(?<=[.!?](?:\*\*)?["')\]]*)\s+(?=(?:\*\*)?["'(\[]?[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  raw.forEach((piece) => {
    let p = piece;
    const lead = p.match(/^((?:\[[SW]\d+\][\s,.]*)+)/);
    if (lead && out.length) { out[out.length - 1] += ' ' + lead[1].trim(); p = p.slice(lead[1].length).trim(); if (!p) return; }
    const prev = out[out.length - 1];
    if (prev !== undefined && (ABBR.test(prev) || /^\d+[.)]$/.test(prev.trim()))) { out[out.length - 1] = prev + ' ' + p; return; }
    out.push(p);
  });
  return out.flatMap((sn) => { const parts = sn.split(/;\s+/); return parts.length > 1 && parts.every((x) => words(x) >= 4) ? parts.map((x, i) => (i < parts.length - 1 ? x + ';' : x)) : [sn]; });
};
// 32-bit FNV-1a. The ID is made from the section and the words, so the same sentence keeps its ID from run to run.
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };

// ---------- the claims ----------
const meta = {};
(cc.claim_lines || []).forEach((m) => { meta[m.line] = m; });
const lines = String(rev.text || '').split('\n');
const claims = [];
const seen = {};
const coverage = { prose_lines: 0, lines_with_claims: 0, claims: 0, source_rows: [], date_notes: [], computed_lines: 0, table_headers: [], label_only: [], unclassified: [] };
let section = '', heading = '', header = null;
const entriesFor = (company, ids) => ledger.filter((c) => (company && c.entity === company) || (c.source_ids || []).some((id) => ids.includes(id))).map((c) => c.claim_id);

lines.forEach((line, i) => {
  const n = i + 1;
  const t = line.trim();
  if (!t) return;
  if (!isRow(t)) header = null;
  if (/^#{1,6}\s/.test(t)) { const title = stripMd(t.replace(/^#+\s*/, '')).trim(); if (/^#{1,2}\s/.test(t)) { section = title; heading = ''; } else heading = title; return; }
  if (isSep(t)) return;
  coverage.prose_lines++;
  const m = meta[n] || {};
  if (m.computed) { coverage.computed_lines++; return; }
  if (m.kind === 'source_row') { coverage.source_rows.push(n); return; }
  if (m.kind === 'date_note') { coverage.date_notes.push({ line: n, ok: m.date_note_ok !== false }); return; }
  const lineCites = citesIn(t);
  const company = m.company || '';
  let pieces = [];
  if (isRow(t)) {
    const cells = t.slice(1, -1).split('|').map((c) => c.trim());
    if (isSep((lines[i + 1] || '').trim())) { header = cells; coverage.table_headers.push(n); return; }
    // The first cell names the row. It is context for the cells beside it, unless it is itself a sentence.
    const label = cells.length > 1 ? bare(cells[0]) : '';
    cells.forEach((cell, j) => {
      if (cells.length > 1 && j === 0 && words(cell) < 9) return;
      sentencesOf(cell).forEach((sn) => pieces.push({ text: sn, cell: j + 1, row: j === 0 ? '' : label, column: header && header[j] ? bare(header[j]) : '' }));
    });
  } else {
    pieces = sentencesOf(t.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')).map((sn) => ({ text: sn, cell: null, row: '', column: '' }));
  }
  let lead = '';
  let made = 0;
  pieces.forEach((p) => {
    if (isLeadIn(p.text)) { lead = bare(p.text); return; }
    if (!substantive(p.text)) return;
    const own = citesIn(p.text);
    const base = 'K' + ('0000000' + fnv(norm(section) + '|' + norm(p.text)).toString(36)).slice(-7);
    seen[base] = (seen[base] || 0) + 1;
    const id = seen[base] > 1 ? base + '-' + seen[base] : base;
    const mentions = entities.filter((e) => e && e.name_words && spaced(p.text).includes(' ' + e.name_words + ' ')).map((e) => e.name);
    claims.push({
      id, line: n, part: ++made, cell: p.cell, section, heading, company, row: p.row, column: p.column, lead,
      text: p.text.trim(), cites: own, line_cites: lineCites, names: mentions,
      // What could support it: entries about the company whose profile it sits in, and entries from the sources it cites.
      candidates: entriesFor(company, own.length ? own : lineCites),
      edited: m.edited || '',
    });
  });
  if (made) coverage.lines_with_claims++;
  else if (pieces.length && pieces.every((p) => isLeadIn(p.text) || !substantive(p.text))) coverage.label_only.push(n);
  else if (!pieces.length && isRow(t)) coverage.label_only.push(n);
  else coverage.unclassified.push(n);
});
coverage.claims = claims.length;

// ---------- the batches ----------
const batches = [];
let cur = [];
claims.forEach((c, k) => {
  const prev = claims[k - 1];
  if (cur.length >= BATCH_MAX || (cur.length >= BATCH_SOFT && prev && prev.section !== c.section)) { batches.push(cur); cur = []; }
  cur.push(c);
});
if (cur.length) batches.push(cur);

const runDate = (() => {
  let ms = Date.now();
  if (Number(ctx.run_started_ms) > 0) ms = Number(ctx.run_started_ms);
  return 'RUN DATE: today is ' + new Date(ms).toISOString().slice(0, 10) + ' (UTC). Do not rely on your own sense of the current year.';
})();
const entryText = (c) => c.claim_id + ' | about: ' + (c.entity || 'no single company') + ' | source: ' + (c.source_ids || []).map((id) => id + (srcById[id] && srcById[id].published ? ' (' + srcById[id].published + ')' : '')).join(', ') + ' | claim: "' + String(c.claim || '').replace(/\s+/g, ' ').trim() + '" | words on the page: "' + String(c.page_excerpt || '').replace(/\s+/g, ' ').trim() + '"';
const byId = {};
ledger.forEach((c) => { byId[c.claim_id] = c; });

const system = [
  'You check a business plan one claim at a time. Each claim is one sentence, or one sentence of a table cell, with its place in the plan. You classify every claim and link it to what supports it. You do not rewrite anything.',
  '',
  'CLASSES. Give each claim exactly one.',
  'FOUNDER: it states something about the founder, the audience they have, or the offer, as fact. "supported": true only when the FOUNDER CONTEXT says it; copy the exact words of the FOUNDER CONTEXT into "intake_quote". A detail the FOUNDER CONTEXT does not state ("an audience that does not yet exist", "the offer involves financial advice") is "supported": false, with what is missing in "missing".',
  'EXTERNAL: it states something about a company, a competitor, customers in general, a market, a survey, a channel, or anything else outside the founder and this plan, as fact. "supported": true only when a ledger entry supports it; see SUPPORT below. With no such entry it is "supported": false, with what no entry states in "missing". A citation on the sentence does not make it supported.',
  'ASSUMPTION: a proposed assumption, a hypothesis, an inference of IdeaToPlan, something stated as not established, or a figure or scenario of this plan\'s own financial model. It must be labelled as such in the sentence itself: copy the labelling words of the sentence into "label". A label in a neighbouring sentence does not count. "Our read:" is not a label; it names the author.',
  'RECOMMENDATION: advice or an instruction to the founder that asserts no fact.',
  'NONE: no factual assertion: a question, a test criterion, a heading-like phrase, a connective.',
  '',
  'SUPPORT for an EXTERNAL claim. Name the entries in "entries". Copy into "entry_quote" the exact words of the entry (its claim or its words on the page) that carry the support. Then answer seven aspects, each "yes", "no", or "na" (the claim has no such element):',
  'subject: the entry is about the same company, people, or thing as the claim.',
  'meaning: the entry says what the claim says. A paraphrase is fine; a stronger, broader, or different statement is not.',
  'qualifiers: the claim keeps the limits the entry carries ("says it", "lists", "may", "some").',
  'numbers: every number in the claim is the entry\'s number.',
  'dates: every date in the claim is in the entry or its source record.',
  'population: the claim is about the same group, sample, and sample size as the entry (a survey of 600 travelers is not "travelers", and not the founder\'s customers).',
  'scope: the claim does not rank, compare, or generalise beyond the entry ("the most", "unlike the others", "established", "focused on").',
  '"supported": true requires subject and meaning "yes" and no aspect "no". If any aspect is "no", set "supported": false and say which words go beyond the entry in "missing". An entry from the cited source that does not say this is not support.',
  '',
  'SPLIT. When one sentence joins a supported fact to an unsupported assertion, or a labelled hypothesis to a fact stated inside it ("a positioning could distinguish QYLAT from the logistics-focused paid services" is a hypothesis that also states as fact that those services are paid and logistics-focused), do not give it one class. Return "split": two or more parts, each with "text" copied exactly from the sentence and its own class and fields. Together the parts must cover the sentence.',
  '',
  'RULES. Judge a company-profile row against the entries about that company. What substitutes or free content cannot give a customer is EXTERNAL and needs an entry, or a label in that sentence. A sentence that reports the customer\'s own doubt ("they do not know whether it is realistic") asserts nothing about feasibility. Do not use RECOMMENDATION or NONE for a sentence that states a fact.',
  '',
  'Answer every claim ID in this request exactly once, and no other ID. Return ONLY JSON:',
  '{"batch":1,"claims":[{"id":"K0000001","class":"EXTERNAL","supported":true,"entries":["E3"],"entry_quote":"19 Years in business","aspects":{"subject":"yes","meaning":"yes","qualifiers":"na","numbers":"yes","dates":"na","population":"na","scope":"na"}},{"id":"K0000002","class":"EXTERNAL","supported":false,"missing":"no entry says which customers the firm serves"},{"id":"K0000003","class":"FOUNDER","supported":true,"intake_quote":"exact words of the founder context"},{"id":"K0000004","class":"ASSUMPTION","label":"This is a hypothesis to test"},{"id":"K0000005","split":[{"text":"exact words","class":"ASSUMPTION","label":"could"},{"text":"exact words","class":"EXTERNAL","supported":false,"missing":"no entry says the services are paid"}]}],"recommendation":["K0000006"],"none":["K0000007"]}',
].join('\n');

const describe = (c) => {
  const where = [c.section, c.heading].filter(Boolean).join(' > ');
  const about = [c.company ? 'profile of ' + c.company : '', c.row ? 'row: ' + c.row : '', c.column ? 'column: ' + c.column : '', c.lead ? 'under: ' + c.lead : '', c.cites.length ? 'cites ' + c.cites.join(', ') : (c.line_cites.length ? 'its line cites ' + c.line_cites.join(', ') : 'no citation'), c.edited ? 'edited by ' + c.edited : ''].filter(Boolean).join(' | ');
  // The exact entry text stands beside the claim. When more than three entries could apply (a sentence about all the
  // competitors reviewed), their IDs stand beside it and the exact text of each is in the LEDGER block of the same request.
  const beside = !c.candidates.length ? '    none: no ledger entry is about this company or from a source this line cites' : c.candidates.length <= 3 ? c.candidates.map((id) => '    ' + entryText(byId[id])).join('\n') : '    ' + c.candidates.join(', ') + ' (the exact text of each is in LEDGER above)';
  return '[' + c.id + '] L' + c.line + (c.cell ? ', cell ' + c.cell : '') + ' | ' + where + ' | ' + about + '\n  TEXT: ' + c.text + '\n  ENTRIES BESIDE IT (exact text):\n' + beside;
};
const payloadOf = (list, k) => JSON.stringify({
  model: MODEL, max_tokens: 8000, temperature: 0,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: [
      runDate,
      '', String(ctx.founder_context || 'FOUNDER CONTEXT: none captured.'),
      '', 'LEDGER (every verified entry; the only external evidence there is)', ledger.map(entryText).join('\n') || 'None.',
      '', 'CLAIMS: batch ' + (k + 1) + ' of ' + batches.length + ', ' + list.length + ' claims. Answer each ID once.',
      list.map(describe).join('\n\n'),
    ].join('\n') },
  ],
});

if (!batches.length) return [{ json: { ...qaIn, claim_skip: true, claim_review: { empty: true, coverage, claims: 0 } } }];
return batches.map((list, k) => ({ json: {
  claim_skip: false,
  batch: k + 1,
  of: batches.length,
  ids: list.map((c) => c.id),
  payload: payloadOf(list, k),
  // The map and the verifier's answer ride on the first item only. Combine Claim Review reads them from there.
  ...(k === 0 ? { claim_map: { claims, coverage, model: MODEL }, qa_response: qaIn } : {}),
} }));
