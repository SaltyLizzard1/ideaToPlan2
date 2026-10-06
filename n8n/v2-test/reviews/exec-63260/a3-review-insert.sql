-- A3. Human review record for plan version 3 of order 9e68ffe1-bf25-4af5-af7e-47d309ba6bc4 (TEST DATA).
-- Prepared by Claude on 2026-10-06 for Liz to read, edit if she disagrees, and run herself in the Supabase SQL editor.
-- Claude has not run it and will not.
--
-- What running it means: RELEASE FOR APPROVAL. It allows an approval request to be sent to Liz for exactly this
-- text and this PDF. It is NOT approval to send. Nothing is delivered unless Liz later clicks Approve on the
-- approval email for this version.
--
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
  'The automated checks were not run on this hand-corrected text. For the version it was corrected from (version 1, execution 63260) the automated claim review did not complete for 52 claims: 40 with no verdict and 12 with verdicts the code could not use. Claude reviewed those 52 by hand and recorded the result in audit-appendix.md. I accepted that recorded manual review for this test version on 2026-10-06. It is a manual review and not completed automated verification. The offline code checks on this text leave one standing warning: five cost categories are unresolved.',
  'Release for approval only. This is not approval to send; that is my separate Approve click on the approval email for this version. I have read the PDF of version 3. Accepted as disclosed in the plan: the five unresolved cost categories, with the forecast stated to be conditional on them; the providers titled as the closest providers found, by IdeaToPlan judgment; a session price of 500 dollars as an untested scenario assumption. Text basis: corrections C1 to C8, wording P1 to P16 and my review decisions of 2026-10-06, including that any obligation required before taking payment is settled before the first sale. Test order: delivery in the test copy goes to liz@ideatoplan.to.',
  'ideatoplan2 repository, branch staging, folder n8n/v2-test/reviews/exec-63260: owner-summary.md, audit-appendix.md, tracked-changes.md, owner-decisions.md, corrected-plan-v2.md. Version 3 was saved by execution 63363.',
  null,
  'Claude'
from public.plan_versions v
where v.id = 'fd285afd-9ca3-4e6f-886b-0608ce5e83f0'
  and v.version = 3
  and v.submission_id = '9e68ffe1-bf25-4af5-af7e-47d309ba6bc4'
  and v.plan_sha256 = '22f41348e9c818964181206d734b2d2273486ab2d6c683cc1d4e9a0975a7dd22'
  and v.pdf_sha256 = '179f2b18405b7f986298d72f3d87a669c391b4aa6df9f90e1f965915e1265fcb'
  and v.status = 'changes_requested'
  and v.review_status = 'HOLD'
returning id as review_id, plan_version_id, decision, reviewer, automated_review_status,
          plan_sha256, pdf_sha256, recorded_by, created_at;
