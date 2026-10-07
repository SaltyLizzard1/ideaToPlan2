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

## Acceptance test A3, refusal tests and preparation, 2026-10-06 (authorised by Liz)

Two writes were attempted once through n8n's own `Supabase account` credential, in workflow `DCBtwrCdKV0PmWnh` (3 nodes, archived), execution 63371:

- Insert of a review record for version 3 (as a `note`, so that an unexpected success could not release anything): refused by the database with "permission denied for table plan_reviews".
- Update of version 3's `review_notes`: refused by the database guard with "The content and the automated review of a plan version cannot be changed. Create a new version."

Afterwards the complete version 3 row is byte-identical to the copy taken before, and `plan_reviews` is still empty.

Prepared, not run: `a3-review-insert.sql`, the review record for Liz to read and run herself. It is a release for approval, not approval to send. It inserts only if version 3 still has its two fingerprints and is still held. It was run against a local copy of the real row in the disposable test database: one row inserted, automated status and report copied unchanged, the version still HOLD and unapproved, a second run refused, and nothing inserted when the stored fingerprint differs.

Carried forward from A2: a refusal inside a workflow that is started by hand does not raise the System Alert. The alert is to be observed when the approval copy refuses a version while running as a sub-workflow; that is added to the remaining tests.

## Presentation rule and version 4, 2026-10-06 (instructed by Liz)

**Rule.** The PDF is the customer's copy. It is rendered without internal review-status wording, before the owner reviews it, and those exact bytes are fingerprinted. HOLD stays in the database row and in the owner notice. Delivery stays blocked until the recorded review and the separate Approve click. Nothing about the approval safeguards changed.

- Code: `format-plan-html.js` no longer prints the "Hold - not for delivery" box; a test asserts that a HOLD plan prints no review status. `supervised/build.mjs` builds the save workflow with the repository's formatter and refuses to build if the formatter prints review status.
- Not changed: v2 Test still holds the older formatter (the pipeline edits are not deployed), and the stored PDFs of versions 1 to 3 still carry the box.

**Version 4.** Before the run: versions 1 to 3 only, no review record, no `v4.pdf`.

- Workflow `hKfRkX3TE7blqYEj` (19 nodes, no model, approval or customer node), run once and archived. Execution 63410, success, 6 seconds, no model call.
- Created: plan version 4, `337ce0b5-3bd6-4ace-a283-d7ab7d8989aa`, order `9e68ffe1-bf25-4af5-af7e-47d309ba6bc4`, changes_requested, HOLD, hand_corrected, parent version 3 (`fd285afd-9ca3-4e6f-886b-0608ce5e83f0`), not approved, not sent. PDF `9e68ffe1-bf25-4af5-af7e-47d309ba6bc4/v4.pdf`, 32 pages.
- One held notice to liz@ideatoplan.to (message `1a110f58f75e0660`).
- Verified by reading back: stored text identical to `draft-for-version-4.md` (fingerprint `14f3c3f4...`); sources stored as an array of 7, taken from version 3; PDF fingerprint (`93923168...`) equals an independent SHA-256 of the stored file; version 3's notes carried unchanged; the version 3 row and the PDFs of versions 1, 2 and 3 unchanged; `plan_reviews` still empty.
- Visual review by Claude, all 32 pages: no review-status box on page 1 or anywhere; the six corrections E1 to E6 are in the rendered text; no clipping, overlap, split table row or stranded heading. Cosmetic only: the source list runs onto a last page that is otherwise empty.

**Review statement.** `review-insert-version-4.sql`, prepared for Liz, not run. It names version 4's ID and fingerprints. Run against a local copy of the real row: one row inserted, version still HOLD and unapproved, second run refused, nothing inserted when the fingerprint differs. The version 3 statement `a3-review-insert.sql` was never run and is not to be used.

## A4: reviewed version approved and delivered (2026-10-06)

**Review record.** Liz ran `review-insert-version-4.sql` herself. Record `d6294274-de89-4888-b340-2fe10965c021`, release_for_approval, reviewer Liz Alfond, recorded_by postgres, 2026-10-06 11:38:38 UTC. Read back: fingerprints equal version 4's, automated status HOLD and notes copied unchanged, one record in `plan_reviews`.

**Request.** Workflow `dcgzn5fcOyrIRz5u`, run once by Claude. Execution 63418, success. The check found the release record, the stored PDF was re-read and its fingerprint matched (`93923168...`), version 4 moved to awaiting_approval. The version ID placeholder was restored afterwards.

**Approval and delivery.** Approval copy `AwxkcbnQK5ChbSOA`, execution 63419 (started as a sub-workflow). One approval email to liz@ideatoplan.to with an "Open PDF" link (the approval email carries a link, not an attachment). Liz clicked Approve once at 11:47:40 UTC.

- Claim wrote approved_at and both approved fingerprints; they equal the version's own (`14f3c3f4...`, `93923168...`).
- The PDF was downloaded again and the attachment bytes fingerprinted before sending: `93923168...`, 180,906 bytes, attachment_ok true.
- One delivery email, Gmail message `1a1110a7d0fc86af`. The send node's recipient is fixed to liz@ideatoplan.to in the test copy.
- Version 4: sent, sent_at 11:47:42 UTC, review_status still HOLD (the automated result is preserved). Order: delivered, 11:47:43 UTC.
- Versions 1 to 3 unchanged. `plan_reviews` still one record. No System Alert execution.

Result: A4 passed. Not checked by Claude: the two emails as they appear in the inbox.

## A5: second Approve click (2026-10-06)

Liz clicked Approve a second time on the same approval email. Read back afterwards: no new execution of the approval copy or the request workflow (63419 remains the only one), no System Alert execution, version 4 unchanged (sent, same approved_at, sent_at and Gmail message `1a1110a7d0fc86af`), order unchanged (delivered, same delivered_at), versions 1 to 3 unchanged, `plan_reviews` still one record.

Result: A5 passed. Nothing was sent and no row changed. Not checked by Claude: what the browser showed Liz on the second click.

## A6 step 1: version 5 saved (2026-10-06)

Authorized by Liz as step 1 only. Before the run: versions 1 to 4, version 4 sent, order delivered, one review record.

- Workflow `VZ59ZBoFaCloASDV` (19 nodes, no model, approval or customer node; the version 4 save workflow with the parent changed to version 4 and a new note), run once and archived. Execution 63429, success, 6 seconds, no model call.
- Created: plan version 5, `2994d4df-873b-4e1c-898f-d7700e760a1f`, changes_requested, HOLD, hand_corrected, parent version 4 (`337ce0b5-3bd6-4ace-a283-d7ab7d8989aa`), not approved, not sent. PDF `9e68ffe1-bf25-4af5-af7e-47d309ba6bc4/v5.pdf`.
- One held notice to liz@ideatoplan.to (the notice node succeeded; its recipient is fixed).
- Read back: stored text identical to `draft-for-version-4.md`, so the plan fingerprint equals version 4's (`14f3c3f4...`). PDF fingerprint `aa6020fa...`, equal to an independent SHA-256 of the stored file, 180,906 bytes. It differs from version 4's PDF fingerprint although the text is the same, so each render is its own file and needs its own review. Sources: 7. Version 4 and the order unchanged. `plan_reviews` still one record.

**One release record per version.** The local test of migration 003 (58 checks, PostgreSQL 18.3 in PGlite, rerun today) confirms a second release record for the same version is refused by `plan_reviews_one_release`, and records cannot be edited. So version 5 can carry the release without a redelivery reason (refusal test) or the one with a reason (successful revised delivery), not both. The guard is not changed. Sequence: release version 5 without a reason, request, expect the stop message; request changes is not needed because the refusal happens before the version is reopened; then save version 6 from version 5, release it with a reason, request, approve.

## A6: revised delivery (2026-10-07)

Authorized by Liz in her completion instruction of 2026-10-07, including running the two test release records through her signed-in Supabase dashboard and one test Approve click, both done by Claude in Chrome.

**Refusal without a reason (version 5).** `review-insert-version-5-refusal-test.sql` run as written: record `0743d695-aaf7-47c7-af55-4777b9500d93`, no redelivery reason, recorded_by postgres. Request workflow execution 63504 stopped at Check Version: "This order already received version 4 (sent 2026-10-06T11:47:42.749+00:00). Approving version 5 would deliver a revised plan, and its review record gives no redelivery reason. No approval email sent." Version 5 unchanged (changes_requested, unapproved, unsent). No approval copy execution. The run was started in the editor, so no System Alert fires for it (see A7).

**Version 6.** Save workflow `rXMgCoh5QTHbYwIP`, execution 63505, archived. Version 6 `7d3302ec-a6ec-40ad-9313-4bd284dfa1c5`, parent version 5, HOLD, hand_corrected. Text identical to `draft-for-version-4.md` (`14f3c3f4...`). PDF `96c48bf6...`, equal to an independent SHA-256 of the stored file, 180,906 bytes. All 32 pages rendered: every page image is identical to the same page of the version 4 PDF. One held notice.

**Release with a reason.** `review-insert-version-6-revised-delivery-test.sql` (entered text hash-checked against the file before running): record `1fbc55ef-dff3-42f9-ac84-e4fc83e5c64d`, redelivery_reason "Acceptance test A6: intentional revised delivery to the owner only." The record states that Liz reviewed version 4 and that version 6 was inspected by Claude, not read by Liz.

**Approval and delivery.** Request execution 63508, approval copy execution 63509. Approval email subject ends "REVISED PLAN" and states the earlier delivery and the recorded reason. Approve clicked once by Claude at 05:03:10 UTC. Claim wrote approved fingerprints equal to the version's. Attachment fingerprinted before sending: `96c48bf6...`, match. One delivery, Gmail message `1a114be87a9a7144`, to liz@ideatoplan.to. The attachment was then fetched from the delivered message in the mailbox and hashed: `96c48bf656ca21c12981398e52c11d2410750b625e6f8d668fff5fb61f604b6b`, 180,906 bytes, equal to the approved fingerprint. Version 6: sent. Order: delivered 05:03:13 UTC. Version 4 and version 5 unchanged.

Result: A6 passed.

## A7 and A8: refusal paths (2026-10-07)

Authorized by Liz in her completion instruction of 2026-10-07. All on version 7, which exists only for these tests.

**Version 7.** Save workflow `0mzNssECPudIIwl3`, archived. Version 7 `bc2a1a84-750d-4d5e-b2ef-79940e1e9673`, parent version 6, HOLD, hand_corrected, text identical to `draft-for-version-4.md`, PDF `ba6bea6d...` equal to an independent SHA-256 of the stored file. Release record `review-insert-version-7-refusal-paths-test.sql`, entered through the dashboard after a hash check of the entered text; it states that Liz has not read the version 7 PDF and that no delivery is intended.

**A7, changed file.** Variant approval copy `BYOz3Z9Ig9zpsSzl`: identical to the test copy except that Download PDF reads `v5.pdf`, a different stored file. No stored PDF was written or overwritten. Request execution 63518, variant execution 63519. Approve clicked once by Claude. Claim wrote the approved fingerprints; the attachment check found a different fingerprint; Send to Customer did not run; version 7 recorded send_failed; one send-error alert to liz@ideatoplan.to (Gmail `1a114c40fccdf857`). No delivery, order unchanged.

**A7, system alert.** Temporary caller `V65Mhtl9rOpnYTCe` started the test copy as a sub-workflow for version 2, which has no fingerprints and is not awaiting approval. Execution 63533 refused: "Plan version 79d61ace-32f7-467e-b9c7-88028454d120 is changes_requested, expected awaiting_approval. No approval email sent." Exactly one System Alert execution followed (63534). Version 2 unchanged. This closes the item carried forward from A2.

**A8, request changes.** Request execution 63524 (accepted from send_failed), test copy execution 63525. "Request changes" clicked once by Claude. Version 7 recorded changes_requested. Nothing sent.

**A8, timeout.** Request with approval_wait_minutes 2, test copy execution 63529, no click. After two minutes version 7 recorded approval_timeout and the timeout alert node ran. Nothing sent.

After all tests: versions 4 and 6 sent, version 7 approval_timeout, all others changes_requested; order delivered at the version 6 time; four review records. The request workflow `dcgzn5fcOyrIRz5u` was restored (placeholder ID, test copy as target, no wait override). Both temporary copies archived.

Result: A7 and A8 passed. Acceptance tests A1 to A8 are complete.

## Pipeline integration into v2 Test (2026-10-07)

Authorized by Liz in her completion instruction of 2026-10-07. v2 Test `mLyKvFeYmJHuwXQ9` stays inactive. Backups without pinned data: `supervised/backups/v2-test.mLyKvFeYmJHuwXQ9.before-supervised.json` and `.after-supervised.json`.

Changes, 61 to 63 nodes:

- `Format Plan as HTML`: the repository formatter. The PDF prints no internal review status.
- `Fingerprint PDF` added between `Generate PDF` and `Resolve Submission`.
- `Prepare Version`: adds the plan text, the sources array, both fingerprints and origin `generated`.
- `Insert Plan Version`: five more fields (plan_text, sources_cited, plan_sha256, pdf_sha256, origin).
- `Start Approval` removed. `Delivery Blocked?` now ends in a notice either way: held goes to `Held Notice` as before, passed goes to the new `Create Review Link` and `Review Notice` (to liz@ideatoplan.to), which says the plan passed, was not sent for approval, and needs a recorded review and a separate approval. No node in v2 Test can start an approval or reach a customer.

Read back from the server: the three code nodes are identical to the repository files; `Finalize Plan` and `Delivery Gate` are unchanged, so automated findings are produced and stored as before; no other node differs from the backup; the pinned webhook data is still present.

**Not done: the final integration generation and the production cutover.** While verifying, Claude sent one request to n8n's internal interface from the signed-in Chrome tab with a wrong session header. n8n answered 401 and ended the Chrome session. Claude does not enter passwords, and an inactive workflow can only be started from the editor, so the one authorized generation could not be started. The cutover depends on it and was not begun. Rollback backups of the live pipeline `Wn6ATzrXmDvKMwJk` and the shared workflow `YECjOQHj4oQYVdVW` were taken read-only and are in `supervised/backups/`. Neither production workflow was changed.

## Final integration generation and production cutover (2026-10-07)

Authorized by Liz in her completion instructions of 2026-10-07. She signed in to n8n again herself.

**Integration generation.** One run of inactive v2 Test from the editor, pinned TEST DATA order, $500 test baseline. Execution 63547, success, 11 minutes, measured model cost $2.0591 (30 calls; Brave Search and PDF rendering are not metered in the response). No rerun.

- Order `d53c1158-25d6-4d61-862e-ea1083c415fa`, labelled TEST DATA in its notes, status generated, not delivered.
- Plan version 1, `5dc66d48-8282-4eaf-a669-413d7afe3fd1`: origin generated, changes_requested, HOLD, not approved, not sent.
- Stored text 71,028 characters; its SHA-256 computed independently equals the stored `plan_sha256` (`741d0a9a...`). Stored PDF 200,595 bytes; an independent SHA-256 of the stored file equals `pdf_sha256` (`c7858413...`) and the value `Fingerprint PDF` produced in the run. Sources stored as an array of 10.
- Automated result preserved: 43 confirmed blocking findings and 1 required check that did not complete, written to the row and the notice unchanged.
- One held notice to liz@ideatoplan.to (Gmail `1a11521d6442bf7d`). No approval request, no customer email. The PDF's first pages carry no review status.
- No review record was written for this version and it was not approved. `plan_reviews` still holds four records.

**Exposed key.** The OpenRouter key typed into the `HTTP Request` node of inactive workflow `VHx0a1Fid4Zmjw5D` was replaced by a note and read back: no key pattern remains in that workflow. The key itself was not read out or printed. It is still in that workflow's version history, so it has to be revoked at OpenRouter. Claude does not create or enter keys; that step is Liz's.

**Cutover.** Built by `supervised/build-production.mjs` into `supervised/production/`, imported through the editor, settings set by API.

| Workflow | ID | State |
|---|---|---|
| IdeaToPlan - Full Pipeline v2 (supervised) | `tZ8blRPhX7UiDxFo` | Published. 62 nodes. Webhook path `idea-submission-v2`. |
| IdeaToPlan - Plan Approval and Delivery (supervised) | `7MAQia1N6jV4bNnc` | Published. 27 nodes. |
| IdeaToPlan - Request approval for a reviewed version (run by hand) | `XIGjvSnypPRpZ4gb` | Manual, starts `7MAQia1N6jV4bNnc`. |
| IdeaToPlan - Save Reviewed Version (run by hand) | `GpObSW2KKZ2S3Vxk` | Manual template, placeholder input, current formatter. |
| IdeaToPlan - Full Pipeline (Rebuilt), the old pipeline | `Wn6ATzrXmDvKMwJk` | Unpublished, unchanged. Rollback target. |

- The pipeline is v2 Test as verified, minus the `Test Financial Baseline` node, the TEST DATA note and the pinned data, with `confirmation_to_client` enabled to the address on the order and the production webhook path. Read back against the built file: every node, credential and connection matches; the only differences are default values the editor drops on import. The test baseline cannot apply: `Founder Context` uses it only under v2 Test's workflow ID.
- The approval workflow is the tested copy with one change: `Send to Customer` goes to the email address on the order. The review-record requirement, the conditional claim, the attachment fingerprint check, send recording and the error paths are the tested ones.
- The pipeline has no node that starts an approval. Every plan, passed or held, ends in a notice to Liz. Delivery needs a release record entered in the database, a run of the request workflow, and the Approve click.
- Check after publishing: the path answers "not registered for GET requests. Did you mean to make a POST request?", which is n8n's reply for a registered POST path; an unknown path answers "is not registered". No POST was sent, so no generation ran and no customer plan was sent.

**Rollback.** Unpublish `tZ8blRPhX7UiDxFo`, publish `Wn6ATzrXmDvKMwJk`. Files: `supervised/backups/`.

**Not verified.** A real HTTP order through the published pipeline (it would be a second paid generation, not authorized). A run without the test baseline since the financial policy changes. The published pipeline has only run as v2 Test from pinned data.

**Left as they are.** The old shared workflow `YECjOQHj4oQYVdVW` (inactive, nothing calls it). v2 Test (inactive; its pinned data still holds the webhook secret). The old save template `GQC5guFRViQrX0vJ` (archiving it did not take). The System Alert adds its delivery-specific advice only for workflow ID `YECjOQHj4oQYVdVW`, so an alert from `7MAQia1N6jV4bNnc` carries the general text.

## Owner test through the staging website (2026-10-07)

Authorized by Liz: exactly one owner test, no card charge, no rerun, no review record, no approval.

- Liz paid once in Stripe test mode on the staging preview (`idea-to-plan2-git-staging-saltylizzard1s-projects.vercel.app`): test session, paid, 5000 (Growth), not live. The site removes the session ID from the address once the form opens, so Claude read the latest test session from Stripe's test API with the project's test key and opened the form with it.
- Claude filled the form with the intake answers of the earlier test order (revenue model left blank, as stored) and submitted once. The site answered "Payment received and idea submitted." Session redeemed at 09:15:54 UTC.
- Published pipeline `tZ8blRPhX7UiDxFo`, execution 63572, started by the webhook at 09:15:55 UTC, success, 12 minutes 24 seconds, measured model cost $2.0173 (28 calls; models Sonnet 4.6, Haiku 4.5 and Perplexity Sonar, unchanged).
- No fixed test baseline: `Founder Context` shows no fixed price and no fixed assumptions, and the plan uses a launch price of $297, not $500.
- Order `fc3ad60d-dcab-4e3a-b9ca-6f46cd902e59`, Growth, no TEST DATA note, status generated, not delivered. Plan version 1, `71750fa4-02b4-4dc8-aba4-de59ee276738`: generated, changes_requested, HOLD, not approved, not sent. Stored text 70,445 characters and stored PDF 177,996 bytes both match independent SHA-256 hashes. Sources stored as an array of 9.
- Emails: the customer confirmation to the address on the form (Gmail `1a115aba55327c1e`), one held notice to liz@ideatoplan.to (Gmail `1a115b1394d62365`), and the site's own "New plan submission" alert (execution 63573). No approval request, no delivery.
- OpenRouter: the new key `n8n-2026-10 (plan, email, quiz)` went from never used to used during the run. The old key `Ideatoplan` did not move.
- No review record was written (still four) and nothing was approved.

**What this verifies.** Runtime: the staging site, its webhook URL and secret, the published pipeline started by a real HTTP order, the pipeline without the test baseline, and the new OpenRouter key. Configuration only: production routing from `ideatoplan.to`. Production has its own Stripe key and environment values; they were not exercised. Both repositories point at `/webhook/idea-submission-v2`, which is registered to `tZ8blRPhX7UiDxFo`.

**Old OpenRouter keys.** A read-only scan of all 54 workflows found no active workflow on an old key. One inactive workflow, `aBpk1zMORyuDuRTU` (Full Pipeline OLD), uses `Bearer Auth account 2`, which was not rotated. No plaintext key remains in any node.

**Webhook credential.** `Header Auth account 2` is attached to five webhook nodes and nothing else: `idea-submission-v2`, `quiz-match-v2` (POST), `quiz-ranking-v1`, `quiz-detail-v1`, `site-alert-v1`. `N8N_WEBHOOK_SECRET` is set in the Vercel projects `idea-to-plan2` and `qylat-next`; `idea-to-plan` has no variables and `qylat-analytics` has none of these.
