-- A6 refusal test. Release record for plan version 5 of order 9e68ffe1-bf25-4af5-af7e-47d309ba6bc4 (TEST DATA).
-- Prepared by Claude on 2026-10-06 for Liz to read, edit if she disagrees, and run herself in the Supabase SQL editor.
-- Claude has not run it and will not.
--
-- Purpose: a TEST RECORD. It releases version 5 for approval with NO redelivery reason, on an order that has already
-- received version 4. The approval request that follows is expected to be refused for that reason. This record is
-- not meant to lead to a delivery and, with no reason in it, it cannot.
--
-- It inserts only if version 5 still has the two fingerprints below and is still held. If anything about the version
-- has changed it inserts nothing and returns no row. The database copies the automated status, the automated report
-- and both fingerprints into the record itself.
-- A record cannot be edited or deleted afterwards, and a version can carry only one release record. Version 5 will
-- therefore never be deliverable. The successful revised delivery is tested on a separate version 6.

insert into public.plan_reviews
  (plan_version_id, decision, reviewer, incomplete_checks_disposition, notes, record_ref, redelivery_reason, ai_prepared_by)
select
  v.id,
  'release_for_approval',
  'Liz Alfond',
  'The automated checks were not run on this hand-corrected text. The text of version 5 is identical to the text of version 4, and the disposition I recorded for version 4 applies to it unchanged: for the version this text descends from (version 1, execution 63260) the automated claim review did not complete for 52 claims, Claude reviewed those 52 by hand and recorded the result in audit-appendix.md, and I accepted that recorded manual review for this test on 2026-10-06. It is a manual review and not completed automated verification. One standing warning remains: five cost categories are unresolved.',
  'TEST RECORD for acceptance test A6. Its purpose is to demonstrate that a revised delivery is refused when the review record gives no redelivery reason. It deliberately gives none. It is not a decision to deliver version 5 and it is not approval to send. Basis: I reviewed the frozen text and the PDF of version 4 and released that version in record d6294274-de89-4888-b340-2fe10965c021. I have not read the PDF of version 5. Checks on version 5 were made by Claude, read-only, on 2026-10-06: the stored text is identical to draft-for-version-4.md and its fingerprint equals the text fingerprint of version 4; the stored PDF fingerprint equals an independent SHA-256 of the stored file; the file is 180,906 bytes, the same size as the PDF of version 4, with a different fingerprint. Claude did not inspect the pages of the version 5 PDF. It was rendered by the same formatter from the same text as version 4.',
  'ideatoplan2 repository, branch staging, folder n8n/v2-test/reviews/exec-63260: owner-decisions.md (sections A4, A5 and A6 step 1), draft-for-version-4.md. Version 5 was saved by execution 63429 with version 4 as its parent.',
  null,
  'Claude'
from public.plan_versions v
where v.id = '2994d4df-873b-4e1c-898f-d7700e760a1f'
  and v.version = 5
  and v.submission_id = '9e68ffe1-bf25-4af5-af7e-47d309ba6bc4'
  and v.plan_sha256 = '14f3c3f4074ce29cf02d5dd469161a313c5780bd9f1687dffa80e8a2c65a3fd2'
  and v.pdf_sha256 = 'aa6020fab204acbd3568f4f4e1fe82bd45f7db609a88de15eebe9a81f194a441'
  and v.status = 'changes_requested'
  and v.review_status = 'HOLD'
returning id as review_id, plan_version_id, decision, reviewer, automated_review_status,
          plan_sha256, pdf_sha256, redelivery_reason, recorded_by, created_at;
