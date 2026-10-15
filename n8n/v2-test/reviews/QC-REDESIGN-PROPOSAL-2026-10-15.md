# Quality-control redesign proposal (2026-10-15)

Design and impact analysis only. Nothing was changed, deployed or run, and no paid call was made. The baseline is the forensic audit (`FORENSIC-AUDIT-2026-10-15.md`) and the live pipeline `tZ8blRPhX7UiDxFo`.

## The idea in one paragraph

Code verifies everything that can be computed or looked up. The writer writes. One AI review reads the whole plan once and reports only material problems, each with the passage, the evidence, a severity and a suggested correction. You see every material finding and record what you did with each one before approval. A genuine defect is corrected by editing the passage, saving it as a new version and rerunning only the code checks and the one review on that version. There is no automatic reviser and no sentence-by-sentence classification. The HOLD safeguard, your recorded review, the separate Approve click, the fingerprints and single delivery stay exactly as they are.

## 1. Current against proposed workflow

**Current (Growth):**

1. intake
2. research and source verification
3. financial model
4. Compute Financials, which copies the model's free text into locked tables
5. writer
6. Assemble Plan
7. Citation Check: about 1,500 lines of rules, and it builds the QA request
8. Final QA, pass 1
9. Plan Revision Request
10. Revise Plan: the model rewrites passages
11. Apply Revisions
12. Final QA, pass 2
13. Build Claim Review: about 450 claims
14. Review Claims: 12 model calls
15. Combine Claim Review: phrase rules
16. Finalize
17. PDF and fingerprint
18. Delivery Gate. In practice every run so far has held, mostly on false findings.
19. Notice to you
20. Your review record, approval request, Approve click and delivery

That is 41 model calls and $1.98 metered per Growth run.

**Proposed (Growth):**

1. intake, with the field mapping fixed
2. research and source verification (unchanged)
3. financial model
4. Compute Financials: tables are code only; the model's notes sit beneath the tables (Fix 1)
5. Build Evidence also writes the research facts as fixed text: competitor rows, listed prices, trials, date notes
6. writer
7. Assemble Plan: places the tables, the notes and the research blocks
8. **Deterministic Checks**: figures, prices, budget ceiling, capacity, dates, citations to sources, and the 90-day targets against the forecast
9. **Material Review**: one model call
10. Finalize
11. PDF and fingerprint
12. Delivery Gate. It holds on any deterministic failure. Otherwise the version waits for your review with the findings listed.
13. Notice to you, showing the material findings with their passages
14. Your review record, now disposing of each material finding
15. Approval request, Approve click and delivery, all unchanged

That is about 26 model calls, almost all of them the cheap research verification, and an estimated $0.83 metered per Growth run.

**Starter** follows the same path without research. It takes 3 model calls: the financial model, the writer and the Material Review.

**Correcting a genuine defect.** You or Claude edit the passage. The existing "Save Reviewed Version" workflow, extended, saves it as the next version. That rerun repeats the Deterministic Checks and the Material Review on the new text, about $0.20, and sends a new notice. Approval binds to the new version's fingerprints as it does now. Nothing rewrites text on its own.

## 2. Node-by-node list

R = retain unchanged, C = change, X = remove.

| Node | Decision | Reason |
|---|---|---|
| Webhook, Respond to Webhook, Log to Supabase | R | Working |
| Prepare Client Data, Sanitize Data | C | Map every intake field whatever the plan goal (65701 lost the founder background), and carry a stated spending cap (65735 replaced $1,500 with $5,000). Code only. |
| Founder Context | C | One definitions block shared by the writer and the reviewer: what counts as analysis, a recommendation or a not-known statement. Starter writer rules no longer ask for competitor or alternative claims without research; it states that none was done. Remove rules that only feed the claim review. |
| Distill Search Query, Brave Search, Growth Research, Market Research, Collect Evidence, Fetch Source Pages, Build Verification Request, Verify Claims, Build Evidence | R / C | Retain the research and Haiku verification ($0.18, no traced defect). Build Evidence (C) also emits the code-written research facts. |
| Build Recheck Request, Verify Corrections | X, later | Redundant once research rows are code-generated. Remove in stage 3 after the acceptance test. |
| Build Financial Request, Financial Assumptions | R | Sonnet 4.6, temperature 0. The defect was where its text went, not the model's numbers. |
| Compute Financials | C (Fix 1) | Tables code only; model notes moved out. Keep the price-validation guard and all reconciliation. |
| Test Financial Baseline (v2 Test only) | C | Remove the 63222 validation sentence from the fixed inputs, so tests stop replaying a known defect. |
| Build Growth Payload, Growth Plan Generator1, Format Growth Output1 | R | Sonnet 5.5 writer with the safe stop on empty or cut-off answers |
| Basic LLM Chain, OpenRouter Chat Model (Starter writer) | R, model under test | Sonnet 4.6 now. It produced the genuine Starter defects in 66650, so test Sonnet 5.5 for it in stage 2 before deciding. Its cost is not metered today. |
| Assemble Plan | C (Fix 1) | Places the notes beneath the tables and the research blocks |
| confirmation_to_client | R | |
| Citation Check | C, simplified | Becomes **Deterministic Checks**. Keep the code checks for figures, prices, dates, citations to sources, competitor counts and price validation. Add a forecast-against-targets comparison: arithmetic on the plan's own numbers. Remove the prose phrase rules and the QA request builder. |
| Final QA | C | Becomes **Material Review**: one pass, a new prompt and a fixed answer format (passage, evidence, severity, correction). Final QA already reads the whole plan, and it was the stage that caught the 66554 pricing claim (QA-001). |
| Plan Revision Request, Revise Plan, Apply Revisions | X | The automatic reviser created or altered the text behind 6 of the 26 traced findings and added one new unsupported claim |
| Final QA pass 2 (verification of the revision) | X | Nothing to verify without the reviser |
| Build Claim Review, Claims To Review, Review Claims, Combine Claim Review | X | The sentence-level contract: $0.82 a Growth run, the source of most false holds, and RC1b to RC1e all live here |
| Finalize Plan | C | The report lists the deterministic results and the material findings. HOLD when any deterministic check fails. |
| Format Plan as HTML, Generate PDF, Fingerprint PDF, Resolve Submission, List Plan Versions, Prepare Version, Upload Plan PDF, Insert Plan Version | R | Fingerprints, versions and storage unchanged |
| Delivery Gate | C (small) | Blocked = deterministic failure. Material findings go into the stored review notes and the notice. |
| Create Held Link, Held Notice, Create Review Link, Review Notice | C (text only) | Show each material finding: passage, evidence, severity, suggested correction |
| Approval and Delivery `7MAQia1N6jV4bNnc`, Request approval `XIGjvSnypPRpZ4gb` | R | Release record, fingerprint binding, attachment check and single delivery unchanged |
| Save Reviewed Version `GpObSW2KKZ2S3Vxk` | C | Becomes the correction path. After saving a corrected version it runs the Deterministic Checks and the Material Review on it. Today it runs no checks on hand-corrected text. |

**Checker code.** Combine Claim Review (453 lines plus the RC1b to RC1e additions) is removed, as are the prose and phrase sections of Citation Check (most of its 1,489 lines) and Plan Revision Request (605 lines). Compute Financials (686 lines) is kept. About 2,500 lines of rules go.

### Fix 1: retain the separation, supersede its reliance on claim review

The approved Fix 1, in progress in the isolated copy, does three things:

- separates the model's explanations from the locked financial tables (Compute Financials);
- places them as editable notes beneath the tables (Assemble Plan);
- points the reviser's wording warnings at those notes (Citation Check).

**Retain the first two.** They are exactly requirement 2 and remove the pricing-validation mechanism at its source.

**The third becomes unnecessary** once the reviser is removed. So does Fix 1's assumption that claim review and Revise Plan will examine and correct the notes. In this design the notes are read by the Material Review, and a genuine defect in them is corrected through the correction path.

If later runs show the notes keep producing material findings, the next step is code-written notes from the model's fixed choices. That should be decided on evidence, not now.

## 3. Estimated cost per plan (metered, from the 66554 and 66650 figures)

| Stage | Growth now | Growth proposed | Starter now | Starter proposed |
|---|---|---|---|---|
| Research and verification | $0.18 | $0.18 | none | none |
| Financial model | $0.09 | $0.09 | $0.06 | $0.06 |
| Writer | $0.38 (Sonnet 5.5) | $0.38 | not metered, about $0.16 | about $0.16 on Sonnet 4.6; about $0.20 to $0.25 if Sonnet 5.5 is chosen |
| Final QA (2 passes) and Revise | $0.51 | none | $0.36 | none |
| Claim review | $0.82 | none | $0.45 | none |
| Material Review, one pass | none | $0.18 to $0.22 | none | $0.12 to $0.15 |
| **Total per plan** | **$1.98** | **about $0.85** | **about $1.03** | **about $0.35 to $0.45** |
| Each correction rerun | none | about $0.20 | none | about $0.15 |

These are estimates. The Material Review figure assumes Final QA's input size, about 46,000 tokens for Growth, and about 3,000 output tokens on Sonnet 4.6. On Sonnet 5.5, expect about 30% more for the same task, from the tokenizer and thinking.

## 4. Model for each remaining AI task

| Task | Recommendation | Evidence |
|---|---|---|
| Research | Perplexity Sonar, unchanged | No traced defect began in it; $0.015 |
| Source verification | Haiku 4.5, unchanged | Narrow task, $0.16; no traced defect |
| Financial assumptions | Sonnet 4.6, temperature 0, unchanged | The defect was placement, not numbers (audit section 2) |
| Growth writer | Sonnet 5.5, unchanged | 7 October drafting comparison; no 66554 finding started in its text. One run only, so keep watching. |
| Starter writer | Test Sonnet 5.5 against 4.6 before deciding | Sonnet 4.6 produced the genuine 66650 defects and the 63260 forecast contradiction; untested on Starter |
| Material Review | Start with Sonnet 4.6 and test Sonnet 5.5 beside it on the same saved plans; pick on results | Untested for this exact task. Sonnet 4.6 already does the closest task (Final QA). On claim review, 5.5 was about level with 4.6 and 60% dearer. |

No stage is assigned a model on the assumption that newer is better.

## 5. Risks and tradeoffs

- **The safety net is coarser by design.** Without sentence-level classification, a small unsupported sentence can pass the AI review. Three things mitigate it: the facts that matter are code-checked or code-written; the review targets the material classes; and your review stays mandatory. Accepted deliberately: the old net held every plan and still missed real defects.
- **You carry the final judgment.** Your time per plan shifts from wading through false holds to deciding on a short list of findings. A poor review prompt would still produce false findings, now as noise in the notice rather than a hard block.
- **Variance.** One review call can miss in one run what it catches in another. The acceptance test runs each plan twice to measure that.
- **Code-written research text reads plainer.** Competitor rows built from the ledger are accurate but less fluent.
- **Starter has no research.** Its plans must say plainly that market facts were not researched, rather than list alternatives. That is less content, and honest.
- **Disposition is recorded as text at first.** Recording what you did with each finding uses the existing review record fields (notes and disposition). Code cannot count findings against dispositions until a structured field exists, so stage 4 proposes that only if needed.
- **Fix 1 is being built for the old reviewer.** Its tests assume claim review reads the notes. Those tests change when claim review is removed.

## 6. Staged implementation plan, with rollback points

Each stage is built in an isolated copy, tested offline, and moved to v2 Test only after your approval. Live changes only in stage 5.

| Stage | What | Cost | Rollback point |
|---|---|---|---|
| 0. Baseline | One code lineage: repository, v2 Test and the isolated copy reconciled; remove the defect sentence from the test baseline; record current versions (live `e3fbdb49`, v2 Test `015c2b97`) | free | Nothing to roll back |
| 1. Fix 1 and intake mapping | Finish Fix 1 without the reviser part; fix the intake field mapping and the spending cap; offline tests on 66554, 66650, 65701, 65735 | free | v2 Test version before stage 1 |
| 2. Material Review on saved plans | Build the review prompt and answer format in the isolated copy; run it on saved final plans only, no generation, with Sonnet 4.6 and Sonnet 5.5, twice each | about $2, separate authorisation | Nothing deployed |
| 3. Deterministic Checks and research blocks | Code-written research facts; forecast-against-targets check; remove the claim-review and reviser nodes in the isolated copy; offline tests | free | Isolated copy only |
| 4. End to end in v2 Test | One Growth and one Starter run on saved intakes; correction path; approval safety tests A4 to A8 repeated on the new path | about $1.40 plus about $0.40 for a correction, separate authorisation | v2 Test version before stage 4 |
| 5. Live | Back up live, deploy, verify, watch the first real order | free | Republish live version `e3fbdb49`; the approval workflow is untouched |

## 7. The acceptance test (saved runs, no generation)

**Inputs:** the saved final plans and their intake, research and financial data for Growth 66554 and Starter 66650, plus 65735 (bookkeeping, budget cap), 63260 (Growth, forecast against targets) and 65701 (lost intake fields), with the manual labels already recorded.

| Measure | Test | Pass |
|---|---|---|
| Material defect detection | The labelled material defects across the inputs: 66554 L232 price validation; 66650 L411 and L433 capacity conclusions, L39 invented customer detail, L47 competition with no research; 63260 targets against forecast; 65735 cap | All caught, by code or the review. Each one names the passage and the evidence. |
| Genuine minor defects | 66650 L320, L329, L337, L407 | Reported; at least 3 of 4 |
| False holds | Code checks on the five saved plans | Zero deterministic holds on accurate text |
| False material findings | Review findings judged false against the labels | At most 2 per plan, on average across the two runs |
| Consistency | The same plan reviewed twice | At least 80% of material findings in both runs |
| Output reliability | Every review answer | 100% readable in the fixed format, with passage, evidence, severity and correction present |
| Financial accuracy | Deliberately changed copies of saved plans: a forecast figure, a price, a target against the forecast, the cap | Every change caught by code |
| Correction workflow | Correct one genuine finding through Save Reviewed Version | New version, new fingerprints, checks and review rerun on it only, finding gone, nothing else changed |
| Approval safety | Repeat A4 to A8 on the new path | No delivery without a release record disposing of every material finding; one Approve click delivers once; changed file refused |

## 8. Evidence required before approving deployment

1. **Stage 2 results.** Each candidate model meets the detection, false-finding, consistency and output-reliability thresholds on the saved plans. The cheaper model is chosen if both pass.
2. **Stage 3 offline suite.** Financial mutations caught and no deterministic false holds on the five saved plans.
3. **Stage 4.** One Growth and one Starter end-to-end run in v2 Test, with the correction path and A4 to A8 passed.
4. **Your own reading of the two stage-4 notices.** Every material finding is either genuine or quick to dismiss with a reason.
5. **Measured cost per plan** within 20% of section 3.
6. **A written rollback,** with live's current version recorded and the approval workflow unchanged.
