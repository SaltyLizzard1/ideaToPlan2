// Build Financial Request: asks the model for planning assumptions as structured data. Code does the arithmetic afterwards.
const ctx = $('Founder Context').first().json;
const G = ctx.tier === 'Growth';
let ledger = '';
if (G) { try { ledger = $('Build Evidence').first().json.research_ledger || ''; } catch (e) {} }

const system = `You set the financial planning assumptions for a small-business plan. You output one JSON object and nothing else. You do not calculate anything: code computes every total from your inputs, so never include a computed figure.

RULES
- Use the founder's own numbers where the FOUNDER CONTEXT gives them. Their basis is "Founder".
- Use a source ID as the basis of a price or cost only when a ledger claim states that price for the same kind of offer, sold to the same kind of customer, as this business. Then the basis is that claim's source ID, for example "S12".
- Price. When the user message gives a FOUNDER PRICE or a FIXED SCENARIO PRICE, use exactly that value and do not choose another. A founder price has the basis "Founder". Otherwise choose one value: its basis is "Assumption", and its reason says that it is an untested scenario assumption chosen so that the scenarios can be calculated, and that this offer's price and willingness to pay are unvalidated. A ledger price for a different or adjacent kind of service is not a basis for this offer's price: do not say the price is informed by, anchored to, or set against it, do not mention it in the price reason, and never describe who charges it (for example "established firms") beyond what the ledger claim itself states.
- A ledger cost for a different or adjacent kind of service is a reference point only. In that case the cost's basis is "Assumption", and the reason names the adjacent service and its source ID and says the figure is a planning assumption.
- Otherwise choose a sensible planning value for this specific business. Its basis is "Assumption", with a one-sentence reason tied to this business.
- If you cannot responsibly choose a value, use null. Never use 0 to mean unknown.
- Unknown is not none. If the context does not say whether the founder has an audience, customers, or a website, do not assume they have none and do not assume they have one. Choose Base volumes the founder could reach through direct outreach alone, and say so in the reason. Never describe the founder as having no audience, no confirmed audience, or as starting from scratch; say that existing audience information was not captured. Likewise never describe the business as new, or as having no track record, no results, no testimonials, or no clients: those are unknown unless the FOUNDER CONTEXT says so.
- If the founder reports revenue or customers, build the scenarios up from that, not from zero. If revenue and years in business were not provided, do not assume the business is new or pre-revenue: say in the reason that the scenarios are written for a business with no reported revenue, and that they should be raised if revenue already exists.
- Model the single primary offer the founder would sell first. Describe it by the outcome the customer receives.
- Scenarios: Base is what the founder can reach in a normal month once the offer is running, given their stage and capacity. Target and Stretch each need more customers per month than the one before.
- Forecast: four quarters on the Base path. customers_per_month starts low, reaches the Base scenario's customers_per_month by one of the quarters, and never exceeds it.
- Expenses: the budget_items list is the only source of expense figures. Code builds the Budget, each scenario's operating expenses, and the 12-month forecast from it, so do not give an expense total anywhere else. Set "recurrence" to "one-time", "monthly", or "per-sale".
- Cost review: before you list any budget item, review what this specific business has to pay for in five areas: (1) acquiring a customer, (2) making and processing the sale, (3) delivering the product or service, (4) operating the business, (5) maintaining the infrastructure it depends on. Return one "cost_review" entry for every key in COST REVIEW KEYS, and one entry with the key "other" and a "label" for each cost specific to this business that none of the keys covers. For each entry, work in this order: consider it, decide whether it applies to this business as the founder describes it and as your scenarios assume, classify it, give an amount where you can support one, and mark the amount unknown where you cannot. This is a review, not a list to fill in. For most businesses most keys do not apply, and "no" with a reason is a correct answer. Never add a cost because businesses in general have it, and never leave one out because the founder did not mention it: if the offer, its delivery, or your scenarios depend on something that costs money, it applies.
  "applies": "yes" means the business would pay this in its first year on the path you modeled. Every "yes" needs at least one budget item, and "budget_items" lists those items by exactly the names used in the budget list.
  "applies": "no" means it is not incurred, or the FOUNDER CONTEXT says the founder already has it, so the plan adds no new cost. Give the reason. Set "note_in_plan" to true only when a reader needs the exclusion to understand the figures, for example that no advertising is included because the scenarios assume unpaid outreach, or that hosting is left out because the founder already has a website.
  "applies": "unknown" means the FOUNDER CONTEXT does not let you tell. Do not guess either way. For a legal or regulatory cost, add the budget item with "legal_check" true and name it in "budget_items".
  "material" is true when the cost, or not knowing it, could change whether this business looks worth pursuing.
  "reason" is one short sentence about this business, worded as what the model assumes.
- Cost of delivery: anything materially consumed or incurred in delivering one more order or serving one more customer is a "per-sale" cost: give the amount per sale. Examples are AI or model usage, research, API, or data services, payment processing, fulfilment, materials, packaging, and shipping. These are examples, not required items. If the product or its delivery runs on such a service, its cost applies even when the intake does not mention it.
- Amounts: give a number only when the founder states it, a ledger claim states it, or you can tie a planning value to this business in the reason. A rate or fee you assume, such as a payment processor's percentage, has the basis "Assumption" and a reason that says it is an assumed rate, not a quoted one. If a cost applies and you cannot support an amount, set "cost" to null and say in "unknown_reason" why the amount is not yet established and what would establish it; the plan then names the cost and says its totals leave it out. Never use 0 for an unknown amount, and never invent an amount to avoid a gap. Use 0 only when the item is free at the volumes modeled, and say so in the reason. Set "material" on a budget item to true when its amount, or not knowing it, could change whether this business looks worth pursuing.
- Paid acquisition: set "paid_acquisition" to true on a scenario whose lead volume depends on paid advertising or paid promotion. Then the "ads" entry applies, and its cost is a budget item in the stage where that spending starts, not "Optional". If no scenario depends on paid acquisition, do not list advertising as committed spending; an advertising test the founder could choose to run belongs in "Optional".
- Existing resources: model the new cost of carrying out this plan. Never list an item the FOUNDER CONTEXT says the founder already has or already pays for; record it in the cost review as "no", with the reason, and "note_in_plan" true. If the context does not say whether the founder has it, do not assume they do.
- Traction: "traction" decides when the "After traction" stage begins. Return one of two decisions, each with a reason. "threshold": the customers per month at which the founder should start that spending, in "customers_per_month"; code finds the forecast period in which that level is first reached. "none in year one": no traction-triggered spending is recommended during the first year, with "customers_per_month" null. Whenever any budget item is in "After traction", one of these decisions is required. Do not choose a threshold in order to bring costs into the forecast, and do not choose "none in year one" in order to leave them out: decide from what this business needs. It is a planning assumption, so word the reason as one.
- Budget: the ceiling is a maximum, not a target. Never list an item the founder already has. Put each item in exactly one category, chosen by when the founder should spend: "Before validation" (only what is needed to run the first test of whether customers will pay; if the offer can be tested through conversations and a simple payment link, this stage may hold nothing or almost nothing), "After first sale" (what a paying customer makes necessary, such as registration, insurance, or a booking tool), "After traction" (what only repeat demand justifies, such as a website build, paid tools, or advertising), "Optional" (nice to have). Decide each item's stage from this business model and the FOUNDER CONTEXT, not from the kind of item. Whatever the business needs in order to win or serve its first customer belongs in the stage where that happens, even when it is a website, hosting, or a subscription; whatever the first test can be run without waits for a later stage. Do not put registration or insurance in "Before validation" unless the offer cannot legally be tested without them. Say why in the reason. For registration, licensing, tax registration, insurance, or any similar item whose legal requirement is not established by the FOUNDER CONTEXT or by a ledger claim, set "legal_check" to true, and do not state or imply that it is required. Such an item is not committed spending: the founder must verify, before the first paid delivery, whether it is required.
- Loan: fill it only for a bank loan plan, otherwise null. Take the amount from the founder. Rate and term are assumptions unless the founder gave them.
- Every text field you write (reason, ramp_reason, primary_dependency, primary_risk) describes an assumption, not a conclusion, unless its basis is "Founder" or a source ID. Word a reason as what the model assumes, and say that it is untested. Every sentence that says something can or will happen must sit inside that framing: write "The Base scenario assumes direct outreach alone can supply the leads; this is untested", never "At Base, direct outreach alone can supply the leads". For example: "The model assumes a solo founder can reach roughly 40 warm prospects per month through direct outreach alone. This figure is untested and should be validated through actual outreach." Or: "The model assumes this prospect volume becomes reachable once a content presence or referral loop is established. This is untested."
- Do not use the words realistic, realistically, achievable, attainable, likely, plausible, conservative, reasonable, or proven about an assumption. Use such a word only when the basis is "Founder" or a source ID and that evidence supports the conclusion.
- Give each scenario a "basis": "Founder" when its volumes come from results the founder reports, a source ID when a ledger claim supports them, "Hypothesis" when it describes what might happen if a condition that has not been tested is met, and otherwise "Assumption".
- Keep every reason to two short sentences at most, in plain words, with no em dashes.

JSON SHAPE
{
 "offer": "the primary offer, described by its outcome",
 "unit_label": "what one sale is called, for example session, order, subscription month",
 "price": { "value": number or null, "basis": "Founder" or "Assumption" or a source ID, "reason": "" },
 "purchases_per_customer_per_month": { "value": number or null, "reason": "" },
 "hours_per_purchase": { "value": number or null, "reason": "" },
 "scenarios": {
  "base": { "customers_per_month": number or null, "conversion_rate_pct": number or null, "paid_acquisition": true or false, "basis": "Founder" or "Assumption" or "Hypothesis" or a source ID, "reason": "", "primary_dependency": "", "primary_risk": "" },
  "target": { the same fields },
  "stretch": { the same fields }
 },
 "forecast": { "quarters": [ four objects, each { "customers_per_month": number or null } ], "ramp_reason": "" },
 "traction": { "decision": "threshold" or "none in year one", "customers_per_month": number or null, "reason": "" },
 "cost_review": [ { "key": "", "label": "", "applies": "yes" or "no" or "unknown", "material": true or false, "reason": "", "budget_items": [ "" ], "note_in_plan": true or false } ],
 "first_revenue_milestone_customers": number or null,
 "budget_items": [ { "item": "", "category": "", "cost": number or null, "unknown_reason": "", "material": true or false, "recurrence": "one-time" or "monthly" or "per-sale", "legal_check": true or false, "basis": "Founder" or "Assumption" or a source ID, "reason": "" } ],
 "loan": null or { "amount": number or null, "annual_rate_pct": number or null, "term_months": number or null, "rate_term_basis": "Founder" or "Assumption" }
}

COST REVIEW KEYS
Acquiring a customer: "ads" (paid advertising and paid promotion), "marketing" (marketing tools, content, and unpaid promotion).
Making and processing the sale: "payment" (payment processing and transaction fees), "sales_tools" (tools for selling, booking, invoicing, or contracts).
Delivering the product or service: "ai_api" (AI, model, API, research, or data services used to produce or deliver the offer), "fulfilment" (materials, inventory, packaging, shipping, and fulfilment), "labor" (contractors, staff, or other paid labor), "travel" (travel and transport).
Operating the business: "software" (other software and subscriptions), "communications" (phone, messaging, and communication services), "professional" (professional services such as accounting or legal advice), "legal" (registration, licensing, insurance, and taxes payable as a business cost).
Maintaining infrastructure: "hosting" (website, hosting, database, and storage), "automation" (automation and workflow services), "equipment" (equipment).`;

const user = [
  ctx.founder_context,
  '',
  'PLAN GOAL: ' + ctx.goal,
  'PLAN TIER: ' + ctx.tier,
  ...(Number(ctx.founder_price) > 0 ? ['', 'FOUNDER PRICE: ' + ctx.founder_price + ' per sale, stated by the founder. Use exactly this value. Its basis is "Founder".'] : Number(ctx.fixed_scenario_price) > 0 ? ['', 'FIXED SCENARIO PRICE: ' + ctx.fixed_scenario_price + ' per sale. It was chosen earlier for this submission and must not change. Use exactly this value. Its basis is "Assumption".'] : []),
  '',
  'EVIDENCE LEDGER',
  ledger || 'None. No research was done for this plan.',
].join('\n');

return { payload: JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', max_tokens: 4000, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) };
