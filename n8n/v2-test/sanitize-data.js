// Sanitize Data: builds the Brave query input and the two Perplexity research briefs from the founder's answers.
const d = $('Prepare Client Data').first().json;
const clean = (v) => (v === undefined || v === null) ? '' : String(v).replace(/\s+/g, ' ').trim();
const orNA = (v) => clean(v) || 'NOT PROVIDED';

const research_system = 'You are a research assistant collecting evidence for a business plan. Report only what your sources state. Do not give advice, opinions, estimates, or conclusions. Do not calculate averages or ranges yourself. Never invent a source, figure, name, or date.';

const business = [
  'BUSINESS BEING RESEARCHED (the founder\'s own description, not verified)',
  'Idea: ' + orNA(d.business_idea),
  'Problem it solves: ' + orNA(d.additional_notes),
  'Target customer: ' + orNA(d.target_customer),
  'Industry: ' + orNA(d.industry),
  'Location: ' + orNA(d.location),
  'Revenue model: ' + orNA(d.revenue_model),
  'Stated differentiator: ' + orNA(d.differentiator),
].join('\n');

// The URL field is what ties a claim to its source. Build Evidence matches it against the pages the search returned.
// The marker [n] is kept only as a fallback, because markers are not always numbered in the order of the returned pages.
const format = [
  'Answer the questions below. Under each question heading, write one claim per line in exactly this format:',
  'CLAIM: <one factual statement, including its scope, geography, currency, and year where relevant> | SOURCE TYPE: <government, regulator, statistics office, company own website, company filing, academic, research firm, industry organization, news publication, vendor blog, listicle or directory, community or forum> | PUBLISHED: <date shown on the source, or date not shown> | URL: <the full address of the one page that states this claim, copied exactly from your search results> [n]',
  'Every CLAIM line must carry the URL of the page that states it. A claim with no URL, or with a URL that is not one of your search results, is discarded.',
  'One claim, one page. If two pages state the same thing, write two CLAIM lines.',
  'A claim about a company must start with that company\'s name, and its URL must be a page on that company\'s own website unless the SOURCE TYPE says otherwise.',
  'Copy prices exactly as the page shows them, with the currency, and say what the price buys. Do not join two prices into a range unless the page states the range.',
  'End every CLAIM line with the citation marker of the same page.',
  'Try at least three different search angles for each question before giving up. Only then write one line: NOT FOUND: <what you looked for>.',
].join('\n');

const rules = [
  'RULES',
  '- Prefer sources from the last 24 months for prices, features, rules, and market figures. Always give the date shown on the source.',
  '- Prefer primary and authoritative sources: government data, statistics offices, regulators, company websites, industry organizations, established research firms. Use list articles and vendor blogs only when nothing better exists, and label them honestly.',
  '- Do not write typically, on average, industry standard, research shows, or similar unless a specific cited source states it.',
  '- Do not say that no competitors exist or that a market is underserved. Report only what you found.',
  '- A search result summary is not a source. Cite only pages whose content states the claim.',
].join('\n');

const research_prompt = [
  business, '', format, '',
  '## C1 Direct competitors',
  'Find 4 to 8 businesses selling a similar solution to the same target customer, in or serving the stated location. Prefer each company\'s own website over review sites, directories, and list articles. For each business write separate CLAIM lines, each starting with the business name, for: who its customer is; what it sells; its price, only if published on its own website; how it positions itself; and anything its own website says the offer does not include. Skip any of these you cannot find. Do not guess.',
  '',
  '## C2 Indirect competitors and substitutes',
  'Different paid solutions this customer uses for the same problem, and the free or do-it-yourself ways they solve it (communities, free content, existing advisors). Name specific examples and what each offers. Start each CLAIM line with the name of the business or site it is about.',
  '', rules,
].join('\n');

const market_prompt = [
  business, '', format, '',
  '## M1 Market size and growth',
  'Market size or growth figures for this exact niche, from government sources, statistics offices, company filings, academic work, industry organizations, or established research firms. State exactly what each figure measures, its geography, and its year. If no figure exists for the exact niche, report figures for the closest adjacent markets or customer groups instead, and begin each of those claims with the word ADJACENT followed by a colon and what the figure measures.',
  '',
  '## M2 Customer group and trends',
  'How many people are in the target customer group and how that is changing: demographic statistics, adoption trends, relevant surveys.',
  '',
  '## M3 Evidence that customers pay',
  'Evidence that this customer has this problem and pays to solve it: surveys, consumer spending data, published prices people pay for comparable solutions, search behavior, recurring complaints. Forums, Reddit, and social media are SOURCE TYPE community or forum; they show sentiment only.',
  '',
  '## M4 Where these customers look for help',
  'Evidence about which channels, platforms, or communities this customer group uses to find solutions like this one: platform usage surveys for this group, search behavior, community sizes. Report what sources state. Do not infer from age or demographic stereotypes.',
  '',
  '## M5 Rules and costs',
  'Licensing, registration, tax, or regulatory requirements, and platform or payment fees, that apply to this business in this location, from official or provider sources.',
  '', rules,
].join('\n');

return {
  query: [d.business_idea, d.target_customer, d.industry, d.location].map(clean).filter(Boolean).join(' | '),
  research_system,
  research_prompt,
  market_prompt,
};
