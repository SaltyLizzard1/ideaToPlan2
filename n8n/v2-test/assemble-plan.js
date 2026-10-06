// Assemble Plan: takes the writer's text and inserts the code-computed financial tables where the markers are.
const ctx = $('Founder Context').first().json;
const fin = $('Compute Financials').first().json;
let text = '';
try { text = $('Format Growth Output1').first().json.text || ''; } catch (e) {}
if (!text) { try { text = $('Basic LLM Chain').first().json.text || ''; } catch (e) {} }

const notes = [];
const hasSection = (re) => ctx.section_names.some((s) => re.test(s));
const place = (marker, block, sectionRe) => {
  const parts = text.split(marker);
  if (parts.length > 1) { text = parts[0] + (block ? '\n' + block + '\n' : '') + parts.slice(1).join(''); return; }
  if (!block || !hasSection(sectionRe)) return;
  const m = text.match(new RegExp('^## .*(' + sectionRe.source + ').*$', 'm'));
  if (m) {
    const at = m.index + m[0].length;
    text = text.slice(0, at) + '\n\n' + block + '\n' + text.slice(at);
    notes.push({ severity: 'MINOR', detail: marker + ' was missing, so the table was placed at the top of "' + m[0].replace(/^#+\s*/, '') + '".' });
  } else {
    notes.push({ severity: 'BLOCKING', detail: marker + ' was missing and its section was not found, so the table was left out.' });
  }
};
// Forecast first, so that if both markers are missing the scenario table still lands above the forecast.
place('[[FORECAST_TABLE]]', fin.forecast_block, /Revenue/);
place('[[SCENARIO_TABLE]]', fin.scenario_block, /Revenue/);
place('[[BUDGET_TABLE]]', fin.budget_block, /Budget/);
place('[[LOAN_TABLE]]', fin.loan_block, /Repayment/);

// The writer's instructions number their rules. A rule number is not part of the plan: "Rule 7: Revenue stream
// validation" as a heading becomes "Revenue stream validation".
text = text.replace(/^(\s*(?:#{1,6}\s+|\*\*)?)Rule \d+[:.]\s*/gim, '$1');

return { text, assembly_notes: notes, t_ms: Date.now() };