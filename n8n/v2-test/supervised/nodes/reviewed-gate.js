// The gate result of a hand-corrected version, in the shape Delivery Gate gives. (Node name: Delivery Gate.)
// It is held by rule, not by a finding: no automated check ran on this text.
const fp = $('Finalize Plan').first().json;
if (fp.status !== 'HOLD' || fp.origin !== 'hand_corrected') throw new Error('This workflow only saves hand-corrected versions on HOLD. No version row was written.');
return [{ json: {
  blocked: true, version_status: 'changes_requested', review_status: 'HOLD',
  reason: 'This is a hand-corrected version. The automated checks were not run on it. It needs a recorded human review before approval can be requested.',
  blocker_count: 0, confirmed_blocker_count: 0, unresolved_check_count: 0, unresolved_checks_text: 'None.',
  unapplied_correction_count: 0, unapplied_corrections_text: 'None.', citation_blocker_count: 0,
  warning_count: 0, minor_count: 0, blockers_text: 'None listed. See the review report.', warnings_text: 'None.',
} }];
