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
export const buildBatches = async (rev = REV, cc) => { const c = cc || await check(rev); return { cc: c, items: (await runNode('build-claim-review.js', { 'Founder Context': FOUNDER, 'Citation Check': c, 'Build Evidence': EV, 'Apply Revisions': rev }, VERIFIER)).map((i) => i.json) }; };

export const ALL_YES = { subject: 'yes', meaning: 'yes', qualifiers: 'yes', numbers: 'na', dates: 'na', population: 'na', scope: 'na' };
const LABEL = /\b(?:hypothesis|assumption|assumes?|not established|whether|to test|may|might|could|would|if|scenario|model|forecast)\b/i;
// A careful reviewer, scripted. Company sentences and cited sentences are linked to an entry of that company or source,
// with words of the entry quoted. A sentence with a label is an assumption. Everything else asserts nothing.
export const ideal = (c) => {
  const pool = c.cites.length ? LEDGER.filter((e) => e.source_ids.some((id) => c.cites.includes(id))) : c.company ? LEDGER.filter((e) => e.entity === c.company) : c.names.length ? LEDGER.filter((e) => c.names.includes(e.entity)) : [];
  const label = (c.text.match(LABEL) || [])[0];
  if (!c.cites.length && label) return { id: c.id, class: 'ASSUMPTION', label };
  if (pool.length) return { id: c.id, class: 'EXTERNAL', supported: true, entries: c.cites.length > 1 ? pool.map((e) => e.claim_id) : [pool[0].claim_id], entry_quote: pool[0].page_excerpt.slice(0, 24), aspects: ALL_YES };
  return { id: c.id, class: 'NONE' };
};
// over: { [claimId]: answer | null | [answer, answer] }. null leaves the claim out. An array answers it more than once.
export const respond = (items, over = {}, perBatch = (r) => r) => {
  const claims = items[0].claim_map.claims;
  return items.map((b) => {
    const list = b.ids.flatMap((id) => { const o = over[id]; const c = claims.find((x) => x.id === id); if (o === null) return []; if (Array.isArray(o)) return o.map((a) => ({ id, ...a })); return [o ? { id, ...o } : ideal(c)]; });
    const body = { batch: b.batch, claims: list.filter((a) => a.split || !['NONE', 'RECOMMENDATION'].includes(a.class)), recommendation: list.filter((a) => a.class === 'RECOMMENDATION').map((a) => a.id), none: list.filter((a) => a.class === 'NONE' && !a.split).map((a) => a.id) };
    return perBatch({ model: 'anthropic/claude-sonnet-4.6', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }], usage: { prompt_tokens: 7000, completion_tokens: 2000, cost: 0.05 } }, b, body);
  });
};
export const combine = async (items, responses) => (await runNode('combine-claim-review.js', { 'Build Claim Review': items, 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Build Evidence': EV }, { __items: responses }))[0].json;
export const finish = (cc, combined, rev = REV) => runNode('plan-revision-request.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Citation Check': cc, 'Apply Revisions': rev, 'Build Evidence': EV }, combined);
export const gateOf = (out) => runNode('delivery-gate.js', { 'Finalize Plan': { status: 'HOLD', final_findings: [] }, 'Plan Revision Request': out });
export const reportOf = async (cc, out, rev = REV) => (await runNode('finalize-plan.js', { 'Founder Context': FOUNDER, 'Compute Financials': FIN, 'Assemble Plan': f26('Assemble Plan'), 'Apply Revisions': rev, 'Build Evidence': EV, 'Citation Check': cc, 'Plan Revision Request': out, 'Growth Research': fixture('Growth Research'), 'Market Research': fixture('Market Research'), 'Brave Search': fixture('Brave Search'), 'Growth Plan Generator1': f26('Growth Plan Generator1'), 'Final QA': f26('Final QA'), 'Revise Plan': f26('Revise Plan'), 'Financial Assumptions': f26('Financial Assumptions'), 'Verify Claims': f26('Verify Claims') })).report;
// The whole chain with a scripted reviewer.
export const review = async (over = {}, perBatch) => { const { cc, items } = await buildBatches(); const combined = await combine(items, respond(items, over, perBatch)); return { cc, items, combined, cr: combined.claim_review, out: await finish(cc, combined) }; };
export const claimAt = (items, line, re) => { const c = items[0].claim_map.claims.find((x) => x.line === line && re.test(x.text)); if (!c) throw new Error('no claim at L' + line + ' matching ' + re); return c; };
export { clone };
