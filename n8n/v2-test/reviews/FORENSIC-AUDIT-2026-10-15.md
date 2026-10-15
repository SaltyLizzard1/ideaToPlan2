# Forensic audit of the IdeaToPlan pipeline (2026-10-15)

Investigation only. Nothing was changed, deployed or run, and no paid call was made.

Evidence used: the live workflow `tZ8blRPhX7UiDxFo` and v2 Test `mLyKvFeYmJHuwXQ9` as stored today; the saved executions and per-node outputs of Growth 66554 and Starter 66650 (both ran in v2 Test at RC1b); their claim-review requests and answers; the manual labels in `diagnostics/phase2/rc1/`; and the saved runs 63220 to 63260, 65689, 65701 and 65735.

Labels used below:

- **NG / NS**: the per-node outputs of 66554 and 66650, in the other session's scratchpad `qa/rc1b-*/6655x-nodes-out.json`.
- **FX**: the claim-review fixtures in `wt-limits/n8n/v2-test/fixtures/phase2/{growth66554,starter66650}/claim-review/`.

## 1. The AI configuration as it actually ran

| Stage | Model actually returned (provider) | Settings sent | Retries / on failure | Output reaches the plan? | Cost in 66554 |
|---|---|---|---|---|---|
| Distill Search Query | claude-haiku-4.5 (Amazon Bedrock) | max 60 | 3 tries, stop | no | $0.0002 |
| Growth Research, Market Research | perplexity/sonar (Perplexity) | temp 0.1, max 4000 | 3 tries; Market continues on error | only through the ledger | $0.015 |
| Verify Claims (19), Verify Corrections (2) | claude-haiku-4.5 (Amazon Bedrock) | temp 0 | 2 tries, continue | no; decides what enters the ledger | $0.162 |
| Financial Assumptions | claude-sonnet-4.6 (Claude Platform on AWS) | temp 0, max 8000 | 3 tries, continue | **yes: its free-text "reason" fields are copied into the computed financial blocks** | $0.090 |
| Growth writer (Growth Plan Generator1) | **claude-sonnet-5.5** (Claude Platform on AWS) | no temperature, max 40000; thinking on by default (19,740 of 30,929 output tokens) | 3 tries, stop | yes | $0.380 |
| Starter writer (OpenRouter Chat Model) | claude-sonnet-4.6 as configured; the run records no model or cost | temp 0.3, max 12000 | 2 retries | yes | not metered |
| Final QA (2 passes) | claude-sonnet-4.6 | temp 0, max 8000 / 16000 | 3 tries, continue | no | $0.360 |
| Revise Plan | claude-sonnet-4.6 | temp 0, max 8000 | 3 tries, continue | **yes: its replacement passages are written straight into the plan** | $0.151 |
| Review Claims (12 requests) | claude-sonnet-4.6 | temp 0, max 16000, batches of 2 | 3 tries, continue | no; decides the gate through the checker | $0.823 |

- **No Opus is used anywhere.** The word "opus" does not appear in either workflow or either run.
- **The reviewer is Sonnet 4.6, not Opus 4.6.**
- **The Starter writer is Sonnet 4.6, not 5.5.** Only the Growth writer uses Sonnet 5.5.
- **No hidden routing.** No request sends routing, fallback model lists, provider preferences, structured-output (`response_format`) or reasoning settings. Every answer came from the model requested.
- **Cost split.** A Growth run costs $1.98 metered. Checking stages (Final QA, Revise, claim review) take $1.33 of that, two thirds. The writer takes $0.38. A Starter run costs $0.87 metered plus the unmetered writer.
- **Three different code versions are in play.** Live equals the repository's `staging`. v2 Test, where both saved runs ran, differs from live in six nodes: the writer and financial prompts (Founder Context, Build Financial Request), Compute Financials, Citation Check, Build Claim Review and Combine Claim Review. The isolated RC1d/RC1e copy differs again. The offline suite tests the repository, so it describes neither v2 Test nor RC1e.

## 2. Defects traced to their first point of failure

Status of each diagnosis: **P** = proven from saved evidence; **H** = hypothesis.

| Run / line | Sentence (short) | First stage that went wrong | Class | Evidence | Customer impact |
|---|---|---|---|---|---|
| 66554 L232, and runs 63220 to 63260 | "once the Base level ... is reached, the founder has validated that customers will pay at this price" | **Financial Assumptions model**, in `traction.reason` | Source information wrong (model-written text in a computed block) | NG Financial Assumptions output and Compute Financials `forecast_block`; `compute-financials.js` line 130 copies the reason; `build-claim-review.js` line 100 skips computed lines, so the reviewer never saw it; Apply Revisions: "cannot be edited" (**P**) | Major: a false validation claim, uneditable and unreviewed. Code caught it in 66554 (AUTO-002, QA-001) |
| Runs 63223 to 63260 | the same sentence ("reaching the Base scenario of 3 paying customers per month confirms enough demand") | **The test baseline**: v2 Test's fixed financial inputs are a copy of 63222's answer, which already contained it. 63220 had a near-identical sentence. | Source information wrong, replicated by a fixture | `test-financial-baseline.js` contains it; the Financial Assumptions answers of 63223 to 63260 do not, their Compute Financials text does (**P**) | The "recurring" defect in eight runs comes from one 63222 answer, not eight model failures |
| 66650 L39 | target customer "does not have someone in-house" | **Writer** (Starter, Sonnet 4.6) | Writer hallucination | Absent from the intake, the financial answer and the writer's prompt (**P**) | Genuine, minor; the reviewer caught it |
| 66650 L329, L433 | "Your current clients already trust your work"; "Capacity is the primary operational constraint" | Writer | Unsupported reasoning stated as fact | Not in the intake; Final QA missed both (**P**) | Genuine, minor; caught |
| 66650 L411 (and L116) | "The capacity ceiling is the binding constraint, not demand" | Writer; then the **reviewer** called it a recommendation, and code settled the L116 twin as a model reference | Writer unsupported reasoning, then reviewer misclassification | Answer K14vx4e7 RECOMMENDATION; K08m8bfx settled as MODEL (**P**) | **Missed**: a genuine unsupported conclusion settled as fine |
| 66650 L407 | "operated for two years with six clients" | **Revise Plan** (edit U14) | Source information altered between stages | NS Apply Revisions `edit_log` U14; the intake has "2 years" and "Six paying clients" as separate facts (**P**) | Minor overreach introduced by the auto-reviser |
| 66650 L47 | list of alternatives, "categories of competition", with no research run | **Prompts conflict**: the writer's rules tell it to list kinds of alternatives; the reviewer is told any external statement with no ledger entry is unsupported | Writer followed instructions; prompt design | Writer rules 7, 8 and 19 in `writer_system`; FX starter request (**P**) | Held as blocking in the run; judged genuine-minor by hand |
| 66650 L62 | insurance "whether ... you should check" | Reviewer | Reviewer misclassification (an instruction classed as an external fact) | Answer K1d5q2og (**P**) | False hold |
| 66650 L320 | "Without a specific answer, your outreach conversations have no clear reason ..." | Writer | Writer failure to follow its framing rule | `writer_system` lines 20 and 21 (**P**) | Genuine, minor |
| 66650 L217, L244, L247, L355 | four accurate sentences left unresolved | **Reviewer output structure**: an omitted claim, a claim answered twice with different classes, a claim placed in three answer lists, a split taking words from the next claim | Reviewer output failure | FX starter `responses.json`; checker reasons "no verdict", "verdicts disagree", "split is not the sentence" (**P**) | False holds |
| 66650 L279 | "The 28 hours ..." (100 less 72) | Checker | Checker interpretation (a correct derived number not found verbatim) | Checker line 339 (**P**) | False hold |
| 66554 L149 | "(listed as a pregnancy Pilates product)" | **Review request**: the source title was in the writer's prompt but not in the reviewer's | Reviewer missing evidence | S12 title "Personalised Pregnancy Pilates forRunners" is in `build-evidence.json`; every review request shows only "S12 (date not shown)" (**P**) | False hold |
| 66554 L138, L160, L125 | "IdeaToPlan analysis" rows and a cited trial sentence | Reviewer | Reviewer breaking its own rules: classes analysis with company facts as ASSUMPTION, a cited fact as RECOMMENDATION, no split | Answers K0bg0lq4, K0gn5x6u, K0tij42p (**P**) | False holds |
| 66554 L152 | "both pages show no date ..."; "billing basis is not stated" | **Revise Plan** wrote both to satisfy code findings; then the **reviewer** judged absence statements as unsupported facts | Altered between stages, then reviewer misjudgment | `edit_log` U12; the ledger lines show "(date not shown)" (**P**) | False holds |
| 66554 L50, L81, L85, L158, L349 | qualifiers and date notes, mostly added by Revise Plan | Checker structural rules on valid answers | Checker interpretation | Checker reasons quoted in `RC1e-findings.md` (**P**) | False holds |
| Run 65701 | founder background, followers and "no sales" never reached the writer | **Intake mapping**: entered in Investor Pitch fields on a Personal Roadmap order | Source information lost between stages | `three-run-comparison.md`, Fidelity (**P** as recorded; field mapping not re-read) | Plan written without known facts |
| Run 65735 | the $1,500 spending cap replaced by "$5,000" six times | **Intake to model**: the budget select range was used, not the free-text cap | Source information lost between stages | `three-run-comparison.md` (**P** as recorded) | Wrong budget in the plan |
| Run 63260 (my 7 October test) | 90-day targets of 6 customers against a forecast of 3 | Writer (Sonnet 4.6, temp 0.3) | Writer contradiction | `eval-sonnet55/COMPARISON.md` (**P**) | Genuine; would reach a customer if not caught by hand |

Counts across the 26 traced findings of 66554 and 66650:

| Class | Count |
|---|---|
| Reviewer misjudgment or output failure | 10 |
| Checker interpretation | 7 |
| Writer unsupported reasoning | 5 |
| Writer instruction failure | 1 |
| Reviewer missing evidence | 1 |
| Source information wrong | 1 |
| Genuine and correctly caught | 1 |

Revise Plan created or altered the text behind 6 of them.

## 3. Recurring patterns: the same mechanisms explain many incidents

- **Forecast scenarios described as validation.** One mechanism, proven. A model writes free-text reasons inside the financial step, and code inserts them into "computed" blocks. Those blocks are excluded from claim review and cannot be revised. The same block also tells the writer "never write that it validates". The writer receives contradictory input, and the reviewer never sees it.
- **Conclusions presented as facts.** Writer behaviour: L433, L411, L329, and L320 in Starter (Sonnet 4.6). They are caught or missed depending on the class the reviewer picks. The miss (L411) and the catch (L433) are the same kind of sentence, given different classes.
- **Accurate research statements rejected.** Three causes. The reviewer is not shown source titles (L149). It is asked to prove absence statements by quoting ("no date", "not stated"), which a quote-based contract cannot do (L152). And Revise Plan adds qualifiers and date notes in wording the checker does not recognise (L50, L81, L152).
- **Facts classified as advice or assumptions.** The reviewer breaks its own class rules on sentences that mix analysis with facts (L138, L160, L125, L411). The checker then trusts the class. With one-sentence batches of about 40 claims and five overlapping classes, the class boundary is a judgment the reviewer makes inconsistently.
- **Contradictions between sections.** These come from writer drift: 63260's targets against its forecast, and 66554 L232 against L269 (computed text against written text). Nothing checks one section against another.
- **Incomplete evidence given to the reviewer.** Source titles are missing. The computed model text is not reviewed. In Starter, the reviewer is told any external statement is unsupported, while the writer is told to write them.

## 4. Architectural complexity

A Growth plan passes through:

- **five model stages that judge or edit the plan:** Final QA twice, Revise Plan, claim review, and the Haiku source verification;
- **about 4,000 lines of rule code:** Citation Check 1,489 lines, Plan Revision Request 605, Compute Financials 686, Combine Claim Review 453 plus the RC1b to RC1e additions.

Where they duplicate or fight:

- **Final QA, Citation Check and claim review review the same sentences** against the same intake and ledger, with different rules, and often disagree. For example, Final QA missed L433, which claim review caught.
- **Revise Plan repairs findings by writing new text that the next stage rejects.** It touched 6 of 26 traced findings, and it introduced one new unsupported claim.
- **Checker rules correct reviewer errors, which creates new errors.** RC1e (c) tried to catch conclusions classed as advice with word rules and found about 30 new false findings for 2 to 3 genuine ones.
- **Generated text is then reviewed for faithfulness.** Competitor rows, prices, trials and date notes are written by a model from the ledger, then checked against the ledger by another model and by quote matching. Code could produce those rows from the ledger directly.

Is the reviewer's task realistic? No. It must classify about 450 sentences per Growth plan into five classes and prove each against quotes, in JSON batches of about 40. In every saved run (24 to 59 blocking findings each) the gate held. Most findings were false, and real defects were sometimes missed. The gate's verdict carries almost no information, and it costs two thirds of the run.

Which checks belong where:

| Check | Belongs in |
|---|---|
| Numbers, arithmetic, prices, budget ceiling, capacity, dates, citation-to-source mapping, competitor rows and prices, consistency between sections and the forecast | Deterministic code |
| Is a conclusion supported? Did the writer invent a fact about the founder or the market? | AI judgment, as a short report of material issues, not a sentence-by-sentence classification |
| Whether a plan is good enough to send | You, already required before every delivery |

## 5. The reviewer comparison

- **The authorized comparison has not been run.** Its workflows and baseline exist in the other session, unexecuted, so model capability cannot yet be separated from prompt and evidence problems on these runs.
- **What exists.** In my 7 October test on a frozen set, Sonnet 5.5 and Sonnet 4.6 reviewed about equally: 11 against 10 of 12 defects, 1 against 0 false positives. Sonnet 5.5 cost 60% more.
- **What this audit adds.** In 10 of the 11 reviewer errors traced here, the reviewer had the evidence in front of it, or broke its own instructions. One (L149) was missing evidence. That pattern points first to task design: too many classes, quote-proof of absence, batches of about 40. A stronger model would likely trim the error rate, not remove it. This is a hypothesis until the comparison runs.

## 6. Answers to your seven questions

### 6.1 Representative defects
See the table in section 2.

### 6.2 The three systemic root causes, ranked

1. **The review architecture asks for sentence-level proof of a whole plan and blocks on any doubt.** High impact, high confidence (proven). Every run held; most findings are false; real defects are still missed; it is two thirds of the cost; and every rule added to fix it has created new false findings.
2. **Model-written prose enters trusted channels without review.** High impact, high confidence (proven). Financial reasons go into computed blocks. Revise Plan writes directly into the plan. This is the origin of the pricing-validation defect and of several reviewer rejections.
3. **Instructions and versions disagree across stages.** Medium impact, medium-high confidence. The writer is told to do things the reviewer is told to reject (alternatives with no research, outside facts to check, analysis rows). The reviewer is given less evidence than the writer. Three code versions diverge. A test fixture carries a defect forward.

### 6.3 Model or architecture?
- **Sonnet 5.5 is not the problem.** It writes only Growth plans, and in 66554 no traced defect started in its text. Every Growth finding started in the financial model, Revise Plan, the review request, the reviewer or the checker.
- **The writer defects found are mostly Sonnet 4.6.** The genuine writer defects (invented customer detail, unsupported conclusions) came from the Starter writer, which is Sonnet 4.6. The 63260 forecast contradiction also came from Sonnet 4.6.
- **The reviewer is Sonnet 4.6, not Opus 4.6.** It misjudges inconsistently, but on a task that would make any model inconsistent.
- **The architecture is the main cause.**

### 6.4 Material issues the automated tests cannot detect
- **Anything a model writes.** All model answers in the tests are fixtures, and prompt changes are only visible in a paid run.
- **Model text placed in computed blocks.** These are excluded from review by design, and the tests were updated to expect the defect sentence.
- **Defects carried by the test baseline itself.**
- **Version drift.** The suite tests the repository, not v2 Test, not live, and not RC1e.
- **Intake fields dropped by goal**, as in 65701.
- **The budget cap replaced by the range select**, as in 65735.
- **Contradictions between sections.**
- **The Starter writer's model and cost**, which are not recorded.

### 6.5 Minimal corrective plan (causes, not symptoms; for decision, not implementation)
1. **Keep model prose out of computed blocks.** The financial model returns numbers and fixed choices; code writes the reasons from templates. This removes the pricing-validation class at its source.
2. **Generate research-derived sentences from the ledger in code.** That means competitor rows, listed prices, trials and date notes. These need no review, which removes the largest false-positive family.
3. **Replace sentence-level classification with one advisory review.** One model pass reports a short list of material problems, each with its evidence: unsupported conclusions about demand, price or viability; facts absent from the intake or ledger; contradictions with the forecast. The gate holds only on deterministic failures. Your review stays mandatory, and the AI report becomes your checklist instead of a wall of false holds.
4. **Stop the automatic reviser.** Findings go to you, or to one writer rerun with the findings attached, not to a model that patches sentences.
5. **One rule set, one version.** Writer and reviewer get the same definitions. A Starter plan does not write competition claims without research. One code lineage runs through repository, v2 Test and live. The test baseline is cleaned of the defect sentence.

### 6.6 What could be eliminated
- Combine Claim Review's phrase rules (RC1b to RC1e).
- The five-class sentence contract and its quote matching.
- Final QA's second (verification) pass.
- Revise Plan and Apply Revisions.
- The overlap between Citation Check's prose rules and Final QA.
- Verify Corrections, if research rows are code-generated.

Together these are most of the 4,000 lines of rules and about $1.10 of the $1.98 Growth run cost, before the cost of the one advisory review that would replace them.

### 6.7 Missing evidence, cheapest first
1. **Writer consistency on one intake.** Free to inspect: the saved runs 65701 and 66235 are the same pilates idea. A direct test means calling only the writer twice with the saved 66554 request, about $0.76, not authorized.
2. **Accuracy on the about 400 claims the reviewer settled per plan.** Free: a manual sample of 40 settled claims from 66554. RC1d checked only the risky slice.
3. **Model against task design for the reviewer.** The already-authorized comparison, about $2.10, or a reduced version on only the requests holding the traced reviewer errors, about $0.60. Not run, and not repeated here.
4. **Live behaviour.** The first real order on the live pipeline, which is older than v2 Test.
5. **The Starter writer's actual model and cost.** Free to read from the OpenRouter activity page.
