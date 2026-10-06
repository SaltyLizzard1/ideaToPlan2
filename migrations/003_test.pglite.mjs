// Tests migration 003 in a disposable in-memory Postgres (PGlite). Nothing here touches Supabase.
// Run from a folder where @electric-sql/pglite is installed:  node 003_test.pglite.mjs <path to 003 .sql>
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MIGRATION = readFileSync(process.argv[2], 'utf8');
const sha = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const SUB = '11111111-1111-1111-1111-111111111111';
const PDF_A = 'a'.repeat(64), PDF_B = 'b'.repeat(64);

// The schema as it is today: the 11 columns read from the API description, the three unique indexes Liz pasted, and
// the grants recorded earlier (the workflow role has select, insert and update, no delete).
const TODAY = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;
create table public.idea_submissions (id uuid primary key);
create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.idea_submissions(id) on delete restrict,
  version integer not null,
  pdf_path text not null,
  status text not null default 'awaiting_approval',
  approved_at timestamptz, sent_at timestamptz, gmail_message_id text,
  created_at timestamptz not null default now(),
  review_status text, review_notes text,
  unique (submission_id, version)
);
create unique index plan_versions_one_in_flight on public.plan_versions (submission_id)
  where status in ('awaiting_approval', 'sending', 'send_unknown');
alter table public.plan_versions enable row level security;
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.plan_versions to service_role;
insert into public.idea_submissions values ('${SUB}');
insert into public.plan_versions (submission_id, version, pdf_path, status, review_status, review_notes, sent_at) values
  ('${SUB}', 1, 's/v1.pdf', 'sent', 'REVIEW', 'old notes', now()),
  ('${SUB}', 2, 's/v2.pdf', 'send_failed', 'TEST DATA', 'old notes', null),
  ('${SUB}', 3, 's/v3.pdf', 'changes_requested', 'HOLD', 'old hold report', null);
`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + ' ' + extra); } };

async function fresh() { const db = new PGlite(); await db.exec(TODAY); return db; }
// Runs sql as a role; returns null on success or the error message.
async function attempt(db, sql, role = 'service_role') {
  await db.exec('begin; set local role ' + role + ';');
  try { await db.exec('savepoint s; ' + sql + '; release savepoint s; commit;'); return null; }
  catch (e) { await db.exec('rollback;'); return String(e.message); }
}
const refused = async (db, name, sql, re, role) => { const e = await attempt(db, sql, role); ok(name, e !== null && re.test(e), 'got: ' + e); };
const allowed = async (db, name, sql, role) => { const e = await attempt(db, sql, role); ok(name, e === null, 'got: ' + e); };
const one = async (db, sql) => (await db.query(sql)).rows[0];

// A new fingerprinted version, inserted the way the pipeline will, as the workflow role.
let nextVersion = 10;
async function newVersion(db, { status = 'awaiting_approval', review = 'HOLD', text } = {}) {
  const v = nextVersion++; const t = text || 'Plan text ' + v + ' with a café.';
  const sub = (await db.query('insert into public.idea_submissions values (gen_random_uuid()) returning id')).rows[0].id;
  await db.exec('set role service_role');
  const r = await db.query(`insert into public.plan_versions (submission_id, version, pdf_path, status, review_status, review_notes, plan_text, sources_cited, plan_sha256, pdf_sha256, origin)
    values ($1, $2, $3, $4, $5, 'automated report', $6, '[]'::jsonb, $7, $8, 'generated') returning id`, [sub, v, sub + '/v' + v + '.pdf', status, review, t, sha(t), PDF_A]);
  await db.exec('reset role');
  return { id: r.rows[0].id, plan: sha(t) };
}
const release = (db, id) => db.query(`insert into public.plan_reviews (plan_version_id, decision, reviewer, incomplete_checks_disposition, ai_prepared_by)
  values ($1, 'release_for_approval', 'Liz Alfond', 'Reviewed by hand: 40 unanswered claims, no defect found.', 'Claude')`, [id]);
const claim = (v, plan = v.plan, pdf = PDF_A) => `update public.plan_versions set status = 'sending', approved_at = now(), approved_plan_sha256 = '${plan}', approved_pdf_sha256 = '${pdf}' where id = '${v.id}' and status = 'awaiting_approval'`;

console.log('A. The migration applies, and leaves existing rows alone');
let db = await fresh();
const before = (await db.query('select id, status, review_status, review_notes, pdf_path, created_at, sent_at from public.plan_versions order by version')).rows;
await db.exec(MIGRATION);
const after = (await db.query('select id, status, review_status, review_notes, pdf_path, created_at, sent_at from public.plan_versions order by version')).rows;
ok('existing rows are identical in every old column', JSON.stringify(before) === JSON.stringify(after));
const nulls = await one(db, 'select count(*)::int total, count(plan_text)::int a, count(plan_sha256)::int b, count(pdf_sha256)::int c, count(origin)::int d, count(parent_version_id)::int e, count(approved_plan_sha256)::int f, count(approved_pdf_sha256)::int g from public.plan_versions');
ok('every new column is empty on existing rows', nulls.total === 3 && nulls.a + nulls.b + nulls.c + nulls.d + nulls.e + nulls.f + nulls.g === 0);

console.log('B. A failure rolls the whole migration back');
{
  const d2 = await fresh();
  await d2.exec('create table public.plan_reviews (id int)');            // makes PART 2 fail after PART 1 has run
  let err = null; try { await d2.exec(MIGRATION); } catch (e) { err = e.message; }
  try { await d2.exec('rollback'); } catch (e) { /* already closed */ }
  const cols = (await d2.query("select count(*)::int n from information_schema.columns where table_name = 'plan_versions' and column_name in ('plan_text', 'plan_sha256', 'approved_pdf_sha256')")).rows[0].n;
  const trg = (await d2.query("select count(*)::int n from pg_trigger where tgname = 'plan_versions_guard'")).rows[0].n;
  ok('the migration stops with an error', err !== null, String(err));
  ok('no column and no trigger was left behind', cols === 0 && trg === 0, 'columns ' + cols + ', triggers ' + trg);
  await d2.close();
}

console.log('C. Historical versions and the existing workflows keep working (no fingerprints)');
const legacySub = (await db.query('insert into public.idea_submissions values (gen_random_uuid()) returning id')).rows[0].id;
await allowed(db, 'old-style insert with review columns, default status', `insert into public.plan_versions (submission_id, version, pdf_path, review_status, review_notes) values ('${legacySub}', 1, 'l/v1.pdf', 'REVIEW', 'report')`);
await allowed(db, 'old Claim: awaiting_approval to sending with approved_at only', `update public.plan_versions set status = 'sending', approved_at = now() where submission_id = '${legacySub}' and status = 'awaiting_approval'`);
await allowed(db, 'old Record Sent: sending to sent', `update public.plan_versions set status = 'sent', sent_at = now(), gmail_message_id = 'm1' where submission_id = '${legacySub}' and status = 'sending'`);
await allowed(db, 'old Reopen and Record Timeout on a historical row', `update public.plan_versions set status = 'approval_timeout' where submission_id = '${SUB}' and version = 3; update public.plan_versions set status = 'awaiting_approval' where submission_id = '${SUB}' and version = 3`);
await allowed(db, 'old Record Send Error path on a historical row', `update public.plan_versions set status = 'sending' where submission_id = '${SUB}' and version = 3; update public.plan_versions set status = 'send_failed' where submission_id = '${SUB}' and version = 3`);

console.log('D. Content and the automated result cannot change');
const d = await newVersion(db);
await refused(db, 'insert with a plan fingerprint that does not match the text', `insert into public.plan_versions (submission_id, version, pdf_path, plan_text, plan_sha256, pdf_sha256) values ('${legacySub}', 50, 'x', 'some text', '${'c'.repeat(64)}', '${PDF_A}')`, /does not match plan_text/);
await refused(db, 'insert with text but no fingerprints', `insert into public.plan_versions (submission_id, version, pdf_path, plan_text) values ('${legacySub}', 51, 'x', 'some text')`, /does not match plan_text|plan_versions_fingerprints_together/);
await refused(db, 'insert a fingerprinted version as already sending', `insert into public.plan_versions (submission_id, version, pdf_path, status, plan_text, plan_sha256, pdf_sha256) values ('${legacySub}', 52, 'x', 'sending', 't', '${sha('t')}', '${PDF_A}')`, /cannot be inserted as/);
for (const [col, val] of [['plan_text', "'changed'"], ['pdf_path', "'other.pdf'"], ['pdf_sha256', `'${PDF_B}'`], ['review_status', "'SEND'"], ['review_notes', "'edited'"], ['sources_cited', `'[1]'::jsonb`], ['origin', "'hand_corrected'"]])
  await refused(db, 'update of ' + col + ' is refused', `update public.plan_versions set ${col} = ${val} where id = '${d.id}'`, /cannot be changed/);
await refused(db, 'update of review_notes on a historical row is refused too', `update public.plan_versions set review_notes = 'resolution' where submission_id = '${SUB}' and version = 1`, /cannot be changed/);

console.log('E. A fingerprinted version cannot enter sending or sent without approval');
const e1 = await newVersion(db);
await refused(db, 'status to sending with null approved fingerprints', `update public.plan_versions set status = 'sending', approved_at = now() where id = '${e1.id}'`, /approved fingerprints are missing/);
await refused(db, 'status straight to sent with null approved fingerprints', `update public.plan_versions set status = 'sent', sent_at = now() where id = '${e1.id}'`, /approved fingerprints are missing/);
await refused(db, 'correct approved fingerprints but no release record', claim(e1), /no matching human release record/);
await release(db, e1.id);
await refused(db, 'release record exists but the approved PDF fingerprint is not this version\'s', claim(e1, e1.plan, PDF_B), /are not its own/);
await refused(db, 'release record exists but the approved text fingerprint is not this version\'s', claim(e1, 'd'.repeat(64), PDF_A), /are not its own/);
await refused(db, 'release record exists but status changes to sending without the approved fingerprints', `update public.plan_versions set status = 'sending' where id = '${e1.id}'`, /approved fingerprints are missing/);
await refused(db, 'approved fingerprints written without entering sending', `update public.plan_versions set approved_plan_sha256 = '${e1.plan}', approved_pdf_sha256 = '${PDF_A}' where id = '${e1.id}'`, /only when an awaiting_approval version is claimed/);
const e2 = await newVersion(db, { status: 'changes_requested' });
await release(db, e2.id);
await refused(db, 'a held version (changes_requested) cannot be claimed directly, even with a release record', `update public.plan_versions set status = 'sending', approved_plan_sha256 = '${e2.plan}', approved_pdf_sha256 = '${PDF_A}' where id = '${e2.id}'`, /only when an awaiting_approval version is claimed/);

console.log('F. The normal reviewed paths remain valid, as the workflow role');
await allowed(db, 'reviewed approval: Claim with the version\'s own fingerprints', claim(e1));
await refused(db, 'approved fingerprints cannot be changed afterwards', `update public.plan_versions set approved_pdf_sha256 = '${PDF_B}' where id = '${e1.id}'`, /cannot be changed/);
await allowed(db, 'successful send: sending to sent', `update public.plan_versions set status = 'sent', sent_at = now(), gmail_message_id = 'm2' where id = '${e1.id}' and status = 'sending'`);
const f1 = await newVersion(db); await release(db, f1.id);
await allowed(db, 'send failure: Claim, then sending to send_failed', claim(f1) + `; update public.plan_versions set status = 'send_failed' where id = '${f1.id}' and status = 'sending'`);
await allowed(db, 'after a failed send: back to awaiting_approval, claimed again with the same fingerprints, then sent', `update public.plan_versions set status = 'awaiting_approval' where id = '${f1.id}'; ` + claim(f1) + `; update public.plan_versions set status = 'sent', sent_at = now() where id = '${f1.id}'`);
const f2 = await newVersion(db); await release(db, f2.id);
await allowed(db, 'uncertain send: Claim, send_unknown, then reconciled to sent', claim(f2) + `; update public.plan_versions set status = 'send_unknown' where id = '${f2.id}'; update public.plan_versions set status = 'sent', sent_at = now() where id = '${f2.id}'`);
const f3 = await newVersion(db);
await allowed(db, 'request changes and timeout need no approval', `update public.plan_versions set status = 'changes_requested' where id = '${f3.id}'; update public.plan_versions set status = 'awaiting_approval' where id = '${f3.id}'; update public.plan_versions set status = 'approval_timeout' where id = '${f3.id}'`);
const f4 = await newVersion(db, { review: 'SEND' });
await refused(db, 'a version the gate passed still needs a release record', claim(f4), /no matching human release record/);

console.log('G. Review records: who can write, and what they hold');
const g = await newVersion(db);
const ins = (id, extra = {}) => `insert into public.plan_reviews (plan_version_id, decision, reviewer, incomplete_checks_disposition) values ('${id}', '${extra.decision || 'release_for_approval'}', '${extra.reviewer ?? 'Liz Alfond'}', '${extra.disp ?? 'None incomplete.'}')`;
for (const role of ['service_role', 'anon', 'authenticated']) await refused(db, role + ' cannot insert a review record', ins(g.id), /permission denied/, role);
await refused(db, 'service_role cannot update a review record', `update public.plan_reviews set notes = 'x'`, /permission denied/);
await refused(db, 'service_role cannot delete a review record', `delete from public.plan_reviews`, /permission denied/);
await refused(db, 'service_role cannot truncate review records', `truncate public.plan_reviews`, /permission denied/);
await allowed(db, 'service_role can read review records', `select count(*) from public.plan_reviews`);
await refused(db, 'anon cannot read review records', `select count(*) from public.plan_reviews`, /permission denied/, 'anon');
await refused(db, 'empty disposition is refused', ins(g.id, { disp: '   ' }), /check constraint/, 'postgres');
await refused(db, 'empty reviewer is refused', ins(g.id, { reviewer: '' }), /check constraint/, 'postgres');
await refused(db, 'release of a version without fingerprints is refused', ins(before[2].id), /has no fingerprints/, 'postgres');
await refused(db, 'review of a version that does not exist is refused', ins('99999999-9999-9999-9999-999999999999'), /does not exist/, 'postgres');
await allowed(db, 'the dashboard role can insert a release', ins(g.id), 'postgres');
await refused(db, 'a second release for the same version is refused', ins(g.id), /plan_reviews_one_release/, 'postgres');
await allowed(db, 'a note on a historical version is accepted', ins(before[0].id, { decision: 'note', disp: 'Not applicable: resolution note.' }), 'postgres');
await refused(db, 'the dashboard role cannot update a record', `update public.plan_reviews set notes = 'x'`, /cannot be changed or deleted/, 'postgres');
await refused(db, 'the dashboard role cannot delete a record', `delete from public.plan_reviews`, /cannot be changed or deleted/, 'postgres');
const typed = await attempt(db, `insert into public.plan_reviews (plan_version_id, decision, reviewer, incomplete_checks_disposition, automated_review_status, plan_sha256, pdf_sha256, recorded_by) values ('${f3.id}', 'keep_on_hold', 'Liz Alfond', 'x', 'SEND', '${'e'.repeat(64)}', '${'e'.repeat(64)}', 'someone')`, 'postgres');
const rec = await one(db, `select r.automated_review_status s, r.automated_review_notes n, r.plan_sha256 = v.plan_sha256 and r.pdf_sha256 = v.pdf_sha256 as same, r.recorded_by from public.plan_reviews r join public.plan_versions v on v.id = r.plan_version_id where v.id = '${f3.id}'`);
ok('typed-in status, fingerprints and recorder are overwritten from the version', typed === null && rec.s === 'HOLD' && rec.n === 'automated report' && rec.same === true && rec.recorded_by === 'postgres', JSON.stringify(rec));
const hold = await one(db, `select review_status from public.plan_versions where id = '${e1.id}'`);
ok('a released and sent version still reads HOLD', hold.review_status === 'HOLD');

console.log('H. The verification queries run');
const priv = (await db.query(`select r.rolname, has_table_privilege(r.oid, 'public.plan_reviews', 'SELECT') s, has_table_privilege(r.oid, 'public.plan_reviews', 'INSERT') i, has_table_privilege(r.oid, 'public.plan_reviews', 'UPDATE') u, has_table_privilege(r.oid, 'public.plan_reviews', 'DELETE') d, has_table_privilege(r.oid, 'public.plan_reviews', 'TRUNCATE') t from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator') or r.oid in (select roleid from pg_auth_members where member = 'authenticator'::regrole) order by 1`)).rows;
ok('privilege query: service_role select only, the others nothing', priv.length === 4 && priv.every((p) => !p.i && !p.u && !p.d && !p.t && p.s === (p.rolname === 'service_role')), JSON.stringify(priv));
const trg = (await db.query(`select tgrelid::regclass::text t, tgname, tgenabled from pg_trigger where tgrelid in ('public.plan_versions'::regclass, 'public.plan_reviews'::regclass) and not tgisinternal order by 1`)).rows;
ok('trigger query: both guards enabled', trg.length === 2 && trg.every((x) => x.tgenabled === 'O'), JSON.stringify(trg));
const rls = await one(db, `select relrowsecurity r, (select count(*)::int from pg_policies where tablename = 'plan_reviews') p from pg_class where oid = 'public.plan_reviews'::regclass`);
ok('row level security on, no policies', rls.r === true && rls.p === 0);

console.log('\n' + (await one(db, 'select version() v')).v.split(' on ')[0] + ': ' + pass + ' passed, ' + fail + ' failed');
await db.close();
process.exit(fail ? 1 : 0);
