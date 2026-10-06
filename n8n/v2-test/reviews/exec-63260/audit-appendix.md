# Execution 63260: audit appendix

Prepared 2026-10-06 by Claude from the saved outputs of execution 63260. Nothing here changes the gate result: the plan version is HOLD (changes_requested), with 38 confirmed blocking findings and 1 required check that did not complete. The dispositions below are my manual review. They are not automated checks and they clear nothing.

## What was checked by what

| Check | Status | By |
|---|---|---|
| Code checks on the generated plan (citations, date notes, counts, targets, financial reconciliation) | Completed | Automated, in the run |
| Claim review, 12 of 13 batches (447 claims) | Completed | Automated, in the run (model verdicts, validated by code) |
| Claim review, batch 10 (40 claims, L431 to L481) | Not completed: the answer was not readable JSON | Reviewed by hand, section C |
| 12 claims whose verdict code could not use | Not completed | Reviewed by hand, section D |
| Every gate finding (44) | Dispositioned | By hand, section B |
| Code checks on the corrected draft | See section E | Automated, offline, no model |
| Claim review of the corrected draft | Not run (no model calls authorised) | Not done |

## A. False-positive groups

- **Group A.** The sentence says that evidence or information is missing, or describes the review itself. The reviewer classed it as an assumption and code then asked for a label it does not need.
- **Group B.** The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted.
- **Group C.** The sentence is already worded as a possibility ("may") and asserts nothing that needs a source.

## B. Every gate finding (44)

Genuine: 4. Disputed, wording proposed: 19. False positive: 18. Other: 3.

| ID | Severity | Line | Check | Sentence | My disposition | Basis or action |
|---|---|---|---|---|---|---|
| AUTO-V01 | BLOCKING | L67 | SOURCE DATE NOTE IS WRONG | Note: all sources cited in this section (S6, S13, S4, S11, S15) show no publication date; the service descriptions may have changed. | Genuine | Corrected by C3. |
| AUTO-005 | BLOCKING | L55 | DEMAND INFERRED FROM SUPPLY | - Evidence that they will pay: none yet from the sources reviewed. | False positive | The sentence says there is no evidence that customers will pay. It infers nothing from supply. P16 rewords it so the code check no longer fires. |
| CL-001 | BLOCKING | L18 | ASSUMPTION NOT LABELLED IN THE TEXT | No validated demand evidence; | False positive (group A) | The sentence says that evidence or information is missing, or describes the review itself. The reviewer classed it as an assumption and code then asked for a label it does not need. |
| CL-002 | BLOCKING | L33 | ASSUMPTION NOT LABELLED IN THE TEXT | The full QYLAT vision, a content platform with interactive tools, affiliate partnerships, and multiple revenue streams, is a multi-year build. | Disputed | Wording proposed: P15. |
| CL-003 | BLOCKING | L41 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | These show that competing offers exist in adjacent territory. | Disputed | Wording proposed: P1. |
| CL-004 | BLOCKING | L45 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | This shows that at least one expat community platform (Expat.com) has built a financial consultation service into its offering. | Disputed | Wording proposed: P2. |
| CL-005 | BLOCKING | L46 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | This shows that a tiered planning service, including a paid one-on-one tier, exists for a related customer group. | Genuine | Corrected by C7. |
| CL-006 | BLOCKING | L54 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | Alternatives: free content on platforms like BecomeNomad [W1]; free expat financial consultation through Expat.com [S4]; free initial consultation from Creative Planning International [S11]; self-directed research. | Disputed | Wording proposed: P3. |
| CL-007 | BLOCKING | L59 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | **Our read:** The adjacent evidence shows that planning and consultation services exist for people navigating relocation and life changes, and that at least some providers have built tiered service offerings for related customer groups. | Disputed | Wording proposed: P4. |
| CL-008 | BLOCKING | L98 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | the free entry point is a direct alternative to a paid first session | Disputed | Wording proposed: P5. |
| CL-009 | BLOCKING | L100 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | Travel blogs, destination guides, and nomad resources such as BecomeNomad [W1] and general digital nomad planning content [W3] | Disputed | Wording proposed: P6. |
| CL-010 | BLOCKING | L102 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | The indirect competitors and substitutes address narrower slices: financial planning for expats, tax planning for US expats abroad, and free self-directed content. | Disputed | Wording proposed: P7. |
| CL-011 | BLOCKING | L102 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | None of the providers reviewed explicitly describes an offer aimed at helping someone decide whether a major lifestyle change is right for them, work through the financial and career dimensions, and build a personalized plan before committing to a destination  | Disputed | Wording proposed: P7. |
| CL-012 | BLOCKING | L121 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | 1. Free alternatives exist, including free consultations from Expat.com [S4] and Creative Planning International [S11], which lower the perceived cost of getting help. | Disputed | Wording proposed: P8a. |
| CL-013 | BLOCKING | L121 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | 2. The target customer (40-60, financially stable) may have access to existing advisers, such as financial planners or career coaches, who partially address the problem. | False positive (group C) | The sentence is already worded as a possibility ("may") and asserts nothing that needs a source. |
| CL-014 | BLOCKING | L121 | FOUNDER DETAIL NOT IN THE INTAKE | 3. The business depends entirely on the founder's time for delivery; | Disputed | Wording proposed: P9a. |
| CL-015 | BLOCKING | L162 | ASSUMPTION NOT LABELLED IN THE TEXT | That is about 7 conversations a week and about 0.7 paying customers a week. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-016 | BLOCKING | L162 | ASSUMPTION NOT LABELLED IN THE TEXT | every lead comes from direct outreach and organic content. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-017 | BLOCKING | L164 | ASSUMPTION NOT LABELLED IN THE TEXT | The capacity limit is real. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-018 | BLOCKING | L222 | ASSUMPTION NOT LABELLED IN THE TEXT | None of these steps is guaranteed; | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-019 | BLOCKING | L222 | ASSUMPTION NOT LABELLED IN THE TEXT | each depends on the price being acceptable to buyers, the outreach reaching the right people, and referrals materializing. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-020 | BLOCKING | L232 | ASSUMPTION NOT LABELLED IN THE TEXT | Costs come in only after your first sale, and the larger infrastructure items wait until you have confirmed traction. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-021 | BLOCKING | L270 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | Payment processing fees apply on every sale but the amount depends on the processor you choose; | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-022 | BLOCKING | L272 | ASSUMPTION NOT LABELLED IN THE TEXT | None of them is a quoted price. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-023 | BLOCKING | L283 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | No source reviewed states a price for a comparable session | False positive (group A) | The sentence says that evidence or information is missing, or describes the review itself. The reviewer classed it as an assumption and code then asked for a label it does not need. |
| CL-024 | BLOCKING | L497 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | A client who receives a clear, useful plan and tells someone about it is a low-cost lead source that compounds over time. | Disputed | Wording proposed: P10. |
| CL-025 | BLOCKING | L517 | ENTRY DOES NOT SUPPORT THE CLAIM | Competing offers exist for adjacent customer groups. | Disputed | Wording proposed: P11. |
| CL-026 | BLOCKING | L517 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | Expat.com has built a free financial consultation service into its platform for expat members [S4]. | Disputed | Wording proposed: P11. |
| CL-027 | BLOCKING | L517 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | These show that providers have built planning and consultation services for people navigating relocation and life changes. | Disputed | Wording proposed: P11. |
| CL-028 | BLOCKING | L519 | FOUNDER DETAIL NOT IN THE INTAKE | The model requires no paid advertising. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-029 | BLOCKING | L523 | ASSUMPTION NOT LABELLED IN THE TEXT | No market size or growth data was found for this specific niche. | False positive (group A) | The sentence says that evidence or information is missing, or describes the review itself. The reviewer classed it as an assumption and code then asked for a label it does not need. |
| CL-030 | BLOCKING | L523 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | Free alternatives exist, including free consultations from Expat.com [S4] and Creative Planning International [S11], which lower the perceived cost of getting help. | Disputed | Wording proposed: P8b. |
| CL-031 | BLOCKING | L523 | ASSUMPTION NOT LABELLED IN THE TEXT | The competitive review covered only four verified providers; | False positive (group A) | The sentence says that evidence or information is missing, or describes the review itself. The reviewer classed it as an assumption and code then asked for a label it does not need. |
| CL-032 | BLOCKING | L527 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | What we know: Competing offers exist for adjacent customer groups. | Disputed | Wording proposed: P12. |
| CL-033 | BLOCKING | L527 | EXTERNAL CLAIM WITHOUT A SUPPORTING ENTRY | Free alternatives exist. | Disputed | Wording proposed: P12. |
| CL-034 | BLOCKING | L528 | ASSUMPTION NOT LABELLED IN THE TEXT | Where this customer looks for help. | False positive (group A) | The sentence says that evidence or information is missing, or describes the review itself. The reviewer classed it as an assumption and code then asked for a label it does not need. |
| CL-035 | BLOCKING | L545 | FOUNDER DETAIL NOT IN THE INTAKE | The business depends entirely on your time for delivery. | Disputed | Wording proposed: P9b. |
| CL-036 | BLOCKING | L545 | FOUNDER DETAIL NOT IN THE INTAKE | Content creation, outreach, and platform development are on top of that. | False positive (group B) | The sentence states the plan's own model, forecast or budget, which code reconciles separately. Nothing external is asserted. |
| CL-OPEN | BLOCKING (check did not complete) | L16 | CLAIM REVIEW IS INCOMPLETE |  | Incomplete automated check | Reviewed by hand below (40 unanswered, 12 unusable). The automated check itself remains incomplete. |
| AUTO-008 | MAJOR |  | FINANCIAL MODEL |  | Owner decision | Standing warning: five cost categories are unresolved and are disclosed in the plan. Not a defect in the text. See the owner summary, decision 3. |
| AUTO-V41 | MAJOR | L54 | UNDATED SOURCES WITHOUT A NOTE IN THIS SECTION | - Alternatives: free content on platforms like BecomeNomad [W1]; free expat financial consultation through Expat.com [S4]; free initial consultation from Creative Planning International [S11]; self-di | Genuine | Corrected by C8. |
| QA-011 | MAJOR | L39 | Undated sources without a note in this section | Kismet Travels & Tours describes relocation support from planning to arrival [S6] | Genuine | Same issue as AUTO-V41. Corrected by C8. |
| DUP-001 | MAJOR | L46 | SAME CLAIM STILL PRESENT ELSEWHERE | - MyExpatPlanning is designed for US expats experiencing major life or financial changes including relocation abroad, retirement, self-employment, and cross-border income changes, and offers three tiers including a one-on-one call with a li | False positive | The sentence at L46 describes the provider in Section 3 and is supported by S15. The statement the reviser removed was its use as a basis for the $500 price in Section 6. What the removal left behind is corrected by C4. |
| QA-025 | MINOR | L55 | Repetition | offer a discounted or free first session to five people in your target group | Minor | Repetition of the ten-conversations instruction. Backlog, no change. |

## C. The 40 claims with no verdict (manual review)

Disputed: 3. No defect found: 37.

| Claim | Line | Sentence | Manual result | Basis |
|---|---|---|---|---|
| K0ypi12q | L431 | The ten conversations in Days 1-14 are not optional. | No defect found | Recommendation or instruction. Asserts no fact. |
| K1hft9x6 | L435 | The model assumes no paid advertising. | No defect found | The plan's own model. Matches the financial model. |
| K01ac8j5 | L435 | Every lead must come from direct outreach and organic content. | No defect found | The plan's own model. Matches the financial model. |
| K0l873gs | L435 | The following channels are recommended in order of how quickly they can be tested with the resources you have now. | No defect found | Recommendation or instruction. Asserts no fact. |
| K16r11s5 | L441 | Recommendation: Start here before building any new channel. | No defect found | Recommendation or instruction. Asserts no fact. |
| K17z0ahe | L443 | Reasoning: Your existing network is a direct path to the first ten conversations and the first paying customer. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K0cj4uzm | L443 | People who already know you can evaluate your credibility without a website, a content archive, or a brand. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K1dcendc | L443 | If you have lived abroad, traveled long-term, or made a major lifestyle change yourself, the people who know that about you may be well placed to refer you to someone who fits the target profile, because they already know your background. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K1tqt2mr | L445 | Evidence status: No evidence was found in the sources reviewed about where this specific customer looks for help. | No defect found | Statement that evidence or intake information is missing. Accurate: the ledger has no entry on this. |
| K0sfvuqd | L445 | This recommendation is based on the reasoning that direct outreach to a known network can be started immediately without paid acquisition, tools, or content, and that existing audience information was not captured in the intake. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K16c3p0l | L445 | IdeaToPlan recommends direct outreach to a known network as the initial channel to test for those reasons. | No defect found | Recommendation or instruction. Asserts no fact. |
| K0xw7ey3 | L445 | If you already have a warm audience on a specific platform, test that channel first. | No defect found | Recommendation or instruction. Asserts no fact. |
| K1vatct2 | L447 | Confidence: Medium (reasoning-based, not evidence-based). | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K0n7avc6 | L449 | 30-day test: Identify 30 people in your network who fit the target profile or who know people who do. | No defect found | Recommendation or instruction. Asserts no fact. |
| K07su5yo | L449 | Reach out to 10 of them this week with a direct, personal message describing the problem you solve and asking whether they or someone they know is thinking about a major lifestyle change. | No defect found | Recommendation or instruction. Asserts no fact. |
| K1iwjm1k | L451 | Success metric: IdeaToPlan planning threshold: at least 5 of 10 respond and agree to a conversation. | No defect found | IdeaToPlan test criterion or threshold, labelled as such. |
| K12egxpx | L453 | Stop or change criterion: If fewer than 3 of 10 respond after two rounds of outreach, your existing network may not contain enough people in the target group. | No defect found | IdeaToPlan test criterion or threshold, labelled as such. |
| K0wkmjip | L453 | Move to community outreach (Channel 2) before spending more time on this channel. | No defect found | Recommendation or instruction. Asserts no fact. |
| K172ue7r | L459 | Recommendation: Test two or three communities where adults considering relocation, early retirement, or lifestyle change gather. | No defect found | Recommendation or instruction. Asserts no fact. |
| K0tiqgbj | L461 | Reasoning: Your target customer, aged 40-60 and considering a major lifestyle change, is likely to seek information and community in online spaces dedicated to expat life, early retirement, career change, or long-term travel. | Disputed | Wording proposed: P13. |
| K0ic0lpr | L461 | Contributing genuinely useful answers to questions in these communities, rather than promoting the offer directly, is a way to build credibility and generate inbound interest without paid advertising. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K18izbxn | L461 | Which specific communities are most active and most aligned with your target customer is not established from the sources reviewed; | No defect found | Statement that evidence or intake information is missing. Accurate: the ledger has no entry on this. |
| K0ox0879 | L461 | testing two or three is the way to find out. | No defect found | Recommendation or instruction. Asserts no fact. |
| K1gc6ab6 | L463 | Evidence status: No verified evidence was found about where this customer looks for help. | No defect found | Statement that evidence or intake information is missing. Accurate: the ledger has no entry on this. |
| K1raljey | L463 | This recommendation is based on the reasoning that online communities are a low-cost channel to test and that the target customer's profile (financially stable, considering a major change, seeking practical guidance) is consistent with the  | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K13ysyqp | L463 | That consistency is a hypothesis, not a finding. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K0pf2i79 | L465 | Confidence: Low (hypothesis, not evidence-based). | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K1e3380c | L467 | 30-day test: Join two or three communities (for example, expat forums, Facebook groups for people considering relocation or early retirement, LinkedIn groups for career changers). | No defect found | Recommendation or instruction. Asserts no fact. |
| K1cy0fdy | L467 | Answer five questions per week with genuinely useful responses. | No defect found | Recommendation or instruction. Asserts no fact. |
| K1hpa7qn | L467 | Include a brief description of your offer in your profile, not in every post. | No defect found | Recommendation or instruction. Asserts no fact. |
| K1tdvrif | L469 | Success metric: IdeaToPlan planning threshold: at least 2 inbound inquiries from community activity within 30 days. | No defect found | IdeaToPlan test criterion or threshold, labelled as such. |
| K0nw1hcn | L471 | Stop or change criterion: If no inbound inquiries arrive after 30 days of consistent participation, either the communities are not the right ones or the profile description is not compelling. | No defect found | IdeaToPlan test criterion or threshold, labelled as such. |
| K0id53iv | L471 | Test a different community or revise the profile description before continuing. | No defect found | Recommendation or instruction. Asserts no fact. |
| K0368uee | L477 | Recommendation: Test LinkedIn as a content and outreach channel, particularly if your target customer is in a professional or career-transition context. | No defect found | Recommendation or instruction. Asserts no fact. |
| K1hpqiqy | L479 | Reasoning: Your target customer is described as financially stable and likely in or recently out of a professional career. | Disputed | Wording proposed: P14. |
| K1unp9nr | L479 | LinkedIn is a platform where that demographic is present and where content about career change, relocation, and lifestyle design is shared. | Disputed | Wording proposed: P14. |
| K165kysd | L479 | Whether your specific target customer uses LinkedIn to look for this kind of help is not established from the sources reviewed. | No defect found | Statement that evidence or intake information is missing. Accurate: the ledger has no entry on this. |
| K0eisqj3 | L481 | Evidence status: No verified evidence was found about this customer's LinkedIn behavior. | No defect found | Statement that evidence or intake information is missing. Accurate: the ledger has no entry on this. |
| K12h6898 | L481 | This recommendation is based on the demographic reasoning that a financially stable 40-to-60-year-old with a professional background is likely to have a LinkedIn presence. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |
| K1rx695m | L481 | That is a hypothesis to test, not a finding. | No defect found | Reasoning or hypothesis, labelled as such in the sentence or the paragraph. |

## D. The 12 claims with an unusable verdict (manual review)

| Claim | Line | Sentence | Why code could not use the verdict | Manual result | Basis |
|---|---|---|---|---|---|
| K0zr89z9 | L16 | Competing offers exist from providers including Kismet Travels & Tours [S6] and Total Law [S13]; | the words it quotes as support are not in the entry it names | No defect found | Entries for S6 and S13 describe these offers. The reviewer joined two quotes in a way code could not match. |
| K136s7h7 | L41 | Note: the sources cited in this section (S6, S13, S4, S15) show no publication date; | the number or date 6, 13, 4, 15 is not in the text of E8, E11 or its source record | Corrected by C8 | A date note. Code read the source numbers as figures. The note itself lacked S11. |
| K15f7s4p | L41 | the service descriptions may have changed. | its only label is "may", which covers the clause it governs and nothing else, and the sentence refers to "the service": the hypothesis has to be split from what is stated | No defect found | Caution attached to the date note. Asserts nothing about the providers. |
| K1vatj3w | L106 | The absence of a provider explicitly targeting your positioning in the sources reviewed does not establish that no such provider exists, and it does not establi | it is classed NONE and it generalises about people, customers, or channels ("customers want"): that is a statement about the world | No defect found | States what the review does not establish. |
| K08lytz5 | L118 | 3. The offer is fully digital and location-independent, keeping overhead low and delivery flexible. | it is classed FOUNDER and the words it quotes are not in the founder context | No defect found | The intake describes a digital platform operating everywhere. "Keeping overhead low" is the plan's reasoning in a Strengths row. |
| K0qdomh7 | L127 | the service descriptions may have changed. | its only label is "may", which covers the clause it governs and nothing else, and the sentence refers to "the service": the hypothesis has to be split from what is stated | Removed by C4 | Part of the stale date note in Section 6. |
| K18wl405 | L306 | Free consultations exist from Expat.com [S4] and Creative Planning International [S11]. | the words it quotes as support are not in the entry it names | No defect found | Supported by the S4 and S11 entries. |
| K1at8b1r | L318 | Existing audience size and outreach reach were not captured in the intake | it is classed FOUNDER and the words it quotes are not in the founder context | No defect found | States that the intake did not capture this. Accurate. |
| K0m3fhmh | L377 | The outcome statement, "a clear, actionable plan identifying your key barriers and concrete next steps," should reflect what the conversations told you buyers a | it is classed RECOMMENDATION and it generalises about people, customers, or channels ("buyers actually want"): that is a statement about the world | No defect found | Instruction to rewrite the offer in customers' words. |
| K0j1cf4d | L417 | By Day 90 you should know: how many people you reached, how many agreed to a conversation, how many converted to paying customers, and how long each session act | it is classed NONE and it generalises about people, customers, or channels ("many people"): that is a statement about the world | No defect found | Instruction on what to track. |
| K0gcy0ju | L517 | the service descriptions may have changed. | its only label is "may", which covers the clause it governs and nothing else, and the sentence refers to "the service": the hypothesis has to be split from what is stated | No defect found | Caution attached to the date note. |
| K0rdygbb | L528 | Whether the founder's experience, once articulated, is a differentiator that buyers value. | it is classed ASSUMPTION and the label it quotes is not in the sentence | No defect found | An item in a list of unknowns. |

## E. Code checks on the drafts (automated, offline, no model)

Citation Check was run on each text with the saved evidence, intake and financial model of execution 63260.

| Text | Code findings |
|---|---|
| Original plan | 4: FINANCIAL MODEL (warning), UNDATED SOURCES WITHOUT A NOTE L54 (warning), SOURCE DATE NOTE IS WRONG L67 (blocking), DEMAND INFERRED FROM SUPPLY L55 (blocking). These are the four the run reported. |
| corrected-plan.md | 2: FINANCIAL MODEL (warning, standing), DEMAND INFERRED FROM SUPPLY L55 (blocking, false positive). |
| corrected-plan-with-proposals.md | 1: FINANCIAL MODEL (warning, standing). No blocking code finding. |

The claim review (the model step) was not run on either draft. The changed sentences have been read by me only.
