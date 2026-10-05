// Shared by the claim-review tests: the 63237 fixture, the nodes of the claim contract, and a scripted reviewer.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, fixture, clone, ROOT } from './harness.mjs';

export const DIR = path.join(ROOT, 'fixtures', 'exec-63237');
const DIR26 = path.join(ROOT, 'fixtures', 'exec-63226');
export const j = (name) => JSON.parse(readFileSync(path.join(DIR, name + '.json'), 'utf8'));
export const f26 = (name) => JSON.parse(readFileSync(path.join(DIR26, name + '.json'), 'utf8'));
export const EV = j('Build Evidence')[0];
export const FOUNDER = f26('Founder Context');
export const FIN = f26('Compute Financials');
export const REV = j('Apply Revisions')[0];
export const TEXT = REV.text.split('\n');
export const LEDGER = JSON.parse(EV.research_ledger);
export const entry = (id) => LEDGER.find((e) => e.claim_id === id);
export const VERIFIER = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(j('verifier-answer')) } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } };

export const check = (rev = REV, extra = {}) => runNode('citation-check.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': f26('Assemble Plan'), 'Build Evidence': EV, 'Growth Plan Generator1': f26('Growth Plan Generator1'), 'Apply Revisions': rev, ...extra });
export const buildBatches = async (rev = REV, cc, extra = {}, ev = EV) => { const c = cc || await check(rev); return { cc: c, items: (await runNode('build-claim-review.js', { 'Founder Context': FOUNDER, 'Citation Check': c, 'Build Evidence': ev, 'Apply Revisions': rev, ...extra }, VERIFIER)).map((i) => i.json) }; };

export const ALL_YES = { subject: 'yes', meaning: 'yes', qualifiers: 'yes', numbers: 'na', dates: 'na', population: 'na', scope: 'na' };
const STRONG = /\b(?:hypothesis|assumption|assumes?|not established|not confirmed|whether|to test|scenario|model|forecast|estimate)\b/i;
const MODAL = /\b(?:may|might|could|would|if)\b/i;
const THIRD = /\b(?:the|these|those|their|existing|other|competing|both)\s+(?:[a-z-]+\s+){0,3}(?:services?|providers?|competitors?|companies|firms?|platforms?|alternatives|substitutes|tools?|agencies|consultants|coaches|customers|travelers|travellers|market)\b/i;
const GENERAL = /\b(?:people|customers?|professionals?|clients?|adults|buyers|prospects|travelers|travellers|expats?|nomads)\b[^.;]{0,90}\b(?:often|usually|typically|tend to|generally|commonly|rarely|are (?:more |less |un)?likely|seek out|prefer|want|expect|struggle)\b|\b(?:Facebook|Reddit|LinkedIn|YouTube|Instagram|forums?|communities|groups)\b[^.;]{0,80}\b(?:are|is|have|has|offer|provide|reach|attract)\b|\b(?:most|the majority of|many|few)\s+(?:[a-z-]+\s+){0,2}(?:people|customers|professionals|clients|adults|buyers|travelers|travellers|expats?|nomads|providers|competitors)\b/i;
const ADVICE = /\b(?:should|recommends?|consider|need(?:s)? to|must|do not|start|ask|write|identify|track|test|use|avoid|confirm|check|review)\b|\byou(?:r)?\b/i;
// A careful reviewer, scripted. It is not a model and stands for none: it gives each claim a well-formed answer that
// the rules accept where they can, so that a test can then change one answer and see what the code makes of it.
export const ideal = (c) => {
  const pool = c.cites.length ? LEDGER.filter((e) => e.source_ids.some((id) => c.cites.includes(id))) : c.company ? LEDGER.filter((e) => e.entity === c.company) : c.names.length ? LEDGER.filter((e) => c.names.includes(e.entity)) : [];
  const strong = (c.text.match(STRONG) || [])[0];
  if (!c.cites.length && strong) return { id: c.id, class: 'ASSUMPTION', label: strong };
  if (pool.length) return { id: c.id, class: 'EXTERNAL', supported: true, entries: c.cites.length > 1 ? pool.map((e) => e.claim_id) : [pool[0].claim_id], entry_quote: pool[0].page_excerpt.slice(0, 24), aspects: ALL_YES };
  const modal = (c.text.match(MODAL) || [])[0];
  if (modal && !c.company && !c.names.length && !THIRD.test(c.text) && !/\d/.test(c.text)) return { id: c.id, class: 'ASSUMPTION', label: modal };
  if (GENERAL.test(c.text) || c.company || c.names.length) return { id: c.id, class: 'EXTERNAL', supported: false, missing: 'no ledger entry states this' };
  if (ADVICE.test(c.text)) return { id: c.id, class: 'RECOMMENDATION' };
  return { id: c.id, class: 'NONE', kind: 'other', reason: 'it states nothing that could be true or false of the world' };
};
// over: { [claimId]: answer | null | [answer, answer] }. null leaves the claim out. An array answers it more than once.
// perBatch may change or replace a response. The token and the batch number are given back as a model is asked to.
export const respond = (items, over = {}, perBatch = (r) => r) => {
  const claims = items[0].claim_map.claims;
  return items.map((b) => {
    const list = b.ids.flatMap((id) => { const o = over[id]; const c = claims.find((x) => x.id === id); if (o === null) return []; if (Array.isArray(o)) return o.map((a) => ({ id, ...a })); return [o ? { id, ...o } : ideal(c)]; });
    const body = { review: b.review, batch: b.batch, claims: list.filter((a) => a.split || !['NONE', 'RECOMMENDATION'].includes(a.class)), recommendation: list.filter((a) => a.class === 'RECOMMENDATION' && !a.split).map((a) => a.id), none: list.filter((a) => a.class === 'NONE' && !a.split).map((a) => (a.kind || a.reason ? { id: a.id, kind: a.kind, reason: a.reason } : a.id)) };
    return perBatch({ model: 'anthropic/claude-sonnet-4.6', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }], usage: { prompt_tokens: 7000, completion_tokens: 2000, cost: 0.05 } }, b, body);
  });
};
export const combine = async (items, responses, ev = EV) => (await runNode('combine-claim-review.js', { 'Build Claim Review': items, 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Build Evidence': ev }, { __items: responses }))[0].json;
export const finish = (cc, combined, rev = REV) => runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, combined);
export const gateOf = (out) => runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD', final_findings: [] }, 'Plan Revision Request': out });
export const reportOf = async (cc, out, rev = REV) => (await runNode('finalize-plan.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': f26('Assemble Plan'), 'Apply Revisions': rev, 'Build Evidence': EV, 'Citation Check': cc, 'Plan Revision Request': out, 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Brave Search': fixture('Brave Search'), 'Growth Plan Generator1': f26('Growth Plan Generator1'), 'Final QA': f26('Final QA'), 'Revise Plan': f26('Revise Plan'), 'Financial Assumptions': f26('Financial Assumptions'), 'Verify Claims': f26('Verify Claims') })).report;
// The whole chain with a scripted reviewer.
export const review = async (over = {}, perBatch) => { const { cc, items } = await buildBatches(); const combined = await combine(items, respond(items, over, perBatch)); return { cc, items, combined, cr: combined.claim_review, out: await finish(cc, combined) }; };
export const claimAt = (items, line, re) => { const c = items[0].claim_map.claims.find((x) => x.line === line && re.test(x.text)); if (!c) throw new Error('no claim at L' + line + ' matching ' + re); return c; };
export { clone };
