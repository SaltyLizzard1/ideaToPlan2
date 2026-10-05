// Apply Revisions: applies one replacement per edit unit. The units were defined by code in Plan Revision Request,
// so an edit is located by its unit ID, not by searching for text. Anything that cannot be applied safely is reported, never guessed.
const before = $('Plan Revision Request').first().json;
const lines = ($('Assemble Plan').first().json.text || '').split('\n');

let edits = [], revision_error = '';
try {
  const raw = $input.first().json.choices[0].message.content || '';
  const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  edits = Array.isArray(o.edits) ? o.edits : [];
} catch (e) { revision_error = 'The reviser did not return readable edits, so no changes were made.'; }

const units = {};
(before.units || []).forEach((u) => { units[u.id] = u; });
const isRow = (l) => /^\s*\|.*\|\s*$/.test(l || '');
const DELETED = '\u0000deleted';
const DROPPED = '\u0000dropped';
const done = new Set();
const log = [];
const unresolved = [];
const stray = [];
const labelOf = (u) => u.id + ' (L' + u.start + (u.end > u.start ? '-L' + u.end : '') + ', ' + u.issues.join(', ') + ')';

edits.forEach((e) => {
  const uid = String((e && e.unit) || '').trim().toUpperCase();
  const u = units[uid];
  if (!u) { stray.push('An edit named a unit that does not exist (' + (uid || 'no unit') + '), so it was ignored.'); return; }
  const label = labelOf(u);
  if (done.has(uid)) { stray.push(label + ': a second edit for the same unit was ignored.'); return; }
  const action = String((e && e.action) || 'replace').toLowerCase() === 'delete' ? 'delete' : 'replace';
  let newText = e && typeof e.new_text === 'string' ? e.new_text.replace(/\r/g, '').replace(/^\[L\d+( computed)?\]\s*/gm, '') : null;
  const current = lines.slice(u.start - 1, u.end).join('\n');
  if (current !== u.text) { unresolved.push(label + ': the plan text no longer matches the unit, so the edit was not applied.'); return; }
  if (action === 'replace') {
    if (newText === null || !newText.trim()) { unresolved.push(label + ': no replacement text was given.'); return; }
    if (u.start === u.end) newText = newText.replace(/\s*\n\s*/g, ' ').trim();
    if (/^#{1,6}\s/m.test(newText)) { unresolved.push(label + ': the replacement would have added a section header.'); return; }
    if (isRow(current) && (!isRow(newText) || newText.split('|').length !== current.split('|').length)) { unresolved.push(label + ': the replacement would have broken a table row.'); return; }
    if (newText === current) { done.add(uid); unresolved.push(label + ': the reviser returned the passage unchanged.'); return; }
  }
  lines[u.start - 1] = action === 'delete' ? DELETED : newText;
  for (let i = u.start; i < u.end; i++) lines[i] = DROPPED;
  done.add(uid);
  log.push({ unit: uid, issues: u.issues, action, start: u.start, end: u.end, before: current, after: action === 'delete' ? '' : newText });
});
Object.values(units).forEach((u) => { if (!done.has(u.id) && !unresolved.some((x) => x.startsWith(u.id + ' '))) unresolved.push(labelOf(u) + ': the reviser returned no edit for this unit.'); });

// Build the final text. A deleted table row is removed outright; any other deleted passage becomes a blank line.
const out = [];
const newLine = {};
lines.forEach((l, i) => {
  if (l === DROPPED) return;
  if (l === DELETED) {
    const prev = lines[i - 1], next = lines[i + 1];
    if (isRow(prev === DELETED || prev === DROPPED ? '' : prev) || isRow(next === DELETED || next === DROPPED ? '' : next)) { newLine[i + 1] = out.length; return; }
    newLine[i + 1] = out.length + 1; out.push(''); return;
  }
  newLine[i + 1] = out.length + 1;
  String(l).split('\n').forEach((part) => out.push(part));
});

const count = (sev) => (before.findings || []).filter((f) => f.severity === sev).length;
return {
  text: out.join('\n'),
  requested_count: (before.units || []).length,
  returned_count: edits.length,
  applied_count: log.length,
  unresolved,
  unlocated: before.unlocated || [],
  stray,
  revision_error,
  // Passages the reviser was asked to correct and did not change. They are not fixed and not cleared: the verification
  // pass reads each one and says whether the problem is in it.
  unchanged_units: Object.values(units).filter((u) => !log.some((e) => e.unit === u.id)).map((u) => ({ unit: u.id, issues: u.issues, start: u.start, end: u.end, line: newLine[u.start] || u.start, text: u.text, why: (unresolved.find((x) => x.startsWith(u.id + ' ')) || '').replace(/^[^:]*:\s*/, '') })),
  edit_log: log.map((e) => ({ unit: e.unit, issues: e.issues, action: e.action, start: e.start, end: e.end, line: newLine[e.start], before: e.before, after: e.after })),
  first_findings: before.findings || [],
  first_qa_usage: before.qa_usage || null,
  stats: before.stats || null,
  qa_done_ms: before.t_ms || null,
  t_ms: Date.now(),
  before_counts: { blocking: count('BLOCKING'), major: count('MAJOR'), minor: count('MINOR') },
};
