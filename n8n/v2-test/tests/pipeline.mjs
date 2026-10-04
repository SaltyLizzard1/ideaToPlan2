// Runs the evidence nodes in order, the way the workflow does, with captured pages and a scripted verifier.
// Nothing here calls the network or a model. The verifier is a function, so each test states exactly what the
// model is assumed to have answered, and the checks that follow in Build Evidence are the code under test.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, fixture, replayContext, ROOT } from './harness.mjs';

export const ws = (v) => String(v || '').replace(/[\s ​‌‍﻿]+/g, ' ').trim();
export const research = () => ({ 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Brave Search': fixture('Brave Search') });

// The text a browser shows for freedomandbeyond.co, captured by hand on 2026-10-04. The live pipeline does NOT get
// this text: the site is drawn by script and a plain fetch reads nothing. It is used to test the price checks.
export const RENDERED_FB = readFileSync(path.join(ROOT, 'fixtures', 'pages', 'rendered', 'freedomandbeyond.co.txt'), 'utf8').replace(/\r\n/g, '\n').trim();
export const withRenderedFB = (pages) => pages.map((p) => p.requested_url === 'https://freedomandbeyond.co/' ? { ...p, outcome: 'ok', detail: '', title: 'Freedom & Beyond — Global Mobility Consulting', text: RENDERED_FB, text_chars: RENDERED_FB.length } : p);

const ALL_OK = { entity: 'match', amount: 'match', currency: 'match', scope: 'match', qualifier: 'match', period: 'match', population: 'match', geography: 'match', date: 'match' };
export const answer = (claim_id, over = {}) => ({ claim_id, verdict: 'supported', excerpt: '', reasoning: 'The page states this.', checks: { ...ALL_OK }, credibility: { rating: 'high', first_party: true, origin_stated: true, basis: 'Scripted answer used by the regression tests.' }, ...over });
export const reply = (source_id, claims, over = {}) => ({ choices: [{ message: { content: JSON.stringify({ source_id, injection_suspected: false, publisher: '', date_shown: '', claims, ...over }) } }], usage: { cost: 0.001 } });

// An excerpt taken from the page around each number the claim states, or the top of the page when it states none.
export const excerptNear = (claim, pageText) => {
  const text = ws(pageText);
  const nums = [...new Set(claim.match(/\d[\d,]*(?:\.\d+)?/g) || [])].map((n) => n.replace(/,$/, ''));
  const parts = [];
  nums.forEach((n) => { const i = text.indexOf(n); if (i >= 0) parts.push(text.slice(Math.max(0, i - 60), i + n.length + 60).trim()); });
  return parts.length ? parts.join(' ... ') : text.slice(0, 140).trim();
};
// The worst case for the code checks: a verifier that calls every claim supported and credible, quoting real page text.
export const agreeable = ({ requests, pages, candidates }) => requests.map((r) => {
  const page = pages.find((p) => p.source_id === r.source_id);
  return reply(r.source_id, r.claim_ids.map((id) => answer(id, { excerpt: excerptNear(candidates.find((c) => c.claim_id === id).claim, page.text) })));
});

// runMs sets the run clock (Founder Context.run_started_ms). Without it the nodes fall back to the real clock.
// recheckVerifier answers the second, separate check of claims extracted after a contradiction. null means that check did not run.
export async function pipeline({ stubs = research(), ctx = replayContext(), pagesHook = (p) => p, verifier = agreeable, recheckVerifier = agreeable, runMs } = {}) {
  const clock = runMs ? { 'Founder Context': { run_started_ms: runMs } } : {};
  const ce = await runNode('collect-evidence.js', { ...stubs, ...clock });
  const fp = await runNode('fetch-source-pages.js', { 'Collect Evidence': ce }, undefined, ctx);
  const pages = pagesHook(JSON.parse(fp.pages));
  fp.pages = JSON.stringify(pages);
  const reqItems = (await runNode('build-verification-request.js', { 'Collect Evidence': ce, 'Fetch Source Pages': fp, ...clock })).map((i) => i.json);
  const candidates = JSON.parse(ce.candidates);
  const requests = reqItems.filter((r) => !r.none);
  const responses = verifier ? verifier({ requests, pages, candidates }) : null;
  const evStubs = { 'Collect Evidence': ce, 'Fetch Source Pages': fp, 'Build Verification Request': reqItems, ...clock };
  if (responses) evStubs['Verify Claims'] = responses;
  let recheck = [];
  if (responses) {
    const items = (await runNode('build-recheck-request.js', { 'Collect Evidence': ce, 'Build Verification Request': reqItems, 'Verify Claims': responses })).map((i) => i.json);
    evStubs['Build Recheck Request'] = items;
    recheck = items.filter((r) => !r.none);
    if (recheck.length && recheckVerifier) evStubs['Verify Corrections'] = recheckVerifier({ requests: recheck, pages, candidates: recheck.flatMap((r) => r.corrections.map((k) => ({ claim_id: k.claim_id, claim: k.claim }))) });
  }
  const ev = await runNode('build-evidence.js', evStubs);
  return {
    ce, fp, pages, requests, candidates, ev, ctx, recheck,
    sources: JSON.parse(ev.sources),
    ledger: ev.verified_claims ? JSON.parse(ev.research_ledger) : [],
    excluded: JSON.parse(ev.excluded_claims),
    integrity: JSON.parse(ev.source_integrity),
    entities: JSON.parse(ev.entities),
    log: JSON.parse(ev.verification_log),
  };
}
