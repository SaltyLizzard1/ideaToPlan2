// Approval request to Liz. The PDF link is a fresh 72 hour signed URL; the wait limit is 48 hours.
// It shows the automated result as it stands, and the human review beside it. Neither replaces the other.
const p = $('Prepare Approval').first().json;
const signed = $input.first().json.signedURL;
if (!signed) throw new Error('Storage returned no signed URL for ' + p.pdf_path + '. No approval email sent.');
const url = 'https://yglmlnfsyzsvozxirlpo.supabase.co/storage/v1' + signed;
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const line = (t) => '<p style="margin: 0;">' + t + '</p>';
const h = p.human_review;
const redelivery = p.already_sent_version === null ? '' : '<p style="margin: 0 0 16px; padding: 10px 12px; background: #fdf0ee; border-left: 4px solid #c0564a;"><strong>This order already received version ' + esc(p.already_sent_version) + (p.already_sent_at ? ' on ' + esc(p.already_sent_at) : '') + '.</strong> Approving sends a revised plan to the client. Reason recorded: ' + esc(p.redelivery_reason) + '</p>';
const inner = '<p style="font-size: 18px; margin-top: 0;"><strong>Ready for your approval</strong></p>'
  + redelivery
  + line('Client: ' + esc(p.client_name)) + line('Email: ' + esc(p.client_email)) + line('Package: ' + esc(p.package)) + line('Order: ' + esc(p.submission_id))
  + line('Version: ' + esc(p.version) + (p.origin === 'hand_corrected' ? ' (hand-corrected)' : '')) + '<p style="margin: 0 0 16px;">Plan version ID: ' + esc(p.plan_version_id) + '</p>'
  + line('<strong>Your recorded review</strong>') + line('Reviewer: ' + esc(h.reviewer) + ', recorded ' + esc(h.recorded_at) + (h.ai_prepared_by ? ' (text prepared by ' + esc(h.ai_prepared_by) + ')' : ''))
  + line('Incomplete checks: ' + esc(h.incomplete_checks_disposition)) + (h.notes ? line('Notes: ' + esc(h.notes)) : '') + (h.record_ref ? line('Record: ' + esc(h.record_ref)) : '') + '<p style="margin: 0 0 16px;"></p>'
  + line('<strong>Automated review, unchanged</strong>') + '<p style="margin: 0 0 4px;">Status: ' + esc(p.review_status) + '</p>'
  + '<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; margin: 0 0 16px;">' + esc(p.review_notes) + '</pre>'
  + line('<a href="' + esc(url) + '">Open PDF</a>') + '<p style="margin: 0 0 4px;">Available for 72 hours from this email.</p>'
  + '<p style="margin: 0 0 16px; font-family: monospace; font-size: 12px;">Text ' + esc(String(p.plan_sha256).slice(0, 16)) + ' | PDF ' + esc(String(p.pdf_sha256).slice(0, 16)) + '</p>'
  + line('<strong>Approve:</strong> Send exactly this version and this PDF to the client.') + '<p style="margin: 0 0 16px;"><strong>Request changes:</strong> Hold delivery for revision.</p>'
  + '<p>Approval expires after ' + (p.wait_minutes === 2880 ? '48 hours' : p.wait_minutes + ' minutes (test setting)') + '. No response means no delivery.</p>';
const html = '<table width="100%" cellpadding="0" cellspacing="0" style="font-family: Georgia, serif; max-width: 700px; margin: 0 auto;"><tr><td style="background: #1e3a5f; padding: 24px 32px; border-radius: 8px 8px 0 0;"><h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">IDEA TO PLAN</h1><p style="color: #a0b8d0; margin: 4px 0 0; font-size: 13px;">Internal Review</p></td></tr><tr><td style="padding: 32px; background: #ffffff; font-size: 15px; line-height: 1.8; color: #222; text-align: left;">' + inner + '</td></tr></table>';
return [{ json: { ...p, approval_subject: 'Approve: ' + p.package + ' plan for ' + p.client_name + ' v' + p.version + ' (automated ' + p.review_status + ', reviewed by ' + h.reviewer + ')' + (p.already_sent_version === null ? '' : ' REVISED PLAN'), approval_html: html } }];
