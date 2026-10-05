// Compute Financials: validates the model's assumptions and does all the arithmetic in code.
// Expenses have one source: the budget items. The Budget, every scenario's operating expenses, and the 12-month forecast are all built from them.
const ctx = $('Founder Context').first().json;
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
let raw = '';
try { raw = $input.first().json.choices[0].message.content || ''; } catch (e) {}
const fin_issues = [];
// Conditions a person has to look at before the plan is sent. They do not make the plan wrong to deliver.
const fin_reviews = [];
const usd = (n) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
let a = null;
try { a = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) {}
if (!a || typeof a !== 'object') { a = {}; fin_issues.push('The financial assumptions could not be read, so the financial tables are incomplete.'); }

// A value is a number or it is null. Unknown never becomes zero.
const num = (v) => {
  if (v && typeof v === 'object') v = v.value;
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const txt = (v) => (v === undefined || v === null) ? '' : String(v).replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
const reasonOf = (v) => (v && typeof v === 'object') ? txt(v.reason) : '';
const allowed = new Set();
const counts = new Set();
const money = (n) => {
  if (n === null) return 'Not set';
  const s = '$' + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  allowed.add(s);
  return (n < 0 ? '-' : '') + s;
};
// A unit cost can have cents, for example a per-sale processing fee.
const unitMoney = (n) => { if (n === null) return 'Not set'; if (Number.isInteger(n)) return money(n); const s = '$' + n.toFixed(2); allowed.add(s); return s; };
const qty = (n) => { if (n === null) return 'Not set'; const r = Math.round(n * 10) / 10; counts.add(r); return String(r); };
const mul = (...xs) => xs.some((x) => x === null) ? null : xs.reduce((p, x) => p * x, 1);
const sub = (x, y) => (x === null || y === null) ? null : x - y;
const sum = (xs) => xs.some((x) => x === null) ? null : xs.reduce((p, x) => p + x, 0);
const cap = (k) => k.charAt(0).toUpperCase() + k.slice(1);

// What kind of information a basis is, and a check that an assumption is not worded as a conclusion.
const supported = (basis) => /^founder$/i.test(basis) || /^[SW]\d+/i.test(basis);
const kindOf = (basis) => /^founder$/i.test(basis) ? 'founder-provided' : /^[SW]\d+/i.test(basis) ? 'researched, ' + basis : /^hypothesis$/i.test(basis) ? 'hypothesis, untested' : 'planning assumption, untested';
const conclusionRe = /\b(realistic(ally)?|achievable|attainable|likely|plausibl[ey]|conservative|reasonabl[ey]|proven)\b/i;
const language_flags = [];
const noneRe = /\b(no|zero|without an?) (confirmed |existing |established |prior )?(audience|following|followers|website|email list|customers|clients|content|track record)\b|\bfrom scratch\b/i;
const assetsUnknown = !String(ctx.existing_assets || '').trim();
const checkWording = (where, text, basis) => {
  if (!text) return;
  if (!supported(basis) && conclusionRe.test(text)) language_flags.push(where + ' words an assumption as a conclusion: "' + text + '"');
  // A sentence that says something can or will happen must be framed as an assumption.
  if (!supported(basis)) text.split(/(?<=[.;])\s+/).forEach((sentence) => {
    if (/\b(can|will|is able to|are able to)\b/i.test(sentence) && !/assum|untested|unvalidated|hypothes|not been|unknown|not captured|\bif\b|\bmay\b|\bmight\b|\bcould\b|should be validated/i.test(sentence)) language_flags.push(where + ' states a capability or an outcome as certain: "' + sentence.trim() + '"');
  });
  if (assetsUnknown && noneRe.test(text) && !/unknown|not captured/i.test(text)) language_flags.push(where + ' may state an unknown as none: "' + text + '"');
};

// 1. Inputs
const offer = txt(a.offer) || 'Not set';
const unit = txt(a.unit_label) || 'purchase';
const price = num(a.price);
const priceBasis = txt(a.price && a.price.basis) || 'Assumption';
const notes = [];
let ppm = num(a.purchases_per_customer_per_month);
if (ppm === null) { ppm = 1; notes.push('- Purchase frequency was not set, so one ' + unit + ' per customer per month was used.'); }
const hpp = num(a.hours_per_purchase);
if (price === null) fin_issues.push('No price was set, so revenue could not be calculated.');

// 2. The expense model. Every expense figure in the plan is built from these items.
const CATS = ['Before validation', 'After first sale', 'After traction', 'Optional'];
const CEILINGS = { 'under5k': 5000, '5k-25k': 25000, '25k-50k': 50000, '50k-100k': 100000 };
const ceiling = CEILINGS[ctx.budget] || null;
const recurrenceOf = (r) => /sale|unit|order|purchase|transaction/i.test(r) ? 'per-sale' : /month/i.test(r) ? 'monthly' : 'one-time';
const items = (Array.isArray(a.budget_items) ? a.budget_items : []).map((b) => ({
  item: txt(b.item),
  category: CATS.find((c) => c.toLowerCase() === txt(b.category).toLowerCase()) || 'Optional',
  cost: num(b.cost),
  kind: recurrenceOf(txt(b.recurrence)),
  basis: txt(b.basis) || 'Assumption',
  reason: txt(b.reason),
  // A legal or regulatory item whose requirement is not established. It is conditional, so it is kept out of every total.
  legal: b.legal_check === true || String(b.legal_check).toLowerCase() === 'true',
  // Why an applicable cost has no amount yet, and whether it could change the decision.
  unknownReason: txt(b.unknown_reason),
  material: !(b.material === false || String(b.material).toLowerCase() === 'false'),
})).filter((b) => b.item);
const LEGAL_TIMING = 'Before first paid delivery: verify whether required';
const stageOrder = (b) => b.legal ? 0.5 : CATS.indexOf(b.category);
items.sort((x, y) => stageOrder(x) - stageOrder(y));
// Committed costs: in a stage, costed, and not conditional. Optional items are never committed.
const committed = items.filter((b) => !b.legal && b.category !== 'Optional' && b.cost !== null);
const uncosted = items.filter((b) => !b.legal && b.category !== 'Optional' && b.cost === null);
const legalItems = items.filter((b) => b.legal);
const optionalItems = items.filter((b) => !b.legal && b.category === 'Optional');
// When the "After traction" stage starts: a planning assumption expressed as customers per month. Code finds the period.
// The decision is either a threshold or "none in year one". It is never left open when After traction items exist.
const tractionReason = txt(a.traction && a.traction.reason);
const tractionNone = /none/i.test(txt(a.traction && a.traction.decision));
const tractionAt = tractionNone ? null : num(a.traction && a.traction.customers_per_month);
const tractionItems = items.filter((b) => b.category === 'After traction' && !b.legal);
if (tractionItems.length && ((!tractionNone && tractionAt === null) || !tractionReason)) fin_issues.push('The Budget has After traction items (' + tractionItems.map((b) => b.item).join(', ') + '), but the financial step returned no traction decision with a reason: either a customer level at which that spending starts, or a decision that none of it starts in year one. Those costs are not in the forecast.');
const stagesFor = (customers, sold, traction) => CATS.slice(0, 3).filter((c) => c === 'Before validation' || (c === 'After first sale' && sold) || (c === 'After traction' && traction));
const recurringOf = (stages) => committed.filter((b) => b.kind === 'monthly' && stages.includes(b.category));
const perSaleOf = (stages) => committed.filter((b) => b.kind === 'per-sale' && stages.includes(b.category));
const total = (list) => list.reduce((p, b) => p + b.cost, 0);
// Names the items behind a figure. Items that cost $0 are left out of the sentence; they stay in the Budget table.
const describe = (list, times, unitWord) => { const paid = list.filter((b) => b.cost > 0); return paid.length ? paid.map((b) => b.item + ' ' + unitMoney(b.cost) + (times ? ' x ' + times + ' ' + unitWord : '')).join(' + ') : 'only items that cost $0'; };

// 3. Scenarios: one month once the offer is running.
const KEYS = ['base', 'target', 'stretch'];
const sc = {};
KEYS.forEach((k) => {
  const s = (a.scenarios && a.scenarios[k]) || {};
  const customers = num(s.customers_per_month), conv = num(s.conversion_rate_pct);
  const revenue = mul(price, customers, ppm);
  const stages = stagesFor(customers, customers !== null && customers > 0, tractionAt !== null && customers !== null && customers >= tractionAt);
  const recurringItems = recurringOf(stages), perSaleItems = perSaleOf(stages);
  const sales = mul(customers, ppm);
  const recurring = total(recurringItems);
  const variable = sales === null ? null : Math.round(total(perSaleItems) * sales);
  const expenses = (customers === null || variable === null) ? null : Math.round(recurring) + variable;
  sc[k] = {
    customers, conv, revenue, stages, recurringItems, perSaleItems, sales, recurring: Math.round(recurring), variable, expenses,
    leads: (customers !== null && conv) ? Math.ceil(customers / (conv / 100)) : null,
    hours: mul(customers, ppm, hpp),
    profit: sub(revenue, expenses),
    basis: txt(s.basis) || 'Assumption',
    paid: s.paid_acquisition === true || String(s.paid_acquisition).toLowerCase() === 'true',
    reason: txt(s.reason), dependency: txt(s.primary_dependency), risk: txt(s.primary_risk),
  };
  if (customers === null) fin_issues.push('The ' + cap(k) + ' scenario has no customer number.');
});
const row = (label, f) => '| ' + label + ' | ' + KEYS.map((k) => f(sc[k])).join(' | ') + ' |';
const scenario_table = [
  '| Input | Base | Target | Stretch |',
  '|---|---|---|---|',
  row('Price per ' + unit, () => money(price)),
  row('Customers per month', (s) => qty(s.customers)),
  row('Conversion assumption', (s) => s.conv === null ? 'Not set' : qty(s.conv) + '%'),
  row('Leads required per month', (s) => qty(s.leads)),
  row('Monthly revenue', (s) => money(s.revenue)),
  row('Monthly operating expenses', (s) => money(s.expenses)),
  row('Monthly operating profit', (s) => money(s.profit)),
  row('Founder hours per month', (s) => qty(s.hours)),
  row('Primary dependency', (s) => s.dependency || 'Not set'),
  row('Primary risk', (s) => s.risk || 'Not set'),
].join('\n');
const expenseLine = (s) => {
  const parts = [];
  if (s.recurringItems.length) parts.push(describe(s.recurringItems));
  if (s.perSaleItems.length) parts.push(s.perSaleItems.map((b) => b.item + ' ' + unitMoney(b.cost) + ' x ' + qty(s.sales) + ' sales').join(' + '));
  return parts.length ? parts.join(' + ') : 'no recurring or per-sale costs in the stages this scenario has reached';
};
const arithmetic = KEYS.filter((k) => sc[k].revenue !== null).map((k) => {
  const s = sc[k];
  let l = '- ' + cap(k) + ': ' + money(price) + ' x ' + qty(s.customers) + ' customers' + (ppm !== 1 ? ' x ' + qty(ppm) + ' per month' : '') + ' = ' + money(s.revenue) + ' revenue';
  if (s.leads !== null) l += '; ' + qty(s.customers) + ' customers at ' + qty(s.conv) + '% conversion = ' + qty(s.leads) + ' leads';
  if (s.profit !== null) l += '; ' + money(s.revenue) + ' less ' + money(s.expenses) + ' operating expenses = ' + money(s.profit) + ' operating profit';
  return l + '.';
});
const scenarioExpenseLines = KEYS.filter((k) => sc[k].expenses !== null).map((k) => '- ' + cap(k) + ' operating expenses, ' + money(sc[k].expenses) + ' a month (' + sc[k].stages.join(', ') + ' stages): ' + expenseLine(sc[k]) + '.');
const assumptions = [];
assumptions.push('- Price (' + kindOf(priceBasis) + '): ' + money(price) + ' per ' + unit + '. ' + reasonOf(a.price));
if (reasonOf(a.purchases_per_customer_per_month)) assumptions.push('- Purchase frequency (planning assumption, untested): ' + qty(ppm) + ' per customer per month. ' + reasonOf(a.purchases_per_customer_per_month));
KEYS.forEach((k) => { if (sc[k].reason) assumptions.push('- ' + cap(k) + ' scenario (' + kindOf(sc[k].basis) + '): ' + sc[k].reason); });
if (hpp !== null) assumptions.push('- Founder time (planning assumption, untested): ' + qty(hpp) + ' hours per ' + unit + '. ' + reasonOf(a.hours_per_purchase));
checkWording('Price reason', reasonOf(a.price), priceBasis);
checkWording('Purchase frequency reason', reasonOf(a.purchases_per_customer_per_month), 'Assumption');
checkWording('Founder time reason', reasonOf(a.hours_per_purchase), 'Assumption');
KEYS.forEach((k) => {
  checkWording(cap(k) + ' scenario reason', sc[k].reason, sc[k].basis);
  checkWording(cap(k) + ' scenario primary dependency', sc[k].dependency, sc[k].basis);
  checkWording(cap(k) + ' scenario primary risk', sc[k].risk, sc[k].basis);
});
checkWording('Forecast ramp', txt(a.forecast && a.forecast.ramp_reason), 'Assumption');
checkWording('Traction trigger', tractionReason, 'Assumption');
let scenario_block = [
  scenario_table, '',
  '**How these figures are calculated**',
  ...(arithmetic.length ? arithmetic : ['- Not calculated because inputs are missing.']),
  ...scenarioExpenseLines,
  '- Operating expenses are the monthly and per-sale costs in the Budget for the stages a scenario has reached. One-time costs are not part of a monthly scenario; they are in the 12-month forecast.', '',
  '**What each input is based on**',
  ...assumptions, ...notes,
].join('\n');

// 3b. Cost review: the financial step's record of which costs it considered. It is internal evidence; only what helps the reader is printed.
const AREA = ['Acquire the customer', 'Make and process the sale', 'Deliver the product or service', 'Operate the business', 'Maintain required infrastructure'];
const REVIEW = {
  ads: [0, 'Paid advertising and promotion'], marketing: [0, 'Marketing tools and content'],
  payment: [1, 'Payment processing and transaction fees'], sales_tools: [1, 'Selling, booking and invoicing tools'],
  ai_api: [2, 'AI, model, API, research and data services used in delivery'], fulfilment: [2, 'Materials, inventory, packaging, shipping and fulfilment'], labor: [2, 'Contractors and other paid labor'], travel: [2, 'Travel and transport'],
  software: [3, 'Other software and subscriptions'], communications: [3, 'Communication services'], professional: [3, 'Professional services'], legal: [3, 'Registration, licensing, insurance and taxes'],
  hosting: [4, 'Website, hosting, database and storage'], automation: [4, 'Automation and workflow services'], equipment: [4, 'Equipment'],
};
const flag = (v) => v === true || String(v).toLowerCase() === 'true';
const cost_review = (Array.isArray(a.cost_review) ? a.cost_review : []).map((r) => {
  const key = txt(r.key).toLowerCase();
  const names = (Array.isArray(r.budget_items) ? r.budget_items : []).map((n) => txt(n).toLowerCase());
  const ap = txt(r.applies).toLowerCase();
  return {
    key, area: REVIEW[key] ? AREA[REVIEW[key][0]] : 'Business-specific', label: REVIEW[key] ? REVIEW[key][1] : (txt(r.label) || 'Other cost'),
    applies: ap === 'yes' ? 'yes' : ap === 'no' ? 'no' : 'unknown', material: flag(r.material), reason: txt(r.reason), note: flag(r.note_in_plan),
    linked: items.filter((b) => names.includes(b.item.toLowerCase())),
  };
}).filter((r) => r.key);
const missingKeys = Object.keys(REVIEW).filter((k) => !cost_review.some((r) => r.key === k));
const costNotes = [];
if (!cost_review.length) fin_issues.push('The financial step returned no cost review, so there is no record that the cost structure of this business was considered.');
else if (missingKeys.length) fin_issues.push('The cost review did not consider: ' + missingKeys.map((k) => REVIEW[k][1]).join('; ') + '.');
cost_review.forEach((r) => {
  let printed = false;
  if (!r.reason) fin_reviews.push('The cost review gives no reason for its decision on "' + r.label + '".');
  if (r.applies === 'yes' && !r.linked.length) {
    if (r.material) fin_issues.push('"' + r.label + '" applies and is material, but no Budget item covers it, so it is missing from the financial model.');
    else { costNotes.push('- Not in these figures: ' + r.label + '. The cost review treats it as applying but too small to change the decision, and gives no amount. ' + r.reason); printed = true; }
  }
  // A cost that is not resolved (applicability or amount) is reported once, in section 4b, with its status and the
  // headroom the forecast has for it. It is not reported here as well.
  if (r.applies === 'no' && r.note) { costNotes.push('- Not included: ' + r.label + '. ' + r.reason); printed = true; }
  if (printed) checkWording('Cost review reason for ' + r.label, r.reason, 'Assumption');
});
const reviewLines = cost_review.map((r) => '- ' + r.area + ' / ' + r.label + ': ' + (r.applies === 'yes' ? 'applies' : r.applies === 'no' ? 'does not apply' : 'not established') + (r.material ? ', material' : '') + (r.linked.length ? ' [' + r.linked.map((b) => b.item).join(', ') + ']' : '') + '. ' + r.reason);
// Paid acquisition: a scenario that depends on it must carry its cost.
const adItems = (cost_review.find((r) => r.key === 'ads') || { linked: [] }).linked.filter((b) => !b.legal && b.category !== 'Optional');
const paidKeys = KEYS.filter((k) => sc[k].paid);
paidKeys.forEach((k) => { if (!adItems.some((b) => sc[k].stages.includes(b.category))) fin_issues.push('The ' + cap(k) + ' scenario depends on paid acquisition, but the expense model has no advertising cost in the stages that scenario has reached.'); });
const paidFact = '- Paid acquisition: ' + (paidKeys.length ? 'the ' + paidKeys.map(cap).join(', ') + ' scenario' + (paidKeys.length > 1 ? 's depend' : ' depends') + ' on paid acquisition' : 'no scenario depends on paid acquisition') + '. ' + (adItems.length ? 'Advertising cost in the model: ' + adItems.map((b) => b.item + ' (' + b.category + ')').join(', ') + '.' : 'The model contains no committed advertising cost, so the plan must not rely on paid advertising.');

// 4. 12-month forecast on the Base path. Stage timing is found by code from the forecast's own customer numbers.
const LABELS = ['Months 1-3', 'Months 4-6', 'Months 7-9', 'Months 10-12'];
const fq = (a.forecast && Array.isArray(a.forecast.quarters)) ? a.forecast.quarters : [];
const cpms = LABELS.map((l, i) => num((fq[i] || {}).customers_per_month));
const firstSaleIdx = cpms.findIndex((c) => c !== null && c > 0);
const tractionIdx = tractionAt === null ? -1 : cpms.findIndex((c) => c !== null && c >= tractionAt);
const startOf = { 'Before validation': 0, 'After first sale': firstSaleIdx, 'After traction': tractionIdx };
const qs = LABELS.map((label, i) => {
  const cpm = cpms[i];
  const stages = CATS.slice(0, 3).filter((c) => startOf[c] >= 0 && i >= startOf[c]);
  const recurringItems = recurringOf(stages), perSaleItems = perSaleOf(stages);
  const oneTimeItems = committed.filter((b) => b.kind === 'one-time' && startOf[b.category] === i);
  const sales = mul(cpm, ppm, 3);
  const revenue = mul(price, cpm, ppm, 3);
  const recurring = Math.round(total(recurringItems) * 3);
  const variable = sales === null ? null : Math.round(total(perSaleItems) * sales);
  const expenses = variable === null ? null : recurring + variable;
  const profit = sub(revenue, expenses);
  const one_time = Math.round(total(oneTimeItems));
  return { label, cpm, stages, recurringItems, perSaleItems, oneTimeItems, sales, revenue, recurring, variable, expenses, profit, one_time, net: sub(profit, one_time) };
});
if (qs.some((q) => q.cpm === null)) fin_issues.push('The 12-month forecast is missing customer numbers for at least one period.');
const year = { revenue: sum(qs.map((q) => q.revenue)), expenses: sum(qs.map((q) => q.expenses)), one_time: sum(qs.map((q) => q.one_time)) };
year.profit = sub(year.revenue, year.expenses);
year.net = sub(year.profit, year.one_time);
// Costs that apply but have no amount yet. They are named, never set to $0, and kept out of every total.
const unknownIn = uncosted.filter((b) => startOf[b.category] >= 0);
uncosted.forEach((b) => {
  if (!b.unknownReason) fin_issues.push('"' + b.item + '" applies but has no amount and no explanation of why the amount is unknown. It is left out of the totals, so they understate expenses.');
  else {
    checkWording('Unknown-amount reason for ' + b.item, b.unknownReason, 'Assumption');
  }
});
const unknownNote = !unknownIn.length ? '' : 'These figures leave out ' + unknownIn.map((b) => b.item).join(', ') + ', because no amount is established for ' + (unknownIn.length > 1 ? 'them' : 'it') + '. If ' + (unknownIn.length > 1 ? 'they apply' : 'it applies') + ', projected ' + (unknownIn.some((b) => b.kind !== 'one-time') ? 'operating profit and net cash are' : 'net cash is') + ' overstated by whatever ' + (unknownIn.length > 1 ? 'they turn' : 'it turns') + ' out to cost.';
if (unknownNote) scenario_block += '\n- ' + unknownNote;
const forecast_table = [
  '| Period | Customers / month | 3-month revenue | 3-month operating expenses | 3-month operating profit |',
  '|---|---|---|---|---|',
  ...qs.map((q) => '| ' + q.label + ' | ' + qty(q.cpm) + ' | ' + money(q.revenue) + ' | ' + money(q.expenses) + ' | ' + money(q.profit) + ' |'),
  '| **Year one (12 months)** | | **' + money(year.revenue) + '** | **' + money(year.expenses) + '** | **' + money(year.profit) + '** |',
].join('\n');
const cash_table = [
  '| Period | Operating profit | One-time costs | Net cash after one-time costs |',
  '|---|---|---|---|',
  ...qs.map((q) => '| ' + q.label + ' | ' + money(q.profit) + ' | ' + money(q.one_time) + ' | ' + money(q.net) + ' |'),
  '| **Year one (12 months)** | **' + money(year.profit) + '** | **' + money(year.one_time) + '** | **' + money(year.net) + '** |',
].join('\n');
const reach = qs.find((q) => q.cpm !== null && sc.base.customers !== null && q.cpm === sc.base.customers);
const forecast_notes = [];
if (txt(a.forecast && a.forecast.ramp_reason)) forecast_notes.push('- Ramp (planning assumption, untested): ' + txt(a.forecast.ramp_reason));
if (sc.base.customers !== null) forecast_notes.push(reach
  ? '- The forecast reaches the Base scenario of ' + qty(sc.base.customers) + ' customers per month in ' + reach.label + '.'
  : '- The forecast does not reach the Base scenario of ' + qty(sc.base.customers) + ' customers per month within 12 months.');
forecast_notes.push('- Each period is three months. Revenue is the price x customers per month x 3. Operating expenses are the monthly costs of the Budget stages that are active, x 3, plus any per-sale costs x the number of sales.');
forecast_notes.push('- Stage timing is modeled in three-month periods. A stage\'s monthly costs are charged for the whole period in which its trigger falls, and its one-time costs are placed in that period. The model does not say in which month of the period the trigger falls.');
// Where that approximation is large against the year's profit, a person should look.
['After first sale', 'After traction'].forEach((c) => {
  if (startOf[c] < 0) return;
  const over = 2 * total(committed.filter((b) => b.kind === 'monthly' && b.category === c));
  if (year.profit !== null && over >= 100 && over >= 0.05 * Math.abs(year.profit)) fin_reviews.push('The ' + c + ' stage carries ' + usd(over / 2) + ' a month of recurring cost and is charged for the whole three-month period in which it starts. If it starts late in that period, year-one operating expenses are overstated by up to ' + usd(over) + ', against a year-one operating profit of ' + usd(year.profit) + '.');
});
// When each stage starts, and what every period's expenses consist of.
const stage_notes = [];
stage_notes.push('- Before validation costs apply from Months 1-3.');
stage_notes.push(firstSaleIdx >= 0
  ? '- After first sale costs start in ' + LABELS[firstSaleIdx] + ', the first period in which the forecast has a sale.'
  : '- After first sale costs do not start in year one, because the forecast has no sale.');
stage_notes.push(tractionNone
  ? '- After traction costs are not included in year one: the model sets no traction-triggered spending during year one (planning assumption, untested). ' + tractionReason
  : tractionAt === null
  ? '- After traction costs are not included in year one: no traction level was set, so the forecast cannot place them.'
  : tractionIdx >= 0
    ? '- After traction costs start in ' + LABELS[tractionIdx] + ', the first period at or above ' + qty(tractionAt) + ' customers per month (planning assumption, untested). ' + tractionReason
    : '- After traction costs do not start in year one: the forecast never reaches ' + qty(tractionAt) + ' customers per month (planning assumption, untested). ' + tractionReason);
const trace = qs.map((q) => {
  const parts = [];
  if (q.recurringItems.length) parts.push(describe(q.recurringItems, 3, 'months'));
  if (q.perSaleItems.length && q.sales !== null) parts.push(q.perSaleItems.map((b) => b.item + ' ' + unitMoney(b.cost) + ' x ' + qty(q.sales) + ' sales').join(' + '));
  return '- ' + q.label + ' operating expenses, ' + money(q.expenses) + ': ' + (parts.length ? parts.join(' + ') : 'none of the active stages has a recurring or per-sale cost') + '.';
});
const oneTimeTrace = qs.filter((q) => q.oneTimeItems.length).map((q) => '- One-time costs in ' + q.label + ', ' + money(q.one_time) + ': ' + describe(q.oneTimeItems) + '.');
if (!oneTimeTrace.length) oneTimeTrace.push('- No one-time cost falls in year one.');
// Conditional legal costs: outside every total, with a sensitivity statement.
const legalOnce = total(legalItems.filter((b) => b.kind === 'one-time' && b.cost !== null));
const legalMonthly = total(legalItems.filter((b) => b.kind === 'monthly' && b.cost !== null));
const legalPerSale = total(legalItems.filter((b) => b.kind === 'per-sale' && b.cost !== null));
const legalMonths = firstSaleIdx >= 0 ? (4 - firstSaleIdx) * 3 : 0;
const yearSales = sum(qs.map((q) => q.sales));
const legalYear = firstSaleIdx >= 0 ? Math.round(legalOnce + legalMonthly * legalMonths + legalPerSale * (yearSales || 0)) : 0;
// A conditional cost with no amount gets no invented sensitivity figure.
const legalKnown = legalItems.filter((b) => b.cost !== null);
const legalUnknown = legalItems.filter((b) => b.cost === null);
const legalUnknownNote = legalUnknown.length ? ' No amount is yet established for ' + legalUnknown.map((b) => b.item).join(', ') + ', so ' + (legalKnown.length ? 'that figure leaves it out.' : 'no figure is given for the effect.') : '';
const sensitivity = !legalItems.length ? ''
  : firstSaleIdx < 0 ? 'The conditional costs (' + legalItems.map((b) => b.item).join(', ') + ') are not included. The forecast has no paid delivery in year one, so they would not arise in it.'
  : 'The conditional costs (' + legalItems.map((b) => b.item).join(', ') + ') are not included above, because it has not been established that they are required.' + (legalKnown.length ? ' If they are required, year-one net cash after one-time costs would be ' + money(legalYear) + ' lower: ' + money(sub(year.net, legalYear)) + ' instead of ' + money(year.net) + '.' : '') + legalUnknownNote;
// 4b. Cost status and headroom.
// Every cost in the cost review gets exactly one status, and applicability is kept apart from amount:
//   applicable_amount_known     it applies and has an amount
//   applicable_amount_unknown   it applies and no amount is established
//   applicability_unknown       it is not established whether it applies
//   not_applicable              it is confirmed not to apply
// A missing value is never treated as zero. A founder answer is used when one exists (older submissions have none),
// and an answer does not by itself resolve a cost: "yes" with no usable amount is still an unknown amount.
// Registration, licensing, insurance and tax items are regulatory checks. Whether they are required is a legal
// question, so they are listed apart and are never judged by headroom.
const ANSWER_KEY = { ai_api: 'ai_services', professional: 'professional_advice' };
const founderAnswers = (() => { let v = ctx.cost_answers; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return (v && typeof v === 'object') ? v : {}; })();
const answerFor = (key) => {
  const r = founderAnswers[ANSWER_KEY[key]];
  if (!r || typeof r !== 'object') return null;
  const ap = txt(r.applies).toLowerCase().replace(/[\s-]+/g, '_');
  const applies = ap === 'yes' ? 'yes' : (ap === 'no' || ap === 'not_applicable') ? 'no' : ap === 'unknown' ? 'unknown' : '';
  if (!applies) return null;
  const amount = num(r.amount);
  const currency = (txt(r.currency) || 'USD').toUpperCase();
  const u = txt(r.unit).toLowerCase();
  const kind = /sale|session|order|customer/.test(u) ? 'per-sale' : /month/.test(u) ? 'monthly' : /one|once/.test(u) ? 'one-time' : /use/.test(u) ? 'per-use' : '';
  // The model is in US dollars and counts sales, not uses. An amount in another currency, or per use, is recorded and left unresolved.
  const usable = applies === 'yes' && amount !== null && currency === 'USD' && ['per-sale', 'monthly', 'one-time'].includes(kind);
  const why = applies !== 'yes' || usable ? '' : amount === null ? 'the founder gave no amount' : currency !== 'USD' ? 'the amount was given in ' + currency + ' and is not converted' : kind === 'per-use' ? 'the amount was given per use, and the number of uses per sale is not known' : 'the amount has no unit (per month, per sale, or one-time)';
  return { applies, amount, currency, kind, usable, why };
};
const cost_status = [];
const founderCosts = [];
const linkedSeen = new Set();
cost_review.forEach((r) => {
  r.linked.forEach((b) => linkedSeen.add(b));
  const regulatory = r.key === 'legal' || (r.linked.length > 0 && r.linked.every((b) => b.legal));
  const ans = regulatory ? null : answerFor(r.key);
  const live = r.linked.filter((b) => !b.legal && b.category !== 'Optional');
  const costed = live.filter((b) => b.cost !== null), open = live.filter((b) => b.cost === null);
  const applies = ans ? ans.applies : r.applies;
  const founderAmount = !!(ans && ans.usable && !costed.length);
  const amountOpen = regulatory ? (!r.linked.length || r.linked.some((b) => b.cost === null)) : (!founderAmount && (open.length > 0 || !costed.length));
  const status = applies === 'no' ? 'not_applicable' : applies === 'unknown' ? 'applicability_unknown' : amountOpen ? 'applicable_amount_unknown' : 'applicable_amount_known';
  if (founderAmount) founderCosts.push({ label: r.label, kind: ans.kind, amount: ans.amount });
  if (ans && ans.applies === 'no' && costed.length) fin_reviews.push('The founder says "' + r.label + '" does not apply, but the model includes ' + costed.map((b) => b.item).join(', ') + ' for it. The figures have not been changed.');
  cost_status.push({
    key: r.key, label: r.label, status, regulatory, in_totals: costed.length > 0 && applies !== 'no',
    source: ans ? 'founder answer' : 'financial step', founder_answer: ans ? { applies: ans.applies, amount: ans.amount, currency: ans.currency, unit: ans.kind, used_in_figures: false, not_used_because: ans.why } : null,
    budget_items: r.linked.map((b) => b.item), exposure: open.map((b) => ({ item: b.item, kind: b.kind, stage: b.category, starts_in_year_one: startOf[b.category] >= 0, months: startOf[b.category] >= 0 ? (4 - startOf[b.category]) * 3 : 0 })), reason: r.reason,
  });
});
uncosted.filter((b) => !linkedSeen.has(b)).forEach((b) => cost_status.push({ key: 'item', label: b.item, status: 'applicable_amount_unknown', regulatory: false, in_totals: false, source: 'financial step', founder_answer: null, budget_items: [b.item], exposure: [{ item: b.item, kind: b.kind, stage: b.category, starts_in_year_one: startOf[b.category] >= 0, months: startOf[b.category] >= 0 ? (4 - startOf[b.category]) * 3 : 0 }], reason: b.unknownReason }));
const STATUS_WORDS = { applicable_amount_known: 'applies, amount known', applicable_amount_unknown: 'applies, amount not established', applicability_unknown: 'not established whether it applies', not_applicable: 'does not apply' };
// Unresolved costs: not regulatory, and either the amount or the applicability is open. A cost whose amount is
// already in the totals is not counted again.
const unresolved = cost_status.filter((c) => !c.regulatory && (c.status === 'applicable_amount_unknown' || (c.status === 'applicability_unknown' && !c.in_totals)));
const regulatoryOpen = cost_status.filter((c) => c.regulatory && (c.status === 'applicability_unknown' || c.status === 'applicable_amount_unknown'));
// A cost the founder stated, that the model's totals do not contain, is taken off the outcome before headroom is measured.
// Monthly is charged for all 12 months, per-sale for every forecast sale, one-time once.
const founderYear = founderCosts.map((x) => ({ ...x, year: x.kind === 'monthly' ? x.amount * 12 : x.kind === 'per-sale' ? (yearSales === null ? null : x.amount * yearSales) : x.amount }));
const founderTotal = sum(founderYear.map((x) => x.year));
// HEADROOM. Outcome tested: year-one net cash after one-time costs, on the Base forecast path.
//   available      = year-one net cash - founder-stated costs that are not in the totals
//   per month      = available / 12                       (a cost paid in every month of year one)
//   per sale       = available / forecast sales in year one
//   one-time       = available
// These are three ways of spending the same amount, and all unresolved costs share it. Thresholds are rounded down to
// whole dollars. A threshold is a break-even point: it is not an estimate of the cost and not evidence of viability.
const available = (year.net === null || founderTotal === null) ? null : year.net - Math.round(founderTotal);
const hasRoom = available !== null && available > 0;
const cost_headroom = !unresolved.length ? null : {
  outcome: 'year-one net cash after one-time costs',
  baseline_usd: year.net,
  founder_costs_not_in_totals_usd: founderTotal === null ? null : Math.round(founderTotal),
  available_usd: available,
  has_room: hasRoom,
  year_one_sales: yearSales,
  per_month_over_12_months_usd: hasRoom ? Math.floor(available / 12) : null,
  per_sale_usd: (hasRoom && yearSales !== null && yearSales > 0) ? Math.floor(available / yearSales) : null,
  one_time_usd: hasRoom ? available : null,
  base_month: { operating_profit_usd: sc.base.profit, sales: sc.base.sales, per_sale_usd: (sc.base.profit !== null && sc.base.profit > 0 && sc.base.sales) ? Math.floor(sc.base.profit / sc.base.sales) : null },
  shared_by: unresolved.map((c) => c.label),
  formula: 'available = year-one net cash - founder-stated costs not in the totals; per month = available / 12; per sale = available / year-one sales; one-time = available. Rounded down. One shared amount, not one per cost.',
};
const namesOf = (list) => list.map((c) => c.label + ' (' + STATUS_WORDS[c.status] + ')').join('; ');
const notInYear = unresolved.filter((c) => c.exposure.length && c.exposure.every((e) => !e.starts_in_year_one));
const costConditionLines = [];
let cost_condition = '';
if (unresolved.length) {
  costConditionLines.push('- Costs that are not resolved and are not in these figures: ' + namesOf(unresolved) + '.');
  founderYear.forEach((x) => costConditionLines.push('- Founder-stated cost not in the tables above: ' + x.label + ', ' + unitMoney(x.amount) + (x.kind === 'monthly' ? ' per month' : x.kind === 'per-sale' ? ' per sale' : ' one-time') + (x.year === null ? '' : ', ' + money(Math.round(x.year)) + ' in year one') + '.'));
  if (available === null) {
    fin_issues.push('Costs are unresolved (' + unresolved.map((c) => c.label).join('; ') + ') and the forecast is incomplete, so the room for them could not be calculated.');
    costConditionLines.push('- The forecast is incomplete, so the room for these costs could not be calculated.');
    cost_condition = 'This assessment is conditional. These costs are not resolved and are not in the figures: ' + namesOf(unresolved) + '. The forecast is incomplete, so no threshold can be given for them.';
  } else if (!hasRoom) {
    costConditionLines.push('- Outcome tested: year-one net cash after one-time costs' + (founderYear.length ? ', less the founder-stated costs above' : '') + ', which is ' + money(available) + '. There is no room for the unresolved costs: any amount they cost adds to that shortfall.');
    cost_condition = 'This assessment is conditional. These costs are not resolved and are not in the figures: ' + namesOf(unresolved) + '. Year-one net cash after one-time costs is ' + money(available) + ' before them, so there is no room for them: any amount they cost adds to that shortfall.';
  } else {
    const perMonth = money(cost_headroom.per_month_over_12_months_usd);
    const perSale = cost_headroom.per_sale_usd === null ? '' : money(cost_headroom.per_sale_usd);
    costConditionLines.push('- Outcome tested: year-one net cash after one-time costs' + (founderYear.length ? ', less the founder-stated costs above' : '') + ', which is ' + money(available) + ' on this forecast.');
    costConditionLines.push('- Break-even threshold: the unresolved costs together would bring that to $0 if they came to ' + money(available) + ' in year one. That is ' + perMonth + ' a month if paid in all 12 months (' + money(available) + ' / 12)' + (perSale ? ', or ' + perSale + ' per sale across the ' + qty(yearSales) + ' forecast sales (' + money(available) + ' / ' + qty(yearSales) + ')' : '; the forecast has no sales in year one, so a per-sale cost would not arise in it') + ', or ' + money(available) + ' once. These are three ways of spending the same amount, rounded down.');
    if (unresolved.length > 1) costConditionLines.push('- The ' + unresolved.length + ' unresolved costs share that one amount. It is not a separate allowance for each.');
    if (cost_headroom.base_month.per_sale_usd !== null) costConditionLines.push('- For one Base month: operating profit of ' + money(sc.base.profit) + ' / ' + qty(sc.base.sales) + ' sales = ' + money(cost_headroom.base_month.per_sale_usd) + ' per sale before that month\'s operating profit reaches $0. This is a monthly figure, not the year-one threshold.');
    // Timing. How each unresolved Budget item would be charged on this forecast, and when the cash it would draw on exists.
    const charged = unresolved.flatMap((c) => c.exposure).filter((e) => e.starts_in_year_one).map((e) => {
      const from = startOf[e.stage];
      const salesFrom = sum(qs.slice(from).map((q) => q.sales));
      return e.item + ': ' + (e.kind === 'monthly' ? 'monthly, for the ' + qty(e.months) + ' months from ' + LABELS[from] : e.kind === 'per-sale' ? 'per sale, on the ' + qty(salesFrom) + ' sales from ' + LABELS[from] : 'once, in ' + LABELS[from]);
    });
    if (charged.length) costConditionLines.push('- How the unresolved Budget items would be charged on this forecast: ' + charged.join('; ') + '. A cost with no Budget item has no timing yet; the monthly figure above assumes it is paid in every month.');
    let running = 0;
    const cumulative = qs.map((q) => { running += q.net; return q.label + ' ' + money(running); });
    costConditionLines.push('- Cumulative net cash by period, before the unresolved costs: ' + cumulative.join(', ') + '. A cost paid before that cash exists has to be funded from the startup budget.');
    if (notInYear.length) costConditionLines.push('- On this forecast, ' + notInYear.map((c) => c.label).join('; ') + ' would not be charged in year one, because the stage it belongs to does not start.');
    costConditionLines.push('- A threshold is a break-even point. It is not an estimate of what these costs are, and it is not evidence that the business works.');
    cost_condition = 'This assessment is conditional. These costs are not resolved and are not in the figures: ' + namesOf(unresolved) + '. On this forecast, year-one net cash after one-time costs is ' + money(available) + '. It stays above $0 only if these costs together come to less than ' + money(available) + ' in year one: ' + perMonth + ' a month if paid in all 12 months' + (perSale ? ', or ' + perSale + ' per sale across the ' + qty(yearSales) + ' forecast sales' : '') + '.' + (unresolved.length > 1 ? ' They share that one amount; it is not a separate allowance for each.' : '') + ' This is a break-even threshold, not an estimate of these costs and not evidence that the business works.';
  }
  // One review item for the person approving the plan. The plan check decides whether the conclusion is worded conditionally.
  if (available !== null) fin_reviews.push('Unresolved costs: ' + namesOf(unresolved) + '. They are not in the figures. The conclusion of this plan is conditional on them' + (hasRoom ? '; year-one net cash has ' + usd(available) + ' of room before it reaches $0' : '; year-one net cash is already ' + (available < 0 ? '-' : '') + usd(Math.abs(available)) + ' before them') + '. Confirm them with the founder.');
}
if (regulatoryOpen.length) costConditionLines.push('- Regulatory checks, not judged by the threshold above: ' + namesOf(regulatoryOpen) + '. Whether these are required is a legal question. A financial threshold cannot show that an obligation does not apply. Verify before the first paid delivery.');

const optionalNote = optionalItems.length ? 'Optional items (' + optionalItems.map((b) => b.item).join(', ') + ') are not included in the forecast.' : '';
const forecast_block = [
  forecast_table, '',
  ...forecast_notes, '',
  '**When each Budget stage starts in the forecast**',
  ...stage_notes, '',
  '**What the operating expenses consist of**',
  ...trace, '',
  '**Operating profit and net cash after one-time costs**', '',
  cash_table, '',
  ...oneTimeTrace,
  ...(sensitivity ? ['- ' + sensitivity] : []),
  ...(unknownNote ? ['- ' + unknownNote] : []),
  ...(optionalNote ? ['- ' + optionalNote] : []),
  ...(costConditionLines.length ? ['', unresolved.length ? '**Costs that are not resolved, and the room the forecast has for them**' : '**Regulatory checks still to make**', ...costConditionLines] : []), '',
  'These projections are planning estimates based on the assumptions shown. They are not predictions or guarantees.',
].join('\n');

// 5. Budget table, built from the same items.
let budget_block = '';
const budgetFacts = [];
const stageTotals = {};
if (items.length) {
  const costCell = (b) => (b.cost === null ? 'Amount not yet established' + (b.kind === 'monthly' ? ' (monthly)' : b.kind === 'per-sale' ? ' (per sale)' : '') : unitMoney(b.cost) + (b.kind === 'monthly' ? ' per month' : b.kind === 'per-sale' ? ' per sale' : '')) + (b.legal ? ', if required' : '');
  CATS.slice(0, 3).forEach((c) => {
    const g = items.filter((b) => b.category === c && !b.legal && b.cost !== null);
    stageTotals[c] = { once: sum(g.filter((b) => b.kind === 'one-time').map((b) => b.cost)), monthly: sum(g.filter((b) => b.kind === 'monthly').map((b) => b.cost)), perSale: sum(g.filter((b) => b.kind === 'per-sale').map((b) => b.cost)) };
  });
  const bv = stageTotals['Before validation'];
  const first3 = (bv.once === null || bv.monthly === null) ? null : bv.once + bv.monthly * 3;
  budgetFacts.push('- Before validation, one-time: ' + money(bv.once));
  budgetFacts.push('- Before validation, each month: ' + money(bv.monthly));
  budgetFacts.push('- Before validation, total if that stage lasts three months (a budget figure, not the forecast\'s operating expenses): ' + money(first3) + (ceiling ? ', against a budget ceiling of ' + money(ceiling) : ''));
  ['After first sale', 'After traction'].forEach((c) => {
    const t = stageTotals[c];
    if (items.some((b) => b.category === c && !b.legal)) budgetFacts.push('- ' + c + ': ' + money(t.once) + ' one-time, ' + money(t.monthly) + ' each month' + (t.perSale ? ', ' + unitMoney(t.perSale) + ' per sale' : ''));
  });
  if (bv.perSale) budgetFacts.push('- Before validation, per sale: ' + unitMoney(bv.perSale));
  if (legalItems.length) budgetFacts.push('- Conditional costs, to be checked before the first paid delivery and paid only if required (not in the stage totals or the forecast): ' + money(legalOnce) + ' one-time, ' + money(legalMonthly) + ' each month' + (legalPerSale ? ', ' + unitMoney(legalPerSale) + ' per sale' : '') + (legalUnknown.length ? '. No amount is yet established for ' + legalUnknown.map((b) => b.item).join(', ') : ''));
  if (ceiling !== null && first3 !== null && first3 > ceiling) fin_issues.push('Spending before validation is above the budget ceiling.');
  const allUnknown = items.filter((b) => b.cost === null && !b.legal && b.category !== 'Optional');
  if (allUnknown.length) budgetFacts.push('- No amount is established for these items, and they are in none of the totals above: ' + allUnknown.map((b) => b.item + (b.unknownReason ? ' (' + b.unknownReason + ')' : '')).join('; ') + '.' + (unknownNote ? ' ' + unknownNote : ''));
  unresolved.forEach((c) => budgetFacts.push('- Cost status: ' + c.label + ', ' + STATUS_WORDS[c.status] + '.' + (c.reason ? ' ' + c.reason : '')));
  costNotes.forEach((l) => budgetFacts.push(l));
  budget_block = [
    '| Item | When to spend | Cost | Basis |',
    '|---|---|---|---|',
    ...items.map((b) => '| ' + b.item + ' | ' + (b.legal ? LEGAL_TIMING : b.category) + ' | ' + costCell(b) + ' | ' + b.basis + ' |'),
    '',
    ...budgetFacts,
  ].join('\n');
}

// 6. Reconciliation of the Budget and the Forecast. Each total is rebuilt item by item and compared with the period-by-period figures.
const reconciliation = [];
const check = (name, ok, detail) => { reconciliation.push({ check: name, ok, detail }); if (!ok) fin_issues.push('Reconciliation failed: ' + name + '. ' + detail); };
if (year.expenses !== null) {
  const activePeriods = (b) => qs.filter((q) => q.stages.includes(b.category));
  const byItemRecurring = committed.filter((b) => b.kind === 'monthly').reduce((p, b) => p + b.cost * 3 * activePeriods(b).length, 0);
  const byItemVariable = committed.filter((b) => b.kind === 'per-sale').reduce((p, b) => p + activePeriods(b).reduce((x, q) => x + b.cost * q.sales, 0), 0);
  const byItemOnce = committed.filter((b) => b.kind === 'one-time').reduce((p, b) => p + (startOf[b.category] >= 0 ? b.cost : 0), 0);
  const tol = (x, y) => Math.abs(x - y) <= qs.length;
  check('Every forecast operating expense traces to a Budget item', tol(byItemRecurring + byItemVariable, year.expenses), 'Items give ' + money(byItemRecurring + byItemVariable) + '; the forecast periods give ' + money(year.expenses) + '.');
  check('Recurring costs start at the right stage', qs.every((q) => q.recurringItems.every((b) => startOf[b.category] >= 0 && qs.indexOf(q) >= startOf[b.category])), 'No recurring cost appears before its stage starts.');
  const countOnce = committed.filter((b) => b.kind === 'one-time').every((b) => qs.filter((q) => q.oneTimeItems.includes(b)).length === (startOf[b.category] >= 0 ? 1 : 0));
  check('Each one-time cost occurs once', countOnce && tol(byItemOnce, year.one_time), 'Items give ' + money(byItemOnce) + '; the forecast periods give ' + money(year.one_time) + '.');
  check('Per-sale costs scale with sales', qs.every((q) => q.variable === Math.round(total(q.perSaleItems) * q.sales)), 'Each period\'s variable cost equals the per-sale costs x that period\'s sales.');
  check('Conditional costs are outside every total', qs.every((q) => !q.recurringItems.concat(q.perSaleItems, q.oneTimeItems).some((b) => b.legal)) && KEYS.every((k) => !sc[k].recurringItems.concat(sc[k].perSaleItems).some((b) => b.legal)), legalItems.length + ' conditional item(s), none in a scenario or a forecast period.');
  const last = qs[qs.length - 1];
  const stageMonthly = last.stages.reduce((p, c) => p + ((stageTotals[c] || {}).monthly || 0), 0);
  check('Budget stage totals match the forecast', tol(stageMonthly * 3, last.recurring), 'The Budget\'s monthly totals for the stages active in ' + last.label + ' give ' + money(stageMonthly * 3) + '; the forecast uses ' + money(last.recurring) + '.');
  check('Year-one operating profit reconciles', year.profit === sum(qs.map((q) => q.profit)) && year.profit === year.revenue - year.expenses, money(year.revenue) + ' revenue less ' + money(year.expenses) + ' operating expenses = ' + money(year.profit) + '.');
  check('Year-one net cash reconciles', year.net === sum(qs.map((q) => q.net)) && year.net === year.profit - year.one_time, money(year.profit) + ' operating profit less ' + money(year.one_time) + ' one-time costs = ' + money(year.net) + '.');
}
reconciliation.push({ check: 'Unknown amounts are outside every total', ok: !qs.some((q) => q.recurringItems.concat(q.perSaleItems, q.oneTimeItems).some((b) => b.cost === null)), detail: uncosted.length + ' applicable item(s) with no amount; none is counted as $0.' });
reconciliation.push({ check: 'Cost review covers every required category', ok: cost_review.length > 0 && !missingKeys.length, detail: cost_review.length + ' entries; ' + missingKeys.length + ' required categories missing.' });
reconciliation.push({ check: 'Every applicable material cost has a Budget item', ok: !cost_review.some((r) => r.applies === 'yes' && r.material && !r.linked.length), detail: cost_review.filter((r) => r.applies === 'yes').length + ' categories apply; ' + cost_review.filter((r) => r.applies === 'yes' && r.linked.length).length + ' have Budget items.' });

// 7. Loan (bank loan plans only)
let loan_block = '';
const loanFacts = [];
if (ctx.goal === 'bank-loan' && a.loan && typeof a.loan === 'object') {
  const amount = num(a.loan.amount), rate = num(a.loan.annual_rate_pct), term = num(a.loan.term_months);
  let payment = null;
  if (amount !== null && rate !== null && term) {
    const r = rate / 1200;
    payment = r === 0 ? amount / term : amount * r / (1 - Math.pow(1 + r, -term));
  } else fin_issues.push('The loan payment could not be calculated because the amount, rate, or term is missing.');
  const left = sub(sc.base.profit, payment);
  const basis = txt(a.loan.rate_term_basis) || 'Assumption';
  loan_block = [
    '| Item | Value |',
    '|---|---|',
    '| Loan amount | ' + money(amount) + ' |',
    '| Annual interest rate (' + basis + ') | ' + (rate === null ? 'Not set' : qty(rate) + '%') + ' |',
    '| Term (' + basis + ') | ' + (term === null ? 'Not set' : qty(term) + ' months') + ' |',
    '| Monthly payment | ' + money(payment) + ' |',
    '| Base scenario monthly operating profit | ' + money(sc.base.profit) + ' |',
    '| Left after the payment in the Base scenario | ' + money(left) + ' |',
    '',
    '- The monthly payment uses the standard loan amortization formula. Replace the rate and term with the lender\'s quote.',
  ].join('\n');
  loanFacts.push('- Loan amount: ' + money(amount) + '. Monthly payment: ' + money(payment) + '. Base scenario operating profit left after the payment: ' + money(left) + (left !== null && left < 0 ? ' (the Base scenario does not cover the payment)' : '') + '.');
}

// 8. Facts the writer may quote
const mc = num(a.first_revenue_milestone_customers);
// Weekly rates are calculated here so the writer never converts a monthly figure itself.
const wk = (n) => String(Math.round(n * 12 / 52 * 10) / 10);
const facts = [
  '- Primary offer: ' + offer,
  '- Price: ' + money(price) + ' per ' + unit + ' (basis: ' + priceBasis + ')',
  ...KEYS.map((k) => '- ' + cap(k) + ' scenario, per month: ' + qty(sc[k].customers) + ' customers, ' + qty(sc[k].leads) + ' leads required, ' + money(sc[k].revenue) + ' revenue, ' + money(sc[k].expenses) + ' operating expenses, ' + money(sc[k].profit) + ' operating profit, ' + qty(sc[k].hours) + ' founder hours'),
  ...KEYS.filter((k) => sc[k].customers !== null).map((k) => '- ' + cap(k) + ' scenario, per week (the monthly figure x 12 / 52): about ' + wk(sc[k].customers) + ' customers' + (sc[k].leads !== null ? ', about ' + wk(sc[k].leads) + ' leads' : '') + (sc[k].hours !== null ? ', about ' + wk(sc[k].hours) + ' founder hours' : '')),
  ...qs.map((q) => '- Forecast ' + q.label + ': ' + qty(q.cpm) + ' customers per month, ' + money(q.revenue) + ' revenue, ' + money(q.expenses) + ' operating expenses, ' + money(q.profit) + ' operating profit, ' + money(q.one_time) + ' one-time costs, ' + money(q.net) + ' net cash after one-time costs'),
  '- Forecast year one: ' + money(year.revenue) + ' revenue, ' + money(year.expenses) + ' operating expenses, ' + money(year.profit) + ' operating profit, ' + money(year.one_time) + ' one-time costs, ' + money(year.net) + ' net cash after one-time costs',
  ...(sensitivity ? ['- Conditional costs: ' + sensitivity] : []),
  paidFact,
  '- First revenue milestone: ' + (mc === null ? 'Not set' : qty(mc) + ' paying customers = ' + money(mul(price, mc)) + ' revenue'),
  ...budgetFacts,
  ...loanFacts,
];
if (ceiling) money(ceiling);

let goal_brief = '';
for (const n of ['Personal Roadmap Prompt', 'Bank Loan Prompt', 'Investor Pitch Prompt']) {
  try { const t = $(n).first().json.full_user_prompt; if (t) { goal_brief = t; break; } } catch (e) {}
}

const financial_model = [
  'FINANCIAL MODEL (every figure below was calculated by code; do not recalculate)',
  '',
  'FINANCIAL FACTS (copy figures exactly from here)',
  ...facts,
  '',
  'SCENARIO TABLE (inserted where you put [[SCENARIO_TABLE]])',
  scenario_block,
  '',
  'FORECAST TABLE (inserted where you put [[FORECAST_TABLE]]; it includes the expense breakdown and the net cash table)',
  forecast_block,
  '',
  'BUDGET TABLE (inserted where you put [[BUDGET_TABLE]])',
  budget_block || 'No budget items were set.',
  ...(items.length ? ['', 'Why each budget item is where it is:', ...items.map((b) => '- ' + b.item + ': ' + (b.reason || 'no reason given'))] : []),
  ...(loan_block ? ['', 'LOAN TABLE (inserted where you put [[LOAN_TABLE]])', loan_block] : []),
  ...(cost_condition ? ['', 'COST CONDITION (required). The Viability Assessment must contain the paragraph below, copied exactly, and must state its conclusion as conditional on it. Do not change its figures, and do not state the conclusion without it.', cost_condition] : []),
  '',
  'COST REVIEW (internal record of which costs were considered; use it to keep recommendations consistent with the model, and never print it as a list)',
  ...(reviewLines.length ? reviewLines : ['None returned.']),
  '',
  'MISSING INPUTS',
  fin_issues.length ? fin_issues.map((i) => '- ' + i).join('\n') : 'None.',
  ...(fin_reviews.length ? ['', 'NEEDS REVIEW BEFORE SENDING', ...fin_reviews.map((i) => '- ' + i)] : []),
].join('\n');

return {
  scenario_block, forecast_block, budget_block, loan_block,
  financial_model,
  fin_issues,
  fin_reviews,
  cost_review: cost_review.map((r) => ({ area: r.area, category: r.label, applies: r.applies, material: r.material, reason: r.reason, budget_items: r.linked.map((b) => b.item), noted_in_plan: r.note })),
  unknown_costs: uncosted.concat(legalUnknown).map((b) => ({ item: b.item, stage: b.legal ? 'Conditional' : b.category, recurrence: b.kind, material: b.material, reason: b.unknownReason })),
  cost_status,
  cost_headroom,
  cost_condition,
  unresolved_costs: unresolved.map((c) => c.label),
  regulatory_checks: regulatoryOpen.map((c) => c.label),
  reconciliation,
  t_ms: Date.now(),
  allowed_money: [...allowed],
  model_counts: [...counts],
  model_percents: KEYS.map((k) => sc[k].conv).filter((v) => v !== null),
  language_flags,
  // The computed values, for the deterministic check of financial statements in the prose.
  model: {
    scenarios: Object.fromEntries(KEYS.map((k) => [k, { customers: sc[k].customers, leads: sc[k].leads, revenue: sc[k].revenue, expenses: sc[k].expenses, profit: sc[k].profit }])),
    periods: qs.map((q) => ({ label: q.label, customers: q.cpm, revenue: q.revenue, expenses: q.expenses, profit: q.profit, one_time: q.one_time, net: q.net })),
    year: { revenue: year.revenue, expenses: year.expenses, profit: year.profit, one_time: year.one_time, net: year.net },
  },
  rate_basis: { customers: [...new Set(KEYS.map((k) => sc[k].customers).concat(qs.map((q) => q.cpm)).filter((v) => v !== null && v > 0))], leads: [...new Set(KEYS.map((k) => sc[k].leads).filter((v) => v !== null && v > 0))] },
  goal_brief,
  // The Starter writer gets the run date too, so any date it writes or judges is measured against the real clock.
  starter_user_prompt: runDate.line + '\n\n' + goal_brief + '\n\n' + financial_model,
};
