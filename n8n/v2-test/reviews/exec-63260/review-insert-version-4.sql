-- Human review record for plan version 4 of order 9e68ffe1-bf25-4af5-af7e-47d309ba6bc4 (TEST DATA).
-- Prepared by Claude on 2026-10-06 for Liz to read, edit if she disagrees, and run herself in the Supabase SQL editor.
-- Claude has not run it and will not.
--
-- What running it means: RELEASE FOR APPROVAL. It allows an approval request to be sent to Liz for exactly this
-- text and this PDF. It is NOT approval to send. Nothing is delivered unless Liz later clicks Approve on the
-- approval email for this version.
--
-- This statement is for version 4 only. The statement for version 3 (a3-review-insert.sql) was never run and is not
-- to be used: version 3 holds an older text and a PDF with an internal banner.
-- It inserts only if the version still has the two fingerprints below and is still held. If anything about the
-- version has changed it inserts nothing and returns no row. The database then copies the automated status, the
-- automated report and both fingerprints into the record itself.
-- A record cannot be edited or deleted afterwards. A later change of mind is a new record.

insert into public.plan_reviews
  (plan_version_id, decision, reviewer, incomplete_checks_disposition, notes, record_ref, redelivery_reason, ai_prepared_by)
select
  v.id,
  'release_for_approval',
  'Liz Alfond',
  'The automated checks were not run on this hand-corrected text. For the version this text descends from (version 1, execution 63260) the automated claim review did not complete for 52 claims: 40 with no verdict and 12 with verdicts the code could not use. Claude reviewed those 52 by hand and recorded the result in audit-appendix.md. I accepted that recorded manual review for this test version on 2026-10-06. It is a manual review and not completed automated verification. The offline code checks on this text leave one standing warning: five cost categories are unresolved.',
  'Release for approval only. This is not approval to send; that is my separate Approve click on the approval email for this version. I have read the PDF of version 4, which carries no internal review status on the page. Accepted as disclosed in the plan: the five unresolved cost categories, with the forecast stated to be conditional on them; the providers titled as the closest providers found, by IdeaToPlan judgment; a session price of 500 dollars as an untested scenario assumption. Text basis: corrections C1 to C8, wording P1 to P16, my review decisions of 2026-10-06 including that any obligation required before taking payment is settled before the first sale, and the six corrections E1 to E6 listed in draft-for-version-4-changes.md. Test order: delivery in the test copy goes to liz@ideatoplan.to.',
  'ideatoplan2 repository, branch staging, folder n8n/v2-test/reviews/exec-63260: owner-summary.md, audit-appendix.md, tracked-changes.md, owner-decisions.md, draft-for-version-4.md, draft-for-version-4-changes.md. Version 4 was saved by execution 63410 with version 3 as its parent.',
  null,
  'Claude'
from public.plan_versions v
where v.id = '337ce0b5-3bd6-4ace-a283-d7ab7d8989aa'
  and v.version = 4
  and v.submission_id = '9e68ffe1-bf25-4af5-af7e-47d309ba6bc4'
  and v.plan_sha256 = '14f3c3f4074ce29cf02d5dd469161a313c5780bd9f1687dffa80e8a2c65a3fd2'
  and v.pdf_sha256 = '93923168cfd10fdc479e7c345b7ed8ded67cac52a9cacba54f658b08ccdf3ca4'
  and v.status = 'changes_requested'
  and v.review_status = 'HOLD'
returning id as review_id, plan_version_id, decision, reviewer, automated_review_status,
          plan_sha256, pdf_sha256, recorded_by, created_at;
