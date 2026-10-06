// Source of every Code node of the supervised-launch workflows. `// @sha256` and `// @approval-checks` are replaced
// by the shared parts when build.mjs writes the node files into ../nodes. The node files are what n8n holds.

export const NODES = {

// ---- Used by the pipeline and by Save Reviewed Version ----

'fingerprint-pdf.js': `// Fingerprints the PDF exactly as it will be stored. Sits directly after Generate PDF, because the file can only be
// read from this node's own input item. The file is passed on unchanged.
// @sha256
const item = $input.first();
if (!item.binary || !item.binary.pdf_data) throw new Error('Generate PDF returned no file. No plan version was created.');
const buf = await this.helpers.getBinaryDataBuffer(0, 'pdf_data');
if (!buf || buf.length < 5 || String.fromCharCode(buf[0], buf[1], buf[2], buf[3], buf[4]) !== '%PDF-') throw new Error('The rendered file is not a PDF. No plan version was created.');
return [{ json: { pdf_sha256: sha256js(new Uint8Array(buf)), pdf_bytes: buf.length }, binary: item.binary }];`,

'prepare-version.js': `// Picks the next version number and puts the generated PDF back on the item for upload.
// The version row carries its own text, sources and the fingerprints of the text and of the PDF.
// @sha256
const sub = $('Resolve Submission').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r && r.version);
const version = rows.reduce((m, r) => Math.max(m, Number(r.version) || 0), 0) + 1;
const printed = $('Fingerprint PDF').first();
if (!printed.binary || !printed.binary.pdf_data || !printed.json.pdf_sha256) throw new Error('The PDF was not fingerprinted. No plan version was created.');
const fin = $('Finalize Plan').first().json;
const text = String(fin.text || '');
if (!text.trim()) throw new Error('The plan text is empty. No plan version was created.');
const origin = fin.origin === 'hand_corrected' ? 'hand_corrected' : 'generated';
if (origin === 'hand_corrected' && !fin.parent_version_id) throw new Error('A hand-corrected version needs its parent version. No plan version was created.');
return [{
  json: {
    submission_id: sub.submission_id,
    version,
    pdf_path: sub.submission_id + '/v' + version + '.pdf',
    review_status: fin.status || '',
    review_notes: fin.report || '',
    plan_text: text,
    sources_cited: Array.isArray(fin.sources_cited) ? fin.sources_cited : [],
    plan_sha256: sha256js(new Uint8Array(Buffer.from(text, 'utf8'))),
    pdf_sha256: printed.json.pdf_sha256,
    origin,
    parent_version_id: origin === 'hand_corrected' ? fin.parent_version_id : null,
  },
  binary: { pdf_data: { ...printed.binary.pdf_data, mimeType: 'application/pdf' } },
}];`,

// ---- Save Reviewed Version ----

'check-parent.js': `// A corrected text is saved as the next version of the order its parent belongs to. Reads only.
const input = $('Review Input').first().json;
const id = String(input.parent_version_id || '').trim();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('The parent plan version ID is missing or is not an ID. Nothing was created.');
const text = String(input.corrected_text || '');
if (text.trim().length < 500) throw new Error('The corrected text is missing or too short to be a plan. Nothing was created.');
const parent = $('Load Parent').first().json;
if (!parent || !parent.id) throw new Error('Parent plan version not found: ' + id + '. Nothing was created.');
const s = $('Load Submission').first().json;
if (!s || !s.id) throw new Error('Submission ' + parent.submission_id + ' not found. Nothing was created.');
const all = $input.all().map((i) => i.json).filter((r) => r && r.id);
const latest = Math.max(...all.map((r) => Number(r.version)));
if (Number(parent.version) !== latest) throw new Error('Version ' + parent.version + ' is not the current version for this order (latest is ' + latest + '). Correct the latest version. Nothing was created.');
const inFlight = all.filter((r) => ['awaiting_approval', 'sending', 'send_unknown'].includes(r.status));
if (inFlight.length) throw new Error('A version of this order is in flight (' + inFlight.map((r) => 'v' + r.version + ' ' + r.status).join(', ') + '). Request changes on it first. Nothing was created.');
// The sources the plan cites are needed to print its Sources section. They come from the parent version. A parent
// from before the supervised process has none stored, and then they have to be given with the input.
let sources = parent.sources_cited;
if (typeof sources === 'string') { try { sources = JSON.parse(sources); } catch (e) { sources = null; } }
let sourcesFrom = 'the parent version';
if (!Array.isArray(sources)) { sources = Array.isArray(input.sources_cited) ? input.sources_cited : null; sourcesFrom = 'the review input, because the parent version stores none'; }
if (!Array.isArray(sources)) throw new Error('Parent version ' + parent.id + ' stores no sources and none were given with the input. Nothing was created.');
const cited = [...new Set(text.match(/\\b[SW]\\d+\\b/g) || [])];
const missing = cited.filter((c) => !sources.some((x) => x && x.id === c));
if (missing.length) throw new Error('The corrected text cites ' + missing.join(', ') + ', which the sources do not contain. A correction may not introduce a source. Nothing was created.');
const goal = s.plan_goal === 'bank-loan' ? 'Bank Loan' : s.plan_goal === 'investor' ? 'Investor Pitch' : 'Personal Roadmap';
return [{ json: {
  parent_version_id: parent.id, parent_version: parent.version, submission_id: parent.submission_id,
  parent_review_status: parent.review_status || 'NOT RECORDED', parent_review_notes: parent.review_notes || '',
  text, note: String(input.note || '').trim(), sources_cited: sources, sources_from: sourcesFrom,
  client_name: s.client_name || '', email: s.email || '', package: s.package || 'Unknown', plan_goal_clean: goal,
} }];`,

'reviewed-client-data.js': `// The client fields the formatter and the notice read, taken from the order row. (Node name: Prepare Client Data.)
const c = $('Check Parent').first().json;
return [{ json: { client_name: c.client_name, email: c.email, package: c.package, plan_goal_clean: c.plan_goal_clean } }];`,

'reviewed-submission.js': `// The order this version belongs to: the parent's. (Node name: Resolve Submission.) There is no fallback order.
const c = $('Check Parent').first().json;
if (!c.submission_id) throw new Error('No order for this version. Nothing was created.');
return [{ json: { submission_id: c.submission_id } }];`,

'reviewed-finalize.js': `// The corrected text, as the formatter and the version row expect it. (Node name: Finalize Plan.) No model runs here.
// A hand-corrected version is always HOLD: the automated checks have not run on this text.
const c = $('Check Parent').first().json;
const report = [
  'HAND-CORRECTED VERSION. NOT APPROVED. The automated checks were not run on this text, so its automated status is HOLD.',
  'Corrected from version ' + c.parent_version + ' (' + c.parent_version_id + '), whose automated status was ' + c.parent_review_status + '.',
  'Sources taken from ' + c.sources_from + '.',
  c.note ? 'Note: ' + c.note : '',
  '--- AUTOMATED REPORT OF THE PARENT VERSION, UNCHANGED ---',
  c.parent_review_notes || '(none recorded)',
].filter(Boolean).join('\\n\\n');
return [{ json: { text: c.text, status: 'HOLD', report, sources_cited: c.sources_cited, origin: 'hand_corrected', parent_version_id: c.parent_version_id, final_findings: [] } }];`,

'reviewed-gate.js': `// The gate result of a hand-corrected version, in the shape Delivery Gate gives. (Node name: Delivery Gate.)
// It is held by rule, not by a finding: no automated check ran on this text.
const fp = $('Finalize Plan').first().json;
if (fp.status !== 'HOLD' || fp.origin !== 'hand_corrected') throw new Error('This workflow only saves hand-corrected versions on HOLD. No version row was written.');
return [{ json: {
  blocked: true, version_status: 'changes_requested', review_status: 'HOLD',
  reason: 'This is a hand-corrected version. The automated checks were not run on it. It needs a recorded human review before approval can be requested.',
  blocker_count: 0, confirmed_blocker_count: 0, unresolved_check_count: 0, unresolved_checks_text: 'None.',
  unapplied_correction_count: 0, unapplied_corrections_text: 'None.', citation_blocker_count: 0,
  warning_count: 0, minor_count: 0, blockers_text: 'None listed. See the review report.', warnings_text: 'None.',
} }];`,

// ---- Request approval for a reviewed version ----

'request-check.js': `// Everything is checked before anything is changed. Reads only.
// @approval-checks
const requested = String($('Plan Version ID').first().json.plan_version_id || '').trim();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested)) throw new Error('The plan version ID is missing or is not an ID. Nothing was changed.');
const v = $('Load Version').first().json;
const s = $('Load Submission').first().json;
const all = $('Load All Versions').all().map((i) => i.json);
const reviews = $input.all().map((i) => i.json);
// A version whose send verifiably failed may be put back for approval. One whose send is uncertain may not.
const facts = approvalChecks(requested, v, s, all, reviews, ['awaiting_approval', 'changes_requested', 'approval_timeout', 'send_failed']);
return [{ json: { plan_version_id: v.id, status: v.status, pdf_path: v.pdf_path, pdf_sha256: v.pdf_sha256, needs_reopen: v.status !== 'awaiting_approval', review_id: facts.review.id, redelivery_reason: facts.redelivery_reason } }];`,

'verify-stored-pdf.js': `// The stored file must still be the one the version was fingerprinted with. Reads only.
// @sha256
const c = $('Check Version').first().json;
const item = $input.first();
if (!item.binary || !item.binary.data) throw new Error('The stored PDF could not be downloaded for ' + c.pdf_path + '. Nothing was changed. No approval email sent.');
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
const found = sha256js(new Uint8Array(buf));
if (found !== c.pdf_sha256) throw new Error('The stored PDF at ' + c.pdf_path + ' does not match the fingerprint of plan version ' + c.plan_version_id + '. Nothing was changed. No approval email sent.');
return [{ json: { ...c, stored_pdf_sha256: found } }];`,

'already-requested.js': `// Zero rows changed: a duplicate request, or the status moved between the check and the update.
const c = $('Check Version').first().json;
throw new Error('No row changed for plan version ' + c.plan_version_id + '. It was already requested or its status changed. No approval email sent.');`,

// ---- Approval and delivery (edits to the shared workflow) ----

'prepare-approval.js': `// Checks the version may be sent for approval and gathers everything the emails need.
// Every version needs a human release record that matches its fingerprints. The automated status is shown, not edited.
// @approval-checks
const requested = $('Start').first().json.plan_version_id;
const v = $('Load Version').first().json;
const s = $('Load Submission').first().json;
const all = $('Load All Versions').all().map((i) => i.json);
const reviews = $input.all().map((i) => i.json);
const facts = approvalChecks(requested, v, s, all, reviews, ['awaiting_approval']);
const r = facts.review;
const name = String(s.client_name || '').trim().replace(/\\b\\w/g, (c) => c.toUpperCase()) || 'there';
const goal = s.plan_goal === 'bank-loan' ? 'Bank Loan' : s.plan_goal === 'investor' ? 'Investor Pitch' : 'Personal Roadmap';
const safeName = name.replace(/[\\\\/:*?"<>|]/g, '').trim() || 'Client';
return [{ json: {
  plan_version_id: v.id,
  submission_id: v.submission_id,
  version: v.version,
  pdf_path: v.pdf_path,
  plan_sha256: v.plan_sha256,
  pdf_sha256: v.pdf_sha256,
  origin: v.origin || 'generated',
  client_name: name,
  client_email: s.email || '',
  package: s.package || 'Unknown',
  plan_goal_label: goal,
  review_status: facts.automated,
  review_notes: v.review_notes || 'No review notes were recorded for this version.',
  human_review: {
    id: r.id, reviewer: r.reviewer, recorded_at: r.created_at, recorded_by: r.recorded_by || '',
    incomplete_checks_disposition: r.incomplete_checks_disposition, notes: r.notes || '', record_ref: r.record_ref || '',
    ai_prepared_by: r.ai_prepared_by || '',
  },
  redelivery_reason: facts.redelivery_reason,
  already_sent_version: facts.already_sent ? facts.already_sent.version : null,
  already_sent_at: facts.already_sent ? (facts.already_sent.sent_at || '') : '',
  customer_subject: 'Your ' + goal + ' plan is ready',
  pdf_filename: 'IdeaToPlan - ' + safeName + '.pdf',
  // 48 hours unless the caller passes a shorter wait for testing.
  wait_minutes: Number($('Start').first().json.approval_wait_minutes) > 0 ? Number($('Start').first().json.approval_wait_minutes) : 2880,
} }];`,

'build-approval-email.js': `// Approval request to Liz. The PDF link is a fresh 72 hour signed URL; the wait limit is 48 hours.
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
return [{ json: { ...p, approval_subject: 'Approve: ' + p.package + ' plan for ' + p.client_name + ' v' + p.version + ' (automated ' + p.review_status + ', reviewed by ' + h.reviewer + ')' + (p.already_sent_version === null ? '' : ' REVISED PLAN'), approval_html: html } }];`,

'verify-attachment.js': `// The last step before the send. Fingerprints the file that the Gmail node attaches (binary "data") and compares it
// with the fingerprint that was approved. The item, with its file, is passed on unchanged.
// @sha256
const item = $input.first();
const expected = String(item.json.pdf_sha256 || '');
let found = '';
if (item.binary && item.binary.data) found = sha256js(new Uint8Array(await this.helpers.getBinaryDataBuffer(0, 'data')));
return [{ json: { ...item.json, attachment_sha256: found, attachment_ok: /^[0-9a-f]{64}$/.test(expected) && found === expected }, binary: item.binary }];`,

'classify-send-error.js': `// Classifies a failed customer send by what is actually known. n8n's error output carries only a text message.
// fingerprint_mismatch: the file to attach was not the approved one, so the send was never attempted: send_failed.
// local_validation: n8n refused the recipient before transmitting anything. Nothing was sent: send_failed.
// gmail_rejection:  Gmail verifiably refused the message: send_failed. Only patterns verified against n8n source are listed.
// uncertain:        anything else. The message may have gone out: send_unknown. This is the safe default.
const e = $input.first().json || {};
const p = $('Build Customer Email').first().json;
if (e.attachment_ok === false) {
  return [{ json: { ...p, send_status: 'send_failed', error_source: 'fingerprint_mismatch', error_message: 'The PDF to attach has fingerprint ' + (e.attachment_sha256 || '(no file)') + ', and the approved fingerprint is ' + (p.pdf_sha256 || '(none)') + '.' } }];
}
const raw = e.error;
const msg = String((raw && typeof raw === 'object' ? (raw.message || raw.description) : raw) || e.message || 'No error message returned');
const LOCAL_VALIDATION = [/^Invalid email address\\b/i];
// n8n 2.20.9 produces this exact text only for an HTTP 400 response (node-api.error.ts, STATUS_CODE_MESSAGES['400']).
// A 400 needs a response from Gmail, so the message was refused, not lost. Other 4xx and all 5xx texts stay uncertain.
const GMAIL_REJECTION = [/^Bad request - please check your parameters\\b/];
let source = 'uncertain';
if (LOCAL_VALIDATION.some((r) => r.test(msg))) source = 'local_validation';
else if (GMAIL_REJECTION.some((r) => r.test(msg))) source = 'gmail_rejection';
const status = source === 'uncertain' ? 'send_unknown' : 'send_failed';
return [{ json: { ...p, send_status: status, error_source: source, error_message: msg } }];`,

};

// Expressions of the nodes that are not Code nodes but changed.
export const ALERT_SEND_ERROR_MESSAGE = `={{ (() => { const c = $('Classify Send Error').first().json; const ids = 'Order: ' + c.submission_id + '\\nVersion: ' + c.version + '\\nPlan version ID: ' + c.plan_version_id; if (c.send_status === 'send_failed') { const lead = c.error_source === 'fingerprint_mismatch' ? 'The send was stopped before it reached Gmail. The stored PDF is not the PDF that was approved, so nothing was sent.' : c.error_source === 'local_validation' ? 'The send was stopped before it reached Gmail. n8n rejected the recipient address, so nothing was sent.' : 'Gmail rejected the send.'; return lead + '\\n\\nError: ' + c.error_message + '\\n' + ids + '\\n\\nResolve the error before authorizing another attempt.'; } return 'Gmail\\'s send result was not confirmed. The email may have been sent.\\n\\nCustomer: ' + c.client_email + '\\nSubject: ' + c.customer_subject + '\\nAttempted at: ' + c.send_attempted_at + '\\n' + ids + '\\nError: ' + c.error_message + '\\n\\nCheck Sent mail and reconcile the status before retrying. An immediate missing search result does not confirm failure.'; })() }}`;
