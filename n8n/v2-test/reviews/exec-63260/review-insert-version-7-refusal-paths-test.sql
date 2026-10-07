-- A7 and A8 refusal-path tests. Release record for plan version 7 of order 9e68ffe1-bf25-4af5-af7e-47d309ba6bc4 (TEST DATA).
-- Prepared by Claude on 2026-10-07. Liz authorized this test record and its running through her signed-in Supabase
-- dashboard in her instruction of 2026-10-07. It exists so that approval can be requested for version 7 on the changed-file, request-changes and timeout paths. No delivery of version 7 is intended.
--
-- It inserts only if version 7 still has the two fingerprints below and is still held. The database copies the
-- automated status, the automated report and both fingerprints into the record itself. A record cannot be edited or
-- deleted afterwards.

insert into public.plan_reviews
  (plan_version_id, decision, reviewer, incomplete_checks_disposition, notes, record_ref, redelivery_reason, ai_prepared_by)
select
  v.id,
  'release_for_approval',
  'Liz Alfond',
  'The automated checks were not run on this hand-corrected text. The text of version 7 is identical to the text of version 4, and the disposition recorded for version 4 applies to it unchanged: for the version this text descends from (version 1, execution 63260) the automated claim review did not complete for 52 claims, Claude reviewed those 52 by hand and recorded the result in audit-appendix.md, and Liz accepted that recorded manual review for this test on 2026-10-06. It is a manual review and not completed automated verification. One standing warning remains: five cost categories are unresolved.',
  'TEST RECORD for acceptance tests A7 and A8 (changed-file refusal, request changes, approval timeout). No delivery of version 7 is intended. Authorized by Liz on 2026-10-07 and entered through her signed-in Supabase dashboard by Claude on her instruction. Basis: Liz reviewed the frozen text and the PDF of version 4 and released that version in record d6294274-de89-4888-b340-2fe10965c021. Liz has not read the PDF of version 7. Checks on version 7 were made by Claude on 2026-10-07: the stored text is identical to draft-for-version-4.md and its fingerprint equals the text fingerprint of version 4; the stored PDF fingerprint equals an independent SHA-256 of the stored file (180,906 bytes). Claude did not inspect the pages of the version 7 PDF. This is not a review of new content by Liz. Every email in the test copies goes to liz@ideatoplan.to only.',
  'ideatoplan2 repository, branch staging, folder n8n/v2-test/reviews/exec-63260: owner-decisions.md (sections A4 to A8), draft-for-version-4.md. Version 7 was saved with version 6 as its parent.',
  'Acceptance tests A7 and A8: refusal paths on an already delivered test order, owner only, no delivery intended.',
  'Claude'
from public.plan_versions v
where v.id = 'bc2a1a84-750d-4d5e-b2ef-79940e1e9673'
  and v.version = 7
  and v.submission_id = '9e68ffe1-bf25-4af5-af7e-47d309ba6bc4'
  and v.plan_sha256 = '14f3c3f4074ce29cf02d5dd469161a313c5780bd9f1687dffa80e8a2c65a3fd2'
  and v.pdf_sha256 = 'ba6bea6d4623005edb218e7cee2669a01c17f6b9e8cf7db4f9fe90d3981931a1'
  and v.status = 'changes_requested'
  and v.review_status = 'HOLD'
returning id as review_id, plan_version_id, decision, reviewer, automated_review_status,
          plan_sha256, pdf_sha256, redelivery_reason, recorded_by, created_at;
