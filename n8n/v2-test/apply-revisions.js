// Apply Revisions: applies one replacement per edit unit. The units were defined by code in Plan Revision Request,
// so an edit is located by its unit ID, not by searching for text. Anything that cannot be applied safely is reported, never guessed.
const before = $('Plan Revision Request').first().json;
const lines = ($('Assemble Plan').first().json.text || '').split('\n');
const original = lines.slice();

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
// Why each unit that was not edited was not edited. "rejected": the reviser gave a replacement and code refused it.
// "unchanged": the reviser returned the passage as it was. "missing": the reviser gave no edit for the unit.
const notApplied = {};
const refuse = (u, kind, why) => { notApplied[u.id] = { kind, why }; unresolved.push(labelOf(u) + ': ' + why); };
// TABLE ROWS AND SECTION NOTES. A table row is replaced by one row with the same number of cells, and nothing else.
// A note about undated sources belongs to the section, and a paragraph cannot stand between two rows of a table. The
// reviser gives such a note in "section_note" (or, as it did in execution 63226, as a paragraph written above the
// row). Code places the note above the table and replaces the row by the row. Anything else beside a row is refused.
const cellsOf = (row) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).length;
const DATE_NOTE = /\bundated\b|\bno (?:publication )?dates?\b|\bdates? (?:is |are |was |were )?not shown\b|\bwithout a (?:publication )?date\b/i;
const idsIn = (v) => [...new Set(String(v || '').match(/\b[SW]\d+\b/g) || [])];
const tableStart = (lineNo) => { let i = lineNo - 1; while (i > 0 && isRow(original[i - 1])) i--; return i; };
// The sources a section cites, in the plan as it was before the edits. A date note is about the section.
const sectionIds = (lineNo) => { let a = lineNo - 1; while (a > 0 && !/^## /.test(original[a] || '')) a--; let b = lineNo; while (b < original.length && !/^## /.test(original[b] || '')) b++; return idsIn(original.slice(a, b).join(' ')); };
const notesAbove = {};

edits.forEach((e) => {
  const uid = String((e && e.unit) || '').trim().toUpperCase();
  const u = units[uid];
  if (!u) { stray.push('An edit named a unit that does not exist (' + (uid || 'no unit') + '), so it was ignored.'); return; }
  const label = labelOf(u);
  if (done.has(uid)) { stray.push(label + ': a second edit for the same unit was ignored.'); return; }
  const action = String((e && e.action) || 'replace').toLowerCase() === 'delete' ? 'delete' : 'replace';
  let newText = e && typeof e.new_text === 'string' ? e.new_text.replace(/\r/g, '').replace(/^\[L\d+( computed)?\]\s*/gm, '') : null;
  let note = e && typeof e.section_note === 'string' ? e.section_note.replace(/\s+/g, ' ').trim() : '';
  const current = lines.slice(u.start - 1, u.end).join('\n');
  if (current !== u.text) { refuse(u, 'rejected', 'the plan text no longer matches the unit, so the edit was not applied.'); return; }
  const row = u.start === u.end && isRow(current);
  if (action === 'replace') {
    if (newText === null || !newText.trim()) { refuse(u, 'rejected', 'no replacement text was given.'); return; }
    if (row) {
      // One row, optionally with a paragraph beside it. The paragraph is taken as the section note.
      const parts = newText.split('\n').map((x) => x.trim()).filter(Boolean);
      const rows = parts.filter(isRow);
      const prose = parts.filter((x) => !isRow(x));
      if (rows.length !== 1) { refuse(u, 'rejected', 'the replacement would have broken a table row: it holds ' + (rows.length ? rows.length + ' rows' : 'no row') + ' where the table has one.'); return; }
      if (prose.length) note = [note].concat(prose).filter(Boolean).join(' ');
      newText = rows[0];
      if (cellsOf(newText) !== cellsOf(current)) { refuse(u, 'rejected', 'the replacement would have broken a table row: it has ' + cellsOf(newText) + ' cells and the row has ' + cellsOf(current) + '.'); return; }
    } else if (u.start === u.end) newText = newText.replace(/\s*\n\s*/g, ' ').trim();
    if (/^#{1,6}\s/m.test(newText) || /^#{1,6}\s/.test(note)) { refuse(u, 'rejected', 'the replacement would have added a section header.'); return; }
    if (note && !row) { newText = note + (u.start === u.end ? ' ' : '\n\n') + newText; note = ''; }
    if (note) {
      const strange = idsIn(note).filter((id) => !sectionIds(u.start).includes(id) && !idsIn(newText).includes(id));
      if (/\|/.test(note) || note.length > 500) { refuse(u, 'rejected', 'the text given beside the table row is not one short note, so nothing was changed.'); return; }
      if (!DATE_NOTE.test(note)) { refuse(u, 'rejected', 'the replacement put text other than a source-date note beside a table row. Only the row itself and a note about undated sources are accepted there.'); return; }
      if (strange.length) { refuse(u, 'rejected', 'the source-date note names a source its section does not cite (' + strange.join(', ') + ').'); return; }
    }
    if (newText === current && !note) { done.add(uid); refuse(u, 'unchanged', 'the reviser returned the passage unchanged.'); return; }
  }
  if (action === 'delete') note = '';
  let noteAt = null;
  if (note) { noteAt = tableStart(u.start); notesAbove[noteAt] = notesAbove[noteAt] || []; if (!notesAbove[noteAt].includes(note)) notesAbove[noteAt].push(note); }
  lines[u.start - 1] = action === 'delete' ? DELETED : newText;
  for (let i = u.start; i < u.end; i++) lines[i] = DROPPED;
  done.add(uid);
  log.push({ unit: uid, issues: u.issues, action, start: u.start, end: u.end, before: current, after: action === 'delete' ? '' : newText, section_note: note, noteAt });
});
Object.values(units).forEach((u) => { if (!done.has(u.id) && !notApplied[u.id]) refuse(u, 'missing', 'the reviser returned no edit for this unit.'); });

// Build the final text. A deleted table row is removed outright; any other deleted passage becomes a blank line.
const out = [];
const newLine = {};
const noteLine = {};
lines.forEach((l, i) => {
  // A section note stands above its table, as a paragraph of its own.
  if (notesAbove[i]) { if (out.length && out[out.length - 1].trim() !== '') out.push(''); noteLine[i] = out.length + 1; notesAbove[i].forEach((n) => { out.push(n); out.push(''); }); }
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
  unchanged_units: Object.values(units).filter((u) => !log.some((e) => e.unit === u.id)).map((u) => ({ unit: u.id, issues: u.issues, start: u.start, end: u.end, line: newLine[u.start] || u.start, text: u.text, kind: (notApplied[u.id] || {}).kind || 'missing', why: (notApplied[u.id] || {}).why || '' })),
  // Replacements that code refused. Their findings are not corrected: each stays open with its original severity.
  rejected_units: Object.values(units).filter((u) => (notApplied[u.id] || {}).kind === 'rejected').map((u) => ({ unit: u.id, issues: u.issues, line: newLine[u.start] || u.start, why: notApplied[u.id].why })),
  edit_log: log.map((e) => ({ unit: e.unit, issues: e.issues, action: e.action, start: e.start, end: e.end, line: newLine[e.start], before: e.before, after: e.after, ...(e.section_note ? { section_note: e.section_note, section_note_line: noteLine[e.noteAt] } : {}) })),
  first_findings: before.findings || [],
  first_qa_usage: before.qa_usage || null,
  stats: before.stats || null,
  qa_done_ms: before.t_ms || null,
  t_ms: Date.now(),
  before_counts: { blocking: count('BLOCKING'), major: count('MAJOR'), minor: count('MINOR') },
};
