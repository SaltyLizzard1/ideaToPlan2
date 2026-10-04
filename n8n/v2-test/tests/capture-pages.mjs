// Captures the pages cited in execution 63211 so the fetch and verification code can be tested with no network.
// Run: node n8n/v2-test/tests/capture-pages.mjs
// It runs the real Fetch Source Pages code with a live request helper and saves every response, one per hop,
// to fixtures/pages/replay.json. A plain GET with the same headers the node sends. Nothing is rendered or altered.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, fixture, PAGES } from './harness.mjs';

// Addresses already captured are replayed, not fetched again, so earlier fixtures stay exactly as they were.
const saved = existsSync(PAGES) ? JSON.parse(readFileSync(PAGES, 'utf8')) : {};
const ctx = { helpers: { httpRequest: async (opts) => {
  if (saved[opts.url]) { const o = saved[opts.url]; if (o.error) { const e = new Error(o.error); e.code = o.code; throw e; } return { statusCode: o.statusCode, headers: o.headers || {}, body: o.body }; }
  try {
    const r = await fetch(opts.url, { method: 'GET', redirect: 'manual', headers: opts.headers, signal: AbortSignal.timeout(opts.timeout) });
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    const type = headers['content-type'] || '';
    const body = /html|text|xml/i.test(type) || !type ? await r.text() : '';
    saved[opts.url] = { statusCode: r.status, headers: { location: headers.location, 'content-type': type }, body, captured_at: new Date().toISOString() };
    return { statusCode: r.status, headers, body };
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    saved[opts.url] = { error: timeout ? 'timeout of ' + opts.timeout + 'ms exceeded' : String((e && e.cause && e.cause.code) || (e && e.message) || e), code: timeout ? 'ECONNABORTED' : (e && e.cause && e.cause.code) || 'ERR', captured_at: new Date().toISOString() };
    const err = new Error(saved[opts.url].error); err.code = saved[opts.url].code; throw err;
  }
} } };

const ce = await runNode('collect-evidence.js', { 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Brave Search': fixture('Brave Search') });
const out = await runNode('fetch-source-pages.js', { 'Collect Evidence': ce }, undefined, ctx);
mkdirSync(path.dirname(PAGES), { recursive: true });
writeFileSync(PAGES, JSON.stringify(saved));
console.log('candidate claims', ce.candidate_claims, '| without source', ce.claims_without_source);
console.log('pages', out.pages_requested, 'read', out.pages_read, out.outcomes, out.fetch_ms + ' ms');
for (const p of JSON.parse(out.pages)) console.log(p.source_id.padEnd(4), p.outcome.padEnd(17), String(p.http_status).padEnd(4), String(p.text_chars).padStart(7), p.redirects.length ? 'redirect -> ' + p.final_url : '', p.detail);
