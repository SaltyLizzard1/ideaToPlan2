// The isolated claim-review replay on the preserved 63237 fixture: its data, its scenarios, and stage one.
// Shared by build-copy.mjs (which writes the workflow file) and simulate.mjs (which runs the same code offline).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REV, EV, FOUNDER, FIN, j, check, buildBatches } from '../tests/claim-helpers.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');

// ---------- the fixed data, slimmed to what the nodes read ----------
const drop = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
export const DATA = async () => {
  const cc = await check(REV);
  return {
    founder: drop(FOUNDER, ['writer_system']),
    fin: drop(FIN, ['starter_user_prompt', 'goal_brief']),
    rev: REV,
    ev: drop(EV, ['verification_log', 'excluded_claims']),
    cc: { ...cc, qa_payload: '' },
    qa: j('Final QA (OpenRouter)')[1],
  };
};
// The second pass of the two-pass scenarios: one sentence of L129 reworded, one ledger entry corrected.
export const VARIANT_B = { from: 'This is a hypothesis, not a finding.', to: 'This is a hypothesis to test in interviews, not a finding.', entry: 'E3', claim: 'Expat US says it has been in business for 19 years.' };

// ---------- stage one ----------
// Known defects and valid controls, by category. "expect" is what a correct review returns: "defect" or "settle".
// "basis" says where the expectation comes from: a rule in code that already reports the same sentence, the intake or
// ledger text itself, or my own reading of the plan against them. Nothing in this list is sent to the model: the
// request carries the claims, the intake and the ledger, and the instructions quote nothing from this plan.
export const STAGE_ONE = [
  // intake attribution
  { cat: 'intake attribution', line: 27, re: /^The model is designed this way deliberately/, expect: 'defect', basis: 'code: UNKNOWN STATED AS NONE at L27' },
  { cat: 'intake attribution', line: 251, re: /^None of these is modeled here/, expect: 'defect', basis: 'code: UNKNOWN STATED AS NONE at L251' },
  { cat: 'intake attribution', line: 287, re: /^These are not optional checks: the offer involves/, expect: 'defect', basis: 'my reading: the intake lists planning tools and sessions, not financial advice, and does not say the business operates globally' },
  { cat: 'intake attribution', line: 27, re: /^You have described additional revenue streams/, expect: 'settle', basis: 'intake: "digital planning products, affiliate commissions ..."' },
  { cat: 'intake attribution', line: 37, re: /^Your target customer is an adult, typically aged 40 to 60/, expect: 'settle', basis: 'intake: "adult, typically age 40 to 60, who is financially stable ..."' },
  { cat: 'intake attribution', line: 25, re: /^The business is designed to serve adults/, expect: 'settle', basis: 'intake, and it reports the customer\'s doubt, not feasibility' },
  // payment
  { cat: 'payment', line: 129, re: /^If customer interviews confirm/, expect: 'defect', basis: 'code: PAYMENT STATED WITHOUT EVIDENCE at L129' },
  { cat: 'payment', line: 127, re: /^Whether any of these providers charges a fee/, expect: 'settle', basis: 'labelled as not established' },
  { cat: 'payment', line: 75, re: /^Not established from the sources reviewed/, expect: 'settle', basis: 'labelled as not established' },
  // company focus
  { cat: 'company focus', line: 79, re: /^Our read: Expat US is focused/, expect: 'defect', basis: 'code: PROVIDER FOCUS STATED WITHOUT EVIDENCE at L79' },
  { cat: 'company focus', line: 103, re: /^Our read: Relocate Now appears/, expect: 'defect', basis: 'my reading: E10 lists what the platform offers and says nothing of who it is for' },
  { cat: 'company focus', line: 113, re: /^Established legal and immigration firm/, expect: 'defect', basis: 'my reading: E17 describes one service and does not say the firm is established' },
  { cat: 'company focus', line: 77, re: /^19 years in business/, expect: 'defect', basis: 'ledger: the entry that says so (E3) was verified on S1, and the sentence cites S3' },
  { cat: 'company focus', line: 73, re: /^Global companies and their employees/, expect: 'settle', basis: 'ledger: E1, on S1, says this' },
  { cat: 'company focus', line: 98, re: /^A digital platform offering relocation, tax support/, expect: 'settle', basis: 'ledger: E10, on S10, lists these' },
  { cat: 'company focus', line: 110, re: /^Help for employers to plan for digital nomads/, expect: 'settle', basis: 'ledger: E17, on S15, says this' },
  { cat: 'company focus', line: 79, re: /^This is a hypothesis to test\./, expect: 'settle', basis: 'labelled as a hypothesis' },
  // survey scope
  { cat: 'survey scope', line: 483, re: /^The problem you are addressing/, expect: 'defect', basis: 'code: PROBLEM STATED AS CONFIRMED at L483' },
  { cat: 'survey scope', line: 43, re: /^It does suggest that logistical friction is a real and reported experience/, expect: 'defect', basis: 'code: PROBLEM STATED AS CONFIRMED at L43' },
  { cat: 'survey scope', line: 43, re: /^Nearly two-thirds of 600 surveyed travelers/, expect: 'settle', basis: 'ledger: E43 says this, with the sample' },
  { cat: 'survey scope', line: 483, re: /^Nearly two-thirds of 600 surveyed travelers/, expect: 'settle', basis: 'ledger: E43 says this, with the sample' },
  { cat: 'survey scope', line: 43, re: /^This is a survey of 600 travelers, not a population figure/, expect: 'settle', basis: 'it states the limits of the survey, which E43 bears out' },
  // substitute limitations
  { cat: 'substitute limitations', line: 127, re: /^The free substitutes, blogs, forums/, expect: 'defect', basis: 'code: SUBSTITUTE LIMITATION STATED WITHOUT EVIDENCE at L127' },
  { cat: 'substitute limitations', line: 127, re: /^Whether a gap exists at the pre-decision stage/, expect: 'settle', basis: 'labelled as a hypothesis' },
  { cat: 'substitute limitations', line: 123, re: /^how widely it is used is not established/, expect: 'settle', basis: 'labelled as not established' },
  { cat: 'substitute limitations', line: 122, re: /^Curated tools and services for every stage/, expect: 'settle', basis: 'ledger: E21, on S13, says this' },
  // uncited assertions
  { cat: 'uncited assertions', line: 462, re: /^Reasoning: People who are seriously considering/, expect: 'defect', basis: 'my reading: a general statement about people, with no source and no label; missed in the replay' },
  { cat: 'uncited assertions', line: 462, re: /^Facebook groups, Reddit communities/, expect: 'defect', basis: 'my reading: a statement about where customers gather, with no source and no label' },
  { cat: 'uncited assertions', line: 37, re: /^Customer conversations should test this hypothesis directly\./, expect: 'settle', basis: 'an instruction' },
  { cat: 'uncited assertions', line: 133, re: /^What did it give you that was useful/, expect: 'settle', basis: 'a question to ask customers' },
  { cat: 'uncited assertions', line: 382, re: /^Done when: 10 conversations completed\./, expect: 'settle', basis: 'a done-when condition' },
  { cat: 'uncited assertions', line: 304, re: /^Low$/, expect: 'settle', basis: 'a rating word' },
  { cat: 'uncited assertions', line: 37, re: /^They may be thinking about long-term travel/, expect: 'settle', basis: 'the intake describes these wishes, and the sentence is hedged' },
  // not scored: reasonable reviewers could differ. Sent so that the answers can be read, not counted.
  { cat: 'not scored', line: 89, re: /^Comprehensive operational coverage/, expect: 'either', basis: 'E6 lists many services; whether "comprehensive" goes beyond it is a judgment' },
  { cat: 'not scored', line: 102, re: /^A customer who wants a self-serve/, expect: 'either', basis: 'a hedged sentence in a profile; the rules ask for a split' },
  { cat: 'not scored', line: 25, re: /^What they need is a structured, personalized plan/, expect: 'either', basis: 'the founder\'s hypothesis continued from the sentence before, with no label of its own' },
];
// CLARIFICATIONS OF THE KEY, RECORDED AFTER THE MODEL WAS ASKED (execution 63256). The key above is as it was when the
// requests were sent, and the score of that execution was computed against it and stands. A clarification changes no
// score. It says how an expectation is to be read from here on.
export const KEY_CLARIFICATIONS = [
  { line: 287, recorded: '2026-10-06', by: 'Liz', text: 'The sentence states two things. That the business operates globally is supported by the intake ("Where the business will operate: everywhere"), so the basis written in the key is wrong on that point. That the offer involves financial advice is judged separately: planning sessions alone do not establish that service. The expected defect is the financial-advice part only.' },
];
export const stageOne = async () => {
  const { items } = await buildBatches();
  const claims = items[0].claim_map.claims;
  return STAGE_ONE.map((k) => { const c = claims.find((x) => x.line === k.line && k.re.test(x.text)); if (!c) throw new Error('stage one: no claim at L' + k.line + ' for ' + k.re); return { id: c.id, line: c.line, cat: k.cat, expect: k.expect, basis: k.basis, text: c.text }; });
};
// Completeness, detection and false positives are three numbers. None of them stands for the others.
export const scoreStageOne = (key, records) => {
  const byId = Object.fromEntries(records.map((r) => [r.id, r]));
  const row = (k) => ({ ...k, status: (byId[k.id] || {}).status || 'absent', check: (byId[k.id] || {}).check || '', why: (byId[k.id] || {}).why || '' });
  const rows = key.map(row);
  const targets = rows.filter((r) => r.expect === 'defect'), controls = rows.filter((r) => r.expect === 'settle');
  const cats = [...new Set(rows.filter((r) => r.expect !== 'either').map((r) => r.cat))];
  return {
    completeness: { sent: rows.length, usable: rows.filter((r) => r.status === 'settled' || r.status === 'defect').length, unreviewed: rows.filter((r) => r.status === 'open' || r.status === 'absent').map((r) => 'L' + r.line + ' ' + r.id) },
    detection: { targets: targets.length, found: targets.filter((r) => r.status === 'defect').length, missed_as_settled: targets.filter((r) => r.status === 'settled').map((r) => 'L' + r.line + ' ' + r.id), left_unreviewed: targets.filter((r) => r.status === 'open' || r.status === 'absent').map((r) => 'L' + r.line + ' ' + r.id) },
    false_positives: { controls: controls.length, wrongly_defect: controls.filter((r) => r.status === 'defect').map((r) => 'L' + r.line + ' ' + r.id + ' ' + r.check), left_unreviewed: controls.filter((r) => r.status === 'open' || r.status === 'absent').map((r) => 'L' + r.line + ' ' + r.id) },
    by_category: Object.fromEntries(cats.map((c) => [c, { targets_found: targets.filter((r) => r.cat === c && r.status === 'defect').length + ' of ' + targets.filter((r) => r.cat === c).length, controls_settled: controls.filter((r) => r.cat === c && r.status === 'settled').length + ' of ' + controls.filter((r) => r.cat === c).length }])),
    not_scored: rows.filter((r) => r.expect === 'either').map((r) => 'L' + r.line + ' ' + r.status + (r.check ? ' ' + r.check : '')),
  };
};

// ---------- the scenarios ----------
export const scenarioList = (tokenA, stageIds) => [
  { mode: 'scenarios', name: 'A1 baseline', plan: 'A' },
  { mode: 'scenarios', name: 'A2 failed middle request', plan: 'A', faults: { fail_batches: [7] } },
  { mode: 'scenarios', name: 'A3 missing output', plan: 'A', faults: { drop_batches: [5] } },
  { mode: 'scenarios', name: 'A4 truncated answers', plan: 'A', faults: { cut_partial: { 9: 3 }, cut_unreadable: [3] } },
  { mode: 'scenarios', name: 'A5 reordered results', plan: 'A', faults: { shuffle: [5, 0, 12, 3, 9, 1, 7, 11, 2, 6, 10, 4, 8] } },
  { mode: 'scenarios', name: 'A6 failed, missing and reversed together', plan: 'A', faults: { fail_batches: [7], drop_batches: [5], reverse: true } },
  { mode: 'scenarios', name: 'A7 missing, contradictory and wrong-batch verdicts', plan: 'A', faults: { omit: [[2, 0]], contradict: [[2, 2]], wrong_batch_claim: { from: [4, 0], to: 1 }, declare: { 11: 12 } } },
  { mode: 'scenarios', name: 'B1 second pass, only first-pass answers arrive', plan: 'B', evidence: 'B', faults: { stale_token: tokenA } },
  { mode: 'scenarios', name: 'B2 second pass, own answers and five old ones', plan: 'B', evidence: 'B', faults: { prepend_stale: 5, prepend_stale_token: tokenA } },
  { mode: 'scenarios', name: 'A8 first text again after the second', plan: 'A' },
  { mode: 'sequential_dry', name: 'S1 sequential, every request', plan: 'A', sequential: true },
  { mode: 'sequential_dry', name: 'S2 sequential, ceiling reached', plan: 'A', sequential: true, ceiling_usd: 0.6 },
  { mode: 'sequential_dry', name: 'S3 sequential, a response without its cost', plan: 'A', sequential: true, faults: { no_cost_batches: [3] } },
  { mode: 'sequential_dry', name: 'S4 sequential, a failed request', plan: 'A', sequential: true, faults: { fail_batches: [2] } },
  { mode: 'sequential_dry', name: 'S5 sequential, a cut-off answer', plan: 'A', sequential: true, faults: { cut_unreadable: [1] } },
  { mode: 'sequential_dry', name: 'S6 sequential, an answer for another review', plan: 'A', sequential: true, faults: { stale_token: 'R0000000' } },
  { mode: 'stage_one', name: 'stage one', plan: 'A', sequential: true, selection: stageIds },
];
export const CONFIG = { dry_run: true, mode: 'scenarios', only: '', ceiling_usd: 2.25, max_requests: 13, usd_per_m_in: 3, usd_per_m_out: 15 };
