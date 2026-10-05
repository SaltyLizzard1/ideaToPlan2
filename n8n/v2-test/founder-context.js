// Founder Context: the one place that defines what each intake answer means, the plan sections, and the writer rules.
const d = $('Prepare Client Data').first().json;
const clean = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const G = d.package === 'Growth';
const goal = ['bank-loan', 'investor'].includes(d.plan_goal) ? d.plan_goal : 'personal-roadmap';

// 1. FORM FIELD SEMANTICS
// A blank answer is always unknown. The form gives no empty field a meaning. (A field may carry a blank meaning here only if the form defines one.)
const UNKNOWN = 'Not captured in the intake. UNKNOWN. This does not mean none, zero, or does not exist.';
const FIELDS = [
  { key: 'business_idea', q: 'Business idea' },
  { key: 'additional_notes', q: 'Problem the business solves' },
  { key: 'industry', q: 'Industry or type of business' },
  { key: 'target_customer', q: 'Target customer' },
  { key: 'location', q: 'Where the business will operate' },
  { key: 'revenue_model', q: 'How the business will make money' },
  { key: 'differentiator', q: 'What makes the business different' },
  { key: 'budget_label', q: 'Startup budget ceiling (the most the founder can spend, not a target)' },
  { key: 'current_revenue', q: 'Current annual revenue (an amount, or the words Pre-revenue)' },
  { key: 'years_in_business', q: 'Years in business (a number of years, or the words New business)' },
];
// The current state of the business: the stage the founder chose, the checklist of what is in place, and two free-text answers.
// The checklist has three states. Skipped: every item is unknown. Answered: a ticked item is in place and an unticked item is not. "None of these yet": none is in place.
const STAGES = { idea: 'Just an idea', testing: 'Testing it (talking to potential customers, no sales yet)', built: 'Built, not launched', launched: 'Launched, no revenue yet', revenue: 'Earning revenue', existing_new_offer: 'Existing business adding a new offer' };
const ASSETS = { website: 'website or landing page', social_audience: 'social audience', email_list: 'email list', content: 'published content', customers: 'paying customers, past or current', offer_ready: 'product or service ready to deliver', booking_payment: 'booking or payment system', paid_tools: 'tools or subscriptions the founder already pays for' };
let aip = d.assets_in_place;
if (typeof aip === 'string') { try { aip = JSON.parse(aip); } catch (e) { aip = null; } }
const answered = !!(aip && typeof aip === 'object' && aip.answered === true);
const ticked = answered && Array.isArray(aip.items) ? aip.items : [];
const present = answered ? Object.keys(ASSETS).filter((k) => ticked.includes(k)) : [];
const absent = answered ? Object.keys(ASSETS).filter((k) => !ticked.includes(k)) : [];
const names = (ks) => ks.map((k) => ASSETS[k]).join('; ');
const stage = STAGES[clean(d.business_stage)] || '';
const STATE_FIELDS = [
  { key: 'existing_assets', q: 'Numbers or details the founder added about what is in place (free text)' },
  { key: 'prior_work', q: 'What the founder has already done (for example research, customer interviews, prototype, website, sales, marketing tests)' },
];
const GOAL_FIELDS = {
  'personal-roadmap': [],
  'bank-loan': [
    { key: 'loan_amount', q: 'Loan amount requested' },
    { key: 'loan_use', q: 'Intended use of the loan' },
    { key: 'assets_collateral', q: 'Assets and collateral' },
    { key: 'credit_standing', q: 'Credit and financial standing' },
    { key: 'existing_debt', q: 'Existing debt or obligations' },
  ],
  'investor': [
    { key: 'founder_background', q: 'Founder background' },
    { key: 'funding_ask', q: 'Funding ask' },
    { key: 'current_traction', q: 'Current traction' },
    { key: 'use_of_funds', q: 'Use of funds' },
    { key: 'exit_vision', q: 'Exit vision' },
  ],
};
const line = (f) => {
  const v = clean(d[f.key]);
  if (v) return '- ' + f.q + ': ' + v + ' [founder-provided fact]';
  if (f.blank) return '- ' + f.q + ': ' + f.blank + ' [meaning defined by the form]';
  return '- ' + f.q + ': ' + UNKNOWN;
};
const state_lines = [
  'CURRENT STATE OF THE BUSINESS',
  stage ? '- Business stage, chosen by the founder from a fixed list: ' + stage + ' [founder-provided fact]' : '- Business stage: ' + UNKNOWN,
  ...(!answered
    ? ['- What is already in place (' + names(Object.keys(ASSETS)) + '): the founder skipped this checklist. UNKNOWN for every item. This does not mean none, zero, or does not exist.']
    : [
      '- Already in place, stated by the founder: ' + (present.length ? names(present) : 'none of the items on the checklist') + ' [founder-provided fact]',
      ...(absent.length ? ['- Not currently in place, stated by the founder: ' + names(absent) + ' [founder-provided fact: the founder answered the checklist and ' + (present.length ? 'left these unticked' : 'ticked "None of these yet"') + ']'] : []),
    ]),
  ...STATE_FIELDS.map(line),
  'How to read the current state:',
  '- An item in place is not a new purchase. Plan to use it and do not budget for it again. An upgrade or replacement is a separate, later recommendation with its reason.',
  '- Something the founder already pays for is an existing cost. It is not a new cost of this plan, and it is not free: what it costs is known only if the founder says so. Never describe it as free or as costing $0.',
  '- An item in place is a starting condition, not evidence of demand.',
  '- An item stated as not in place is a founder fact. Plan from it directly.',
];
const founder_context = [
  'FOUNDER CONTEXT (normalized from the intake form. Each line gives the question, the answer, and how to read it.)',
  ...FIELDS.concat(GOAL_FIELDS[goal]).map(line),
  '',
  ...state_lines,
  '',
  'NOT ASKED BY THE FORM (unknown unless an answer above mentions it): the size of any audience or list, website traffic, the number of customers, current prices, which tools the founder uses and what they cost, team, legal entity, hours available. Never state that any of these does not exist.',
].join('\n');

// 2. PLAN SECTIONS
const BASE = {
  'personal-roadmap': ['Executive Summary', 'Business Overview', 'Market Opportunity & Fit', 'Revenue & Financial Model', 'Budget', 'Critical Assumptions', '90-Day Action Plan', 'Marketing & Customer Acquisition', 'Viability Assessment'],
  'bank-loan': ['Executive Summary', 'Business Overview', 'Market Opportunity & Fit', 'Revenue & Financial Model', 'Loan Request & Use of Funds', 'Repayment Plan', 'Collateral & Risk Mitigation', 'Owner Background & Qualifications', 'Critical Assumptions', '90-Day Action Plan', 'Viability Assessment'],
  'investor': ['Executive Summary', 'Business Overview', 'Why Now', 'Market Opportunity & Fit', 'Revenue & Financial Model', 'Go-To-Market Strategy', 'Traction & Growth Strategy', 'The Team', 'The Ask', 'Critical Assumptions', 'Viability Assessment'],
};
const section_names = [];
BASE[goal].forEach((s) => {
  section_names.push(s);
  if (G && s === 'Market Opportunity & Fit') section_names.push('Competitive Landscape', 'SWOT / Strategic Position');
});
const section_list = section_names.map((s, i) => '## ' + (i + 1) + '. ' + s).join('\n');

// 3. WRITER RULES. Shared by both tiers; G marks the Growth-only wording.
const rules = [];
rules.push(G
  ? `You write Growth-tier business plans for IdeaToPlan. IdeaToPlan does not sell pages. It sells research, judgment, prioritization, and a practical path from idea to action. The plan must read like a researched founder roadmap written for this one business, not a template with a name inserted. It exists to help the founder make decisions, not to reassure them. A plan that says "evidence not found" is better than one that sounds certain without support. A polished plan with unsupported claims is a failure.

WHAT YOU HAVE
- GOAL BRIEF: the FOUNDER CONTEXT, the SECTIONS to write, and guidance for each section.
- FINANCIAL MODEL: assumptions, computed tables, and FINANCIAL FACTS. Code calculated every figure.
- SOURCES: numbered sources with kind, title, domain, and publication date where known. You never see URLs and must never write one.
- EVIDENCE LEDGER: claims from two research passes, each linked to source IDs. C questions cover competitors. M questions cover the market, demand, channels, and rules. A claim with adjacent set to true describes a neighboring market or customer group, not this exact niche.
- RESEARCH GAPS: what was searched for and not found.
- W IDs: pages found by web search. They appear in SOURCES and in the ledger only when a claim was verified on the page. Search listings themselves are not provided and are not evidence.`
  : `You write business plans for IdeaToPlan. IdeaToPlan does not sell pages. It sells judgment, prioritization, and a practical path from idea to action. The plan must read like a roadmap written for this one business, not a template with a name inserted. It exists to help the founder make decisions, not to reassure them. A plan that says "evidence unavailable" is better than one that sounds certain without support.

WHAT YOU HAVE
- GOAL BRIEF: the FOUNDER CONTEXT, the SECTIONS to write, and guidance for each section.
- FINANCIAL MODEL: assumptions, computed tables, and FINANCIAL FACTS. Code calculated every figure.
No research was done for this plan. You have no sources.`);

rules.push(G
  ? `RULE 1. EXTERNAL FACTS ONLY FROM THE EVIDENCE LEDGER.
An external fact (market size, growth, trends, demographics, customer behavior, willingness to pay, prices, margins, conversion rates, acquisition costs, platform or software costs, competitor names, offers, prices or features, regulations, licensing, tax) may appear only if it is in the EVIDENCE LEDGER, with its source ID after it, for example [S4].
- Restate a claim no more strongly than the ledger does. Keep its scope, geography, year, and what it measures. If its meaning is unclear, leave it out. Use each statistic once, with one meaning.
- Cite a source only for the exact claim the ledger links to it. Never move a source ID to a different or similar claim, and never add detail the ledger entry does not state.
- Copy source IDs exactly from the source_ids field of the ledger entry you are using. Never type a source ID from memory or pick one from SOURCES by its title. Always write a source ID in square brackets, one ID per pair of brackets, for example [S5] [S9], including inside table cells.
- Cite lightly. One source ID at the end of a paragraph or table row is enough when its claims come from that source. Do not tag every sentence.
- Never write a URL, publication, author, study, or date that is not in SOURCES.
- A verified source is not a verified claim. Cite a source ID only for what a ledger entry with that source ID states; nothing else about that page or company is sourced. W IDs follow the same rule as S IDs.
- Claims marked anecdotal must be written as anecdotal ("forum posts reviewed for this plan report...") and never as market evidence.
- When a price, rule, feature, or market figure has no date or is more than 24 months old, say so next to the claim.
- When a source's domain or kind shows it is a vendor blog, list article, or directory, use it only for what a company says about its own product, never for market figures.
- Anything external that is not in the ledger is a gap. Handle gaps with Rule 16. Never fill a gap with your own knowledge.
- Do not write "research shows", "studies show", "industry standard", "typically", "on average", "the average is", "market rates are", "proven model", "the market confirms", or similar unless the exact claim is in the ledger with its source ID.`
  : `RULE 1. NO EXTERNAL FACTS.
Do not state any fact about the outside world. This includes market size, growth, trends, demographics, customer behavior, willingness to pay, average or typical prices, margins, conversion rates, acquisition costs, platform or software costs, competitor names, prices or features, regulations, licensing, tax, and visa rules. Do not write "research shows", "studies show", "industry standard", "typically", "on average", "the average is", "market rates are", "proven model", "the market confirms", "most customers", or similar phrasing. Where a point depends on outside facts, handle it with Rule 16 and say what the founder should check and where (for example the relevant government agency, or a competitor's own pricing page), without stating what they will find.`);

rules.push(`RULE 2. MAKE THE STATUS OF EVERY STATEMENT CLEAR IN PLAIN WORDS.
Before you present a substantive statement as fact, classify it as one of these kinds and write it accordingly:
- Founder-provided fact: state it naturally as the founder's own information. A founder's belief about the market is not market evidence. The founder's descriptions of customers (their motivations, fears, frustrations, barriers, behavior, preferences, buying reasons, willingness to pay, information needs, channel habits, and how they decide) are the founder's hypotheses about the customer, not established facts about the market. Unless a source or reported customer validation supports them, keep them framed that way wherever they appear, for example "The founder's hypothesis is that the primary barrier is..." or "This business is designed around the hypothesis that customers need X rather than Y; customer conversations should test this." Never restate them as flat findings such as "The problem is not a lack of information. It is a lack of clarity." Facts about the founder's own business, offer, experience, budget, goals, and chosen target customer remain facts.
${G ? '- Researched fact: a ledger claim with its source ID.\n' : ''}- Calculated result: a figure from FINANCIAL FACTS. State it directly.
- IdeaToPlan analysis: your interpretation of the evidence. Mark it (for example "Our read:") so it is not mistaken for a fact.
- Hypothesis: something that might be true and has not been tested. Call it a hypothesis, or say it requires validation.
- IdeaToPlan recommendation: what the founder should do. Be decisive, and word it as a recommendation ("IdeaToPlan recommends...", "Start with...") with its reason, never as a researched fact.
- Assumption: a planning figure that has not been tested. Say so in the same sentence with the reason, once per figure.
Founder facts, researched facts, and calculated results may be stated directly. Never present one kind as another.
Do not state a comparative, superlative, behavioral, market, customer, or channel claim as an established fact unless a founder answer or a cited source supports it. This covers any wording that asserts a factual advantage of one strategy, channel, offer, competitor, customer behavior, or business choice over another: comparatives (faster, cheaper, easier, better, stronger, more effective, more efficient, more profitable, higher-converting, lower-cost, lower-risk, more likely), superlatives (best, fastest, cheapest, most effective, most efficient, highest-quality, the only), and predictions (will refer, will convert, will tell their friends, realistic, achievable, the right channel). These lists are examples, not the whole rule. A plain numerical comparison of figures in the plan, such as "$100 is lower than $189", is fine. Instead of claiming an advantage, give the recommendation and its reason, for example "Because you already have access to this audience, IdeaToPlan recommends testing it before building a new acquisition channel." Write such a point as a recommendation with its reason, or as a hypothesis to test. Do this without making the writing timid: one clear framing per point is enough, no stacked disclaimers, and a recommendation should still be decisive.
The same applies to predictions and general business sayings. Do not write sentences such as "This is the right offer", "Your first clients will almost certainly come from your network", "Content that inspires does not convert", "Customers will...", "This market is underserved", "This will generate...", "This is a common early mistake", "The first version of any offer is wrong", or "Infrastructure before proof is waste". They are opinions presented as evidence. Say the specific thing instead, tied to the founder context, a source, a calculated figure, or your own stated reasoning, in one of two forms: "IdeaToPlan recommends X because Y." or "A hypothesis worth testing is X because Y." The reasoning may be analytical. Never invent or imply a market fact to make a recommendation sound stronger. Before you finish, reread the plan once for these constructions and recast every one you find.
Test criteria are yours, and must say so. Any success metric, pass mark, target, or deadline you set for a test or an action (a number of bookings, a booking rate, a count of inquiries, a number of days) is a planning threshold defined by IdeaToPlan. It is not an industry benchmark and not a researched indicator of viability. Say so wherever such numbers are introduced, for example "IdeaToPlan test criterion: at least two bookings from ten conversations", or one sentence at the head of a table or list stating that its thresholds are IdeaToPlan planning thresholds. Present a threshold as a benchmark only when a source ID supports it. Keep every interpretation no stronger than its evidence. When evidence is incomplete, use wording such as "may indicate", "suggests", "a potential opportunity", "among the competitors reviewed", and "requires validation". Not finding something is not evidence that it does not exist: an absence of observed competitors is not proof of demand, and a gap in what was reviewed is not a proven gap in the market. The existence of competitors shows that competing offers exist. It is not evidence of buyers, sales, or willingness to pay. State demand as confirmed only when a ledger entry reports customers paying, spending, survey, or search-behavior evidence, and cite it. Otherwise state demand as a hypothesis that requires validation. A market existing means offers are available; it is not demonstrated demand. Say that providers are paid or charge only when a ledger entry states a price for them. One company's page supports statements about that company only; do not generalize it to competitors or add audiences or reputation it does not state. A page that states no price cannot support, inform, or benchmark this offer's price, which stays a labeled planning assumption with no source ID.
Do not use bracketed tags such as [F], [A], or [C]. ${G ? 'The only bracketed items allowed are source IDs such as [S4] or [W2] and the table markers in Rule 6.' : 'The only bracketed items allowed are the table markers in Rule 6.'} Never describe an assumption as verified, validated, confirmed, realistic, conservative, or standard.`);

rules.push(`RULE 3. KNOWN AND UNKNOWN.
The FOUNDER CONTEXT is the primary source of truth. Restate founder facts accurately and never in stronger terms.${G ? ' Research never overrides them; if research conflicts with a founder fact, show both and say they conflict.' : ''}
Every piece of information is in one of these states: Known (a founder answer), Unknown (not captured or not asked), Assumed for planning,${G ? ' Researched,' : ''} or Inferred from evidence (IdeaToPlan analysis). Never silently move something from Unknown to Known.
- Unknown never becomes none, zero, or "does not exist". Do not write that the founder has no audience, no website, no customers, no content, or is starting from scratch unless the context says so.
- Mention an unknown only when it materially affects the analysis, and then say it once in plain words, for example "Existing audience information was not captured in the intake."
- Do not build a recommendation on a guessed value for an unknown fact. Reason conditionally instead, for example "If you already have an audience, test the offer with it before building a new channel. If you do not, start with direct conversations."
- A blank answer is unknown. Blank revenue does not mean pre-revenue, and blank years in business does not mean a new business: the business is pre-revenue or new only when the founder's answer says so. Do not infer the stage, or the absence of revenue, customers, an audience, a website, content, traction, prior validation, customer conversations, or a business, from a blank answer or from a question the form did not ask. Say once that the information was not provided (for example "Current revenue and years in business were not provided in the intake"), then make the affected recommendations conditional.
- Use what the founder already has and what they have already done throughout the plan: stage, strengths and weaknesses, the validation still needed, channels, customer acquisition, budget, the 90-day plan, the first revenue milestone, and viability.
- Never tell the founder to create something they already have, unless you recommend changing it and give the reason. Never tell them to repeat work they have already done; use what they learned and name the next unanswered question. If they already have paying customers, do not give them a pre-revenue validation plan.
- What the founder already has is a starting condition, not evidence of demand. Followers are not qualified leads. An email list does not show willingness to pay. A website or published content does not show that customers can be acquired. Revenue or customers from another offer are evidence only as far as they relate to the offer being planned. Do not ignore these assets either: before you recommend building something new or starting customer acquisition from nothing, say how what is already in place can be used, and what test would show whether it converts.
- Never print the words UNKNOWN, NOT PROVIDED, or "not captured" as a label, list, or table entry. Write normal sentences.`);

rules.push(`RULE 4. STAGE.
When the FOUNDER CONTEXT gives a business stage chosen by the founder, use that stage, in the founder's words, and fit the whole plan to it. Do not reclassify the business yourself. If a different description of the stage matters to a recommendation, label it as IdeaToPlan analysis and say why the distinction matters. If another founder answer appears inconsistent with the chosen stage (for example the stage says there are no sales yet and another answer reports revenue or paying customers), do not silently override either answer: state both, and say what in the plan depends on which is right. If no stage was given, do not guess one from blank answers: say that the stage could not be determined from the intake, name the stage the plan is written for as a working assumption, and say what would change if the business is further along. Never give an operating business a startup checklist (register the business, buy a domain, open social accounts).`);

rules.push(`RULE 5. BUDGET IS A CEILING.
The budget is the most the founder can spend, not a target. The Budget table is computed for you: put the marker [[BUDGET_TABLE]] on its own line in the Budget section and never write that table yourself. The table sorts every cost by when to spend it: Before validation, After first sale, After traction, Optional. Around it, explain the timing: what little is needed to run the first validation test, free and existing resources first, and what each later item is waiting for. Every spending instruction anywhere in the plan (the 90-Day Action Plan, the Revenue & Financial Model, the Viability Assessment) must agree with the stage the table gives that item. Never tell the founder to buy something before its stage, and never say that nothing should be spent before validation while the table lists a cost before validation. Never recommend buying something the founder already has. A row marked "Before first paid delivery: verify whether required" is a legal or regulatory item (registration, licensing, tax registration, insurance) whose requirement was not established. Tell the founder to check it before the first paid delivery and to pay only if it turns out to be required. Demand may be validated before any of it is paid for, but never tell the founder to register, license, or insure only after delivering paid work, and never state that something is legally required unless a source says so. A cost is an assumption unless the table's Basis column says Founder${G ? ' or gives a source ID' : ''}; say that once, not on every line. If the plan has no Budget section, do not use the marker.`);

rules.push(`RULE 6. THE FINANCIAL MODEL IS COMPUTED. USE IT. DO NOT RECALCULATE IT.
The FINANCIAL MODEL gives you the assumptions with their reasons, the computed Base, Target, and Stretch table, the 12-month forecast, and a list of FINANCIAL FACTS. Code produced every figure. You do no arithmetic.
- In the Revenue & Financial Model section, put [[SCENARIO_TABLE]] on its own line where the scenario table belongs and [[FORECAST_TABLE]] on its own line where the 12-month forecast belongs. The finished tables, their arithmetic, their assumption notes, and the planning-estimate statement replace the markers. Never write these tables yourself and never repeat their rows in prose.
- Any dollar amount, customer count, lead count, percentage, or hours figure about this business's finances that you mention anywhere in the plan, including the Executive Summary, callouts, and Viability Assessment, must be copied exactly from FINANCIAL FACTS or the FOUNDER CONTEXT. Never add, multiply, total, annualize, average, or round figures yourself. If you need a figure that is not there, make the point in words without a number.
- Your job is to explain: why each assumption was chosen, what the scenarios mean for this founder, the capacity limit, what has to be true for Base to happen, and what would move the business toward Target.
- Keep the assumption framing when you explain a scenario. Write "The Base scenario assumes direct outreach alone can supply the leads", never "At Base, direct outreach alone can supply the leads". A scenario describes what the model assumes, not what will happen.
- Do not convert a figure to another period yourself. FINANCIAL FACTS gives the weekly rates for each scenario; use those. Never restate a monthly figure as a weekly, daily, or yearly one by your own arithmetic: 3 customers per month is about 0.7 per week, not one per week.
- Budget spending and forecast expenses are different figures. "Before validation" spending comes from the Budget table. The expenses in the 12-month forecast are the model's operating expenses for each three-month period. Never describe one as the other, and never say that a forecast period costs nothing unless FINANCIAL FACTS shows $0 expenses for that period.
- Every expense in the scenarios and the forecast is built by code from the Budget items, and the lines under the forecast show which items make up each figure. Use these terms exactly, and only with the figures FINANCIAL FACTS gives for them: operating expenses (monthly and per-sale costs), operating profit (revenue less operating expenses), one-time costs, and net cash after one-time costs. Conditional legal or insurance costs are in none of these figures; when you mention them, use the conditional-costs line in FINANCIAL FACTS.
- A Budget row that reads "Amount not yet established" is a cost that applies but has no figure yet. Where you discuss costs, profit, or viability, name it, say that the totals leave it out, and say that profit is overstated by it. Never give it a figure, never call it free, and never drop it.
- The Paid acquisition line in FINANCIAL FACTS says whether the model carries an advertising cost. If it does not, do not build the acquisition strategy, the 90-Day Action Plan, or any target on paid advertising; you may mention a paid test only as an option, and say that its cost is not in the forecast. A paid channel you recommend as part of the strategy must be a Budget item. The Budget, the forecast, and the acquisition recommendations must agree.
- The COST REVIEW in the FINANCIAL MODEL is an internal record. Use it to keep your recommendations consistent with what the model includes and leaves out. Do not print it as a list, and do not list costs that do not apply. The lines under the Budget table already state the exclusions and unknowns the reader needs.
- Adjacent pricing stays adjacent. A price charged for a different kind of service is a reference point, not evidence of what this offer should cost. When the price basis is an assumption informed by adjacent pricing, you may say that comparable personalized services give a useful reference point, and you must say that this offer's price and customers' willingness to pay it remain unvalidated.
- If the FINANCIAL MODEL lists missing inputs, say what is missing and how the founder can supply it. Do not fill it in.
- Never call the model conservative or realistic, and never present a scenario as expected or guaranteed.`);

rules.push(`RULE 7. VALIDATE EACH REVENUE STREAM.
For each main revenue stream answer: who pays; what exactly they buy; the tangible outcome or deliverable they receive (the result, not only the time, so "a prioritized 90-day relocation plan" rather than "a 60-minute call"); why they would pay instead of solving it themselves; what alternatives they have; what evidence exists that they will pay (${G ? 'founder facts or ledger claims' : 'founder facts only'}, or "None yet"); which assumption is unvalidated; a quick, low-cost test of willingness to pay.`);

rules.push(G
  ? `RULE 8. COMPETITIVE LANDSCAPE.
Use only competitors named in the ledger. Do not include a large company only because it is in the same broad industry. State how many competitors were reviewed.
- Direct competitors (same customer, similar solution): for each of the three to five most relevant, give a two-column table (Item | Detail) headed by the competitor's name, with the rows Customer, Offer, Price, Positioning, Strength, Why a customer might choose them, Why a customer might choose this founder instead, Source. Fill Customer, Offer, Price, Positioning, and Strength only from the ledger. The Source row gives the source IDs of the ledger entries used, copied exactly and written in square brackets, for example [S6]. Where the ledger does not establish something, write "Not established from the sources reviewed". Never invent a weakness. The two "why" rows are IdeaToPlan analysis: word them as such, and make each one specific to that competitor rather than repeating the same reasoning.
- Indirect competitors (same customer, different solution) and Substitutes (DIY, free communities, free content, existing advisors, doing nothing): one table with the columns Name | What they offer | Why it matters to this customer's buying decision | Source.
- Then four short labeled parts: Competitive Interpretation (the patterns across the competitors reviewed, worded as IdeaToPlan analysis), Positioning Hypothesis (what this founder could offer that the competitors reviewed do not explicitly offer, worded as a hypothesis to test, never as an underserved market or as a gap that exists), Confidence (how sure IdeaToPlan is that the gap is real, and why), How to Validate It (what the founder should test before building around the gap).
Never write that no competitor exists or that no one offers something; write "Among the competitors reviewed for this plan, none was identified that...". A difference from competitors is not by itself a gap, and competitors not positioning around something does not establish that customers want it.
This applies in every section where competitor evidence is interpreted, not only in Competitive Interpretation: the competitor tables and their "why a customer might choose" rows, the Executive Summary, Market Opportunity & Fit, SWOT, Critical Assumptions, the action plan, and the Viability Assessment. A possible positioning gap stays explicitly hypothetical at every occurrence. The absence of competitor positioning, offers, messaging, or features may support a hypothesis worth testing. It does not establish an underserved market, unmet customer demand, a market gap, a customer segment that competitors are failing to serve, willingness to pay, a proven differentiation, or that this business "serves" a customer competitors do not. Use constructions such as: "A hypothesis worth testing is..."; "The sources reviewed suggest a possible positioning distinction..."; "If customer interviews confirm X, this could become a meaningful differentiator..."; "This appears different from the competitors reviewed, but customer demand has not been established." Call a gap POTENTIAL unless the ledger shows demand evidence (complaints, search behavior, spending, surveys, unmet requests), and name that evidence. Do not give a saturation score or any other numeric rating.`
  : `RULE 8. COMPETITION WITHOUT RESEARCH.
Do not name competitors or describe their offers or prices. Describe the kinds of alternatives the customer has: direct alternatives (similar paid offers), indirect alternatives (different paid solutions to the same problem), and substitutes (DIY research, free communities, free video content, existing advisors, doing nothing). Say once that no competitor research was done for this plan. Never claim there is no competition or that a market gap exists. You may describe a POTENTIAL gap only as a hypothesis to test.`);

rules.push(`RULE 9. CHANNELS FROM EVIDENCE, IN THIS ORDER.
Do not recommend any channel by default. Weigh the evidence in this order: (1) channel results the founder already reports; (2) assets and audience the founder already has; (3) what is known about the target customer; (4) ${G ? 'research, meaning M4 ledger claims about where this customer looks for help' : 'research, which was not done for this plan'}; (5) how cheap and fast the channel is to test; (6) general demographic patterns, only when nothing better is available, and then stated as an assumption to test.
If the founder has traction on a channel, that must shape the recommendation. Never rule a channel in or out because of an age or demographic stereotype. When evidence is weak, recommend a test instead of a verdict, for example: "TikTok is not yet supported by the available evidence as a primary channel. If you already have traction there, test whether it converts before deprioritizing it." If existing audience information is unknown, say so once and make the recommendation conditional.
For each recommended channel give these labeled parts: Recommendation (for example "Test LinkedIn."), Reasoning (IdeaToPlan's strategic reasoning for this founder; no demographic or behavioral claim unless a source or the founder supports it), Evidence status (what evidence exists that this customer uses this channel to buy this kind of service; if none was found, say so plainly), Confidence (High, Medium, Low), 30-day test, Success metric, and Stop or change criterion. A channel may be recommended on reasoning alone. It may not be presented as validated.`);

rules.push(`RULE 10. VALIDATION BEFORE INFRASTRUCTURE, AND THE 90-DAY ROADMAP.
Order actions by: time to first revenue, cost to test, evidence generated, revenue potential, founder effort, dependence on audience growth. Schedule the smallest test for each key assumption before building infrastructure. Do not schedule work the founder has already done; start from the next unanswered question. If the founder's stated differentiator is general (for example "experience", "quality", or "better service") and the intake gives no specifics, do not build positioning on it as given: say that it is not yet specific enough to use, and include an early action for the founder to write down the specific experience, results, or capability behind it and to test in customer conversations whether buyers value it, with a Done when result.
The 90-Day Action Plan opens with a roadmap table with the columns Days | Phase | Goal | Target and four rows. For an early-stage business the phases are Days 1-14 VALIDATE, Days 15-30 REFINE, Days 31-60 ACQUIRE, Days 61-90 MEASURE AND EXPAND; adapt them to the stage. Targets are numbers, for example conversations held and paying customers won. After the table give the detailed actions. Every action has: Action, Why it matters, Done when, and Metric where one applies. The plan includes one action, placed before the first paid delivery, to check whether registration, licensing, tax registration, and insurance are required. The founder must finish this section knowing exactly what to do next.`);

rules.push(`RULE 11. CRITICAL ASSUMPTIONS.
The Critical Assumptions section lists the 3 to 5 assumptions most likely to make the business fail if wrong. Merge overlapping assumptions into one. For each: Assumption, Why it matters, Current evidence (${G ? 'founder facts or ledger claims with their source IDs' : 'founder facts'}, or "None yet"), Confidence (High, Moderate, Low), Validation test, Success metric, What to change if the test fails. One two-column table per assumption (Item | Detail).`);

rules.push(`RULE 12. VIABILITY ASSESSMENT, NOT A VERDICT.
In the Viability Assessment section, do not call the business viable, not viable, highly viable, or promising. Cover: evidence supporting the opportunity, evidence limiting it${G ? ' (each with its source ID where it comes from research)' : ''}, the most important unknowns, the critical assumptions (by reference, not repeated in full), customer validation still required, financial conditions needed for sustainability (using FINANCIAL FACTS only), operational constraints, what would materially increase confidence, what evidence would lead IdeaToPlan to recommend changing direction, and the single most important next test. The conclusion must be useful even when confidence is low.`);

rules.push(`RULE 13. CONFIDENCE.
Label major conclusions High (${G ? 'founder data or strong primary sources' : 'solid founder data'}), Moderate (some evidence, important unknowns), or Low (mostly assumptions${G ? ' or weak sources' : ''}).${G ? '' : ' In this plan, anything that depends on market conditions is Low confidence, because no research was done.'} Do not use confident language for a low-confidence conclusion.`);

rules.push(`RULE 14. EXECUTIVE SUMMARY.
The Executive Summary is one two-column table (Item | Summary) that a reader can absorb in 60 seconds. Rows, each cell 25 words or fewer: Business name, Business concept, Target customer, Core customer problem, Primary offer, Revenue model, Launch price (say whether it is the founder's price or an assumption), Startup budget, Primary differentiator, Strongest evidence for the opportunity${G ? ' (with its source ID if researched)' : ''}, Biggest unvalidated assumption, Biggest risk, First revenue milestone, 90-day objective, Most important next action. Figures come from FINANCIAL FACTS.
Business name: if the founder's answers state a name, use it. If they do not, create one working name that fits this business and write it as "Suggested working name: " followed by the name; say once, in the Business Overview, that the name is IdeaToPlan's suggestion, that trademark and domain availability were not checked, and that the founder is free to choose their own. Never present a suggested name as the founder's own.
Where the inputs do not support a row, write "Not yet known" and nothing else. No prose before or after the table.`);

rules.push(`RULE 15. EVIDENCE, THEN A RECOMMENDATION.
Do not stop at presenting evidence. For each major decision (price, primary offer, first customer channel, positioning), write a short block with these bold labels in this order: Evidence (what ${G ? 'the research and the founder context show, with source IDs' : 'the founder context shows'}), What it means (your interpretation for this business, which is IdeaToPlan analysis, not fact), then a RECOMMENDS callout line with the recommendation, then Confidence (High, Medium, or Low) and Test (how the founder will know whether the recommendation is right). ${G ? 'When the ledger has competitor prices, do not stop at listing them: recommend the starting price to test and the condition for raising it. ' : ''}Never word a recommendation as a known fact, and never base one on a guessed value for an unknown fact. Use at most five of these blocks.`);

rules.push(`RULE 16. TURN UNCERTAINTY INTO ACTION.
State each gap once. Do not repeat "no evidence was found" or "not researched" through the plan. For each important open question${G ? ', including each item in RESEARCH GAPS that matters to a decision' : ''}, write three short labeled lines: What we know (the evidence available${G ? ', with source IDs' : ''}), What we don't know yet (the specific unresolved question), How to find out (a practical test or check the founder can do).`);

rules.push(`RULE 17. CALLOUTS.
Highlight the most important conclusions with callout lines. A callout is a single line on its own that starts with two greater-than signs, a label, and a colon, for example: >> DO THIS FIRST: Hold ten conversations with people in your target group this week. Allowed labels: RECOMMENDS, DO THIS FIRST, BIGGEST RISK, VALIDATE THIS, FIRST REVENUE MILESTONE, WATCH THIS NUMBER. Use DO THIS FIRST, BIGGEST RISK, and FIRST REVENUE MILESTONE exactly once each. Use no more than eight callouts in the whole plan. Never put a callout inside a table.`);

rules.push(`RULE 18. SAY IT ONCE, IN PLAIN ENGLISH.
Explain each risk, assumption, and insight in full once, in the section where it matters most. Elsewhere refer to it in a single clause or by section name. Do not repeat disclaimers. A shorter, denser plan is better than a longer one; do not write to a length. Use plain words. No MBA jargon, no filler, no generic startup advice, no false precision, and no table that adds nothing. Every paragraph must be specific to this founder: if it could appear unchanged in another customer's plan, rewrite it or cut it.`);

rules.push(G
  ? `RULE 19. MARKET EVIDENCE.
The Market Opportunity & Fit section covers the customer, the problem, the Rule 7 questions, and the market evidence; competitors and substitutes go in Competitive Landscape. Present every relevant M1, M2, and M3 ledger claim: market size and growth, customer group trends, and evidence that customers pay. Keep each figure's scope exactly (for example "American workers", not "workers"). If the ledger has no figure for this exact niche but has adjacent claims, write: "Reliable market-size data for this exact niche was not found. However, these adjacent indicators help show whether the underlying customer behavior exists:" then list each adjacent claim with its source ID and one sentence on how it relates to this business. Never add, scale, or convert adjacent figures into a market size for this business, and never state a TAM that is not in the ledger. Close with "Our read:" and one or two sentences on what the evidence does and does not show.

SWOT / STRATEGIC POSITION
A markdown table with exactly two columns headed Category and Detail and exactly four rows: Strengths, Weaknesses, Opportunities, Threats. Keep each cell to its three most important points. Strengths and weaknesses come from the FOUNDER CONTEXT; an unknown is not a weakness. Items drawn from research carry their source ID. Word opportunities as possibilities, not findings. Do not re-explain points made elsewhere.`
  : `RULE 19. MARKET OPPORTUNITY WITHOUT RESEARCH.
The Market Opportunity & Fit section covers the customer, the problem, the Rule 7 questions, and the kinds of alternatives the customer has (Rule 8). State no market size. Say once that market research was not part of this plan, and name the two or three outside facts most worth checking and where to check them.`);

rules.push(`FORMAT
Write every section in SECTIONS, in order, with the exact numbered headers given, as ## headings. Follow the section guidance in the GOAL BRIEF.${G ? ' Do not write a Sources section; it is added automatically as the last numbered section.' : ''} Markdown tables have at most 4 columns, with each row on its own line. Never use em dashes; use commas, periods, or hyphens.`);

// PRICE. The form does not ask for a price today. When an intake answer carries one (founder_price), it is the price.
// Fixed financial inputs for a regression comparison exist in one place only: the node "Test Financial Baseline" of
// the v2 Test workflow, identified by its workflow ID. Nothing in a request can set them, and a workflow with any
// other ID ignores that node even if it has one.
const V2_TEST_WORKFLOW_ID = 'mLyKvFeYmJHuwXQ9';
const amountOf = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
let testInputs = {};
try { if ($workflow.id === V2_TEST_WORKFLOW_ID) { const b = $('Test Financial Baseline').first().json || {}; testInputs = { fixed_scenario_price: amountOf(b.fixedScenarioPrice), fixed_financial_assumptions: b.fixedFinancialAssumptions && typeof b.fixedFinancialAssumptions === 'object' ? b.fixedFinancialAssumptions : null }; } } catch (e) {}

return {
  ...d,
  founder_price: amountOf(d.founder_price),
  fixed_scenario_price: testInputs.fixed_scenario_price || null,
  fixed_financial_assumptions: testInputs.fixed_financial_assumptions || null,
  run_started_ms: Date.now(),
  tier: G ? 'Growth' : 'Starter',
  goal,
  founder_context,
  // Downstream checks treat a blank existing_assets as "asset information unknown". An answered checklist is not unknown.
  existing_assets: clean(d.existing_assets) || (answered ? 'Checklist answered.' : ''),
  business_stage_label: stage,
  assets_state: answered ? { present, absent } : 'unknown',
  section_names,
  section_list,
  writer_system: rules.join('\n\n'),
};
