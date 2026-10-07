-- A6 revised delivery test. Release record for plan version 6 of order 9e68ffe1-bf25-4af5-af7e-47d309ba6bc4 (TEST DATA).
-- Prepared by Claude on 2026-10-07. Liz authorized this test record and its running through her signed-in Supabase
-- dashboard in her instruction of 2026-10-07. It gives the redelivery reason she specified, word for word.
--
-- It inserts only if version 6 still has the two fingerprints below and is still held. The database copies the
-- automated status, the automated report and both fingerprints into the record itself. A record cannot be edited or
-- deleted afterwards.

insert into public.plan_reviews
  (plan_version_id, decision, reviewer, incomplete_checks_disposition, notes, record_ref, redelivery_reason, ai_prepared_by)
select
  v.id,
  'release_for_approval',
  'Liz Alfond',
  'The automated checks were not run on this hand-corrected text. The text of version 6 is identical to the text of version 4, and the disposition recorded for version 4 applies to it unchanged: for the version this text descends from (version 1, execution 63260) the automated claim review did not complete for 52 claims, Claude reviewed those 52 by hand and recorded the result in audit-appendix.md, and Liz accepted that recorded manual review for this test on 2026-10-06. It is a manual review and not completed automated verification. One standing warning remains: five cost categories are unresolved.',
  'TEST RECORD for acceptance test A6, revised delivery. Authorized by Liz on 2026-10-07 and entered through her signed-in Supabase dashboard by Claude on her instruction. Basis: Liz reviewed the frozen text and the PDF of version 4 and released that version in record d6294274-de89-4888-b340-2fe10965c021. Liz has not read the PDF of version 6. Version 6 was inspected by Claude on 2026-10-07: the stored text is identical to draft-for-version-4.md and its fingerprint equals the text fingerprint of version 4; the stored PDF fingerprint equals an independent SHA-256 of the stored file (180,906 bytes); all 32 pages were rendered and each page image is identical to the same page of the version 4 PDF, which carries no internal review status. This is not a review of new content by Liz. Delivery in the test copy goes to liz@ideatoplan.to only.',
  'ideatoplan2 repository, branch staging, folder n8n/v2-test/reviews/exec-63260: owner-decisions.md (sections A4 to A6), draft-for-version-4.md. Version 6 was saved by execution 63505 with version 5 as its parent.',
  'Acceptance test A6: intentional revised delivery to the owner only.',
  'Claude'
from public.plan_versions v
where v.id = '7d3302ec-a6ec-40ad-9313-4bd284dfa1c5'
  and v.version = 6
  and v.submission_id = '9e68ffe1-bf25-4af5-af7e-47d309ba6bc4'
  and v.plan_sha256 = '14f3c3f4074ce29cf02d5dd469161a313c5780bd9f1687dffa80e8a2c65a3fd2'
  and v.pdf_sha256 = '96c48bf656ca21c12981398e52c11d2410750b625e6f8d668fff5fb61f604b6b'
  and v.status = 'changes_requested'
  and v.review_status = 'HOLD'
returning id as review_id, plan_version_id, decision, reviewer, automated_review_status,
          plan_sha256, pdf_sha256, redelivery_reason, recorded_by, created_at;
