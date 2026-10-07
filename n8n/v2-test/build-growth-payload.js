// Build Growth Payload: assembles the Growth writer request from the founder context, the computed financial model, and the evidence.
// The writer sees only verified evidence: the ledger, the sources that have a verified claim, and the research gaps.
// Search listings are not passed. A page found by search reaches the writer only as a verified ledger entry.
const ctx = $('Founder Context').first().json;
const ev = $('Build Evidence').first().json;
const fin = $('Compute Financials').first().json;
const sources = JSON.parse(ev.sources || '[]');
// RUN DATE: the date this run started, read from the workflow clock. It is never hardcoded and never left to a
// model's own sense of the current year. Every prompt that judges a date is given this line.
const runDate = (() => {
  let ms = Date.now();
  try { const c = $('Founder Context').first().json; if (c && Number(c.run_started_ms) > 0) ms = Number(c.run_started_ms); } catch (e) {}
  const d = new Date(ms);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const iso = d.toISOString().slice(0, 10);
  return { ms, iso, line: 'RUN DATE: today is ' + iso + ' (' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + '), timezone UTC. This is the current date. Do not rely on your own sense of the current year. A date on or before ' + iso + ' is in the past and is not an error. Only a date after ' + iso + ' is in the future; a future publication date is an error to report and is never treated as published.' };
})();
let ledger = [];
try { const p = JSON.parse(ev.research_ledger); if (Array.isArray(p)) ledger = p; } catch (e) {}
const verified = new Set(ledger.flatMap((c) => c.source_ids || []));

const user = [
  runDate.line,
  '',
  'GOAL BRIEF',
  fin.goal_brief,
  '',
  fin.financial_model,
  '',
  'SOURCES (only pages on which at least one claim was verified; no other page may be cited)',
  JSON.stringify(sources.filter((s) => verified.has(s.id)).map(({ id, kind, title, domain, published }) => ({ id, kind, title, domain, published })), null, 1),
  '',
  'EVIDENCE LEDGER (each entry was verified against the text of its page; page_excerpt is the supporting passage)',
  ev.research_ledger,
  '',
  'RESEARCH GAPS',
  ev.research_gaps || 'None recorded.',
  '',
  'HOW TO USE THE EVIDENCE',
  '- A verified source is not a verified claim. Cite a source ID only for what one ledger entry states. Do not add detail about a company or page that its ledger entries do not state.',
  '- A conclusion you draw from the evidence is IdeaToPlan\'s inference. Word it as an inference and give it no source ID.',
  '- Competitors existing shows that competing offers exist. It is not evidence of buyers, sales, or willingness to pay. State demand as confirmed only when a ledger entry reports customers paying, spending, survey, or search-behavior evidence, and cite that entry. Otherwise state demand as a hypothesis that requires validation.',
  '- The offer\'s own price is a planning assumption. Label it as one and give it no source ID. A page that states no price cannot support, inform, or benchmark a price: cite such pages only for the service descriptions they support. Never say the price is validated by the market.',
  '- A competitor price in the ledger is the price of that competitor\'s own offer. Give its amount, currency, what it buys, its length, and any qualifier exactly as the ledger entry states them. Keep separate offers separate. Call it an adjacent reference point; never call it equivalent to this offer.',
  '- Say that a provider is paid, charges, or sells only when a ledger entry for that provider states a price, a fee, or a charge. This holds with or without a source ID, and in every section: "paid relocation services" in a list of alternatives needs it too. An entry marked payment_not_established does not support it. Otherwise describe what they offer.',
  '- Do not assign providers a focus, a stage, or a kind of customer that their ledger entries do not state. The entries list services. They do not say that a provider works only after a decision is made, focuses on logistics or execution, or leaves the planning stage out. Say what the pages list and stop there.',
  '- A survey finding is what the survey asked, of whom, and how many. Keep all three every time you use it ("nearly two-thirds of 600 surveyed travelers said ..."). Never write that it confirms, proves, or shows that something is true of travelers, customers, or people in general, or of this customer.',
  '- A superlative needs comparative evidence. "The most common substitute", "the biggest barrier", "the most popular channel" compare one thing with all the others. Without a ledger entry that makes that comparison, say that it is one substitute, barrier, or channel, and that how it compares with the others is not established.',
  '- A market existing means offers are available. It is not demonstrated demand. Say that competing offers exist.',
  '- One company\'s page supports statements about that company only. Do not generalize it to competitors, and do not add audiences, track records, or reputation that the ledger entry does not state.',
  '- W IDs are pages found by web search. They appear in the ledger only when verified and are used exactly like S IDs. Search listings themselves are not evidence and are not provided.',
  '- Judge source dates against the RUN DATE. Never call a date on or before the RUN DATE anomalous or future-dated.',
].join('\n');

return {
  // Writer: Sonnet 5.5 since 2026-10-07. It does not accept a temperature, and its thinking counts against max_tokens.
  payload: JSON.stringify({ model: 'anthropic/claude-sonnet-5.5', max_tokens: 40000, messages: [{ role: 'system', content: ctx.writer_system }, { role: 'user', content: user }] }),
};
