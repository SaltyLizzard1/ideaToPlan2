// The corrected text, as the formatter and the version row expect it. (Node name: Finalize Plan.) No model runs here.
// A hand-corrected version is always HOLD: the automated checks have not run on this text.
const c = $('Check Parent').first().json;
const report = [
  'HAND-CORRECTED VERSION. NOT APPROVED. The automated checks were not run on this text, so its automated status is HOLD.',
  'Corrected from version ' + c.parent_version + ' (' + c.parent_version_id + '), whose automated status was ' + c.parent_review_status + '.',
  'Sources taken from ' + c.sources_from + '.',
  c.note ? 'Note: ' + c.note : '',
  '--- AUTOMATED REPORT OF THE PARENT VERSION, UNCHANGED ---',
  c.parent_review_notes || '(none recorded)',
].filter(Boolean).join('\n\n');
return [{ json: { text: c.text, status: 'HOLD', report, sources_cited: c.sources_cited, origin: 'hand_corrected', parent_version_id: c.parent_version_id, final_findings: [] } }];
