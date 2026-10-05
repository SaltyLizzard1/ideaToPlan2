// Collect Evidence: turns both research calls and the Brave results into source records and candidate claims.
// Nothing here is evidence yet. A candidate claim enters the ledger only after Build Evidence has checked it
// against the fetched page.
//
// SOURCE AND CLAIM CONTRACT
// - A source record is created once, keyed by its URL, and gets its ID at that moment. Nothing later renumbers it.
// - A claim gets its ID (E1, E2, ...) here, in the order the research output states it. The ID stays with the
//   claim whether it is later verified or excluded, so ledger IDs can have gaps.
// - A search listing is not evidence. The first few listings are turned into candidate claims (what the listing says
//   the page is), so they are fetched and verified like every other claim, or excluded. Nothing reaches the writer
//   from a search result without that check.
// - Each claim lists the sources it could rest on, in this order: the page address the research model gave for it,
//   pages of the company it names, and the page its citation marker points at. These are candidates only. Which
//   source a claim is attributed to is decided by what the fetched pages say, never by a domain name or a marker.
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
  sources.push({ id, kind, title: title || 'Untitled page', url, domain, site: siteOf(domain), entity_keys: entityKeys(title, domain), published, published_basis: kind === 'research' ? 'not checked' : 'search listing', identity: 'unverified', call, accessed });
  return id;
};
const byId = (id) => sources.find((s) => s.id === id);

// 2. Research calls. Each call's annotations become source records; each CLAIM line becomes a candidate claim.
const failed = [];
const candidates = [];
const callReports = [];
const gaps = [];
const noSource = [];
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
const entities = {};
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
    const id = addSource('research', clean(uc.title), uc.url, 'date not shown', nodeName);
    markerToId[i + 1] = id;
    if (!callIds.includes(id)) callIds.push(id);
  });
  let mine = 0;
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
    const claimText = strip(parts[0]);
    const sourceType = field('SOURCE TYPE');
    const urlField = field('URL');
    const urlId = urlField && urlToId[normUrl(urlField)] && callIds.includes(urlToId[normUrl(urlField)]) ? urlToId[normUrl(urlField)] : '';
    const positional = [...new Set(markers.map((n) => markerToId[n]).filter(Boolean))];

    // Sources in this call whose site or title spells the company the claim starts with.
    const grams = leadGrams(claimText);
    const minKey = /company/i.test(sourceType) ? 5 : 15;
    let best = 0;
    const hits = [];
    callIds.map(byId).forEach((s) => s.entity_keys.forEach((k) => { if (k.length >= minKey && grams.has(k)) { hits.push({ s, k }); if (k.length > best) best = k.length; } }));
    const top = hits.filter((h) => h.k.length === best);
    let entityIds = [...new Set(top.map((h) => h.s.id))];
    let entity = null;
    if (top.length) {
      const key = top[0].k;
      const name = displayName(claimText, key);
      entity = { key, name, name_words: words(name).join(' ') };
      const e = entities[key] = entities[key] || { name, name_words: entity.name_words, key, sites: [], own_source_ids: [] };
      entityIds.forEach((id) => { const s = byId(id); if (!e.sites.includes(s.site)) e.sites.push(s.site); });
    } else if (/company/i.test(sourceType)) {
      // No source key spells the name in full: Reelo on reelome.com, Intermark on intermarkrelocation.com. The name the
      // claim opens with is accepted only when a source of this call carries it: its site name starts with the name
      // (or the name with the site name), or its page title contains the name as words. Only a site match makes the
      // site the company's own. Build Evidence still requires the fetched page to name the company.
      const name = leadName(claimText);
      const key = squash(name);
      const nameWords = words(name).join(' ');
      if (key.length >= 5) {
        const bySite = callIds.filter((id) => { const site = squash(byId(id).site); return site.length >= 5 && (site.startsWith(key) || key.startsWith(site)); });
        const byTitle = callIds.filter((id) => (' ' + words(byId(id).title).join(' ') + ' ').includes(' ' + nameWords + ' '));
        const ids = [...new Set(bySite.concat(byTitle))];
        if (ids.length) {
          entity = { key, name, name_words: nameWords };
          entityIds = ids;
          const e = entities[key] = entities[key] || { name, name_words: nameWords, key, sites: [], own_source_ids: [] };
          bySite.forEach((id) => { const s = byId(id); if (!e.sites.includes(s.site)) e.sites.push(s.site); });
        }
      }
    }
    const ordered = [];
    const push = (id, basis) => { if (id && !ordered.some((x) => x.id === id)) ordered.push({ id, basis }); };
    push(urlId, 'page address given by the research tool');
    entityIds.filter((id) => positional.includes(id)).forEach((id) => push(id, 'citation marker and company name'));
    entityIds.forEach((id) => push(id, 'page of the company the claim names'));
    positional.forEach((id) => push(id, 'citation marker'));
    const kept = ordered.slice(0, 3);

    const cand = {
      claim_id: 'E' + (candidates.length + 1),
      call: nodeName,
      question,
      claim: claimText,
      source_type: sourceType,
      reported_published: field('PUBLISHED') || 'date not shown',
      url_given: urlField,
      markers,
      entity,
      candidate_source_ids: kept.map((x) => x.id),
      candidate_basis: kept.map((x) => x.basis),
    };
    candidates.push(cand);
    mine++;
    if (!kept.length) noSource.push(cand.claim_id);
  });
  callReports.push({ node: nodeName, sources_returned: callIds.length, claims: mine });
};
['Growth Research', 'Market Research'].forEach(readCall);
// A company's own pages: every research source on a site that spells its name.
Object.values(entities).forEach((e) => { e.own_source_ids = sources.filter((s) => s.kind === 'research' && e.sites.includes(s.site)).map((s) => s.id); });
failed.forEach((n) => gaps.unshift(n + ': this research call returned nothing. Treat its questions as not researched.'));

// 3. Brave results. A listing only tells us a page exists. Each of the first SEARCH_LISTING_LIMIT listings becomes a
//    candidate claim about its own page, tied to that page alone. The rest are recorded as sources and not used.
const SEARCH_LISTING_LIMIT = 8;
let results = [];
try { const br = $('Brave Search').first().json; results = br && br.web && Array.isArray(br.web.results) ? br.web.results : []; } catch (e) {}
let listingClaims = 0;
let listingsSkipped = 0;
results.forEach((r) => {
  if (!r || !r.url) return;
  const title = stripTags(r.title).replace(/\s+/g, ' ');
  const description = stripTags(r.description).replace(/\s+/g, ' ');
  const id = addSource('search_snippet', title, r.url, 'date not shown', 'Brave Search');
  if (listingClaims >= SEARCH_LISTING_LIMIT || !description) { listingsSkipped++; return; }
  if (candidates.some((c) => c.call === 'Brave Search' && c.candidate_source_ids[0] === id)) return;
  listingClaims++;
  candidates.push({
    claim_id: 'E' + (candidates.length + 1),
    call: 'Brave Search',
    question: 'W Pages found by web search',
    claim: 'The page "' + title + '" says: ' + description,
    source_type: 'search listing',
    reported_published: 'date not shown',
    url_given: r.url,
    markers: [],
    entity: null,
    candidate_source_ids: [id],
    candidate_basis: ['page found by web search'],
  });
});
callReports.push({ node: 'Brave Search', sources_returned: results.length, claims: listingClaims, listings_not_checked: listingsSkipped });

return {
  sources: JSON.stringify(sources),
  candidates: JSON.stringify(candidates),
  entities: JSON.stringify(Object.values(entities)),
  gaps: JSON.stringify(gaps),
  snippets: '',
  calls: JSON.stringify(callReports),
  failed_calls: JSON.stringify(failed),
  candidate_claims: candidates.length,
  claims_without_source: noSource.length,
  unmatched_markers: unmatched,
  t_ms: Date.now(),
};
