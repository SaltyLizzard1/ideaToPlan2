// Fetch Source Pages: fetches each cited page once per run and keeps what was requested, what came back, and its text.
//
// - One request chain per unique URL. Redirects are followed by hand so the final address is recorded.
// - Every request has a timeout, and the whole node has a time budget. A page that is not reached is recorded as
//   such; it is never retried silently and never counted as read.
// - A plain GET with an honest User-Agent. No cookies, no login, no rendering service. A page that refuses the
//   request (401, 403, 429) is recorded as refused.
// - The page text is evidence for the verifier. Nothing in it is ever treated as an instruction.
const ce = $('Collect Evidence').first().json;
const sources = JSON.parse(ce.sources || '[]');
const candidates = JSON.parse(ce.candidates || '[]');

const UA = 'Mozilla/5.0 (compatible; IdeaToPlanSourceCheck/1.0; +https://ideatoplan.to)';
const REQUEST_TIMEOUT_MS = 12000;
const NODE_BUDGET_MS = 100000;
const MAX_REDIRECTS = 5;
const CONCURRENCY = 6;
const MAX_TEXT_CHARS = 200000;
const MIN_TEXT_CHARS = 200;
const started = Date.now();

// Only public web addresses. A URL written by a model must not reach this server's own network.
const blockedHost = (u) => {
  const m = String(u || '').match(/^https?:\/\/(\[[^\]]+\]|[^\/?#:]+)/i);
  if (!m) return 'not an http or https address';
  const h = m[1].toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.startsWith('[')) return 'local or internal host';
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) { const a = +ip[1], b = +ip[2]; if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private network address'; }
  return '';
};
const absolute = (loc, base) => {
  if (/^https?:\/\//i.test(loc)) return loc;
  const o = base.match(/^(https?:)\/\/[^\/?#]+/i);
  if (!o) return loc;
  if (loc.startsWith('//')) return o[1] + loc;
  if (loc.startsWith('/')) return o[0] + loc;
  return base.replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/') + loc;
};

// HTML to text. Scripts, styles and markup are removed; block tags become line breaks; entities are decoded.
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', middot: '·', bull: '•', times: '×', deg: '°' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : ' '; }
  const v = NAMED[e.toLowerCase()];
  return v === undefined ? all : v;
});
const toText = (html) => {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? decode(titleM[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
  let t = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/header|\/footer|\/table|\/ul|\/ol|\/blockquote|\/dd|\/dt)\b[^>]*>/gi, '\n')
    .replace(/<\/(td|th)\s*>/gi, ' | ')
    .replace(/<[^>]*>/g, ' ');
  t = decode(t).replace(/[ ​‌‍﻿]/g, ' ');
  t = t.split('\n').map((l) => l.replace(/[ \t\r\f\v]+/g, ' ').trim()).filter(Boolean).join('\n');
  return { title, text: t };
};

const fetchPage = async (src) => {
  const page = { source_id: src.id, requested_url: src.url, final_url: '', redirects: [], retrieved_at: new Date().toISOString(), http_status: null, content_type: '', outcome: '', detail: '', title: '', text: '', text_chars: 0, truncated: false, ms: 0 };
  const t0 = Date.now();
  const done = (outcome, detail) => { page.outcome = outcome; page.detail = detail || ''; page.ms = Date.now() - t0; return page; };
  let url = src.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const blocked = blockedHost(url);
    if (blocked) return done('blocked_address', blocked);
    if (Date.now() - started > NODE_BUDGET_MS) return done('not_fetched', 'the time budget for fetching pages ran out before this page was requested');
    let r;
    try {
      r = await this.helpers.httpRequest({ method: 'GET', url, returnFullResponse: true, ignoreHttpStatusErrors: true, disableFollowRedirect: true, timeout: REQUEST_TIMEOUT_MS, encoding: 'text', json: false, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en' } });
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 200);
      return done(/timeout|ETIMEDOUT|ECONNABORTED/i.test(msg + ' ' + ((e && e.code) || '')) ? 'timeout' : 'network_error', msg);
    }
    const status = r.statusCode;
    const headers = r.headers || {};
    page.http_status = status;
    page.final_url = url;
    if (status >= 300 && status < 400 && headers.location) {
      const next = absolute(String(headers.location), url);
      page.redirects.push({ from: url, status, to: next });
      url = next;
      continue;
    }
    page.content_type = String(headers['content-type'] || '');
    if (status === 401 || status === 403 || status === 429) return done('refused', 'the site answered HTTP ' + status);
    if (status < 200 || status >= 300) return done('http_error', 'the site answered HTTP ' + status);
    const body = typeof r.body === 'string' ? r.body : '';
    if (page.content_type && !/html|text\/plain|xml/i.test(page.content_type)) return done('unsupported_type', 'the address returned ' + page.content_type.split(';')[0] + ', which is not read as page text');
    const x = toText(body);
    page.title = x.title;
    page.truncated = x.text.length > MAX_TEXT_CHARS;
    page.text = x.text.slice(0, MAX_TEXT_CHARS);
    page.text_chars = page.text.length;
    if (page.text_chars < MIN_TEXT_CHARS) return done('empty', 'the page returned ' + page.text_chars + ' characters of readable text');
    return done('ok', '');
  }
  return done('too_many_redirects', 'more than ' + MAX_REDIRECTS + ' redirects');
};

// Only sources that at least one claim could rest on are fetched, and each address is fetched once.
const wanted = new Set();
candidates.forEach((c) => (c.candidate_source_ids || []).forEach((id) => wanted.add(id)));
const queue = sources.filter((s) => wanted.has(s.id));
const pages = [];
let next = 0;
const worker = async () => { while (next < queue.length) { const s = queue[next++]; pages.push(await fetchPage(s)); } };
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
pages.sort((a, b) => queue.findIndex((s) => s.id === a.source_id) - queue.findIndex((s) => s.id === b.source_id));

const outcomes = {};
pages.forEach((p) => { outcomes[p.outcome] = (outcomes[p.outcome] || 0) + 1; });
return {
  pages: JSON.stringify(pages),
  pages_requested: pages.length,
  pages_read: pages.filter((p) => p.outcome === 'ok').length,
  outcomes: JSON.stringify(outcomes),
  fetch_ms: Date.now() - started,
};
