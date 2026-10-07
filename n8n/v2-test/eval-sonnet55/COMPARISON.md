# Sonnet 4.6 against Sonnet 5.5 for IdeaToPlan: one bounded comparison

2026-10-07. Production was not changed. Spend: $0.42 of the $3.00 authorized. Four model calls, one per execution, no retries.

## Recommendation

**Use Sonnet 5.5 for one node: the plan writer. Keep Sonnet 4.6 for the review nodes.**

The evidence for the writer is one draft from each model, so it is suggestive, not proof. The switch is one line, reversible, and every plan still needs your recorded review and your Approve click.

The model is not the main weakness. See "Where the weakness is" below.

## Availability (checked before any paid call)

| | Sonnet 4.6 | Sonnet 5.5 |
|---|---|---|
| OpenRouter model ID | `anthropic/claude-sonnet-4.6` | `anthropic/claude-sonnet-5.5` |
| Anthropic model ID | `claude-sonnet-4-6` | `claude-sonnet-5-5` |
| Price per million tokens, input / output | $3 / $15 | $2 / $10 |
| Thinking | off unless requested | always on; cannot be switched off through these requests |
| Temperature | accepted | Anthropic rejects non-default values, so it was not sent |

Sources: OpenRouter's model list (read 2026-10-07) and Anthropic's model reference. Opus was not used.

The lower price did not make Sonnet 5.5 cheaper here. It counts more input tokens for the same text (31,429 against 22,469 for the identical writer request, 40% more) and it bills thinking as output.

## Test 1: reviewing claims against evidence

The frozen set of execution 63256: 36 sentences, key fixed before either model was asked, disputed items resolved in `KEY-RESOLUTION.md` before Sonnet 5.5 was asked. Scored key: 12 defects, 20 valid controls, 4 not scored. Sonnet 4.6's answers are the ones saved from 63256. Sonnet 5.5 got the same two requests, message for message.

| | Sonnet 4.6 | Sonnet 5.5 |
|---|---|---|
| Defects the model itself flagged | 10 of 12 | 11 of 12 |
| Defects missed | L251, L287 | L287 |
| Valid sentences wrongly flagged | 0 of 20 | 1 of 20 (L43) |
| Answers the code could not use (of 36 sent) | 4 | 2 |
| Cost for the two requests | $0.093 | $0.149 |
| Time | not recorded per request | 54 s and 15 s |

What the code did, apart from the models' judgment: for Sonnet 4.6 the code refused two answers on scored defects (L251, L287) and left them unreviewed, which holds the plan. That was the code catching a badly formed answer, not the model finding the defect. For Sonnet 5.5 the code accepted its answer on L287, so that miss went through as settled.

The three differences, read one by one:

- **L251, a real improvement.** "They depend on an audience that does not yet exist." Sonnet 5.5 split the sentence and flagged the first half: the intake never says there is no audience. Sonnet 4.6 answered the sentence whole as a labelled assumption.
- **L287, both wrong, Sonnet 5.5 less visibly.** "The offer involves personalized financial and life-planning advice." The intake lists financial planning tools and planning sessions, not financial advice. Both models called it supported. Sonnet 4.6 quoted words that are not in the intake, so the code rejected the answer. Sonnet 5.5 quoted a real intake sentence that does not say it, so the code accepted the answer.
- **L43, a new false positive.** "It covers travelers broadly rather than your specific 40-60 age group." This is the plan stating a limit of its evidence. Sonnet 5.5 flagged it because no entry gives the sample's age range. This is the kind of flag that produced most of the false holds in execution 63260.

Reading: on this set the two models are close. Sonnet 5.5 follows the answer format better and found one more defect. It also added the kind of false positive that already causes most unnecessary holds, and it cost 60% more. Twelve defects is too few to call a winner.

## Test 2: drafting one section

Both models got the production writer request for the 63260 intake, ledger and financial model, plus one instruction: write only section 9, the 90-Day Action Plan. Identical messages. Read by Claude against the intake, the ledger and the computed forecast. The forecast for Months 1 to 3 is 1 customer a month, 3 in total.

| Point (fixed before the run) | Sonnet 4.6 | Sonnet 5.5 |
|---|---|---|
| 1. Milestones agree with the forecast | **No.** 1 customer by Day 30, then "2 paying clients in this period" and "3 paying clients in this period": 6 in 90 days against the forecast's 3 | Yes. 1, 2 and 3 in total, and it says so against the forecast |
| 2. No founder or service detail beyond the intake | **Two.** "Sit with you for an hour" (no session length in the intake). "QYLAT will offer personalized financial and life-planning advice" (not in the intake) | None found. It says the intake gives no session length or format and offers one as an assumption to confirm |
| 3. No unsupported external statement; citations right | No citations. Four plain assertions with no evidence (for example that manual scheduling "makes the business look less professional to prospects") | One citation pair, S4 and S11, both in the ledger. Small stretch: it calls the S11 consultation "expat financial", which the entry does not say |
| 4. Assumptions labelled where made | Yes | Yes |
| 5. Pre-payment obligations before the first sale | Yes. The check sits in Days 1 to 14, with a note on the $300 budget timing | **Inconsistent.** Action 4 says "before you ask anyone to pay", then allows the adviser consultation "after the first customer has paid", and Action 8 places it in Days 31 to 60, after the first session is delivered |
| 6. Usable as written | Yes, 14,900 characters | Yes, 10,700 characters |
| Cost | $0.117 | $0.151 |

Reading: Sonnet 5.5's draft is the better one. It kept to the forecast, invented nothing about you or the service, and marked what the intake does not say. Its one defect, the accountant timing, is the same point you corrected by hand in the 63260 plan. Sonnet 4.6's draft has the defects that keep recurring in generated plans: a forecast contradiction and invented service details.

The production code checks were not run on these drafts. They expect a whole plan, not one section.

## What this does and does not show

- One draft per model and twelve scored defects. Sonnet 4.6 drafted at temperature 0.3, so a second draft from it could differ.
- It does not show that either model produces a plan that passes the gate. Neither draft was put through claim review.
- It does not establish reliability for future plans on other ideas.

## Where the weakness is

In order, from the saved runs and this test:

1. **The review contract, measured against thin evidence.** Execution 63260 held on 44 findings. By hand, 16 were false positives, 19 were disputed wording and 1 was a plain defect. Most flags are on the plan's own interpretive sentences. A model change does not alter that: Sonnet 5.5 added a flag of the same kind.
2. **The research inputs.** The ledger carries a handful of provider pages and no evidence of demand or willingness to pay. Any writer has to say "not established" throughout, and every interpretive sentence beyond that is a finding.
3. **The writer model.** Real, and the one part a model change helps: forecast contradictions and invented details came from Sonnet 4.6's draft and not from Sonnet 5.5's.
4. **The prompts.** Not shown to be a cause here. The same prompt produced a clean draft from one model and a flawed one from the other.

So the expectation to set: with Sonnet 5.5 as writer, drafts should need fewer hand corrections of the 63260 kind. Plans will still arrive on HOLD, because the holds come mostly from items 1 and 2.

## Proposed change (not applied)

One node in the published pipeline `tZ8blRPhX7UiDxFo`, and the same line in v2 Test and in the repository file `n8n/v2-test/build-growth-payload.js`:

Node `Build Growth Payload`, last statement. From:

```js
payload: JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', max_tokens: 20000, temperature: 0.3, messages: [...] }),
```

To:

```js
payload: JSON.stringify({ model: 'anthropic/claude-sonnet-5.5', max_tokens: 40000, messages: [...] }),
```

- `temperature` is removed because the model does not accept it.
- `max_tokens` is raised because thinking counts against it. A full plan is about 11,000 output tokens, and this test used 5,400 thinking tokens for one section.
- Nothing else changes: `Growth Plan Generator1` keeps its credential, its 10-minute timeout and its retry setting.

Expected cost effect per plan, an estimate: the writer call was $0.25 on Sonnet 4.6. On Sonnet 5.5, about $0.25 to $0.35, depending on thinking.

Left on Sonnet 4.6: `Build Claim Review`, `Citation Check` (Final QA), `Plan Revision Request` (Revise Plan), `Build Financial Request`, and the Base plan writer. They were not tested here, or tested with no clear gain.

**Rollback:** restore the original line in `Build Growth Payload` and publish. The previous version is also in n8n's workflow history and in `supervised/backups/` and `supervised/production/`.

**First plan after the change:** treat it as the acceptance check. Compare its section 9 with the forecast and read the review report before releasing it. No separate paid test is needed, because your review happens anyway.

Unchanged by this proposal: your recorded review, the separate Approve click, the fingerprint checks and the delivery safeguards.

## Files

- `KEY-RESOLUTION.md`: the key and the settings, committed before Sonnet 5.5 was asked.
- `build.mjs`: builds the isolated workflow. `extract.mjs`: stores a response. `score.mjs`: scores the review test offline.
- `score-sonnet-4.6-63256.json`, `score-sonnet-5.5.json`: every sentence, the expected answer, each model's answer and what the code made of it.
- `outputs/`: the four raw responses and both drafts as text.
- Executions 63594 to 63597 of workflow `p3QvoeTpkvg81h3O` (archived). It had four nodes: a trigger, a request picker, the OpenRouter call and a result node. No database write, upload, email or approval.

## Cost

| Request | Model | Input tokens | Output tokens (of which thinking) | Cost |
|---|---|---|---|---|
| Review 1 | Sonnet 5.5 | 11,688 | 8,698 (6,000) | $0.1104 |
| Review 2 | Sonnet 5.5 | 7,146 | 2,399 (1,361) | $0.0383 |
| Draft | Sonnet 4.6 | 22,469 | 3,326 (0) | $0.1173 |
| Draft | Sonnet 5.5 | 31,429 | 8,769 (5,352) | $0.1505 |
| **Total** | | | | **$0.4165** |

Sonnet 4.6's review answers were reused from execution 63256 at no new cost ($0.0930 then).
