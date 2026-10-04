// Build Evidence: merges both research calls and the Brave results into one source list and an evidence ledger.
//
// SOURCE CONTRACT
// - A source record is created once, keyed by its URL, and gets its ID at that moment. Nothing later renumbers it.
// - Each record carries its URL, title, domain, entity keys, dates and the basis for each date.
// - A claim is tied to a source by the page address the research model gives for it (URL field) when present.
//   The numeric marker [n] is only a fallback, because the research model does not always number its markers in
//   the order of the returned source list.
// - A claim that names a company must resolve to a source that belongs to that company. If the marker points at a
//   different company's page, the claim is moved to the right source when exactly one fits, and dropped otherwise.
// - When a research call is shown to have unreliable markers, its remaining marker-only claims are dropped.
// - Dropped claims go to RESEARCH GAPS with the reason. They never reach the ledger.
const accessed = new Date().toISOString().slice(0, 10);
const clean = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const stripTags = (v) => clean(v).replace(/<[^>]*>/g, '');
const hostOf = (u) => { const m = String(u || '').match(/^https?:\/\/([^\/?#:]+)/i); return m ? m[1].replace(/^www\./i, '').toLowerCase() : ''; };
const normUrl = (u) => clean(u).replace(/#.*$/, '').replace(/[)\].,;]+$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
const words = (v) => clean(v).toLowerCase().replace(/&/g, ' and ').replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const squash = (v) => words(v).join('');
// The registrable part of a host: freedomandbeyond.co -> freedomandbeyond, relocations.moveoneinc.com -> moveoneinc.
const siteOf = (host) => { const l = String(host || '').split('.').filter(Boolean); return l.length >= 2 ? l[l.length - 2] : (l[0] || ''); };
const entityKeys = (title, host) => {
  const keys = new Set();
  const site = squash(siteOf(host));
  if (site.length >= 5) keys.add(site);
  const whole = squash(host.split('.').join(' '));
  if (whole.length >= 5) keys.add(whole);
  clean(title).split(/\s*[|—–:·•,]\s*|\s+-\s+/).forEach((seg) => { const k = squash(seg); if (k.length >= 7) keys.add(k); });
  return [...keys];
};

// 1. Sources. One list across both research calls and the Brave results. The same URL keeps one ID.
const sources = [];
const urlToId = {};
let unmatched = 0;
const addSource = (kind, title, url, published, call) => {
  const key = normUrl(url);
  if (urlToId[key]) return urlToId[key];
  const id = (kind === 'research' ? 'S' : 'W') + (sources.filter((s) => s.kind === kind).length + 1);
  urlToId[key] = id;
  const domain = hostOf(url);
  sources.push({ id, kind, title: title || 'Untitled page', url, domain, site: siteOf(domain), entity_keys: entityKeys(title, domain), published, published_basis: kind === 'research' ? 'not provided' : 'search listing', identity: 'unverified', call, accessed });
  return id;
};
const byId = (id) => sources.find((s) => s.id === id);

// 2. Research calls. Each call's annotations become source records; each CLAIM line becomes a candidate claim.
const failed = [];
const candidates = [];
const callReports = [];
const gaps = [];
const readCall = (nodeName) => {
  let msg = {};
  try { const r = $(nodeName).first().json; msg = (r && Array.isArray(r.choices) && r.choices[0] && r.choices[0].message) || {}; } catch (e) {}
  if (!clean(msg.content)) { failed.push(nodeName); return; }
  const annotations = Array.isArray(msg.annotations) ? msg.annotations : [];
  const markerToId = {};
  const callIds = [];
  annotations.forEach((a, i) => {
    const uc = a && a.type === 'url_citation' ? a.url_citation : null;
    if (!uc || !uc.url) return;
    const id = addSource('research', clean(uc.title), uc.url, 'not provided by the search tool', nodeName);
    markerToId[i + 1] = id;
    if (!callIds.includes(id)) callIds.push(id);
  });
  const mine = [];
  let question = '';
  clean(msg.content).split('\n').forEach((line) => {
    const t = line.trim().replace(/^[-*]\s*/, '');
    const q = t.match(/^#+\s*([A-Z]\d\s.*)$/);
    if (q) { question = q[1].trim(); return; }
    if (/^NOT FOUND:/i.test(t)) { gaps.push((question ? question + ': ' : '') + t.replace(/^NOT FOUND:\s*/i, '')); return; }
    const c = t.match(/^CLAIM:\s*(.+)$/i);
    if (!c) return;
    const parts = c[1].split('|').map((p) => p.trim());
    const strip = (v) => v.replace(/\[\d+\]/g, '').trim();
    const field = (name) => { const p = parts.find((x) => x.toUpperCase().startsWith(name + ':')); return p ? strip(p.slice(name.length + 1)) : ''; };
    const markers = [...new Set((t.match(/\[(\d+)\]/g) || []).map((x) => parseInt(x.slice(1, -1), 10)))];
    markers.forEach((n) => { if (!markerToId[n]) unmatched++; });
    const urlField = field('URL');
    const urlId = urlField && urlToId[normUrl(urlField)] && callIds.includes(urlToId[normUrl(urlField)]) ? urlToId[normUrl(urlField)] : '';
    const positional = [...new Set(markers.map((n) => markerToId[n]).filter(Boolean))];
    if (!urlId && !positional.length) return;
    const claimText = strip(parts[0]);
    const cand = { call: nodeName, question, claim: claimText, source_type: field('SOURCE TYPE'), published: field('PUBLISHED') || 'date not shown', urlId, url_given: !!urlField, positional, markers, callIds };
    mine.push(cand);
    candidates.push(cand);
  });
  callReports.push({ node: nodeName, sources_returned: callIds.length, markers_used: [...new Set(mine.flatMap((m) => m.markers))].sort((a, b) => a - b), claims: mine.length });
};
['Growth Research', 'Market Research'].forEach(readCall);

// 3. Resolve each claim to a source and check that a named company matches the source it is tied to.
const leadGrams = (text) => {
  let w = words(text);
  if (w[0] === 'adjacent') w = w.slice(1);
  if (w[0] === 'the') w = w.slice(1);
  const grams = new Map();
  for (let k = 1; k <= Math.min(6, w.length); k++) grams.set(w.slice(0, k).join(''), k);
  return grams;
};
// The company name as the claim writes it: the shortest run of leading words that spells the matched key.
const displayName = (text, key) => {
  const tokens = clean(text).replace(/^ADJACENT\s*:\s*/i, '').replace(/^the\s+/i, '').split(/\s+/);
  for (let i = 0; i < Math.min(tokens.length, 8); i++) if (squash(tokens.slice(0, i + 1).join(' ')) === key) return tokens.slice(0, i + 1).join(' ').replace(/['’]s$/, '').replace(/[.,;:]+$/, '');
  return key;
};
const entities = {};
const resolve = (c) => {
  const company = /company/i.test(c.source_type);
  const grams = leadGrams(c.claim);
  const minKey = company ? 5 : 15;
  let best = 0;
  const hits = [];
  c.callIds.map(byId).forEach((s) => {
    s.entity_keys.forEach((k) => { if (k.length >= minKey && grams.has(k)) { hits.push({ s, k }); if (k.length > best) best = k.length; } });
  });
  const matches = [...new Set(hits.filter((h) => h.k.length === best).map((h) => h.s.id))];
  const sites = [...new Set(matches.map((id) => byId(id).site))];
  const candidate = c.urlId || (c.positional.length === 1 ? c.positional[0] : '');
  const named = () => { const h = hits.find((x) => x.k.length === best); const name = displayName(c.claim, h.k); return { key: h.k, name, words: words(name).join(' ') }; };
  if (matches.length) {
    const n = named();
    if (sites.length > 1) return { ok: false, reason: 'the company it names matches more than one retrieved site' };
    const id = matches.includes(candidate) ? candidate : matches[0];
    const sameSite = sources.filter((s) => s.kind === 'research' && s.site === sites[0]).map((s) => s.id);
    const e = entities[n.key] = entities[n.key] || { name: n.name, name_words: n.words, key: n.key, site: sites[0], source_ids: [] };
    sameSite.forEach((x) => { if (!e.source_ids.includes(x)) e.source_ids.push(x); });
    if (matches.includes(candidate)) return { ok: true, id, attribution: c.urlId ? 'url_and_entity_verified' : 'entity_verified', entity: n.name };
    return { ok: true, id, attribution: 'remapped', entity: n.name, remapped_from: candidate || c.positional.join(',') || 'none' };
  }
  // The page address is the claim's own statement of where it comes from, so it binds the claim when it is a retrieved source.
  if (c.urlId) return { ok: true, id: c.urlId, attribution: 'url_verified' };
  if (c.url_given) return { ok: false, reason: 'the page address given for it is not one of the retrieved sources' };
  if (company) return { ok: false, reason: 'it is a company claim with no page address, and no retrieved source belongs to the company it names' };
  if (c.positional.length) return { ok: true, id: c.positional[0], ids: c.positional, attribution: 'positional' };
  return { ok: false, reason: 'it has no usable source' };
};
candidates.forEach((c) => { c.res = resolve(c); });
// A call in which a named company's claim pointed at another company's page has unreliable markers: that is positive
// proof the numbering is off. Its marker-only claims cannot be trusted. A company claim that matches no retrieved
// source is dropped by itself and proves nothing about the other markers.
callReports.forEach((r) => {
  const mine = candidates.filter((c) => c.call === r.node);
  const broken = mine.some((c) => c.res.ok && c.res.attribution === 'remapped');
  const checked = mine.some((c) => c.res.ok && /entity_verified/.test(c.res.attribution));
  r.marker_order = broken ? 'unreliable' : checked ? 'consistent with the named companies' : 'not checkable (no company claims)';
  if (broken) mine.forEach((c) => { if (c.res.ok && c.res.attribution === 'positional') c.res = { ok: false, reason: 'its only link to a source is a citation marker, and this research call numbered its markers out of order' }; });
  r.verified = mine.filter((c) => c.res.ok && /verified/.test(c.res.attribution)).length;
  r.remapped = mine.filter((c) => c.res.ok && c.res.attribution === 'remapped').length;
  r.positional = mine.filter((c) => c.res.ok && c.res.attribution === 'positional').length;
  r.dropped = mine.filter((c) => !c.res.ok).length;
});

// 4. Evidence ledger: one object per kept claim.
const claims = [];
const remaps = [];
const dropped = [];
candidates.forEach((c) => {
  const short = c.claim.length > 160 ? c.claim.slice(0, 157) + '...' : c.claim;
  if (!c.res.ok) { dropped.push({ call: c.call, claim: short, reason: c.res.reason }); gaps.push((c.question ? c.question + ': ' : '') + 'A research claim was discarded because ' + c.res.reason + '. Do not use it: "' + short + '"'); return; }
  const ids = c.res.ids || [c.res.id];
  const entry = {
    claim_id: 'E' + (claims.length + 1),
    question: c.question,
    claim: c.claim,
    claim_type: 'external_research',
    adjacent: /^ADJACENT\s*:/i.test(c.claim),
    source_ids: ids,
    source_type: c.source_type,
    published: c.published,
    anecdotal: /community|forum|reddit|social/i.test(c.source_type),
    attribution: c.res.attribution,
  };
  if (c.res.entity) entry.entity = c.res.entity;
  if (c.res.attribution === 'remapped') remaps.push({ claim_id: entry.claim_id, entity: c.res.entity, marker_pointed_at: c.res.remapped_from, resolved_to: c.res.id });
  claims.push(entry);
});
// A source's date and identity come only from claims that are tied to it.
claims.forEach((c) => {
  if (c.source_ids.length !== 1) return;
  const s = byId(c.source_ids[0]);
  if (!s || s.kind !== 'research') return;
  if (c.attribution !== 'positional') s.identity = 'matched to the company or page address named in the claim';
  if (!/not shown/i.test(c.published) && /^not provided/.test(s.published)) {
    s.published = c.published + ' (as reported by the research tool)';
    s.published_basis = c.attribution === 'positional' ? 'research tool, source tied to the claim by citation marker only' : 'research tool, source identity checked against the claim';
  }
});
failed.forEach((n) => gaps.unshift(n + ': this research call returned nothing. Treat its questions as not researched.'));

// 5. Brave results: search listings only, kept with URL and date.
let results = [];
try { const br = $('Brave Search').first().json; results = br && br.web && Array.isArray(br.web.results) ? br.web.results : []; } catch (e) {}
const snippets = [];
results.forEach((r) => {
  if (!r || !r.url) return;
  const id = addSource('search_snippet', stripTags(r.title), r.url, r.page_age ? String(r.page_age).slice(0, 10) : 'date not shown', 'Brave Search');
  snippets.push(id + ': ' + stripTags(r.title) + '. ' + stripTags(r.description));
});

return {
  sources: JSON.stringify(sources),
  research_ledger: claims.length
    ? JSON.stringify(claims, null, 1)
    : 'Structured parsing failed. No research claim could be tied to a source. Treat every research question as not researched.',
  research_gaps: gaps.join('\n'),
  snippets: snippets.join('\n'),
  entities: JSON.stringify(Object.values(entities)),
  source_integrity: JSON.stringify({ calls: callReports, remapped: remaps, dropped }, null, 1),
  remapped_claims: remaps.length,
  dropped_claims: dropped.length,
  unmatched_markers: unmatched,
  t_ms: Date.now(),
};
