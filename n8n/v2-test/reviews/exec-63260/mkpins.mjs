// Builds the temporary pin data for the one rendering run of the reviewed text (version 2). Reads the saved
// outputs of execution 63260; changes only the plan text and the review note.
import fs from 'node:fs';
const src = process.argv[2];
const x = JSON.parse(fs.readFileSync(src, 'utf8')).data.nodes;
const one = (n) => x[n].data.output.flat()[0].json;
const fp = one('Finalize Plan');
const text = fs.readFileSync(new URL('corrected-plan-v2.md', import.meta.url), 'utf8');
const note = [
  'REVIEWED TEST VERSION. NOT APPROVED. HOLD remains in force.',
  'This is version 2 of the plan generated in execution 63260, with corrections C1 to C8, the wording P1 to P16 and the owner review decisions of 2026-10-06 applied by hand. Every replacement is listed in n8n/v2-test/reviews/exec-63260/tracked-changes.md.',
  'What was checked: the offline code checks were run on this text and leave one standing warning (FINANCIAL MODEL: five cost categories are unresolved and disclosed; the forecast is conditional on them). The automated claim review was NOT run on this text. For version 1 that review did not complete for 52 claims; those were reviewed by hand, which is recorded as a manual review and is not automated verification.',
  'Version 1 and its PDF are unchanged. Its gate result stands: 38 confirmed blocking findings and 1 required check that did not complete.',
  'This version was rendered from pinned data. No model was called, and it was not sent for approval.',
].join('\n\n');
const pins = {
  'Finalize Plan': [{ json: { ...fp, text, status: 'HOLD', report: note, final_findings: [] } }],
  'Prepare Client Data': [{ json: one('Prepare Client Data') }],
  'Log to Supabase': [{ json: one('Log to Supabase') }],
  'Update Supabase Status': [{ json: { skipped: true, note: 'Pinned for the review rendering of 2026-10-06 so that the submission row is not rewritten.' } }],
};
if (fp.status !== 'HOLD') throw new Error('original status ' + fp.status);
fs.writeFileSync(new URL('pins.json', import.meta.url), JSON.stringify(pins));
const lg = pins['Log to Supabase'][0].json, pc = pins['Prepare Client Data'][0].json;
console.log(JSON.stringify({ bytes: JSON.stringify(pins).length, submission: lg.id, notes: String(lg.notes).slice(0, 40), client: pc.client_name, package: pc.package, pcKeys: Object.keys(pc).length, fpKeys: Object.keys(pins['Finalize Plan'][0].json), sources: (fp.sources_cited || []).length, textChars: text.length }));
