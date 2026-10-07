# Answer key for the Sonnet 4.6 / 5.5 comparison, resolved before Sonnet 5.5 was asked

Written 2026-10-07, before any Sonnet 5.5 request was sent. The key is never part of a model request.

## Test 1: claim review

The benchmark is the stage-one set of execution 63256: 36 sentences of the 63237 plan, judged against its evidence ledger and intake. The key is `replay/plan.mjs` (`STAGE_ONE`), committed before Sonnet 4.6 was asked: 13 expected defects, 20 valid controls, 3 not scored. Sonnet 4.6's answers are the ones saved from 63256. Sonnet 5.5 receives the same two requests, message for message.

What the set covers: unsupported competitor characterisations, payment and demand statements, survey scope, citation attribution, statements about the founder or the service that the intake does not carry, substitute limitations, uncited assertions, and as controls: supported facts, evidence limitations ("no source reviewed states ...") and explicitly labelled assumptions.

Disputed items, resolved now:

| Line | Was | Now | Reason |
|---|---|---|---|
| L287 | defect | defect, on the financial-advice part only | Liz's clarification of 2026-10-06, already in `KEY_CLARIFICATIONS`. "Operates globally" is supported by the intake. |
| L251 | defect (code rule) | defect | The sentence says an audience "does not yet exist". The intake does not say whether one exists. Stating an unknown as a fact is the defect, whatever label sits elsewhere in the sentence. |
| L129 | defect (code rule) | not scored | The sentence is conditional ("If customer interviews confirm ... could distinguish"). The code rule fired on the words "paid services". Whether that phrase needs evidence inside a labelled hypothesis is a matter of opinion, so neither answer is counted. |

Scored key after resolution: 12 defects, 20 controls, 4 not scored.

How it is scored: `score.mjs` runs today's `combine-claim-review.js` on each model's raw responses. Reported separately: what the model itself answered for a sentence, and what the code made of that answer (a verdict the code cannot use counts as unreviewed, not as found).

Not covered by this test: arithmetic and contradictions between the forecast and the action plan. In the pipeline those are checked by code against the financial model, not by the claim-review model. They are looked at in Test 2.

## Test 2: drafting

Both models receive the production writer request for the 63260 intake, ledger and financial model, with one added instruction: write only section 9, the 90-Day Action Plan. The messages are identical for both models.

Read by Claude against the intake, the ledger and the computed model, on these points, decided now:

1. Milestones agree with the forecast (customers and revenue by day 30, 60, 90).
2. No founder or service detail that the intake does not state (session length or format, audience, assets, prior work).
3. No competitor, payment or demand statement without a ledger entry; citations point at the right source.
4. Assumptions are labelled as assumptions in the sentence that makes them.
5. Obligations that apply before taking payment are not placed after the first sale.
6. The section is usable as written (complete, in the plan's format, not cut off).

The production code checks are also run on each draft where they apply. A model saying its draft is correct is not counted.

## Settings

| | Sonnet 4.6 | Sonnet 5.5 |
|---|---|---|
| Review requests | as sent in 63256: temperature 0, max_tokens 8000 | temperature not sent, max_tokens 16000 |
| Draft request | production: temperature 0.3; max_tokens 6000 for one section | temperature not sent, max_tokens 12000 |
| Thinking | off (not requested) | on, cannot be switched off; no reasoning setting sent |

Budget: 3 dollars in total. Four requests, one per execution, cost read after each. No retries of a request that returned an answer.
