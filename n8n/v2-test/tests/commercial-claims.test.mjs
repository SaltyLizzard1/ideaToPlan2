// Regression checks for the defects found in execution 63220.
// Run: node --test n8n/v2-test/tests/commercial-claims.test.mjs
// No network and no model calls. Uses the ReloFlow page exactly as the workflow fetched it in execution 63220
// (fixtures/pages/reloflow-63220.json), the financial output of that run, and the sentences that escaped its gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, fixture, clone, ROOT } from './harness.mjs';
import { pipeline, research, answer, reply, agreeable, excerptNear, ws } from './pipeline.mjs';

const RELOFLOW_PAGE = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'pages', 'reloflow-63220.json'), 'utf8'));
const RELOFLOW_CLAIM = readFileSync(path.join(ROOT, 'fixtures', 'pages', 'reloflow-63220.claim.txt'), 'utf8').trim();
const FIN_63220 = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'exec-63220', 'Compute Financials.json'), 'utf8'));
const relo = () => {
  const s = research();
  s['Growth Research'] = { choices: [{ message: { content: '## C1 Direct competitors\nCLAIM: ' + RELOFLOW_CLAIM + ' | SOURCE TYPE: company own website | PUBLISHED: date not shown | URL: https://www.reloflow.com/ [1]\n', annotations: [{ type: 'url_citation', url_citation: { title: 'ReloFlow', url: 'https://www.reloflow.com/' } }] } }] };
  s['Market Research'] = { choices: [{ message: { content: '' } }] };
  s['Brave Search'] = { web: { results: [] } };
  return s;
};
const withReloPage = (pages) => pages.map((p) => /reloflow/.test(p.requested_url) ? { ...RELOFLOW_PAGE, source_id: p.source_id } : p);
const PAGE = ws(RELOFLOW_PAGE.text);
const COACHING = 'A 1 - hour call with one of our experienced movers to plan your move, tackle big decisions, and help you avoid costly mistakes. Learn More $ 75 USD';
const PLAN = 'A customized plan built around your goals, timeline, and budget — with a kickoff call and follow - up to keep you on track. Learn More $ 150 USD';
const C1 = 'ReloFlow lists 1:1 Relo-Coaching, a 1-hour call with one of its experienced movers to plan a move, at $75 USD.';
const C2 = 'ReloFlow lists a Custom Relocation Plan, a customized plan built around goals, timeline, and budget with a kickoff call and follow-up, at $150 USD.';
// The first verifier contradicts the research claim and proposes what the page says instead.
const contradict = (corrections) => ({ requests }) => requests.map((r) => reply(r.source_id, r.claim_ids.map((id) => answer(id, { verdict: 'contradicted', excerpt: '', reasoning: 'The claim says the page states no price, but the page shows prices for both services.', corrections }))));
const TWO = [{ claim: C1, excerpt: 'proposed by the first verifier' }, { claim: C2, excerpt: 'proposed by the first verifier' }];
// The second, separate verifier answers each extracted claim.
const second = (byClaim) => ({ requests, candidates }) => requests.map((r) => reply(r.source_id, r.claim_ids.map((id) => { const c = candidates.find((x) => x.claim_id === id); return answer(id, byClaim(c)); })));
const honest = second((c) => ({ excerpt: /75/.test(c.claim) ? COACHING : PLAN }));
const run = (opts = {}) => pipeline({ stubs: relo(), pagesHook: withReloPage, verifier: contradict(TWO), recheckVerifier: honest, ...opts });

const citationCheck = (ev, { planText, fin = fixture('Compute Financials'), founder = { ...fixture('Founder Context'), run_started_ms: Date.parse('2026-10-04T13:25:56Z') }, firstPass = false } = {}) => {
  const stubs = { 'Founder Context': founder, 'Compute Financials': fin, 'Assemble Plan': fixture('Assemble Plan'), 'Build Evidence': ev, 'Growth Plan Generator1': fixture('Growth Plan Generator1') };
  if (!firstPass) { const rev = clone(fixture('Apply Revisions')); if (planText !== undefined) rev.text = planText; stubs['Apply Revisions'] = rev; }
  return runNode('citation-check.js', stubs);
};
const withLine = (line) => fixture('Apply Revisions').text + '\n\n' + line + '\n';
const lastLine = (text) => text.replace(/\n+$/, '').split('\n').length;
const onLast = async (ev, line, opts = {}) => { const text = withLine(line); return (await citationCheck(ev, { ...opts, planText: text })).det_issues.filter((i) => i.line === lastLine(text)); };
const types = (issues) => issues.map((i) => i.severity + ' ' + i.type);
const COMMERCIAL = /PRICE|PAYMENT|DEMAND|ONE SOURCE|DATE NOTE|BEYOND THE VERIFIED|WITHOUT A VERIFIED/;
const commercial = (issues) => types(issues.filter((i) => COMMERCIAL.test(i.type)));

// ---------------- 1. Recovering contradicted evidence ----------------

test('correction: the page fixture is the one the workflow fetched, and it states both prices', () => {
  assert.equal(RELOFLOW_PAGE.requested_url, 'https://www.reloflow.com/');
  assert.ok(PAGE.includes(COACHING) && PAGE.includes(PLAN));
  assert.match(RELOFLOW_CLAIM, /does not state a price/);
});

test('correction: the ReloFlow prices are recovered as two separate verified claims, with their history', async () => {
  const r = await run();
  // The research claim stays rejected.
  assert.equal(r.excluded.length, 1);
  assert.equal(r.excluded[0].claim_id, 'E1');
  assert.equal(r.excluded[0].status, 'contradicted');
  assert.deepEqual(r.excluded[0].corrections, [{ claim_id: 'E2', outcome: 'verified' }, { claim_id: 'E3', outcome: 'verified' }]);
  // Two distinct offers, each with its own claim, amount, currency, length, scope and excerpt.
  assert.deepEqual(r.ledger.map((c) => c.claim_id), ['E2', 'E3']);
  const [coach, plan] = r.ledger;
  assert.equal(coach.claim, C1);
  assert.equal(plan.claim, C2);
  assert.equal(coach.page_excerpt, COACHING);
  assert.equal(plan.page_excerpt, PLAN);
  assert.ok(/75 USD/.test(coach.page_excerpt) && /1 - hour call/.test(coach.page_excerpt) && !/150/.test(coach.page_excerpt));
  assert.ok(/150 USD/.test(plan.page_excerpt) && /kickoff call/.test(plan.page_excerpt) && !/\b75\b/.test(plan.page_excerpt));
  r.ledger.forEach((c) => { assert.equal(c.derived_from, 'E1'); assert.equal(c.verification, 'supported'); assert.match(c.attribution, /extracted from the fetched page after research claim E1 was contradicted, then verified by a separate check/); assert.equal(c.entity, 'ReloFlow'); assert.deepEqual(c.source_ids, r.excluded[0].candidate_source_ids); });
  assert.deepEqual(r.integrity.corrections.map((h) => [h.original, h.claim_id, h.outcome]), [['E1', 'E2', 'verified'], ['E1', 'E3', 'verified']]);
  assert.equal(r.integrity.verification.corrections_proposed, 2);
  assert.equal(r.integrity.verification.corrections_verified, 2);
  assert.equal(r.entities.find((e) => e.name === 'ReloFlow').verified_claims, 2);
  // The second check is a plain verification request: same system prompt, same page text, the new claims, and nothing that says they are corrections.
  const first = JSON.parse(r.requests[0].payload);
  const again = JSON.parse(r.recheck[0].payload);
  assert.equal(again.messages[0].content, first.messages[0].content);
  assert.ok(again.messages[1].content.includes(RELOFLOW_PAGE.text.slice(0, 200)));
  assert.ok(again.messages[1].content.includes(C1) && again.messages[1].content.includes(C2));
  assert.ok(!/proposed by the first verifier|correct/i.test(again.messages[1].content.split('CLAIMS TO CHECK AGAINST THIS PAGE')[1]));
});

test('correction: a proposal is never accepted on the first verifier\'s word', async () => {
  // The second check did not run: nothing is verified and the plan is held.
  const none = await run({ recheckVerifier: null });
  assert.equal(none.ledger.length, 0);
  assert.ok(none.ev.verification_incomplete > 0);
  assert.equal(none.integrity.verification.corrections_verified, 0);
  // The second check does not find it on the page.
  const no = await run({ recheckVerifier: second(() => ({ verdict: 'unverifiable', excerpt: '' })) });
  assert.equal(no.ledger.length, 0);
  assert.deepEqual(no.integrity.corrections.map((h) => h.outcome), ['excluded', 'excluded']);
  // The second check returns something unreadable.
  const bad = await run({ recheckVerifier: ({ requests }) => requests.map(() => ({ choices: [{ message: { content: 'not json' } }] })) });
  assert.equal(bad.ledger.length, 0);
  assert.ok(bad.ev.verification_incomplete > 0);
  // The original is rejected in every case, and nothing about it reaches the writer.
  [none, no, bad].forEach((r) => { assert.equal(r.excluded.find((x) => x.claim_id === 'E1').status, 'contradicted'); assert.ok(!/75|150/.test(r.ev.research_gaps)); });
});

test('correction: the same code checks apply to extracted claims', async () => {
  const both = COACHING + ' ... ' + PLAN;
  const cases = [
    // a wrong amount
    [[{ claim: 'ReloFlow lists 1:1 Relo-Coaching, a 1-hour call, at $95 USD.', excerpt: 'x' }], COACHING, /does not contain the figure/],
    // two separate prices merged into a range
    [[{ claim: 'ReloFlow lists coaching and planning services for $75 to $150 USD.', excerpt: 'x' }], both, /does not state those two amounts as a range/],
    // a wrong currency
    [[{ claim: 'ReloFlow lists 1:1 Relo-Coaching, a 1-hour call, at €75.', excerpt: 'x' }], COACHING, /in EUR, and the page gives it in USD/],
    // an excerpt that is not on the page
    [[{ claim: C1, excerpt: 'x' }], 'A 1 hour coaching call costs $ 75 USD', /not in the fetched page text/],
    // a wrong length
    [[{ claim: 'ReloFlow lists 1:1 Relo-Coaching, a 2-hour call with an experienced mover, at $75 USD.', excerpt: 'x' }], 'Learn More $ 75 USD Custom Relocation Plan', /does not contain the figure/],
  ];
  for (const [proposals, excerpt, why] of cases) {
    const r = await run({ verifier: contradict(proposals), recheckVerifier: second(() => ({ excerpt })) });
    assert.equal(r.ledger.length, 0, proposals[0].claim);
    assert.match(r.excluded.find((x) => x.corrects === 'E1').reason, why, proposals[0].claim);
  }
  // No more than three proposals per claim are taken, and a proposal is taken only from a contradicted verdict.
  const many = await run({ verifier: contradict([1, 2, 3, 4, 5].map((n) => ({ claim: 'ReloFlow lists item number ' + n + ' on its page for buyers.', excerpt: 'x' }))) });
  assert.equal(many.integrity.verification.corrections_proposed, 3);
  const supported = await run({ verifier: ({ requests }) => requests.map((r) => reply(r.source_id, r.claim_ids.map((id) => answer(id, { excerpt: PAGE.slice(0, 80), corrections: TWO })))) });
  assert.equal(supported.integrity.verification.corrections_proposed, 0);
});

test('correction: recovered prices can be cited as what they are, and not as equivalent or as validation', async () => {
  const r = await run();
  const S = r.ledger[0].source_ids[0];
  assert.deepEqual(commercial(await onLast(r.ev, 'ReloFlow lists a 1-hour coaching call at $75 USD and, separately, a custom relocation plan at $150 USD [' + S + ']. These are adjacent reference points for different offers, not a benchmark for this session.')), []);
  assert.ok(commercial(await onLast(r.ev, 'ReloFlow\'s $75 coaching call is equivalent to this $350 session [' + S + '].')).includes('BLOCKING COMPETITOR PRICE TREATED AS EQUIVALENT'));
  assert.ok(commercial(await onLast(r.ev, 'With competitor prices of $75 and $150 [' + S + '], the $350 price is in line with the market.')).includes('BLOCKING PRICE STATED AS MARKET-VALIDATED'));
  // A changed amount is caught by the existing figure checks.
  const off = await onLast(r.ev, 'ReloFlow lists a 1-hour coaching call at $95 USD [' + S + '].');
  assert.ok(types(off).includes('BLOCKING CITED PRICE NOT IN THE VERIFIED CLAIM'), JSON.stringify(types(off)));
  assert.match(off.find((i) => i.type === 'CITED PRICE NOT IN THE VERIFIED CLAIM').detail, /\$75, \$150/);
  // The writer is told how to use a competitor price.
  const writer = JSON.parse((await runNode('build-growth-payload.js', { 'Founder Context': fixture('Founder Context'), 'Build Evidence': r.ev, 'Compute Financials': fixture('Compute Financials') })).payload).messages[1].content;
  assert.match(writer, /never call it equivalent to this offer/);
  assert.ok(writer.includes(C1) && writer.includes(C2));
});

// ---------------- 2. Pricing citations ----------------

test('pricing: a price cannot be cited to pages that state no price', async () => {
  const r = await pipeline();
  const ids = r.ledger.filter((c) => c.entity && !/[$€£]\s?\d/.test(c.claim + c.page_excerpt)).map((c) => c.source_ids[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  assert.ok(ids.length >= 3);
  const cites = ids.map((id) => '[' + id + ']').join(' ');
  // The two sentences from execution 63220, with this evidence set's source IDs.
  for (const line of [
    'No competitor in the research states a price for a one-on-one planning session sold to this customer type. The $350 figure is a planning assumption informed by the adjacent concierge and consulting services described in the competitor research ' + cites + '. This offer\'s price and customers\' willingness to pay it are unvalidated.',
    '| Current evidence | None. No competitor states a price. The $350 figure is a planning assumption informed by adjacent services ' + cites + ' |',
  ]) {
    const hit = (await onLast(r.ev, line)).filter((i) => i.type === 'PRICE CITED TO SOURCES WITHOUT PRICES');
    assert.equal(hit.length, 1, line);
    assert.equal(hit[0].severity, 'BLOCKING');
    ids.forEach((id) => assert.ok(hit[0].detail.includes(id)));
  }
  // The same assumption with no source attached is fine, and so is citing those pages for what they do support.
  assert.deepEqual(commercial(await onLast(r.ev, 'Price (planning assumption, untested): $350 per session. No verified competitor price was found.')), []);
  const claim = r.ledger.find((c) => c.source_ids[0] === ids[0]);
  assert.deepEqual(commercial(await onLast(r.ev, claim.claim + ' [' + ids[0] + ']')), []);
  // Market-validated wording is blocked with or without a source.
  for (const line of ['The $350 price is validated by the market.', 'At $350, the session is competitively priced.', 'The $350 price point has been validated ' + cites + '.']) assert.ok(commercial(await onLast(r.ev, line)).includes('BLOCKING PRICE STATED AS MARKET-VALIDATED'), line);
  assert.deepEqual(commercial(await onLast(r.ev, 'The $350 price has not been validated by the market.')), []);
});

// ---------------- 3. Demand and payment ----------------

test('demand and payment: the sentences that escaped the gate in execution 63220 are now blocked', async () => {
  const r = await pipeline();
  const ids = r.ledger.filter((c) => c.entity && !/[$€£]\s?\d/.test(c.claim + c.page_excerpt)).map((c) => c.source_ids[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  const cites = ids.map((id) => '[' + id + ']').join(' ');
  const one = r.entities.find((e) => e.name === 'Move One Relocations').source_ids[0];
  const escaped = [
    ['| Strongest evidence for the opportunity | Multiple providers (Expat Livin, Traveling with Kristin, Start Abroad, LA Relocation Group, Move One Relocations) offer paid relocation and lifestyle-change services, confirming that the category of paid guidance exists ' + cites + '. Whether your specific target customer (aged 40-60, pre-decision) is paying for this type of service is unconfirmed. |', 'PAYMENT STATED WITHOUT EVIDENCE'],
    ['Our read: The research confirms that a market for paid relocation and lifestyle-change guidance exists, and that multiple providers have built offers around it.', 'DEMAND STATED AS CONFIRMED'],
    ['The category of paid relocation and lifestyle-change consulting exists and has multiple established providers ' + cites + ' (sources undated; service details may have changed).', 'PAYMENT STATED WITHOUT EVIDENCE'],
    ['Established competitors have long track records and existing audiences [' + one + '] (source undated; service details may have changed).', 'ONE SOURCE CITED FOR A CLAIM ABOUT MANY'],
  ];
  for (const [line, type] of escaped) {
    const hit = (await onLast(r.ev, line)).filter((i) => i.type === type);
    assert.equal(hit.length, 1, type + ': ' + line.slice(0, 90));
    assert.equal(hit[0].severity, 'BLOCKING');
  }
  // What the same evidence does support is not flagged.
  for (const line of [
    'Multiple providers offer relocation and lifestyle-change services ' + cites + '. Whether anyone pays for them, and what they pay, was not established.',
    'The existence of these providers shows that competing offers have been built in this space. It does not confirm that buyers are paying for them.',
    '| Revenue model | Paid consulting sessions as primary revenue; digital products and affiliate income as later additions |',
    'Move One Relocations states it has assisted clients for more than three decades [' + one + '].',
    'Competitors such as Move One Relocations state long operating histories [' + one + '].',
    'Whether a market exists for this offer is a hypothesis that requires validation.',
  ]) assert.deepEqual(commercial(await onLast(r.ev, line)), [], line);
});

test('demand and payment: "paid" passes only with a verified price for the providers cited', async () => {
  const r = await run();
  const S = r.ledger[0].source_ids[0];
  assert.deepEqual(commercial(await onLast(r.ev, 'ReloFlow sells paid coaching: a 1-hour call at $75 USD [' + S + '].')), []);
  // A general claim about the market resting on one company's price is still one company speaking for many.
  assert.ok(commercial(await onLast(r.ev, 'Providers in this space charge for planning help [' + S + '].')).includes('BLOCKING ONE SOURCE CITED FOR A CLAIM ABOUT MANY'));
  // The reviewer is given every commercial line to judge for meaning, and the rules to judge it by.
  const text = withLine('Our read: the research confirms that a market for this kind of help exists.');
  const cc = await citationCheck(r.ev, { planText: undefined, firstPass: true });
  const p = JSON.parse(cc.qa_payload);
  ['24. Prices and payment', '25. Who a source speaks for', '26. Meaning, not keywords'].forEach((h) => assert.ok(p.messages[0].content.includes(h), h));
  assert.match(p.messages[0].content, /A market existing means offers are available; it is not demonstrated demand/);
  assert.match(p.messages[1].content, /LINES THAT MAKE COMMERCIAL CLAIMS/);
  assert.ok(text.length > 0);
});

// ---------------- 4. Source-date notes ----------------

test('date notes: a correct note passes without a false warning, a wrong note is blocked, a claim next to a date is still checked', async () => {
  const stamp = (p) => p.map((x) => x.source_id === 'S5' ? { ...x, text: x.text + '\nUpdated 20 Apr 2023' } : x);
  const dated = (a) => agreeable(a).map((res, i) => { if (a.requests[i].source_id !== 'S5') return res; const o = JSON.parse(res.choices[0].message.content); o.date_shown = 'Updated 20 Apr 2023'; return { ...res, choices: [{ message: { content: JSON.stringify(o) } }] }; });
  const r = await pipeline({ runMs: Date.parse('2026-10-04T13:25:56Z'), pagesHook: stamp, verifier: dated });
  const s5 = r.sources.find((s) => s.id === 'S5');
  assert.equal(s5.published_iso, '2023-04-20');
  const undated = r.sources.find((s) => s.kind === 'research' && s.published === 'date not shown' && r.ledger.some((c) => c.source_ids[0] === s.id)).id;
  // The sentence from execution 63220 that drew the false warning, with this evidence set's source.
  const ok = await onLast(r.ev, 'Note: The LA Relocation Group source [S5] was last updated April 2023, more than 24 months before this plan\'s date; verify currency before relying on it.');
  assert.deepEqual(commercial(ok), []);
  assert.deepEqual(commercial(await onLast(r.ev, 'LA Relocation Group offers relocation services for digital nomads [S5] (source last updated April 2023; more than 24 months before this plan\'s date; verify currency).')), []);
  assert.deepEqual(commercial(await onLast(r.ev, 'LA Relocation Group offers relocation services for digital nomads [S5] (updated 20 April 2023).')), []);
  // The date, the age and the source identity are each validated.
  const wrong = [
    ['The LA Relocation Group source [S5] was last updated June 2024.', /dates S5 differently/],
    ['The LA Relocation Group source [S5] was last updated April 2023, less than 12 months before this plan\'s date.', /is 42 months before the run date/],
    ['The LA Relocation Group source [S5] was last updated April 2023, more than 60 months before this plan\'s date.', /is 42 months before the run date/],
    ['LA Relocation Group offers relocation services for digital nomads [S5] (source undated; service details may have changed).', /S5 is called undated/],
    ['This source [' + undated + '] was last updated April 2023.', /no date was verified on its page/],
  ];
  for (const [line, why] of wrong) {
    const hit = (await onLast(r.ev, line)).filter((i) => i.type === 'SOURCE DATE NOTE IS WRONG');
    assert.equal(hit.length, 1, line);
    assert.equal(hit[0].severity, 'BLOCKING');
    assert.match(hit[0].detail, why, line);
  }
  // An undated source may be called undated.
  const u = r.ledger.find((c) => c.source_ids[0] === undated);
  assert.deepEqual(commercial(await onLast(r.ev, u.claim + ' [' + undated + '] (source undated; service details may have changed).')), []);
  // A sentence is not exempt because it contains a date: the claim beside the note is still compared with the verified claims.
  const mixed = await onLast(r.ev, 'Community forums of remote workers discuss retirement savings, insurance renewals and school enrolment deadlines every quarter [S5], and the source was last updated April 2023.');
  assert.ok(commercial(mixed).includes('MAJOR CITED STATEMENT GOES BEYOND THE VERIFIED CLAIM'));
});

// ---------------- 5. Financial uncertainty stays explicit (policy unchanged) ----------------

test('financial: unknown cost applicability from execution 63220 still blocks and still holds the plan', async () => {
  assert.equal(FIN_63220.fin_issues.length, 2);
  const unknown = FIN_63220.cost_review.filter((c) => c.applies === 'unknown' && c.material);
  assert.deepEqual(unknown.map((c) => c.category).sort(), ['AI, model, API, research and data services used in delivery', 'Professional services', 'Registration, licensing, insurance and taxes'].sort());
  // Nothing was set to zero: the unknown costs carry no amount.
  assert.ok(FIN_63220.unknown_costs.length >= 1);
  const r = await pipeline();
  const out = await citationCheck(r.ev, { fin: FIN_63220 });
  const blocking = out.det_issues.filter((i) => i.type === 'FINANCIAL MODEL' && i.severity === 'BLOCKING');
  assert.equal(blocking.length, 2);
  assert.ok(blocking.some((i) => /AI, model, API, research and data services/.test(i.detail)));
  assert.ok(blocking.some((i) => /Professional services/.test(i.detail)));
  const gate = await runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD' }, 'Plan Revision Request': { findings: blocking.map((i, n) => ({ id: 'AUTO-' + n, severity: i.severity, check: i.type, problem: i.detail })) } });
  assert.equal(gate.blocked, true);
  assert.equal(gate.version_status, 'changes_requested');
  // The inconsistency reported in the diagnosis: the same cost is "not established whether it applies" and "applies".
  assert.ok(FIN_63220.fin_reviews.some((x) => /"Professional advice \(accounting or legal\)" applies, but its amount is not yet established/.test(x)));
});

// ---------------- 6. Telemetry covers the second check ----------------

test('telemetry: recheck calls are counted with the verifier', async () => {
  const r = await pipeline();
  const cc = await citationCheck(r.ev);
  const call = (cost) => ({ model: 'anthropic/claude-haiku-4.5', usage: { prompt_tokens: 1000, completion_tokens: 100, cost } });
  const t = (await runNode('finalize-plan.js', { 'Founder Context': fixture('Founder Context'), 'Compute Financials': fixture('Compute Financials'), 'Assemble Plan': fixture('Assemble Plan'), 'Apply Revisions': fixture('Apply Revisions'), 'Build Evidence': r.ev, 'Citation Check': cc, 'Plan Revision Request': fixture('Plan Revision Request'), 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Growth Plan Generator1': fixture('Growth Plan Generator1'), 'Brave Search': fixture('Brave Search'), 'Verify Claims': [call(0.01), call(0.01)], 'Verify Corrections': [call(0.005)] })).telemetry;
  const v = t.calls.find((c) => c.stage === 'Source verification');
  assert.equal(v.call_count, 3);
  assert.ok(Math.abs(v.cost_usd - 0.025) < 1e-9);
});
