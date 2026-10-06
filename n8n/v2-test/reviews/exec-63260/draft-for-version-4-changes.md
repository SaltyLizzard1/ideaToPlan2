# Draft for a fourth version of the 63260 plan: change list

Prepared 2026-10-06 by Claude on Liz's instructions. A local draft only: nothing was rendered, stored, sent or recorded as reviewed.

**Status of this draft.** It is not plan version 3. Version 3 (`fd285afd-9ca3-4e6f-886b-0608ce5e83f0`) holds the text of `corrected-plan-v2.md` and its own PDF. This draft changes that text, so it has different fingerprints. It needs its own saved version, its own PDF and its own owner review. The review statement `a3-review-insert.sql` names version 3's fingerprints and must not be used for this text. These corrections have not been reviewed or approved by anyone.

Source: `corrected-plan-v2.md`. Result: `draft-for-version-4.md`. 10 replacements for 6 instructions. Every dollar amount, every percentage and every table row with figures is unchanged (checked by the build script).

## E1 (line 154 of the source)

Each forecast sale is one standalone session. Repeat purchases are not assumed.

Before:

> - Purchase frequency (planning assumption, untested): 1 per customer per month. The model assumes each customer buys one session per month; repeat or package purchases are possible but are not modeled here because the primary offer is a standalone planning session.

After:

> - Purchase frequency (planning assumption, untested): 1 per customer per month. Each sale in the forecast is one standalone session: a customer counted in a month buys one session in that month and is not assumed to buy again. A month with 3 customers means 3 different customers. Repeat or package purchases are possible but are not assumed and are not modeled here.

## E2 (line 120 of the source)

SWOT: a labelled positioning hypothesis in place of a statement about what no reviewed provider does.

Before:

> 1. Among the providers reviewed, none explicitly positions around helping someone decide whether a lifestyle change is right for them before committing to logistics; a hypothesis worth testing is that this is a positioning gap.

After:

> 1. Positioning hypothesis (IdeaToPlan, untested): helping someone decide whether a lifestyle change is right for them, before they commit to logistics, could be a distinct position for this offer. Whether other providers already serve that stage is not established from the five pages reviewed, and whether customers want it has not been tested.

## E3 (line 404 of the source)

Three completed sessions is a Day 90 milestone. The forecast has two customers by Day 60.

Before:

> Done when: First three sessions delivered and timed.

After:

> Done when: Every session delivered by Day 60 is timed (the forecast has two customers by then), and the first three sessions are delivered and timed by Day 90.

## E4a (line 332 of the source)

The two-hour assumption stays. The test passes only at or below it.

Before:

> | Success metric | IdeaToPlan planning threshold: average actual hours per session is 3 or fewer after the first three sessions |

After:

> | Success metric | IdeaToPlan planning threshold: average actual hours per session is at or below the 2 hours the model assumes, after the first three sessions |

## E4b (line 333 of the source)

A higher measured average means the capacity calculations are updated, not left as they are.

Before:

> | What to change if the test fails | If sessions consistently take more than 3 hours, either raise the price to reflect the true time cost, reduce the scope of the deliverable, or build a preparation template that cuts prep time |

After:

> | What to change if the test fails | If the measured average is above 2 hours, update the capacity calculations with the measured figure (founder hours per month in every scenario) before relying on them. Then either raise the price to reflect the true time cost, reduce the scope of the deliverable, or build a preparation template that cuts prep time |

## E4c (line 403 of the source)

Same point where the sessions are timed.

Before:

> If sessions consistently take longer, the capacity ceiling is lower than the model shows.

After:

> If the measured average is higher, the capacity ceiling is lower than the model shows, and the capacity calculations have to be updated with the measured figure.

## E5a (line 29 of the source)

Existing customers or audience: use actual data, not "revise upward".

Before:

> several early-stage steps below can be skipped, and the financial forecast should be revised upward.

After:

> several early-stage steps below can be skipped, and the financial forecast should be rebuilt from your actual sales, costs and conversion data in place of these assumptions.

## E5b (line 177 of the source)

Same instruction in the forecast note.

Before:

> these scenarios are written for a business with no reported revenue and should be raised if revenue already exists.

After:

> these scenarios are written for a business with no reported revenue and should be replaced with actual sales, costs and conversion data if revenue already exists.

## E6a (line 232 of the source)

"Before spending anything" covers the initial customer conversations only.

Before:

> The model requires $0 before validation, meaning you can run your first conversations and test willingness to pay before spending anything. Costs come in only after your first sale, and the larger infrastructure items wait until you have confirmed traction.

After:

> The model requires $0 before validation, meaning the initial customer conversations, where you test willingness to pay, need no spending. That covers those conversations only. The unresolved costs listed below are not in that figure, and anything required before you may take payment has to be settled before your first sale, which may cost money. The costs included in the model come in only after your first sale, and the larger infrastructure items wait until you have confirmed traction.

## E6b (line 519 of the source)

Same limit in the Viability Assessment.

Before:

> The funding requirement of the included costs is $0 before validation, meaning you can test the offer before spending anything.

After:

> The funding requirement of the included costs is $0 before validation, meaning the initial customer conversations can be held without spending. The unresolved costs, and any obligation that applies before you take payment, are outside that figure.

## Not changed

- The HOLD banner. It is added when the PDF is rendered, from the version's status, and stays.
- All owner decisions already in the text: corrections C1 to C8, wording P1 to P16, "Closest providers found", the pre-payment obligation wording, the conditional forecast sentence.
- The two-hour delivery assumption and every figure that depends on it.
- The stored versions 1, 2 and 3, their PDFs and their records.

## Launch requirement recorded, not built

A version's PDF is rendered when the version is saved, and approval is tied to those exact bytes. A held or hand-corrected version is rendered with the banner "Hold - not for delivery. This plan has unresolved blocking issues. See the review email." If such a version is released and approved as it stands, the approved PDF, and therefore the delivered PDF, carries that banner. Before launch, the customer-facing PDF of an approved version must not carry internal HOLD language, without weakening the tie between approval and the exact PDF. This is to be designed and decided; nothing was changed for it now. It also applies to stored version 3: its PDF has the banner.

## Backlog (suggestions, not applied)

- Section 4, Competitive Interpretation, still says that on the pages reviewed IdeaToPlan did not find an offer described as serving the pre-decision stage. It is labelled as an IdeaToPlan reading of five pages. If the SWOT wording (E2) is preferred there too, the same replacement fits.
- Assumption 5's validation test and the Viability Assessment both say "time the first three sessions" without a date. They are consistent with E3 and were left as they are.
- The Budget table lists the payment processing fee under "Before validation". The table is computed from the model and was not touched.
