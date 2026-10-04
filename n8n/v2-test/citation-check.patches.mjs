// The changes made to the Citation Check node for citation integrity, as find and replace pairs.
// build-citation-check.mjs applies them to the pre-fix node code to produce citation-check.js.
// The same pairs are applied to the node in n8n, so the file and the node stay identical.
export const patches = [
  {
    find: "let sources = [], ledger = '', gaps = '', unmatched = 0, truncated = false;",
    replace: "let sources = [], ledger = '', gaps = '', unmatched = 0, truncated = false, entitiesJson = '[]', integrity = null;",
  },
  {
    find: "unmatched = ev.unmatched_markers || 0; } catch (e) {}",
    replace: "unmatched = ev.unmatched_markers || 0; entitiesJson = ev.entities || '[]'; try { integrity = JSON.parse(ev.source_integrity || 'null'); } catch (e2) {} } catch (e) {}",
  },
  {
    find: "// Lines whose wording may assert feasibility, a comparison, an unsourced generalization, or that something does not exist.",
    replace: `// ---------- CITATION INTEGRITY ----------
// Deterministic checks that a cited source is the right source for what the text says. Every one of them blocks delivery
// except the last, which is a warning. They read the source records and the ledger exactly as Build Evidence produced
// them. Source IDs are never renumbered here or anywhere after Build Evidence.
let evClaims = [];
try { const p = JSON.parse(ledger); if (Array.isArray(p)) evClaims = p; } catch (e) {}
let entities = [];
try { const p = JSON.parse(entitiesJson); if (Array.isArray(p)) entities = p; } catch (e) {}
const srcById = {};
sources.forEach((x) => { srcById[x.id] = x; });
const spaced = (v) => ' ' + String(v || '').toLowerCase().replace(/&/g, ' and ').replace(/['\\u2019]s\\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const entityOfSource = {};
entities.forEach((e) => (e.source_ids || []).forEach((id) => { entityOfSource[id] = e; }));
const statRe = /\\$\\s?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|m|b|bn|million|billion|thousand)?\\b|\\b\\d[\\d,]*(?:\\.\\d+)?\\s?%|\\b\\d[\\d,]*(?:\\.\\d+)?\\s?(?:million|billion|thousand)\\b/gi;
const normStat = (v) => v.toLowerCase().replace(/[\\s,$]/g, '').replace(/billion|bn/, 'b').replace(/million/, 'm').replace(/thousand/, 'k').replace(/\\.00(?=\\D|$)/, '');
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
const segmentsOf = (t) => /^\\|.*\\|$/.test(t) ? [t] : t.split(/(?<=[.!?;])\\s+/);
let rowEntity = null;
let sectionNo = 0;
lines.forEach((line, i) => {
  const t = line.trim();
  const L = i + 1;
  if (!t) { rowEntity = null; return; }
  const sec = t.match(/^## (\\d+)\\./);
  if (sec) sectionNo = parseInt(sec[1], 10);
  const isRow = /^\\|.*\\|$/.test(t);
  if (!isRow) rowEntity = null;
  if (t.startsWith('#') || /^\\|?\\s*:?-{2,}/.test(t)) return;
  if (isRow) {
    // A profile table names its company in a row of its own: | **Company** | |. Every row under it is about that company.
    const cells = t.replace(/^\\||\\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length === 2 && cells[1] === '' && cells[0]) { rowEntity = entities.find((e) => spaced(cells[0]).includes(' ' + e.name_words + ' ')) || null; return; }
  }
  segmentsOf(t).forEach((seg) => {
    const cited = [...new Set(seg.match(/\\b[SW]\\d+\\b/g) || [])].filter((id) => srcById[id]);
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
      if (/^\\d/.test(tok) && !/^\\d[\\d.]*$/.test(tok)) add('BLOCKING', 'UNSUPPORTED STATISTIC', 'The statistic ' + tok + ' sits on text that cites ' + cited.join(', ') + ', but no ledger entry states it for any source.', short(seg), L);
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
    const yr = seg.match(/\\b(?:dated|published in|as of)\\s+((?:19|20)\\d{2})\\b/i);
    if (yr && /\\b(source|entry|page|report|listing)\\b/i.test(seg) && !cited.some((id) => String(srcById[id].published || '').startsWith(yr[1]))) add('BLOCKING', 'SOURCE DATE NOTE ON THE WRONG SOURCE', 'The text says its source is dated ' + yr[1] + ', but ' + cited.map((id) => id + ' is recorded as published ' + srcById[id].published).join('; ') + '.', short(seg), L);
    // 4. Warning, not a blocker: a figure from a weak source stated with no qualifier. Repeating it does not make it established.
    if (!qualified.test(seg) && statsIn(seg).some((tok) => !ownStats.has(tok))) cited.forEach((id) => {
      const why = weakSource(id);
      if (why && statsIn(seg).some((tok) => statOwners[tok] && statOwners[tok].has(id))) add('MAJOR', 'UNVERIFIED EVIDENCE STATED WITHOUT QUALIFICATION', id + ' is ' + (why === 'undated' ? 'an undated source' : 'a ' + why) + '. Its figure is stated here as fact' + (sectionNo === 1 ? ', in the Executive Summary' : '') + '. Say whose estimate it is and that it has not been verified, every time it appears.', short(seg), L);
    });
  });
});
if (integrity && Array.isArray(integrity.calls)) integrity.calls.forEach((c) => { if (c.marker_order === 'unreliable') add('MINOR', 'RESEARCH MARKERS WERE OUT OF ORDER', 'In ' + c.node + ' the research tool numbered its citation markers out of order. ' + (c.remapped || 0) + ' claims were moved to the page of the company they name and ' + (c.dropped || 0) + ' were discarded. No action is needed in the plan; this is recorded for review.'); });

// Lines whose wording may assert feasibility, a comparison, an unsourced generalization, or that something does not exist.`,
  },
  {
    find: "a source ID attached to a claim the ledger does not support, where the result is a materially false factual statement;",
    replace: "a source ID attached to a claim the ledger does not link to that source; a citation attached to the wrong company; a cited price or statistic given with a different amount, currency, scope, geography, or year than its ledger entry, or with one of those left out so that it reads as broader than the source; a note about a source's date placed on a different source;",
  },
  {
    find: " A cited figure whose scope, geography, or year was loosened.\n- MINOR:",
    replace: " A figure from an undated source, a vendor blog, or a list article stated as fact without saying whose estimate it is.\n- MINOR:",
  },
  {
    find: "The user message lists LINES FLAGGED BY CODE FOR WORDING, with the matched words in brackets.",
    replace: "21. Attribution: for every cited claim, find the EVIDENCE LEDGER entry it rests on. The source ID must be one of that entry's source_ids, and any company the sentence names must be the company that entry is about. A source ID that exists in SOURCES but belongs to a different company, or to a ledger entry that says something else, is BLOCKING: a real ID on the wrong claim is as serious as an invented one. A price must keep its currency, what it buys, and whether it is a fixed price, a starting price, or a range, exactly as the ledger entry states. A statistic must keep the population, geography, and year the ledger entry states. A note about a source's age must sit on the source it describes: check it against that source's published value in SOURCES. A figure from a source that is undated, a vendor blog, or a list article must be worded as that source's estimate every time it appears, including in the Executive Summary and the Viability Assessment; repeating a figure does not make it established. Ledger entries marked attribution remapped were moved by code to the page of the company they name: the source_ids they carry now are the correct ones.\nThe user message lists LINES FLAGGED BY CODE FOR WORDING, with the matched words in brackets.",
  },
];
