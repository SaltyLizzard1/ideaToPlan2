// Scripted responses for the claim-review replay. DRY RUN ONLY: this node stands where the model would answer.
// It is not a model and shows nothing about how one will judge. It gives each claim of the current run a well-formed
// answer, and then breaks the answers the way the scenario says, so that the nodes after it can be watched handling it.
//
// Input: the batch items of Build Claim Review for this run (all of them, or one at a time in the sequential path).
// It reads the claims from the run it belongs to, never from a saved list.
const sc = $('Scenario').first().json;
const built = $('Build Claim Review').all().map((i) => i.json);
const map = (built[0] || {}).claim_map || { claims: [] };
const ev = $('Build Evidence').first().json;
const LEDGER = JSON.parse(ev.research_ledger || '[]');
const fx = sc.faults || {};

const ALL_YES = { subject: 'yes', meaning: 'yes', qualifiers: 'yes', numbers: 'na', dates: 'na', population: 'na', scope: 'na' };
const STRONG = /\b(?:hypothesis|assumption|assumes?|not established|not confirmed|whether|to test|scenario|model|forecast|estimate)\b/i;
const MODAL = /\b(?:may|might|could|would|if)\b/i;
const THIRD = /\b(?:the|these|those|their|existing|other|competing|both)\s+(?:[a-z-]+\s+){0,3}(?:services?|providers?|competitors?|companies|firms?|platforms?|alternatives|substitutes|tools?|agencies|consultants|coaches|customers|travelers|travellers|market)\b/i;
const GENERAL = /\b(?:people|customers?|professionals?|clients?|adults|buyers|prospects|travelers|travellers|expats?|nomads)\b[^.;]{0,90}\b(?:often|usually|typically|tend to|generally|commonly|rarely|are (?:more |less |un)?likely|seek out|prefer|want|expect|struggle)\b|\b(?:Facebook|Reddit|LinkedIn|YouTube|Instagram|forums?|communities|groups)\b[^.;]{0,80}\b(?:are|is|have|has|offer|provide|reach|attract)\b|\b(?:most|the majority of|many|few)\s+(?:[a-z-]+\s+){0,2}(?:people|customers|professionals|clients|adults|buyers|travelers|travellers|expats?|nomads|providers|competitors)\b/i;
const ADVICE = /\b(?:should|recommends?|consider|need(?:s)? to|must|do not|start|ask|write|identify|track|test|use|avoid|confirm|check|review)\b|\byou(?:r)?\b/i;
const ideal = (c) => {
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
const byId = {};
map.claims.forEach((c) => { byId[c.id] = c; });
const idsOfBatch = {};
built.forEach((b) => { idsOfBatch[b.batch] = b.ids || []; });
const at = (pair) => (idsOfBatch[pair[0]] || [])[pair[1]];
const omit = new Set((fx.omit || []).map(at));
const contradict = new Set((fx.contradict || []).map(at));
const moved = fx.wrong_batch_claim ? { id: at(fx.wrong_batch_claim.from), to: fx.wrong_batch_claim.to } : null;

const out = $input.all().map((item) => {
  const b = item.json;
  if ((fx.fail_batches || []).includes(b.batch)) return { json: { error: { message: 'ECONNRESET: socket hang up (scripted failure of batch ' + b.batch + ')' } } };
  let list = (b.ids || []).filter((id) => !omit.has(id) && !(moved && moved.id === id)).flatMap((id) => {
    const a = ideal(byId[id]);
    return contradict.has(id) ? [a, { id, class: 'EXTERNAL', supported: false, missing: 'scripted second verdict that disagrees' }] : [a];
  });
  if (moved && moved.to === b.batch && byId[moved.id]) list = list.concat([ideal(byId[moved.id])]);
  const body = {
    review: fx.stale_token ? fx.stale_token : b.review,
    batch: (fx.declare || {})[b.batch] || b.batch,
    claims: list.filter((a) => !['NONE', 'RECOMMENDATION'].includes(a.class)),
    recommendation: list.filter((a) => a.class === 'RECOMMENDATION').map((a) => a.id),
    none: list.filter((a) => a.class === 'NONE').map((a) => ({ id: a.id, kind: a.kind, reason: a.reason })),
  };
  let content = JSON.stringify(body), finish = 'stop';
  if ((fx.cut_partial || {})[b.batch]) { content = JSON.stringify({ ...body, claims: body.claims.slice(0, fx.cut_partial[b.batch]), recommendation: [], none: [] }); finish = 'length'; }
  if ((fx.cut_unreadable || []).includes(b.batch)) { content = content.slice(0, 700); finish = 'length'; }
  const usage = { prompt_tokens: Math.ceil(String(b.payload || '').length / 3.6), completion_tokens: Math.ceil(content.length / 3.6) };
  if (!(fx.no_cost_batches || []).includes(b.batch)) usage.cost = Math.round((usage.prompt_tokens * 3 + usage.completion_tokens * 15) / 1e6 * 1e6) / 1e6;
  return { json: { id: 'scripted-' + b.batch, model: 'scripted (no model was called)', choices: [{ finish_reason: finish, message: { role: 'assistant', content } }], usage } };
});
return out;
