// Build Evidence: merges both research calls and the Brave results into one numbered source list and an evidence ledger.
const accessed = new Date().toISOString().slice(0, 10);
const clean = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const stripTags = (v) => clean(v).replace(/<[^>]*>/g, '');
const domainOf = (u) => { const m = String(u || '').match(/^https?:\/\/([^\/?#:]+)/i); return m ? m[1].replace(/^www\./i, '') : ''; };

// 1. Sources. One numbered list across both research calls and the Brave results. The same URL keeps one ID.
const sources = [];
const urlToId = {};
let unmatched = 0;
const addSource = (kind, title, url, published) => {
  if (urlToId[url]) return urlToId[url];
  const id = (kind === 'research' ? 'S' : 'W') + (sources.filter((s) => s.kind === kind).length + 1);
  urlToId[url] = id;
  sources.push({ id, kind, title: title || 'Untitled page', url, domain: domainOf(url), published, accessed });
  return id;
};

// Perplexity marks claims [1], [2]... and returns the URLs as annotations in marker order.
const failed = [];
const ingest = (nodeName) => {
  let msg = {};
  try { const r = $(nodeName).first().json; msg = (r && Array.isArray(r.choices) && r.choices[0] && r.choices[0].message) || {}; } catch (e) {}
  if (!clean(msg.content)) { failed.push(nodeName); return ''; }
  const annotations = Array.isArray(msg.annotations) ? msg.annotations : [];
  const markerToId = {};
  annotations.forEach((a, i) => {
    const uc = a && a.type === 'url_citation' ? a.url_citation : null;
    if (!uc || !uc.url) return;
    markerToId[i + 1] = addSource('research', clean(uc.title), uc.url, 'not provided by the search tool');
  });
  return clean(msg.content).replace(/\[(\d+)\]/g, (m, n) => {
    if (markerToId[n]) return '[' + markerToId[n] + ']';
    unmatched++;
    return '[unmatched source]';
  });
};
const research = [ingest('Growth Research'), ingest('Market Research')].filter(Boolean).join('\n\n');

// 2. Brave results: search listings only, kept with URL and date.
let results = [];
try { const br = $('Brave Search').first().json; results = br && br.web && Array.isArray(br.web.results) ? br.web.results : []; } catch (e) {}
const snippets = [];
results.forEach((r) => {
  if (!r || !r.url) return;
  const id = addSource('search_snippet', stripTags(r.title), r.url, r.page_age ? String(r.page_age).slice(0, 10) : 'date not shown');
  snippets.push(id + ': ' + stripTags(r.title) + '. ' + stripTags(r.description));
});

// 3. Evidence ledger: one object per CLAIM line. Claims without a source are dropped.
const claims = [];
const gaps = failed.map((n) => n + ': this research call returned nothing. Treat its questions as not researched.');
let question = '';
research.split('\n').forEach((line) => {
  const t = line.trim().replace(/^[-*]\s*/, '');
  const q = t.match(/^#+\s*([A-Z]\d\s.*)$/);
  if (q) { question = q[1].trim(); return; }
  if (/^NOT FOUND:/i.test(t)) { gaps.push((question ? question + ': ' : '') + t.replace(/^NOT FOUND:\s*/i, '')); return; }
  const c = t.match(/^CLAIM:\s*(.+)$/i);
  if (!c) return;
  const parts = c[1].split('|').map((p) => p.trim());
  const strip = (v) => v.replace(/\[(S\d+|unmatched source)\]/g, '').trim();
  const field = (name) => { const p = parts.find((x) => x.toUpperCase().startsWith(name + ':')); return p ? strip(p.slice(name.length + 1)) : ''; };
  const sourceIds = [...new Set((t.match(/\[S\d+\]/g) || []).map((x) => x.slice(1, -1)))];
  if (!sourceIds.length) return;
  const sourceType = field('SOURCE TYPE');
  const claimText = strip(parts[0]);
  claims.push({
    claim_id: 'E' + (claims.length + 1),
    question,
    claim: claimText,
    claim_type: 'external_research',
    adjacent: /^ADJACENT\s*:/i.test(claimText),
    source_ids: sourceIds,
    source_type: sourceType,
    published: field('PUBLISHED') || 'date not shown',
    anecdotal: /community|forum|reddit|social/i.test(sourceType),
  });
});
claims.forEach((c) => {
  if (c.source_ids.length !== 1 || /not shown/i.test(c.published)) return;
  const s = sources.find((x) => x.id === c.source_ids[0]);
  if (s && s.kind === 'research' && /^not provided/.test(s.published)) s.published = c.published + ' (as reported by the research tool)';
});

return {
  sources: JSON.stringify(sources),
  research_ledger: claims.length
    ? JSON.stringify(claims, null, 1)
    : 'Structured parsing failed. Raw research follows. Use only sentences that carry an [S#] tag.\n' + research,
  research_gaps: gaps.join('\n'),
  snippets: snippets.join('\n'),
  unmatched_markers: unmatched,
  t_ms: Date.now(),
};
