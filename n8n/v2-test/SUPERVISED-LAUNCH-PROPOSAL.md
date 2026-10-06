# Supervised launch: finalized preparation

Prepared 2026-10-06 by Claude. Nothing here has been built or deployed. No SQL has been run. No version, approval or delivery was created.

Accepted by Liz on 2026-10-06: every plan needs her recorded review before approval, whether the automated gate passes or holds it, and the automated result is preserved. Plan version `79d61ace-32f7-467e-b9c7-88028454d120` stays on HOLD as a test record. No version 3 yet.

## 1. What was inspected (read-only)

**`plan_versions`, from the database's own API description.** Eleven columns: `id` (uuid, generated), `submission_id` (uuid, foreign key to the order), `version` (integer), `pdf_path` (text), `status` (text, default `awaiting_approval`), `approved_at`, `sent_at`, `gmail_message_id`, `created_at` (default now), `review_status`, `review_notes`. There is no column for the plan text, the sources or any fingerprint.

**Rows, read through the workflow credential.** 26 rows across 12 orders. Statuses in use: `sent` 7, `send_failed` 6, `changes_requested` 13. None is in flight. One test order has four sent versions, so sending a later version of an order that was already delivered is an existing, intentional path.

**Indexes, from your pasted `pg_indexes` on 2026-10-05.** Primary key on `id`; unique `(submission_id, version)`; one in flight per order for `awaiting_approval`, `sending`, `send_unknown`.

**Permissions, from the earlier verified setup.** Row level security on, no policies; the workflow role has select, insert and update, no delete.

**Not visible to me.** Check constraints (including any on `status`), triggers and exact grants cannot be read without SQL. The SQL below does not touch `status`, adds no status value, and does not depend on any of them. Section 6 has an optional read-only query if you want them on record.

**Existing guards in the shared workflow `YECjOQHj4oQYVdVW`.**

- `Prepare Approval` refuses a version that is not `awaiting_approval`, and refuses review status HOLD.
- `Approved?` proceeds only on `approved === true`. A decline or a timeout sends nothing.
- `Claim` moves `awaiting_approval` to `sending` only if the row is still `awaiting_approval`, so a second click changes no row and the send branch does not run.
- `Record Sent` moves `sending` to `sent` only. A failed send goes to `send_failed` or `send_unknown` with an alert. Nothing retries.

**Existing ways to start or restart approval.** "Re-request approval" (`WEkryJD0KowZf9o6`) accepts only a timed-out version, and checks that it is the latest version with nothing else in flight. "Start approval for an inserted version" (`9PLVpEU45vAhUEk2`) accepts an `awaiting_approval` version that is not HOLD. Neither can reopen a `changes_requested` or `send_failed` version. Both are inactive. The two test workflows from the recipient test are inactive too.

## 2. Fingerprint test (zero cost, no external calls)

Workflow `KbTdENuhzuEQ1xbn`, execution 63310, 0.5 seconds, six nodes, no credentials, now archived.

- Node's `crypto` module is blocked in Code nodes on this instance ("Module 'crypto' is disallowed"), and the browser-style `crypto.subtle` is not available.
- A self-contained SHA-256 written in the Code node gave the correct value for a fixed 200,000 byte file and for a text with non-ASCII characters. Both match values computed outside n8n.
- The Crypto node gave the same file value.
- The file was re-wrapped the way `Build Customer Email` does (new file name, same content) before hashing, and was unchanged for the next node.

Decision: fingerprints are computed by the self-contained function in a Code node, because a Code node keeps the file on the item and the Crypto node is known to drop it. The same function was checked outside n8n against Node's own SHA-256 on seven sizes and on the real `v2.pdf`.

## 3. Who can create a review record, and how your identity is established

- A review record is a row in `plan_reviews`. **Only a signed-in Supabase dashboard session can insert one.** The workflow role, and the public roles, get read access only. No n8n workflow and no key that n8n or the websites hold can write the table.
- The database stamps each row with the database role that inserted it and the time. You type your name as reviewer. The row is insert-only: no update, no delete.
- The database copies the automated status, the automated notes and both fingerprints from the version into the row itself. They cannot be typed in, so a record cannot describe a different text or PDF than the one it releases.
- **An AI recommendation is not a review.** I prepare the disposition and hand you an insert statement to read. The row records that I drafted it (`ai_prepared_by`). It becomes a review only when you run it. I do not run SQL and I do not act in the Supabase dashboard; that is already your standing rule.
- Your second, separate act is the Approve click in the approval email in your own mailbox.
- The limit, stated plainly: the database knows a dashboard session inserted the row. It cannot tell you from someone else using your Supabase login. That rests on your account security. Two-factor sign-in on Supabase is worth having if it is not already on.

## 4. The PDF fingerprint and the exact bytes sent

- At creation, the pipeline hashes the PDF bytes it uploads and stores that as `pdf_sha256`.
- Before approval starts, the request-approval workflow downloads the stored file and refuses if its hash differs.
- At delivery, the check sits in the last node before `Send to Customer`, on the file item that the Gmail node attaches (`binary.data`). No node touches the file between the check and the send. A mismatch with the approved fingerprint sends nothing, sets `send_failed` and alerts you.
- What that proves: the bytes handed to Gmail are the approved bytes. What it does not prove by itself: what arrived. Acceptance test 6 therefore also downloads the attachment from the delivered message and compares its hash.

## 5. The sent-order guard

The first proposal said to refuse approval when another version of the order was already sent. That would have silently blocked revised plans, which the existing process sends on purpose. Replaced by:

- **Same version, twice:** already impossible and unchanged. A `sent` version cannot be approved or sent again. A second click changes nothing.
- **In flight:** unchanged. `sending` and `send_unknown` block any other version of the order through the unique index, with an error, until reconciled by hand.
- **A later version of an order that already has a sent version:** allowed only when the review record carries a `redelivery_reason`. Without one, the request stops with a message that names the version already sent and its date, and you get the system alert. With one, the approval email says at the top that this order already received a plan and that approving sends a revised one.
- **`send_failed`:** a version whose send verifiably did not go out can be put back for approval through the same workflow, with its existing review record. `send_unknown` cannot; it is reconciled by hand first, as now.

## 6. SQL for you to run

Three parts, in order. No existing row is rewritten: every new column is nullable with no default. Status updates by the existing workflows keep working, because the guard only restricts content columns and the approved fingerprints. It can be run before any workflow is changed; the current workflows do not write the new columns and are unaffected.

Two effects to know before running:

- `review_status` and `review_notes` become unchangeable after insert, which is what preserves the automated result. Hand notes on a version go into `plan_reviews` as a `note` from then on. The old habit of writing a resolution into `review_notes`, and the seed test that temporarily set a row to HOLD, will be refused.
- Existing rows have no fingerprints, so none of them can be released through the new path. That includes `79d61ace`, as agreed.

**Superseded on 2026-10-06.** The migration to run is the file `migrations/003_plan_versions_fingerprints_and_reviews.sql`. It differs from the first draft in two ways: it is one transaction (`begin` ... `commit`), and a fingerprinted version cannot enter `sending` or `sent` without its own approved fingerprints and a matching release record, whatever else the update changes. It was executed 58 times over in a disposable local database (`migrations/003_test.pglite.mjs`, PostgreSQL 18.3 in PGlite; production is 17). It has not been run in Supabase.

`incomplete_checks_disposition` is required on every record. When the automated run had no incomplete check, the text says so.

A review, when the time comes, is one statement that I prepare and you run:

```sql
insert into public.plan_reviews
  (plan_version_id, decision, reviewer, incomplete_checks_disposition, notes, record_ref, redelivery_reason, ai_prepared_by)
values
  ('<version id>', 'release_for_approval', 'Liz Alfond', '<your disposition>', '<notes>', '<review folder and commit>', null, 'Claude');
```

Optional, read-only, if you want the parts I could not see on record before running:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.plan_versions'::regclass;
select tgname from pg_trigger where tgrelid = 'public.plan_versions'::regclass and not tgisinternal;
select grantee, privilege_type from information_schema.role_table_grants where table_name = 'plan_versions';
```

One thing I could not test: the SQL itself. I have no database to run it against. Acceptance tests 2 to 5 exercise it, and step 2 of the checklist verifies it through the workflow role before anything is built on it.

## 7. Implementation scope

Five pieces. No new review layer and no model node anywhere in them.

1. **Pipeline, three node edits** (v2 Test first). `Prepare Version` adds the plan text, sources and both fingerprints. `Insert Plan Version` writes them with `origin = generated`. `Delivery Blocked?` no longer leads to `Start Approval`: both outcomes end in a notice to you with the PDF link and the gate result. A passing version is inserted `awaiting_approval` as today, and waits there for your review.
2. **"Save Reviewed Version", one new workflow.** Inputs: parent version id, corrected text, note. It refuses while a version of the order is in flight, renders with the existing formatting and PDF nodes using the parent's sources, fingerprints, uploads `vN.pdf`, inserts the row (`hand_corrected`, parent id, `changes_requested`, HOLD) and sends the held notice. Same shape as today's archived rendering copy.
3. **"Request approval for a reviewed version", by extending `WEkryJD0KowZf9o6`.** Input: version id. It accepts `awaiting_approval`, `changes_requested`, `approval_timeout` and `send_failed`; requires the latest version and nothing else in flight; requires a release record with matching fingerprints; downloads the PDF and checks its fingerprint; applies the sent-order rule in section 5; sets `awaiting_approval` by a conditional update; starts the shared workflow. It writes no review record. `9PLVpEU45vAhUEk2` becomes redundant and is left as it is.
4. **Shared workflow `YECjOQHj4oQYVdVW`, four edits.** `Prepare Approval` requires a release record with matching fingerprints for every version, replacing the blanket HOLD refusal. The approval email shows the automated status, your review record, any redelivery reason, the version id and short fingerprints. `Claim` writes the approved fingerprints. The fingerprint check goes into the node before `Send to Customer`, with its failure branch to `send_failed` and an alert.
5. **Repository.** Local code files and offline tests for every changed Code node, as with the rest of v2 Test.

Order of work: SQL (you), then pieces 1 to 4 in inactive workflows with read-back, then the acceptance tests.

## 8. Acceptance tests

The twelve tests stand. Four change because of what this preparation found:

- **Test 4, review record keeps the HOLD.** The record is now inserted by you in the Supabase dashboard, not by a workflow. Expect the row to show the automated status and notes copied by the database, the version still reading HOLD, and one approval email showing both.
- **Test 5, the record cannot be faked or weakened.** Was "disposition is required". Now: an insert with an empty disposition is refused; an insert through the workflow role is refused; an update or delete of a record is refused; a release for a version without fingerprints is refused.
- **Test 6, approve.** Adds: download the attachment from the delivered message and confirm its fingerprint equals the approved one.
- **Test 10, already delivered.** Was a flat refusal. Now: without a redelivery reason the request stops with a clear message and an alert; with one, the approval email states that a revised plan will be sent, and one approval sends it once.

Unchanged: 1, 2, 3, 7, 8, 9, 11, 12.

## 9. Go-live checklist

1. You run the SQL in section 6.
2. I verify through the workflow role, read-only plus the refusals in tests 2 and 5, that it behaves as written.
3. Build pieces 1 to 4 in inactive workflows only. Read back each one against the repository.
4. Run acceptance tests 1 to 11. Test 12 is one paid generation and needs your separate authorisation.
5. Complete the open items in `GO-LIVE-CHECKLIST.md`: remove the TEST DATA note, set `Send to Customer` to the customer address, decide the confirmation email, rotate the webhook secret and re-pin without it, one real HTTP call to the webhook, publish the shared workflow.
6. Push the local commits, then activate production with your explicit go-ahead.
7. First real orders: I prepare the review record text and any corrected version; you run the insert and click Approve. Nothing is sent otherwise.

## 10. Observed, not predicted

- Both generations since the claim review was added held (63257, 63260). Two earlier ones reached `awaiting_approval` (63211, 63217).
- One claim-review response in 26 was unreadable.
- How often future plans will hold is not known. Nothing above depends on it.

## 11. Compatibility checks and the query to run after the migration (added 2026-10-06)

Checked read-only before recommending the SQL:

- No workflow updates `review_status` or `review_notes`. All 21 workflows that could touch `plan_versions` were read in full: every update writes only `status`, `approved_at`, `sent_at` or `gmail_message_id`. The two review columns are written at insert only. Neither site's code refers to `plan_versions`.
- The credentials that could reach the table are the n8n `Supabase account` credential and the two sites' server keys, which carry the `service_role` claim, and the public key, which is `anon`. n8n holds no Postgres connection credential. Through the API a request can only act as a role granted to `authenticator`.

After running the migration, read-only:

```sql
-- 1. Existing rows untouched: the total is unchanged and every new column is empty.
select count(*) as total_rows, count(plan_text) as with_text, count(plan_sha256) as with_plan_hash,
       count(pdf_sha256) as with_pdf_hash, count(origin) as with_origin, count(parent_version_id) as with_parent,
       count(approved_plan_sha256) as with_approved_hash, max(created_at) as newest_row
from public.plan_versions;

-- 2. Statuses unchanged. Expected on 2026-10-06: changes_requested/HOLD 12, changes_requested/TEST DATA 1,
--    send_failed/TEST DATA 5, send_failed/null 1, sent/REVIEW 2, sent/TEST DATA 5.
select status, review_status, count(*) from public.plan_versions group by 1, 2 order by 1, 2;

-- 3. Both guards are installed and enabled (tgenabled = 'O').
select tgrelid::regclass as on_table, tgname, tgenabled from pg_trigger
where tgrelid in ('public.plan_versions'::regclass, 'public.plan_reviews'::regclass) and not tgisinternal;

-- 4. What each API role may do to review records. Expected: service_role can select only; every other role nothing.
select r.rolname,
       has_table_privilege(r.oid, 'public.plan_reviews', 'SELECT') as can_select,
       has_table_privilege(r.oid, 'public.plan_reviews', 'INSERT') as can_insert,
       has_table_privilege(r.oid, 'public.plan_reviews', 'UPDATE') as can_update,
       has_table_privilege(r.oid, 'public.plan_reviews', 'DELETE') as can_delete,
       has_table_privilege(r.oid, 'public.plan_reviews', 'TRUNCATE') as can_truncate
from pg_roles r
where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
   or r.oid in (select roleid from pg_auth_members where member = 'authenticator'::regrole)
order by 1;

-- 5. Row level security is on, with no policies, and the table is empty.
select relrowsecurity as rls_on,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'plan_reviews') as policies,
       (select count(*) from public.plan_reviews) as review_rows
from pg_class where oid = 'public.plan_reviews'::regclass;
```

## 12. Built on 2026-10-06 (inactive test copies; the live shared workflow and v2 Test are untouched)

Migration 003 was run by Liz and verified from outside the SQL editor: 19 columns on `plan_versions`, `plan_reviews` present, all 26 existing rows unchanged, the public key refused. The two triggers and the refusal of writes by the workflow key cannot be seen read-only; acceptance tests 2 and 5 exercise them.

Code: `supervised/src/nodes.mjs` is the source of every Code node, `supervised/build.mjs` writes the node files in `supervised/nodes/` and builds the workflow files. Tests: `tests/supervised.test.mjs` (9 groups, offline) and `migrations/003_test.pglite.mjs` (58 checks in a disposable local database).

| Workflow in n8n (all inactive) | ID | What it is |
|---|---|---|
| SUPERVISED TEST COPY - Plan Approval and Delivery | `AwxkcbnQK5ChbSOA` | The shared workflow with the four agreed edits. 27 nodes. Every email node sends to liz@ideatoplan.to. |
| SUPERVISED TEST - Request approval for a reviewed version | `dcgzn5fcOyrIRz5u` | Checks everything, verifies the stored PDF, reopens, starts the copy above. 14 nodes. Writes no review record. |
| SUPERVISED TEST - Save Reviewed Version | `GQC5guFRViQrX0vJ` | Saves a corrected text as the next version, on HOLD. 19 nodes, no model, approval or customer node. Its input node holds placeholders. |
| TEST - supervised code nodes | `ZlKu3tFbkccZnGDC` | Engine test, no credentials. Run once (execution 63328), archived. |

How each requirement is met:

- **Corrected text as a new version, no model calls.** `build.mjs save <export> <out> <parent id> <text file> <note>` writes the workflow with the text built in; it is imported, run once and archived. It refuses a parent that is not the latest version, an order with a version in flight, and a text that cites a source the parent does not have. The version is always HOLD and carries the parent's automated report unchanged.
- **Recorded review before approval.** `Prepare Approval` refuses any version, held or passing, without a `release_for_approval` record whose fingerprints equal the version's. The database refuses the claim as well.
- **Approval and delivery bound to the exact version and PDF.** `Claim` writes the approved fingerprints; the stored PDF is fingerprinted before approval is requested; `Verify Attachment` fingerprints the file on the item the Gmail node attaches, and a mismatch goes down the existing send-error path as `send_failed` with an alert.
- **Automated findings preserved, revised delivery on purpose.** The approval email shows the automated status and report unchanged beside the review. An order that already has a sent version needs a `redelivery_reason` on the review record; without one the request stops with a message, with one the email announces a revised plan.
- **Reused unchanged:** the approve / request changes email and its 48 hour limit, the conditional claim, the one-in-flight index, `Record Sent`, `Mark Delivered`, the send-error classification, the "sent but not recorded" alert, the timeout path.

Not done, by instruction or because it needs a write: nothing was run against the database or the mailbox; the pipeline edits (`Fingerprint PDF` after `Generate PDF`, the new `Prepare Version`, six more fields on `Insert Plan Version`, both gate outcomes ending in a notice) exist as code and tests only and are not in v2 Test; the code of the request workflow was checked by structure, not compared byte for byte after import.

Unverified until the acceptance tests: that the Supabase node writes `sources_cited` as a JSON array and the plan text byte for byte (the database refuses the insert if the text and its fingerprint disagree); how the editor-imported copies behave when started as a sub-workflow.
