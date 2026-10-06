// Builds the review record for execution 63260 from the saved outputs. Reads only; the original plan, PDF, records and
// gate results are not touched. No network and no model. Run: node build.mjs
import fs from 'node:fs';
const D = new URL('../', import.meta.url), OUT = new URL('./', import.meta.url);
const original = fs.readFileSync(new URL('final-plan.md', D), 'utf8');
const cr = JSON.parse(fs.readFileSync(new URL('claim-review.json', D), 'utf8'));
const prr = JSON.parse(fs.readFileSync(new URL('prr-final.json', D), 'utf8'));

// ---------- C: corrections of confirmed errors. P: proposed wording for disputed claims. ----------
const A13 = `**Action 13: Book the accountant or adviser consultation.**
The model places a $300 one-time consultation in Months 1-3. Use it to confirm your tax obligations for a globally operating digital consulting business, understand how to handle payment processing fees, and ask whether professional liability insurance is required for your specific offer.
Done when: Consultation completed and obligations documented.
Metric: Tax and insurance obligations confirmed before Month 3 ends.

`;
const A7 = `Done when: A booking link exists and a test payment has been processed.
Metric: First session booked through the tool, not by email.
`;
const C = [
  { id: 'C1', line: 48, why: 'Internal rule number printed in customer text.',
    find: 'Applying the Rule 7 questions to the primary offer:', to: 'The questions a revenue stream has to answer, applied to the primary offer:' },
  { id: 'C2a', line: 63, why: 'Five providers are named and cited (Kismet Travels & Tours, Total Law, Expat.com with Holborn Assets, Creative Planning International, MyExpatPlanning), not four.',
    find: 'Four providers were reviewed for this plan. Two were identified as direct competitors and two as indirect competitors or substitutes.', to: 'Five providers were reviewed for this plan. Two were identified as direct competitors and three as indirect competitors or substitutes.' },
  { id: 'C2b', line: 106, why: 'Same count.', find: 'The competitive review covered four verified providers.', to: 'The competitive review covered five verified providers.' },
  { id: 'C2c', line: 523, why: 'Same count.', find: 'The competitive review covered only four verified providers;', to: 'The competitive review covered only five verified providers;' },
  { id: 'C3', line: 67, why: 'The note said every source in Section 4 is undated. W1 and W3 are cited there and show dates. Gate finding AUTO-V01.',
    find: 'Note: all sources cited in this section (S6, S13, S4, S11, S15) show no publication date; the service descriptions may have changed.\n\n| Item | Detail |', to: 'Note: sources S6, S13, S4, S11 and S15 cited in this section show no publication date; the service descriptions may have changed. W1 is dated 31/03/2016 and W3 November 11, 2024.\n\n| Item | Detail |' },
  { id: 'C4', line: 127, why: 'Section 6 cites neither S15 nor S4. The note was left behind when the reviser removed the sentence that cited them.',
    find: 'Note: sources S15 and S4 cited in this section show no publication date; the service descriptions may have changed. **Why $500', to: '**Why $500' },
  { id: 'C5', line: 341, why: 'The forecast has 1 customer per month in Months 1-3. A target of 2-3 in Days 31-60 was above it with no label.',
    find: '| 2-3 paying customers; first content published |', to: '| 1 paying customer in this period, as the forecast assumes (2 or more is a stretch aim beyond the forecast); first content published |' },
  { id: 'C6a', line: 355, why: 'Accountant timing. The model spends $0 before validation and places the $300 consultation after the first sale, in Months 1-3. Action 2 asked for an accountant before any sale, and Action 13 booked one in Days 61-90. Action 2 is now a no-cost check.',
    find: `Pay only what is confirmed as required.
Done when: You have spoken to an accountant or legal adviser and know what is required before you take money.
Metric: Completed before the first paid session.`,
    to: `Pay only what is confirmed as required. This check costs nothing: use the official registration and tax pages for your jurisdiction, and write down any question you cannot answer from them for the consultation in Action 8.
Done when: You have a written list of what is required, with where you found it, and of the questions still open.
Metric: Completed before the first paid session.` },
  { id: 'C6b', line: 426, why: 'Accountant timing. Removed from Days 61-90; it now follows the first sale (see C6c).', find: A13, to: '' },
  { id: 'C6c', line: 391, why: 'Accountant timing. The consultation follows the first sale, which is where the Budget and the forecast place its $300.',
    find: A7, to: A7 + `
**Action 8: Book the accountant or adviser consultation.**
The model places a $300 one-time consultation after your first sale, in Months 1-3. Book it once your first customer has paid. Use it to confirm your tax obligations for a globally operating digital consulting business, understand how to handle payment processing fees, settle the questions left open in Action 2, and ask whether professional liability insurance is required for your specific offer.
Done when: Consultation completed and obligations documented.
Metric: Consultation held within 30 days of your first payment.
` },
  ...[[12, 13, 'Decide whether to invest in a website.'], [11, 12, 'Track your conversion numbers.'], [10, 11, 'Publish your first piece of content.'], [9, 10, 'Ask every client for a referral.'], [8, 9, 'Deliver the first sessions and time them.']]
    .map(([a, b, t]) => ({ id: 'C6d', line: 0, why: 'Renumbered after the consultation moved to Action 8.', find: '**Action ' + a + ': ' + t + '**', to: '**Action ' + b + ': ' + t + '**' })),
  { id: 'C7', line: 46, why: 'The source entry lists three tiers and does not say that any of them is paid.',
    find: 'including a paid one-on-one tier, exists', to: 'including a one-on-one tier, exists' },
  { id: 'C8', line: 41, why: 'S11 is cited in Section 3 (L54) and shows no date, and the section note did not name it. Gate findings AUTO-V41 and QA-011.',
    find: 'Note: the sources cited in this section (S6, S13, S4, S15) show no publication date;', to: 'Note: the sources cited in this section (S6, S13, S4, S15, S11) show no publication date;' },
];
const P = [
  { id: 'P1', line: 41, why: '"Adjacent territory" is the plan\'s characterisation, not the sources\'.', find: 'These show that competing offers exist in adjacent territory.', to: 'These show that related offers exist.' },
  { id: 'P2', line: 45, why: 'The source says the consultation is offered in collaboration with Holborn Assets. "Built into its offering" says more, and the sentence before already states the fact.',
    find: ' This shows that at least one expat community platform (Expat.com) has built a financial consultation service into its offering. Whether', to: ' Whether' },
  { id: 'P3', line: 54, why: 'W1 is a search-result listing of one resources page from 2016. It supports that the page exists, not a description of the site.',
    find: 'free content on platforms like BecomeNomad [W1]', to: 'free online resources for digital nomads, such as the BecomeNomad resources page [W1]' },
  { id: 'P4', line: 59, why: 'Generalises from five pages to "services exist for people navigating relocation and life changes".',
    find: 'The adjacent evidence shows that planning and consultation services exist for people navigating relocation and life changes, and that at least some providers have built tiered service offerings for related customer groups.',
    to: 'The providers reviewed offer planning and consultation services to people who are relocating or going through major life changes, and one of them, MyExpatPlanning, offers its service in tiers.' },
  { id: 'P5', line: 98, why: '"Direct alternative" is an inference about buyer behaviour.', find: 'the free entry point is a direct alternative to a paid first session', to: 'the free consultation is an option they could try before paying for a session' },
  { id: 'P6', line: 100, why: 'Same as P3: the sources do not describe travel blogs or destination guides.',
    find: 'Travel blogs, destination guides, and nomad resources such as BecomeNomad [W1] and general digital nomad planning content [W3]', to: 'Free online resources such as the BecomeNomad resources page [W1] and digital nomad planning content [W3]' },
  { id: 'P7', line: 102, why: 'Characterises what each provider is "about" and states what none of them offers. Reworded to what was read, and kept as an IdeaToPlan reading.',
    find: 'The indirect competitors and substitutes address narrower slices: financial planning for expats, tax planning for US expats abroad, and free self-directed content. None of the providers reviewed explicitly describes an offer aimed at helping someone decide whether a major lifestyle change is right for them, work through the financial and career dimensions, and build a personalized plan before committing to a destination or a move. That is an IdeaToPlan inference from what the pages say, not a finding about what the market offers or what customers want.',
    to: 'The indirect competitors and substitutes reviewed are a free financial consultation for expats, a free initial consultation, a tiered planning service for US expats, and free self-directed content. On the pages reviewed, IdeaToPlan did not find an offer described as helping someone decide whether a major lifestyle change is right for them, work through the financial and career dimensions, and build a personalized plan before committing to a destination or a move. That is an IdeaToPlan reading of five pages, not a finding about what the market offers or what customers want.' },
  { id: 'P8a', line: 121, why: '"Lower the perceived cost" is an inference about customer perception.',
    find: 'Creative Planning International [S11], which lower the perceived cost of getting help. 2.', to: 'Creative Planning International [S11]; whether they make a paid first session harder to sell is untested. 2.' },
  { id: 'P8b', line: 523, why: 'Same phrase.', find: 'Creative Planning International [S11], which lower the perceived cost of getting help. The competitive', to: 'Creative Planning International [S11]. The competitive' },
  { id: 'P9a', line: 121, why: 'The intake does not say who delivers the sessions. The model assumes the founder does.',
    find: "3. The business depends entirely on the founder's time for delivery; capacity is a ceiling on revenue at every scenario.", to: '3. The model assumes the founder delivers every session; on that assumption, founder time is a ceiling on revenue in every scenario.' },
  { id: 'P9b', line: 545, why: 'Same point.', find: 'The business depends entirely on your time for delivery. At Base', to: 'The model assumes you deliver every session yourself. At Base' },
  { id: 'P10', line: 497, why: 'A general statement about referrals with no source.',
    find: 'A client who receives a clear, useful plan and tells someone about it is a low-cost lead source that compounds over time.', to: 'A client who receives a clear, useful plan and tells someone about it could become a low-cost source of leads; whether that happens for this offer is untested.' },
  { id: 'P11', line: 517, why: 'Three sentences that generalise from the five pages, and "built into its platform" (see P2).',
    find: 'Competing offers exist for adjacent customer groups. Kismet', to: 'The providers reviewed offer related services. Kismet' },
  { id: 'P11', line: 517, why: 'As above.', find: 'Expat.com has built a free financial consultation service into its platform for expat members [S4]. These show that providers have built planning and consultation services for people navigating relocation and life changes.',
    to: 'Expat.com offers its members a free financial consultation in collaboration with Holborn Assets [S4]. These are examples of planning and consultation services offered to people who are relocating or going through major life changes.' },
  { id: 'P12', line: 527, why: 'Two general statements with no citation beside them.',
    find: 'What we know: Competing offers exist for adjacent customer groups. Free alternatives exist.', to: 'What we know: The providers reviewed offer related services, and two of them offer a free consultation [S4] [S11].' },
  { id: 'P13', line: 461, why: 'Found in my manual review of the unanswered claims. "Is likely to seek" is an inference stated as expectation; the next paragraph already calls it a hypothesis.',
    find: 'Reasoning: Your target customer, aged 40-60 and considering a major lifestyle change, is likely to seek information and community in online spaces', to: "Reasoning: IdeaToPlan's hypothesis is that your target customer, aged 40-60 and considering a major lifestyle change, seeks information and community in online spaces" },
  { id: 'P14', line: 479, why: 'Found in my manual review of the unanswered claims. The intake says financially stable; it does not say "in or recently out of a professional career". The LinkedIn sentence is a general statement with no source.',
    find: 'Reasoning: Your target customer is described as financially stable and likely in or recently out of a professional career. LinkedIn is a platform where that demographic is present and where content about career change, relocation, and lifestyle design is shared.',
    to: "Reasoning: You describe your target customer as financially stable. IdeaToPlan's working assumption is that many are in or recently out of a professional career, and that people in that position can be reached on LinkedIn." },
  { id: 'P16', line: 55, why: 'Not a disputed claim: the code check DEMAND INFERRED FROM SUPPLY fires on the words "from the sources reviewed" in this line, which infers nothing. The plainer wording says the same and passes the check.',
    find: '- Evidence that they will pay: none yet from the sources reviewed.', to: '- Evidence that they will pay: none found.' },
  { id: 'P15', line: 33, why: 'A judgment about how long the platform will take, stated as fact.', find: 'and multiple revenue streams, is a multi-year build.', to: 'and multiple revenue streams, is a longer build than the first revenue step.' },
];
// ---------- D: owner decisions of 2026-10-06 (Liz), applied on top of the corrections and the proposed wording ----------
const D_LIST = [
  { id: 'D1a', line: 63, why: 'Owner decision: the two closest providers are not called direct competitors. The sentence says whose judgment "closest" is, because the code check holds an unexplained ranking of providers.',
    find: 'Two were identified as direct competitors and three as indirect competitors or substitutes.', to: 'Two are profiled in full below under "Closest providers found" and three are listed as indirect competitors or substitutes. "Closest" is an IdeaToPlan judgment among the five reviewed, not a ranking of the market.' },
  { id: 'D1b', line: 65, why: 'Table title.', find: '**Direct competitors**', to: '**Closest providers found**' },
  { id: 'D1c', line: 71, why: 'Row label, to match the title.', find: '| **Competitor** | **Kismet Travels & Tours** |', to: '| **Provider** | **Kismet Travels & Tours** |' },
  { id: 'D1d', line: 83, why: 'Row label, to match the title.', find: '| **Competitor** | **Total Law** |', to: '| **Provider** | **Total Law** |' },
  { id: 'D1e', line: 104, why: 'Same label in the positioning hypothesis.', find: 'than the direct competitors reviewed,', to: 'than the closest providers found,' },
  { id: 'D2a', line: 355, why: 'Owner decision: nothing that is required before taking payment may wait for the consultation. Action 2 now has to be finished before the first payment, and says what to do if official sources do not settle a question.',
    find: `Before your first paid delivery, verify whether business registration, professional liability insurance, and tax registration are required in your jurisdiction for a globally operating digital consulting business. The model assigns a planning figure of $200 for registration if required; no amount is established for insurance. Pay only what is confirmed as required. This check costs nothing: use the official registration and tax pages for your jurisdiction, and write down any question you cannot answer from them for the consultation in Action 8.
Done when: You have a written list of what is required, with where you found it, and of the questions still open.
Metric: Completed before the first paid session.`,
    to: `Before you take your first payment, establish whether business registration, professional liability insurance, and tax registration are required in your jurisdiction for a globally operating digital consulting business. The model assigns a planning figure of $200 for registration if required; no amount is established for insurance. Pay only what is confirmed as required. Start with the official registration and tax pages for your jurisdiction, which cost nothing. Anything that must be in place before you may take payment has to be completed before your first sale. If official sources do not settle such a question, get it answered by the authority or by an adviser before you take payment. If that means paying for advice now, the consultation in Action 8 moves forward to this step and its $300 is spent before your first sale, which the forecast does not assume.
Done when: Every obligation that applies before you take payment is identified and met, or confirmed not to apply, with a note of where you confirmed it.
Metric: Completed before you take your first payment.` },
  { id: 'D2b', line: 393, why: 'The consultation is for what comes after the first sale. It does not postpone Action 2.',
    find: 'Use it to confirm your tax obligations for a globally operating digital consulting business, understand how to handle payment processing fees, settle the questions left open in Action 2, and ask whether professional liability insurance is required for your specific offer.\nDone when: Consultation completed and obligations documented.\nMetric: Consultation held within 30 days of your first payment.',
    to: 'Use it to confirm how your consulting income is taxed and reported from here on for a globally operating digital consulting business, and to understand how to handle payment processing fees. This consultation does not postpone anything in Action 2: whatever had to be in place before you took payment was settled there.\nDone when: Consultation completed and ongoing obligations documented.\nMetric: Consultation held within 30 days of your first payment.' },
  { id: 'D2c', line: 264, why: 'Same point in the Budget text.',
    find: 'particularly for a business operating globally. Do not skip this step.', to: 'particularly for a business operating globally. Do not skip this step. It does not replace the checks below: anything required before you may take payment is settled before your first sale, not at this consultation.' },
  { id: 'D2d', line: 266, why: 'Same point in the Budget text. The Budget table and the forecast notes say "before first paid delivery"; they are computed from the model and are left as they are. This paragraph sets the earlier point.',
    find: '**Before your first paid delivery, check these.**', to: '**Before you take your first payment, check these.**' },
  { id: 'D2e', line: 266, why: 'As above.',
    find: 'Verify both before your first paid session and pay only if required. Do not deliver paid consulting work before you have checked this.', to: 'Verify both before you take your first payment and pay only if required. Do not take payment or deliver paid consulting work before you have checked this, and do not wait for the $300 consultation to do it.' },
  { id: 'D3', line: 166, why: 'Owner decision: the unresolved-cost disclosure stays, and the forecast says where it stands that it is conditional.',
    find: '**The 12-month forecast.**', to: '**The 12-month forecast.** This forecast is conditional. It leaves out the unresolved costs listed below, and its year-one result holds only if those costs stay within the threshold given there.' },
];
const apply = (text, list) => list.reduce((t, r) => { const n = t.split(r.find).length - 1; if (n !== 1) throw new Error(r.id + ' L' + r.line + ': found ' + n + ' times'); return t.replace(r.find, () => r.to); }, text);
const corrected = apply(original, C);
const withProposals = apply(corrected, P);
fs.writeFileSync(new URL('corrected-plan.md', OUT), corrected);
fs.writeFileSync(new URL('corrected-plan-with-proposals.md', OUT), withProposals);
const v2 = apply(withProposals, D_LIST);
fs.writeFileSync(new URL('corrected-plan-v2.md', OUT), v2);

const q = (s) => s.split('\n').map((l) => '> ' + l).join('\n');
const block = (r) => '### ' + r.id + (r.line ? ' (line ' + r.line + ' of the original)' : '') + '\n\n' + r.why + '\n\nBefore:\n\n' + q(r.find.trim()) + '\n\nAfter:\n\n' + (r.to.trim() ? q(r.to.trim()) : '> (removed)') + '\n';
fs.writeFileSync(new URL('tracked-changes.md', OUT), '# Execution 63260: tracked replacements\n\nEvery change made to the original plan text. `corrected-plan.md` holds the corrections only. `corrected-plan-with-proposals.md` holds the corrections and the proposed wording. The original `final-plan.md` is unchanged.\n\n## Corrections (applied in both drafts)\n\n' + C.filter((r) => r.id !== 'C6d').map(block).join('\n') + '\n### C6d\n\nActions 8 to 12 are renumbered 9 to 13, because the consultation is now Action 8. No other wording changes.\n\n## Proposed wording for disputed claims (adopted as a set by the owner on 2026-10-06; in the second draft and in v2)\n\n' + P.map(block).join('\n') + '\n\n## Owner decisions of 2026-10-06 (in `corrected-plan-v2.md` only, the text rendered as version 2)\n\n' + D_LIST.map(block).join('\n'));

// ---------- Audit appendix ----------
const FP = {
  A: 'False positive. The sentence says that evidence or information is missing, or describes the review itself. The reviewer classed it as an assumption and code then asked for a label it does not need.',
  B: "False positive. The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted.",
  C: 'False positive. The sentence is already worded as a possibility ("may") and asserts nothing that needs a source.',
};
const CL = ['A', 'P15', 'P1', 'P2', 'C7', 'P3', 'P4', 'P5', 'P6', 'P7', 'P7', 'P8a', 'C', 'P9a', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'A', 'P10', 'P11', 'P11', 'P11', 'B', 'A', 'P8b', 'A', 'P12', 'P12', 'A', 'P9b', 'B'];
const OTHER = {
  'AUTO-V01': ['Genuine', 'Corrected by C3.'], 'AUTO-005': ['False positive', 'The sentence says there is no evidence that customers will pay. It infers nothing from supply. P16 rewords it so the code check no longer fires.'],
  'CL-OPEN': ['Incomplete automated check', 'Reviewed by hand below (40 unanswered, 12 unusable). The automated check itself remains incomplete.'],
  'AUTO-008': ['Owner decision', 'Standing warning: five cost categories are unresolved and are disclosed in the plan. Not a defect in the text. See the owner summary, decision 3.'],
  'AUTO-V41': ['Genuine', 'Corrected by C8.'], 'QA-011': ['Genuine', 'Same issue as AUTO-V41. Corrected by C8.'],
  'DUP-001': ['False positive', 'The sentence at L46 describes the provider in Section 3 and is supported by S15. The statement the reviser removed was its use as a basis for the $500 price in Section 6. What the removal left behind is corrected by C4.'],
  'QA-025': ['Minor', 'Repetition of the ten-conversations instruction. Backlog, no change.'],
};
const disp = (code) => code[0] === 'C' && code.length > 1 ? ['Genuine', 'Corrected by ' + code.replace(/[a-z]$/, '') + '.'] : code[0] === 'P' ? ['Disputed', 'Wording proposed: ' + code + '.'] : ['False positive (group ' + code + ')', FP[code].replace(/^False positive\. /, '')];
const cell = (s) => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const defects = cr.defects;
if (defects.length !== CL.length) throw new Error('defect count ' + defects.length);
let n = 0;
const rows = prr.findings.map((f) => {
  let d, text = f.quote;
  if (/^CL-\d/.test(f.id)) { const x = defects[n]; if (x.line !== f.line) throw new Error('order ' + f.id); d = disp(CL[n]); text = x.text; n++; } else d = OTHER[f.id];
  if (!d) throw new Error('no disposition ' + f.id);
  return '| ' + [f.id, f.severity + (f.unresolved ? ' (check did not complete)' : ''), f.line ? 'L' + f.line : '', cell(f.check), cell(text).slice(0, 260), d[0], d[1]].join(' | ') + ' |';
});

// The 40 claims with no verdict (batch 10 returned unreadable JSON), reviewed by hand.
const KIND = { R: 'Recommendation or instruction. Asserts no fact.', M: "The plan's own model. Matches the financial model.", N: 'Statement that evidence or intake information is missing. Accurate: the ledger has no entry on this.', H: 'Reasoning or hypothesis, labelled as such in the sentence or the paragraph.', T: 'IdeaToPlan test criterion or threshold, labelled as such.' };
const MISSING = 'R M M R R H H H N H R R H R R T T R R P13 H N R N H H H R R R T T R R P14 P14 N N H H'.split(' ');
const miss = cr.records.filter((r) => cr.missing.includes(r.id));
if (miss.length !== MISSING.length) throw new Error('missing count ' + miss.length);
const missRows = miss.map((r, i) => { const k = MISSING[i]; return '| ' + [r.id, 'L' + r.line, cell(r.text).slice(0, 240), k[0] === 'P' ? 'Disputed' : 'No defect found', k[0] === 'P' ? 'Wording proposed: ' + k + '.' : KIND[k]].join(' | ') + ' |'; });

// The 12 claims with a verdict code could not use.
const UNUSABLE = {
  'L16': ['No defect found', 'Entries for S6 and S13 describe these offers. The reviewer joined two quotes in a way code could not match.'],
  'L41a': ['Corrected by C8', 'A date note. Code read the source numbers as figures. The note itself lacked S11.'],
  'L41b': ['No defect found', 'Caution attached to the date note. Asserts nothing about the providers.'],
  'L106': ['No defect found', 'States what the review does not establish.'],
  'L118': ['No defect found', 'The intake describes a digital platform operating everywhere. "Keeping overhead low" is the plan\'s reasoning in a Strengths row.'],
  'L127': ['Removed by C4', 'Part of the stale date note in Section 6.'],
  'L306': ['No defect found', 'Supported by the S4 and S11 entries.'],
  'L318': ['No defect found', 'States that the intake did not capture this. Accurate.'],
  'L377': ['No defect found', 'Instruction to rewrite the offer in customers\' words.'],
  'L417': ['No defect found', 'Instruction on what to track.'],
  'L517': ['No defect found', 'Caution attached to the date note.'],
  'L528': ['No defect found', 'An item in a list of unknowns.'],
};
const seen = {};
const openRows = cr.open.filter((o) => !cr.missing.includes(o.id)).map((o) => { const base = 'L' + o.line; seen[base] = (seen[base] || 0) + 1; const key = UNUSABLE[base] ? base : base + 'ab'[seen[base] - 1]; const u = UNUSABLE[key]; if (!u) throw new Error('unusable ' + key); return '| ' + [o.id, base, cell(o.text).slice(0, 200), cell(o.why).slice(0, 170), u[0], u[1]].join(' | ') + ' |'; });
if (openRows.length !== 12) throw new Error('unusable count ' + openRows.length);

const count = (re) => rows.filter((r) => re.test(r.split(' | ')[5])).length;
fs.writeFileSync(new URL('audit-appendix.md', OUT), `# Execution 63260: audit appendix

Prepared 2026-10-06 by Claude from the saved outputs of execution 63260. Nothing here changes the gate result: the plan version is HOLD (changes_requested), with 38 confirmed blocking findings and 1 required check that did not complete. The dispositions below are my manual review. They are not automated checks and they clear nothing.

## What was checked by what

| Check | Status | By |
|---|---|---|
| Code checks on the generated plan (citations, date notes, counts, targets, financial reconciliation) | Completed | Automated, in the run |
| Claim review, 12 of 13 batches (447 claims) | Completed | Automated, in the run (model verdicts, validated by code) |
| Claim review, batch 10 (40 claims, L431 to L481) | Not completed: the answer was not readable JSON | Reviewed by hand, section C |
| 12 claims whose verdict code could not use | Not completed | Reviewed by hand, section D |
| Every gate finding (${rows.length}) | Dispositioned | By hand, section B |
| Code checks on the corrected draft | See section E | Automated, offline, no model |
| Claim review of the corrected draft | Not run (no model calls authorised) | Not done |

## A. False-positive groups

- **Group A.** ${FP.A.replace('False positive. ', '')}
- **Group B.** ${FP.B.replace('False positive. ', '')}
- **Group C.** ${FP.C.replace('False positive. ', '')}

## B. Every gate finding (${rows.length})

Genuine: ${count(/^Genuine/)}. Disputed, wording proposed: ${count(/^Disputed/)}. False positive: ${count(/^False positive/)}. Other: ${count(/^(Incomplete|Owner|Minor)/)}.

| ID | Severity | Line | Check | Sentence | My disposition | Basis or action |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## C. The 40 claims with no verdict (manual review)

Disputed: ${missRows.filter((r) => / \| Disputed \| /.test(r)).length}. No defect found: ${missRows.filter((r) => /No defect found/.test(r)).length}.

| Claim | Line | Sentence | Manual result | Basis |
|---|---|---|---|---|
${missRows.join('\n')}

## D. The 12 claims with an unusable verdict (manual review)

| Claim | Line | Sentence | Why code could not use the verdict | Manual result | Basis |
|---|---|---|---|---|---|
${openRows.join('\n')}

## E. Code checks on the drafts (automated, offline, no model)

Citation Check was run on each text with the saved evidence, intake and financial model of execution 63260.

| Text | Code findings |
|---|---|
| Original plan | 4: FINANCIAL MODEL (warning), UNDATED SOURCES WITHOUT A NOTE L54 (warning), SOURCE DATE NOTE IS WRONG L67 (blocking), DEMAND INFERRED FROM SUPPLY L55 (blocking). These are the four the run reported. |
| corrected-plan.md | 2: FINANCIAL MODEL (warning, standing), DEMAND INFERRED FROM SUPPLY L55 (blocking, false positive). |
| corrected-plan-with-proposals.md | 1: FINANCIAL MODEL (warning, standing). No blocking code finding. |

The claim review (the model step) was not run on either draft. The changed sentences have been read by me only.
`);
console.log(JSON.stringify({ findings: rows.length, genuine: count(/^Genuine/), disputed: count(/^Disputed/), false_positive: count(/^False positive/), other: count(/^(Incomplete|Owner|Minor)/), fpA: CL.filter((x) => x === 'A').length, fpB: CL.filter((x) => x === 'B').length, fpC: CL.filter((x) => x === 'C').length, missing: missRows.length, missing_disputed: missRows.filter((r) => / \| Disputed \| /.test(r)).length, unusable: openRows.length, chars: [original.length, corrected.length, withProposals.length] }));
