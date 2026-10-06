// The checks a version must pass before an approval email may be sent. Used unchanged by the request workflow
// (before it reopens anything) and by Prepare Approval in the approval workflow (whoever started it).
// It only reads. It throws with the reason, and every reason ends by saying that no approval email was sent.
const approvalChecks = (requested, v, s, all, reviews, allowed) => {
  const stop = (why) => { throw new Error(why + ' No approval email sent.'); };
  if (!v || !v.id) stop('Plan version not found: ' + requested + '.');
  if (!allowed.includes(v.status)) stop('Plan version ' + v.id + ' is ' + v.status + ', expected ' + allowed.join(' or ') + '.');
  if (!s || !s.id) stop('Submission ' + v.submission_id + ' not found for plan version ' + v.id + '.');
  if (!v.plan_sha256 || !v.pdf_sha256) stop('Plan version ' + v.id + ' has no fingerprints. A version created before the supervised process cannot be approved through it.');
  const automated = String(v.review_status || '').trim().toUpperCase() || 'NOT RECORDED';
  const releases = (reviews || []).filter((r) => r && r.id && r.plan_version_id === v.id && r.decision === 'release_for_approval');
  if (!releases.length) stop('Plan version ' + v.id + ' has no human release record (automated status ' + automated + '). Every version needs a recorded review before approval.');
  const review = releases[0];
  if (review.plan_sha256 !== v.plan_sha256 || review.pdf_sha256 !== v.pdf_sha256) stop('The release record of plan version ' + v.id + ' describes different content than the version holds.');
  const versions = (all || []).filter((x) => x && x.id);
  const latest = Math.max(...versions.map((x) => Number(x.version)));
  if (Number(v.version) !== latest) stop('Version ' + v.version + ' is not the current version for this order (latest is ' + latest + ').');
  const inFlight = versions.filter((x) => x.id !== v.id && ['awaiting_approval', 'sending', 'send_unknown'].includes(x.status));
  if (inFlight.length) stop('Another version of this order is in flight (' + inFlight.map((x) => 'v' + x.version + ' ' + x.status).join(', ') + ').');
  // An order that already received a plan gets another one only on purpose: the review record has to say why.
  const sent = versions.filter((x) => x.id !== v.id && x.status === 'sent').sort((a, b) => Number(b.version) - Number(a.version));
  const reason = String(review.redelivery_reason || '').trim();
  if (sent.length && !reason) stop('This order already received version ' + sent[0].version + ' (sent ' + (sent[0].sent_at || 'date not recorded') + '). Approving version ' + v.version + ' would deliver a revised plan, and its review record gives no redelivery reason.');
  return { review, automated, already_sent: sent[0] || null, redelivery_reason: sent.length ? reason : '' };
};
