// A corrected text is saved as the next version of the order its parent belongs to. Reads only.
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
const cited = [...new Set(text.match(/\b[SW]\d+\b/g) || [])];
const missing = cited.filter((c) => !sources.some((x) => x && x.id === c));
if (missing.length) throw new Error('The corrected text cites ' + missing.join(', ') + ', which the sources do not contain. A correction may not introduce a source. Nothing was created.');
const goal = s.plan_goal === 'bank-loan' ? 'Bank Loan' : s.plan_goal === 'investor' ? 'Investor Pitch' : 'Personal Roadmap';
return [{ json: {
  parent_version_id: parent.id, parent_version: parent.version, submission_id: parent.submission_id,
  parent_review_status: parent.review_status || 'NOT RECORDED', parent_review_notes: parent.review_notes || '',
  text, note: String(input.note || '').trim(), sources_cited: sources, sources_from: sourcesFrom,
  client_name: s.client_name || '', email: s.email || '', package: s.package || 'Unknown', plan_goal_clean: goal,
} }];
