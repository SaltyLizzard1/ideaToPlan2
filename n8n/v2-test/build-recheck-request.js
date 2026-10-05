// Build Recheck Request: turns the verifier's proposed corrections into new candidate claims and asks for them to be
// verified again, separately.
//
// When a research claim is contradicted by its page, the verifier may say what the page states instead. That is a
// proposal, not a fact. Each proposal becomes a new candidate claim with its own ID and goes through the same
// verification as every other claim: a second verifier call that is not told it is checking a correction and does
// not see the proposed excerpt, followed by the same code checks in Build Evidence. The original claim stays
// rejected, and the link between the two is kept.
const ce = $('Collect Evidence').first().json;
const candidates = JSON.parse(ce.candidates || '[]');
const requests = $('Build Verification Request').all().map((i) => i.json);
const responses = $('Verify Claims').all().map((i) => i.json);

const MAX_PER_CLAIM = 3;
const MARK = '\nCLAIMS TO CHECK AGAINST THIS PAGE\n';
const byId = {};
candidates.forEach((c) => { byId[c.claim_id] = c; });
// New claim IDs continue after the last ID Collect Evidence issued, so no existing ID is reused or renumbered.
let next = candidates.reduce((m, c) => Math.max(m, parseInt(String(c.claim_id).slice(1), 10) || 0), 0);

// PAYMENT. A claim that calls a service paid, on a passage that shows no price, fee, or charge, is not accepted. The
// same claim without "paid" is a different claim. Removing a word does not show that what is left is supported, so the
// shortened claim is a proposal like any other: it gets its own ID and goes through the separate check below. The
// second verifier is not told it is checking a correction. Nothing enters the ledger on the strength of the edit.
const PAYMENT_ASSERTED = /\bpaid(?:-for)?\b|\bcharg(?:es|ed|ing)\b|\bcharge (?:for|clients|customers|a fee|fees)\b|\bfor a fee\b|\b(?:customers|clients|people|buyers|users|members) (?:pay|are paying|have paid)\b|\bsells?\b/i;
const chargeShown = (excerpt) => {
  const v = String(excerpt || '').replace(/\b(?:clear|transparent|simple|fair|honest|upfront|competitive|flexible|affordable|straightforward) pricing\b/gi, ' ').replace(/\b(?:no|without|zero|free of) (?:fees?|charges?|costs?)\b/gi, ' ');
  return /(?:US\$|\$|€|£)\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|dollars|euros|pounds)\b|\bfees?\b|\bcharg(?:e|es|ed|ing)\b|\bpriced? (?:at|from)\b|\bprices? (?:start|from|range)\b|\bstart(?:s|ing)? (?:at|from) \S*\d|\bbuy now\b|\badd to cart\b|\bcheckout\b|\border now\b|\bsubscriptions?\b|\binvoic\w+\b|\bbilled\b|\bpaid (?:plan|tier|membership|consultation|session)s?\b/i.test(v);
};
const withoutPaid = (claim) => {
  const out = String(claim).replace(/\b(an?) paid(?:-for)? ([a-z])/gi, (m, art, ch) => (/[aeiou]/i.test(ch) ? (art[0] === 'A' ? 'An' : 'an') : (art[0] === 'A' ? 'A' : 'a')) + ' ' + ch).replace(/\bpaid(?:-for)? /gi, '');
  return PAYMENT_ASSERTED.test(out) ? '' : out;
};

const parsed = requests.map((req, i) => {
  if (!req || req.none || !req.source_id) return null;
  let obj = null;
  try { const content = responses[i].choices[0].message.content; obj = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)); } catch (e) {}
  return obj && Array.isArray(obj.claims) && obj.source_id === req.source_id ? obj : null;
});
// Proposals from contradicted claims are numbered first, in request order, as they always were. Proposals that come
// from removing "paid" are numbered after them, so an ID issued by an earlier version of this node never changes.
const foundFor = requests.map(() => []);
requests.forEach((req, i) => {
  const obj = parsed[i];
  if (!obj) return;
  (req.claim_ids || []).forEach((cid) => {
    const mine = obj.claims.filter((k) => k && k.claim_id === cid);
    if (mine.length !== 1 || mine[0].verdict !== 'contradicted' || !Array.isArray(mine[0].corrections)) return;
    mine[0].corrections
      .filter((k) => k && typeof k.claim === 'string' && k.claim.trim().length >= 20 && typeof k.excerpt === 'string')
      .slice(0, MAX_PER_CLAIM)
      .forEach((k) => { next++; foundFor[i].push({ claim_id: 'E' + next, corrects: cid, claim: k.claim.trim().replace(/\s+/g, ' '), proposed_excerpt: k.excerpt }); });
  });
});
const proposedPayment = new Set();
requests.forEach((req, i) => {
  const obj = parsed[i];
  if (!obj) return;
  (req.claim_ids || []).forEach((cid) => {
    const mine = obj.claims.filter((k) => k && k.claim_id === cid);
    const c = byId[cid];
    if (mine.length !== 1 || mine[0].verdict !== 'supported' || !c || proposedPayment.has(cid)) return;
    if (!PAYMENT_ASSERTED.test(c.claim) || chargeShown(mine[0].excerpt)) return;
    const shorter = withoutPaid(c.claim);
    if (!shorter || shorter.trim().length < 20) return;
    proposedPayment.add(cid);
    next++;
    foundFor[i].push({ claim_id: 'E' + next, corrects: cid, claim: shorter.trim().replace(/\s+/g, ' '), proposed_excerpt: typeof mine[0].excerpt === 'string' ? mine[0].excerpt : '', kind: 'payment_wording_removed' });
  });
});

const items = [];
// Pages with a proposal from a contradiction come first, in request order, then pages whose only proposals remove "paid".
const order = requests.map((_, i) => i).filter((i) => foundFor[i].some((f) => !f.kind)).concat(requests.map((_, i) => i).filter((i) => foundFor[i].length && !foundFor[i].some((f) => !f.kind)));
order.forEach((i) => {
  const req = requests[i];
  const found = foundFor[i];
  if (!found.length) return;
  let first = null;
  try { first = JSON.parse(req.payload); } catch (e) {}
  if (!first || !Array.isArray(first.messages) || first.messages.length < 2) return;
  const user = String(first.messages[1].content || '');
  const cut = user.indexOf(MARK);
  if (cut < 0) return;
  // Same system prompt and the same page text as the first check. Only the list of claims changes.
  const claims = found.map((f) => ({ claim_id: f.claim_id, claim: f.claim, source_type_reported_by_research_tool: (byId[f.corrects] || {}).source_type || '' }));
  items.push({ json: {
    source_id: req.source_id,
    claim_ids: found.map((f) => f.claim_id),
    corrections: found,
    payload: JSON.stringify({ model: first.model, temperature: 0, max_tokens: Math.min(8000, 700 + 480 * found.length), messages: [first.messages[0], { role: 'user', content: user.slice(0, cut) + MARK + JSON.stringify(claims, null, 1) }] }),
    t_ms: Date.now(),
  } });
});
// With nothing to recheck, one marker item keeps the workflow moving. The Has Corrections node routes it past the model call.
if (!items.length) return [{ json: { none: true, source_id: '', claim_ids: [], corrections: [], t_ms: Date.now() } }];
return items;
