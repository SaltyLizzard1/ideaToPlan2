// Delivery Gate: decides whether this plan version may enter the approval flow.
// A plan with any BLOCKING finding is held: its version row is written as changes_requested, no approval email is
// sent, and so there is no Approve button that could release it. MAJOR and MINOR findings are warnings; they go to
// the reviewer in the approval email and do not stop the approval flow.
// The gate fails closed: an unreadable or unexpected review status is treated as a block.
const fp = $('Finalize Plan').first().json;
let findings = [];
try { findings = $('Plan Revision Request').first().json.findings || []; } catch (e) {}
// Checks made after revision, for example on the computed cost condition, are raised by Finalize Plan.
if (Array.isArray(fp.final_findings)) findings = findings.concat(fp.final_findings);

const CITATION = /CITATION|EXCLUDED CLAIM|SOURCE VERIFICATION|UNVERIFIED COMPANY|FIGURE CITED TO THE WRONG SOURCE|UNSUPPORTED STATISTIC|SOURCE DATE NOTE|UNKNOWN SOURCE ID|UNVERIFIED FIGURE|CITED SOURCE MISSING|URL WRITTEN BY MODEL|citation|attribution|source quality/i;
const status = String(fp.status || '').toUpperCase();
const blockers = findings.filter((f) => f.severity === 'BLOCKING');
// A required check that did not complete holds the plan like a blocker, and is counted and listed separately:
// it is not a defect that was confirmed.
const incomplete = blockers.filter((f) => f.unresolved === true);
const confirmed = blockers.filter((f) => f.unresolved !== true);
// A correction that was required and refused by code is still open, with the severity of its finding. It is counted
// and listed on its own, so that "every applied edit passed" can never be read as "every finding was dealt with".
const unapplied = findings.filter((f) => f.correction_not_applied === true);
const known = ['SEND', 'REVIEW', 'HOLD'].includes(status);
const blocked = !known || status === 'HOLD' || blockers.length > 0;
const citationBlockers = blockers.filter((f) => CITATION.test(String(f.check || '')));

const line = (f) => '- ' + (f.id || 'no id') + ' | ' + (f.check || 'unnamed check') + (f.line ? ' | L' + f.line : '') + ': ' + String(f.problem || '').slice(0, 320);
const reason = !known
  ? 'The review status could not be read (' + (fp.status === undefined ? 'missing' : String(fp.status)) + '), so the plan is held.'
  : blockers.length
    ? [confirmed.length ? confirmed.length + ' confirmed blocking finding' + (confirmed.length === 1 ? '' : 's') + ' remain' + (confirmed.length === 1 ? 's' : '') + ', ' + citationBlockers.length + ' of them about citations or sources.' : '', incomplete.length ? incomplete.length + ' required check' + (incomplete.length === 1 ? '' : 's') + ' did not complete, so the result is unresolved, not a confirmed defect.' : ''].filter(Boolean).join(' ')
    : status === 'HOLD' ? 'The final review set the status to HOLD. See the review report.' : '';
const unappliedNote = unapplied.length ? unapplied.length + ' required correction' + (unapplied.length === 1 ? ' was' : 's were') + ' refused by code and not applied (' + unapplied.filter((f) => f.severity === 'BLOCKING').length + ' blocking, ' + unapplied.filter((f) => f.severity === 'MAJOR').length + ' major). ' + (unapplied.length === 1 ? 'Its finding remains' : 'Their findings remain') + ' open.' : '';

return {
  blocked,
  version_status: blocked ? 'changes_requested' : 'awaiting_approval',
  review_status: known ? status : 'HOLD',
  reason: [reason, unappliedNote].filter(Boolean).join(' '),
  blocker_count: blockers.length,
  confirmed_blocker_count: confirmed.length,
  unresolved_check_count: incomplete.length,
  unresolved_checks_text: incomplete.length ? incomplete.map(line).join('\n') : 'None.',
  unapplied_correction_count: unapplied.length,
  unapplied_corrections_text: unapplied.length ? unapplied.map((f) => line(f).replace(/^- /, '- ' + f.severity + ' | ')).join('\n') : 'None.',
  citation_blocker_count: citationBlockers.length,
  warning_count: findings.filter((f) => f.severity === 'MAJOR').length,
  minor_count: findings.filter((f) => f.severity === 'MINOR').length,
  blockers_text: blockers.length ? confirmed.map(line).concat(incomplete.map((f) => line(f).replace(/^- /, '- CHECK DID NOT COMPLETE | '))).join('\n') : 'None listed. See the review report.',
  warnings_text: findings.filter((f) => f.severity === 'MAJOR').map(line).join('\n') || 'None.',
};
