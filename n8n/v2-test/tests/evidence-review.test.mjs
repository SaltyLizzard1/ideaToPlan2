// Regression checks for the evidence and review fixes that followed the first source-verification run (execution 63217).
// Run: node --test n8n/v2-test/tests/evidence-review.test.mjs
// No network and no model calls. Everything here is decided by code; where a result would depend on a model's
// answer, the answer is scripted and the test says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNode, fixture, clone } from './harness.mjs';
import { pipeline, research, withRenderedFB, answer, reply, agreeable, excerptNear, ws } from './pipeline.mjs';

const DAY = 24 * 3600 * 1000;
const at = (iso) => Date.parse(iso + 'T09:00:00Z');
const clock = (iso) => ({ ...fixture('Founder Context'), run_started_ms: at(iso) });
const citationCheck = (ev, { planText, founder = fixture('Founder Context'), firstPass = false } = {}) => {
  const stubs = { 'Founder Context': founder, 'Compute Financials': fixture('Compute Financials'), 'Assemble Plan': fixture('Assemble Plan'), 'Build Evidence': ev, 'Growth Plan Generator1': fixture('Growth Plan Generator1') };
  if (!firstPass) { const rev = clone(fixture('Apply Revisions')); if (planText !== undefined) rev.text = planText; stubs['Apply Revisions'] = rev; }
  return runNode('citation-check.js', stubs);
};
const delivered = () => fixture('Apply Revisions').text;
const withLine = (line) => delivered() + '\n\n' + line + '\n';
const lastLine = (text) => text.replace(/\n+$/, '').split('\n').length;
const onLast = async (ev, line, opts = {}) => { const text = withLine(line); return (await citationCheck(ev, { ...opts, planText: text })).det_issues.filter((i) => i.line === lastLine(text)); };
const types = (issues) => issues.map((i) => i.severity + ' ' + i.type);
const scripted = (byClaim) => ({ requests, pages, candidates }) => requests.map((r) => reply(r.source_id, r.claim_ids.map((id) => { const c = candidates.find((x) => x.claim_id === id); const page = pages.find((p) => p.source_id === r.source_id); return answer(id, { excerpt: excerptNear(c.claim, page.text), ...(byClaim(c, page) || {}) }); })));
const withDate = (sid, shown) => (a) => agreeable(a).map((res, i) => { if (a.requests[i].source_id !== sid) return res; const o = JSON.parse(res.choices[0].message.content); o.date_shown = shown; return { ...res, choices: [{ message: { content: JSON.stringify(o) } }] }; });
const stampPage = (sid, text) => (p) => p.map((x) => x.source_id === sid ? { ...x, text: x.text + '\n' + text } : x);

// ---------------- 1. Run date ----------------

test('run date: every prompt that judges dates carries the workflow clock, not a fixed date', async () => {
  for (const iso of ['2026-10-04', '2031-03-05', '2024-01-31']) {
    const founder = clock(iso);
    const r = await pipeline({ runMs: founder.run_started_ms });
    const line = 'RUN DATE: today is ' + iso;
    // research
    const san = await runNode('sanitize-data.js', { 'Prepare Client Data': {}, 'Founder Context': founder });
    assert.ok(san.research_system.includes(line), 'research ' + iso);
    assert.equal(san.run_date, iso);
    // verification
    r.requests.forEach((q) => assert.ok(JSON.parse(q.payload).messages[0].content.includes(line), 'verifier ' + iso));
    assert.equal(r.ev.run_date, iso);
    // writing
    const writer = await runNode('build-growth-payload.js', { 'Founder Context': founder, 'Build Evidence': r.ev, 'Compute Financials': fixture('Compute Financials') });
    assert.ok(JSON.parse(writer.payload).messages[1].content.startsWith(line), 'writer ' + iso);
    // QA, first review and the check after revision
    for (const firstPass of [true, false]) {
      const cc = await citationCheck(r.ev, { founder, firstPass });
      assert.ok(JSON.parse(cc.qa_payload).messages[1].content.startsWith(line), 'QA ' + iso);
    }
    // revision
    const cc = await citationCheck(r.ev, { founder, firstPass: true });
    const prr = await runNode('plan-revision-request.js', { 'Founder Context': founder, 'Compute Financials': fixture('Compute Financials'), 'Citation Check': cc, 'Assemble Plan': fixture('Assemble Plan'), 'Build Evidence': r.ev }, { choices: [{ message: { content: JSON.stringify({ findings: [], summary: '' }) } }], usage: {} });
    if (prr.revise_payload) assert.ok(JSON.parse(prr.revise_payload).messages[1].content.startsWith(line), 'reviser ' + iso);
    assert.ok(prr.needs_revision && prr.revise_payload, 'the delivered plan needs revision, so the reviser request is built');
  }
  // The timezone is stated, and the code holds no fixed date.
  const san = await runNode('sanitize-data.js', { 'Prepare Client Data': {}, 'Founder Context': clock('2026-10-04') });
  assert.match(san.research_system, /timezone UTC/);
});

test('run date: a legitimate past date is kept, a genuinely future date is rejected, by code', async () => {
  const cases = [
    // [date on the page, run date, expected published, future?]
    ['September 11, 2026', '2026-10-04', 'September 11, 2026', false],
    ['September 11, 2026', '2026-09-11', 'September 11, 2026', false],
    ['September 11, 2026', '2026-06-01', 'date not shown', true],
    ['6th February 2025', '2026-10-04', '6th February 2025', false],
    ['2023-04-17T18:39:46.000Z', '2026-10-04', '2023-04-17T18:39:46.000Z', false],
    ['Published February 12, 2026 · Updated July 26, 2026', '2026-10-04', 'Published February 12, 2026 · Updated July 26, 2026', false],
    ['Published February 12, 2026 · Updated July 26, 2026', '2026-03-01', 'date not shown', true],
    ['March 3, 2027', '2026-10-04', 'date not shown', true],
    ['14 January 2031', '2026-10-04', 'date not shown', true],
    ['October 2026', '2026-10-04', 'October 2026', false],
    ['December 2026', '2026-10-04', 'date not shown', true],
  ];
  for (const [shown, run, expected, future] of cases) {
    const r = await pipeline({ runMs: at(run), pagesHook: stampPage('S5', 'Last updated ' + shown), verifier: withDate('S5', shown) });
    const s = r.sources.find((x) => x.id === 'S5');
    assert.equal(s.published, expected, shown + ' on ' + run);
    assert.equal(!!s.future_date_shown, future, shown + ' on ' + run);
    if (future) assert.match(s.published_basis, new RegExp('after the run date ' + run));
    else assert.match(s.published_basis, /on or before the run date/);
  }
  // The publication-date fix from the previous round still holds.
  for (const bad of ['©2023-2025', 'Copyright 2025', '2026']) {
    const r = await pipeline({ runMs: at('2026-10-04'), pagesHook: stampPage('S5', bad + ' La Relocation Group'), verifier: withDate('S5', bad) });
    assert.equal(r.sources.find((x) => x.id === 'S5').published, 'date not shown', bad);
  }
});

test('run date: the plan may not call a past date anomalous, and may say so for a future one', async () => {
  const past = await pipeline({ runMs: at('2026-10-04'), pagesHook: stampPage('S27', 'Last updated September 22, 2026'), verifier: withDate('S27', 'September 22, 2026') });
  const line = 'The services market grew to $54.49 billion in 2026 [S27]. Note: the publication date shown for this source is September 22, 2026, which is anomalous.';
  const a = await onLast(past.ev, line, { founder: clock('2026-10-04') });
  assert.ok(types(a).includes('MAJOR SOURCE DATE WRONGLY CALLED ANOMALOUS'));
  assert.match(a.find((i) => i.type === 'SOURCE DATE WRONGLY CALLED ANOMALOUS').detail, /run date is 2026-10-04/);
  // When the cited page really shows a date after the run date, the remark is allowed.
  const future = await pipeline({ runMs: at('2026-06-01'), pagesHook: stampPage('S27', 'Last updated September 22, 2026'), verifier: withDate('S27', 'September 22, 2026') });
  const b = await onLast(future.ev, line, { founder: clock('2026-06-01') });
  assert.ok(!types(b).includes('MAJOR SOURCE DATE WRONGLY CALLED ANOMALOUS'));
  // The reviewer and the reviser are told the rule.
  const cc = await citationCheck(past.ev, { founder: clock('2026-10-04'), firstPass: true });
  assert.match(JSON.parse(cc.qa_payload).messages[0].content, /A source date on or before the RUN DATE is not anomalous/);
});

// ---------------- 2. Demand ----------------

test('demand: competitor existence stated as buyers, demand or willingness to pay is blocking', async () => {
  const r = await pipeline();
  // Sentences taken from the plan of execution 63217.
  for (const line of [
    'Multiple direct competitors are operating and publicly marketing one-on-one planning services [S5]. This confirms the service category exists and has buyers.',
    '| Evidence they will pay | The existence of direct competitors offering one-on-one planning sessions [S5] suggests the service category has buyers, but no evidence of willingness to pay $250 has been established |',
    'Competitors are publicly marketing their services [S5], which suggests the service category has an audience willing to seek out paid help.',
    'Multiple competitors are operating in adjacent spaces [S5], suggesting a real customer base exists for paid planning help.',
    'The competitor landscape proves demand for this service.',
    'Competitor activity shows customers are willing to pay.',
  ]) {
    const hit = (await onLast(r.ev, line)).filter((i) => i.type === 'DEMAND STATED AS CONFIRMED');
    assert.equal(hit.length, 1, line);
    assert.equal(hit[0].severity, 'BLOCKING');
    assert.match(hit[0].detail, /hypothesis that requires validation/);
  }
  // Hypothesis wording, negations and questions are accepted.
  for (const line of [
    'Demand for this offer is a hypothesis that requires validation; competitors existing shows only that competing offers exist [S5].',
    'No evidence of willingness to pay has been established.',
    'This offer\'s price and customers\' willingness to pay it remain unvalidated.',
    'The most important unknown is willingness to pay $250.',
    'The first ten conversations test whether buyers exist at this price.',
    'If three people pay, that would show demand at this price.',
  ]) assert.deepEqual((await onLast(r.ev, line)).filter((i) => i.type === 'DEMAND STATED AS CONFIRMED'), [], line);
});

test('demand: a confirmed-demand statement passes only with a verified customers-pay entry cited on it', async () => {
  const r = await pipeline();
  const pays = r.ledger.find((c) => /^M3/.test(c.question));
  assert.ok(pays, 'the fixtures contain a verified M3 (customers pay) claim');
  const id = pays.source_ids[0];
  assert.deepEqual((await onLast(r.ev, 'Published relocation package costs show buyers exist for paid relocation help [' + id + '].')).filter((i) => i.type === 'DEMAND STATED AS CONFIRMED'), []);
  // The same sentence resting on a competitor page is blocked.
  assert.equal((await onLast(r.ev, 'Published relocation services show buyers exist for paid relocation help [S5].')).filter((i) => i.type === 'DEMAND STATED AS CONFIRMED').length, 1);
  // Writer, reviewer and reviser all carry the rule.
  const writer = await runNode('build-growth-payload.js', { 'Founder Context': fixture('Founder Context'), 'Build Evidence': r.ev, 'Compute Financials': fixture('Compute Financials') });
  assert.match(JSON.parse(writer.payload).messages[1].content, /It is not evidence of buyers, sales, or willingness to pay/);
  const cc = await citationCheck(r.ev, { firstPass: true });
  assert.match(JSON.parse(cc.qa_payload).messages[0].content, /23\. Demand: the existence of competitors shows that competing offers exist/);
});

// ---------------- 3. Search listings ----------------

test('search listings: nothing from a search result reaches the writer unless its page was fetched and verified', async () => {
  const brave = fixture('Brave Search').web.results;
  assert.ok(brave.length >= 5);
  const r = await pipeline();
  // Each listing became a candidate claim tied to its own page, and that page was fetched.
  const listed = r.candidates.filter((c) => c.call === 'Brave Search');
  assert.equal(listed.length, 5);
  listed.forEach((c) => { assert.match(c.candidate_source_ids[0], /^W\d+$/); assert.ok(r.pages.some((p) => p.source_id === c.candidate_source_ids[0])); });
  assert.equal(r.ce.snippets, '');
  assert.equal(r.ev.snippets, '');
  // With a verifier that finds the listings unsupported, no W source and no listing text reaches the writer.
  const none = await pipeline({ verifier: scripted((c) => c.call === 'Brave Search' ? { verdict: 'unverifiable', excerpt: '' } : null) });
  assert.ok(!none.ledger.some((c) => /^W/.test(c.source_ids[0])));
  const payload = JSON.parse((await runNode('build-growth-payload.js', { 'Founder Context': fixture('Founder Context'), 'Build Evidence': none.ev, 'Compute Financials': fixture('Compute Financials') })).payload);
  const user = payload.messages[1].content;
  assert.ok(!/SEARCH SNIPPETS/.test(user));
  assert.ok(!/"id": "W\d+"/.test(user), 'no W source is listed for the writer');
  brave.slice(0, 5).forEach((b) => { const d = String(b.description).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 60); assert.ok(!user.includes(d), 'listing text is not in the writer request: ' + d); });
  // Only sources with a verified claim are listed for the writer.
  const listedForWriter = [...user.matchAll(/"id": "([SW]\d+)"/g)].map((m) => m[1]);
  const verified = new Set(none.ledger.flatMap((c) => c.source_ids));
  assert.ok(listedForWriter.length > 0);
  listedForWriter.forEach((id) => assert.ok(verified.has(id), id));
  // A listing page that was fetched and verified enters the ledger like any other page, with its excerpt.
  const some = await pipeline();
  const w = some.ledger.filter((c) => /^W/.test(c.source_ids[0]));
  w.forEach((c) => { assert.equal(c.verification, 'supported'); assert.ok(ws(some.pages.find((p) => p.source_id === c.source_ids[0]).text).includes(c.page_excerpt.split(' ... ')[0])); });
});

test('search listings: a W ID with no verified claim is blocking in the plan, a verified one is not', async () => {
  const none = await pipeline({ verifier: scripted((c) => c.call === 'Brave Search' ? { verdict: 'unverifiable', excerpt: '' } : null) });
  const hit = (await onLast(none.ev, 'Search results show pages from providers positioning around digital nomad coaching [W1] [W2].')).filter((i) => i.type === 'SOURCE CITED WITHOUT A VERIFIED CLAIM');
  assert.equal(hit.length, 2);
  hit.forEach((i) => { assert.equal(i.severity, 'BLOCKING'); assert.match(i.detail, /a page found by web search/); });
  // The delivered plan of 63211 cites W sources; with no verified W claim it is held.
  const out = await citationCheck(none.ev);
  const gate = await runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD' }, 'Plan Revision Request': { findings: out.det_issues.map((i, n) => ({ id: 'A' + n, severity: i.severity, check: i.type, problem: i.detail })) } });
  assert.equal(gate.blocked, true);
  // The old warning that let a listing through is gone.
  assert.ok(!out.det_issues.some((i) => i.type === 'NUMBER SUPPORTED ONLY BY SEARCH SNIPPET'));
  // Writer rules no longer invite listing citations.
  const fc = (await import('node:fs')).readFileSync(new URL('../founder-context.js', import.meta.url), 'utf8');
  assert.ok(!/W snippets|SEARCH SNIPPETS|search listings only/.test(fc));
});

test('evidence paths: the only routes into the writer are the verified ledger, verified sources and masked gaps', async () => {
  const low = await pipeline({ verifier: scripted((c) => /72 million/.test(c.claim) ? { credibility: { rating: 'low', first_party: false, origin_stated: false, basis: 'No origin is given for the forecast on this page.' } } : null) });
  const user = JSON.parse((await runNode('build-growth-payload.js', { 'Founder Context': fixture('Founder Context'), 'Build Evidence': low.ev, 'Compute Financials': fixture('Compute Financials') })).payload).messages[1].content;
  const sections = user.split('\n').filter((l) => /^[A-Z][A-Z ]{6,}(?: \(|$)/.test(l)).map((l) => l.replace(/ \(.*$/, ''));
  ['SOURCES', 'EVIDENCE LEDGER', 'RESEARCH GAPS', 'HOW TO USE THE EVIDENCE'].forEach((s) => assert.ok(sections.includes(s), s));
  assert.ok(!sections.some((s) => /SNIPPET|LISTING|^SEARCH/.test(s)));
  // An excluded statistic is not in the request in any form.
  assert.ok(!/72 million/.test(user));
  // The raw research answers and unverified source titles are not in it either.
  const excludedSource = low.sources.find((s) => s.kind === 'research' && !low.ledger.some((c) => c.source_ids.includes(s.id)));
  assert.ok(excludedSource);
  assert.ok(!user.includes('"id": "' + excludedSource.id + '"'));
});

// ---------------- 4. Verified source is not a verified claim ----------------

test('claims: a source ID is good only for what was verified on that page', async () => {
  const r = await pipeline();
  // A research source that was fetched but has no verified claim.
  const bare = r.sources.find((s) => s.kind === 'research' && s.fetch && s.fetch.outcome === 'ok' && !r.ledger.some((c) => c.source_ids.includes(s.id)));
  assert.ok(bare, 'a page that was read but supports nothing');
  const a = (await onLast(r.ev, 'This provider offers relocation planning for families [' + bare.id + '].')).filter((i) => i.type === 'SOURCE CITED WITHOUT A VERIFIED CLAIM');
  assert.equal(a.length, 1);
  assert.equal(a[0].severity, 'BLOCKING');
  // A source with verified claims does not authorize an unrelated statement.
  const b = (await onLast(r.ev, 'Evidence: community forums of remote workers discuss retirement savings, insurance renewals and school enrolment deadlines every quarter [S5].')).filter((i) => i.type === 'CITED STATEMENT GOES BEYOND THE VERIFIED CLAIM');
  assert.equal(b.length, 1);
  assert.equal(b[0].severity, 'MAJOR');
  assert.match(b[0].detail, /A verified source is not a verified claim/);
  // A statement that restates the verified claim is not flagged.
  const claim = r.ledger.find((c) => c.source_ids[0] === 'S5');
  const ok = await onLast(r.ev, claim.claim + ' [S5]');
  assert.deepEqual(ok.filter((i) => /VERIFIED CLAIM/.test(i.type)), []);
  // The reviewer is told to check the claim, not the source.
  const cc = await citationCheck(r.ev, { firstPass: true });
  assert.match(JSON.parse(cc.qa_payload).messages[0].content, /A verified source is not a verified claim: the ledger lists what was verified on each page/);
});

// ---------------- 5. Punctuation-related exclusions (kept, and counted) ----------------

test('excerpts: matching stays whitespace-only, and punctuation-only misses are recorded as such', async () => {
  const curly = (p) => p.map((x) => x.source_id === 'S5' ? { ...x, text: x.text + '\nIt’s why we plan every move — visas, housing and schools — with you.' } : x);
  const stubs = research();
  stubs['Growth Research'].choices[0].message.content = '## C1 Direct competitors\nCLAIM: LA Relocation Group says it plans every move with the client, covering visas, housing and schools. | SOURCE TYPE: company own website | PUBLISHED: date not shown [3]\n';
  stubs['Market Research'] = { choices: [{ message: { content: '' } }] };
  stubs['Brave Search'] = { web: { results: [] } };
  const straight = await pipeline({ stubs, pagesHook: curly, verifier: scripted(() => ({ excerpt: "It's why we plan every move - visas, housing and schools - with you." })) });
  assert.equal(straight.ledger.length, 0);
  assert.equal(straight.excluded[0].kind, 'deterministic_punctuation');
  assert.match(straight.excluded[0].reason, /PUNCTUATION ONLY/);
  assert.equal(straight.integrity.verification.excluded_for_punctuation_only, 1);
  // Copied exactly, it passes.
  const exact = await pipeline({ stubs, pagesHook: curly, verifier: scripted(() => ({ excerpt: 'It’s why we plan every move — visas, housing and schools — with you.' })) });
  assert.equal(exact.ledger.length, 1);
  // A different wording is not a punctuation miss.
  const other = await pipeline({ stubs, pagesHook: curly, verifier: scripted(() => ({ excerpt: 'We plan each move with you, including visas and schools.' })) });
  assert.equal(other.excluded[0].kind, 'deterministic');
  assert.equal(other.integrity.verification.excluded_for_punctuation_only, 0);
});

// ---------------- 6. Telemetry ----------------

test('telemetry: verifier usage is counted, measured cost is separate from unknown usage, nothing is estimated', async () => {
  const r = await pipeline();
  const cc = await citationCheck(r.ev);
  const base = { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fixture('Compute Financials'), 'Assemble Plan': fixture('Assemble Plan'), 'Apply Revisions': fixture('Apply Revisions'), 'Build Evidence': r.ev, 'Citation Check': cc, 'Plan Revision Request': fixture('Plan Revision Request'), 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Growth Plan Generator1': fixture('Growth Plan Generator1'), 'Brave Search': fixture('Brave Search') };
  const call = (cost) => ({ model: 'anthropic/claude-haiku-4.5', usage: { prompt_tokens: 4000, completion_tokens: 900, cost } });
  const without = (await runNode('finalize-plan.js', base)).telemetry;
  const full = (await runNode('finalize-plan.js', { ...base, 'Verify Claims': [call(0.008), call(0.009), call(0.01)] })).telemetry;
  const v = full.calls.find((c) => c.stage === 'Source verification');
  assert.equal(v.call_count, 3);
  assert.equal(v.input_tokens, 12000);
  assert.equal(v.output_tokens, 2700);
  assert.ok(Math.abs(v.cost_usd - 0.027) < 1e-9);
  assert.ok(Math.abs(full.metered_cost_usd - without.metered_cost_usd - 0.027) < 1e-4, 'the verifier cost is in the total');
  assert.equal(full.ai_calls, without.ai_calls + 3);
  assert.equal(full.cost_complete, true);
  assert.equal(full.cost_basis.estimated_usd, null);
  assert.equal(full.cost_basis.measured_usd, full.metered_cost_usd);
  assert.equal(full.source_verification.pages_requested, 30);
  // A verifier call that reports no usage is counted as unknown, named, and not filled in.
  const partial = await runNode('finalize-plan.js', { ...base, 'Verify Claims': [call(0.008), { error: { message: 'timeout' } }, call(0.01)] });
  const pv = partial.telemetry.calls.find((c) => c.stage === 'Source verification');
  assert.equal(pv.call_count, 3);
  assert.equal(pv.calls_with_unknown_usage, 1);
  assert.ok(Math.abs(pv.cost_usd - 0.018) < 1e-9);
  assert.equal(partial.telemetry.cost_complete, false);
  assert.ok(partial.telemetry.cost_basis.unknown.some((u) => /Verify Claims: 1 of 3 calls returned no usage/.test(u)));
  assert.match(partial.report, /Cost basis: measured from provider responses\. Estimated: none\./);
  assert.match(partial.report, /incomplete: at least one call reported no cost/);
});

// ---------------- 7. Code shape the n8n validator checks ----------------

test('validator: no Code node returns a bare list of non-items from inside a helper', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['build-evidence.js', 'collect-evidence.js', 'fetch-source-pages.js', 'build-verification-request.js', 'build-growth-payload.js']) {
    const code = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.equal((code.match(/return \[\s*['"`]/g) || []).length, 0, f + ' has a return of an array of strings');
  }
});
