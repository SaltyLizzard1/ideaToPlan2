# Execution 63260: owner review decisions

These are review decisions. They are not approval of the plan. Version 1 stays on HOLD (changes_requested) with its gate result unchanged: 38 confirmed blocking findings and 1 required check that did not complete.

## Decisions by Liz, 2026-10-06

1. **Proposed wording P1 to P16: adopted as proposed.**
2. **The 52 claims without a usable automated verdict (40 unanswered, 12 unusable): the recorded manual review by Claude is accepted for this test version.** It is a manual review. It is not completed automated verification, and the automated claim review has not been run on the corrected text.
3. **Unresolved costs: the disclosure is retained and the forecast is stated to be conditional** where the forecast is presented (D3), as well as in the Viability Assessment.
4. **Competitor tables retitled "Closest providers found",** with the related sentences and row labels changed to match (D1a to D1e). The count sentence says that "closest" is an IdeaToPlan judgment among the five reviewed, because the code check holds an unexplained ranking of providers.
5. **Accountant wording: nothing that is required before taking payment may wait for the $300 consultation** (D2a to D2e). Action 2 must be complete before the first payment. The consultation after the first sale covers ongoing tax and reporting only.

The text carrying all of this is `corrected-plan-v2.md`. Every replacement is in `tracked-changes.md`.

## Checks on corrected-plan-v2.md

- Offline code checks (automated, no model): one finding, the standing FINANCIAL MODEL warning about unresolved costs. No blocking code finding.
- Claim review (model step): not run.
- PDF: not rendered. See below.

## Rendering attempt of 2026-10-06: failed, stopped, nothing written

The plan was to pin four nodes in v2 Test (Finalize Plan, Prepare Client Data, Log to Supabase, Update Supabase Status) and run the Held Notice step, so that only the rendering nodes would run.

That did not hold. In this n8n version a pinned node in the middle of the workflow does not stop the nodes before it from running. The run started at the first node after the pinned Webhook and ran the research stage. Claude stopped it after 38 seconds.

Execution 63276 (canceled):

- Ran: Respond to Webhook, the prompt and context nodes, Distill Search Query, Brave Search, Growth Research, Market Research, Collect Evidence, Fetch Source Pages, Verify Claims (13 requests), and the start of the recheck step.
- Metered cost: $0.1120 (Verify Claims $0.0964, research $0.0151, query $0.0005). These calls were not authorised.
- Did not run: the writer, QA, revision, claim review, any database write, any upload, any email, Start Approval.
- No submission row, no version row and no PDF were created. Version 1 and its PDF are unchanged.
- The pins were never saved. The saved workflow was read back afterwards: inactive, only the Webhook pinned, Start Approval and both email nodes disabled, all 20 tracked code nodes identical to the repository.

Claude's statement before the run that the path could not invoke models was wrong. It was based on the connections between nodes, not on how this n8n version chooses where a partial run starts.

No version 2 row and no v2.pdf exist.

## Rendering of version 2, 2026-10-06 (authorised by Liz as a single exception)

Liz authorised one temporary, inactive, rendering-only copy for one attempt. This prepares the corrected version. It is not approval.

- Copy: workflow `kAhISi8tjL76eOqR`, "IdeaToPlan - RENDER ONLY 63260 v2 (temporary, inactive, no models)", built by `build-render-copy.mjs`. 18 nodes: a manual trigger, four fixed-input code nodes (client data, submission id, the one standing warning, the reviewed text), two guard code nodes, and 11 nodes copied unchanged from v2 Test (Format Plan as HTML, Generate PDF, Resolve Submission, List Plan Versions, Prepare Version, Upload Plan PDF, Delivery Gate, Insert Plan Version, Delivery Blocked?, Create Held Link, Held Notice). No model, research, approval, customer-confirmation or customer-delivery node, and no subworkflow call. The "not blocked" branch leads nowhere.
- Read back before the run: nodes and connections matched the built file. Two parameters differed only by default values that n8n drops on import.
- Execution 63295: one run, 3.9 seconds, success. All 18 nodes ran once. No model was called. Cost: none metered (one PDF render request to the existing PDF service, which this workflow calls without an account key).
- Before the run the submission had one version: version 1, `70558b86-caf9-49cc-a84f-9b6d8d7353fe`, changes_requested, HOLD, not approved, not sent.
- Created: plan version 2, `79d61ace-32f7-467e-b9c7-88028454d120`, submission `9e68ffe1-bf25-4af5-af7e-47d309ba6bc4`, status changes_requested, review status HOLD, not approved, not sent, PDF `9e68ffe1-bf25-4af5-af7e-47d309ba6bc4/v2.pdf` (31 pages).
- One held notice to liz@ideatoplan.to (message `1a1104a015cc69df`). No other email.
- Version 1: its row was read, not written. Its stored PDF was downloaded again after the run and is byte-identical to the copy saved from execution 63260.
- The submission row was not written: the copy has no node that updates it.
- Afterwards: the copy is archived and inactive. v2 Test was read back: inactive, only the Webhook pinned, Start Approval and both email nodes disabled, 20 of 20 tracked code nodes identical to the repository.

Visual review of v2.pdf, all 31 pages, by Claude: no clipping, overlap, split table row or stranded heading; cover subtitle readable; no printed separators or rule numbers; all corrections and decisions visible in the rendered text. Minor, in the backlog: a "Year one" total row alone at the top of page 13, and the first two rows of the Assumption 4 table alone at the foot of page 20.

## Cost history for this review

| Execution | What | Metered cost | Authorised |
|---|---|---|---|
| 63260 | Acceptance generation, version 1 | $1.7626 | Yes |
| 63276 | Failed pinned rendering attempt in v2 Test, stopped after 38 s | $0.1120 | No |
| 63295 | Rendering-only copy, version 2 | $0 metered | Yes |

## Acceptance test A1, 2026-10-06: corrected text saved as version 3 (authorised by Liz)

Before the run there was no execution of the save workflow, no version 3 row and no `v3.pdf`.

- Workflow `mZrr18dSBQJk3mzu` "SUPERVISED TEST - Save Reviewed Version A1", built by `supervised/build.mjs save` with the text of `corrected-plan-v2.md`, parent version 2 and the seven sources of execution 63260 (the parent stores none). 19 nodes, no model, approval or customer node. Run once, then archived.
- Execution 63363: success, 6 seconds, no model call, no metered cost.
- Created: plan version 3, `fd285afd-9ca3-4e6f-886b-0608ce5e83f0`, order `9e68ffe1-bf25-4af5-af7e-47d309ba6bc4`, status changes_requested, review status HOLD, origin hand_corrected, parent `79d61ace-32f7-467e-b9c7-88028454d120`, not approved, not sent. PDF `9e68ffe1-bf25-4af5-af7e-47d309ba6bc4/v3.pdf`, 31 pages.
- One held notice to liz@ideatoplan.to (message `1a110aba36438c92`). No other email.

Verified afterwards, by reading the row and the stored files:

- The stored text is identical to `corrected-plan-v2.md`, and `plan_sha256` equals an independently computed SHA-256 of it (`22f41348...`).
- `sources_cited` is stored as a JSON array of 7 entries (S6, S13, S4, S15, W1, S11, W3).
- `pdf_sha256` (`179f2b18...`) equals an independently computed SHA-256 of the stored `v3.pdf`.
- The automated report of version 2 is carried unchanged at the end of the review notes, under the hand-corrected header.
- Versions 1 and 2: rows unchanged (status, review status, creation time, no text, not approved, not sent); both stored PDFs are byte-identical to the copies saved earlier.

Two things this settles that were unverified before: the Supabase node writes the source list as an array and the plan text byte for byte. The database's insert check on the text fingerprint passed.

## Acceptance test A2, 2026-10-06: approval requested with no review record (authorised by Liz)

- Before: the request workflow `dcgzn5fcOyrIRz5u` was read back and its three Code nodes were identical to the repository; `Start Approval` pointed at the test copy `AwxkcbnQK5ChbSOA`; no row in `plan_reviews` existed for version 3 (the table was empty).
- Execution 63370, one run, 1.6 seconds, ended in an error as intended. Path: Run Once, Plan Version ID, Load Version, Load Submission, Load All Versions (3 rows), Load Review (no record), Check Version, which stopped with: "Plan version fd285afd-9ca3-4e6f-886b-0608ce5e83f0 has no human release record (automated status HOLD). Every version needs a recorded review before approval. No approval email sent."
- Did not run: Download Stored PDF, Verify Stored PDF, Reopen, Start Approval. The approval copy has no execution at all.
- Emails: none. No node that sends mail ran in any workflow. The System Alert workflow did not run either (its last execution is 63240 on 2026-10-05): n8n does not start the error workflow for a run started by hand in the editor. The mailbox itself was not opened.
- After: the version 3 row is identical to the copy taken before the run (changes_requested, HOLD, no approved time or fingerprints, not sent). `plan_reviews` is still empty. No version of the order is in flight.
- The version ID placed in the test copy for the run was removed again; the copy holds its placeholder and is inactive.

A1's open visual check, closed: all 31 pages of the stored `v3.pdf` were rendered to images. Every page image is byte-identical to the corresponding image of `v2.pdf`, which was inspected page by page on 2026-10-06, and pages 1-2, 23-24 and 31 of v3 were looked at directly. The two PDF files differ only outside the page content (same size, different fingerprint).
