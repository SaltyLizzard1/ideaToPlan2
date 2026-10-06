// Checks that the I2P Inbox token works and is as narrow as intended. Read-only in effect: the two write
// attempts target a conversation id that does not exist, so nothing can be written even if a check fails.
// Prints status codes only, never the token or the key.
//
//   node check-inbox-access.mjs
import { readFileSync } from 'node:fs';

const ENV_FILE = process.argv[2] || 'C:\\Users\\lizal\\qylat-analytics-inbox\\.env.development.local';
const env = Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const { INBOX_SUPABASE_URL: url, INBOX_SUPABASE_API_KEY: key, INBOX_SUPABASE_READ_JWT: jwt } = env;
if (!url || !key || !jwt) { console.error('FAIL: the env file is missing one of the three INBOX_SUPABASE settings. Run make-inbox-token.mjs first.'); process.exit(1); }

const claims = JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
console.log('Token role: ' + claims.role + ', expires ' + new Date(claims.exp * 1000).toISOString().slice(0, 10));

const call = async (method, path, body) => {
  const res = await fetch(url + '/rest/v1/' + path, {
    method, headers: { apikey: key, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  let code = '';
  try { code = (await res.json()).code || ''; } catch (e) { /* no body */ }
  return { status: res.status, code };
};
const NOBODY = '00000000-0000-0000-0000-000000000000';
const allowed = (r) => r.status === 200;
const denied = (r) => r.status === 401 || r.status === 403 || r.code === '42501';
const checks = [
  ['can read conversations (email_threads)', 'GET', 'email_threads?select=id&limit=1', null, allowed],
  ['can read the history (email_events)', 'GET', 'email_events?select=id&limit=1', null, allowed],
  ['cannot read orders (idea_submissions)', 'GET', 'idea_submissions?select=id&limit=1', null, denied],
  ['cannot read plan versions', 'GET', 'plan_versions?select=id&limit=1', null, denied],
  ['cannot read quiz results', 'GET', 'quiz_results?select=id&limit=1', null, denied],
  ['cannot read leads (lead_notifications)', 'GET', 'lead_notifications?select=id&limit=1', null, denied],
  ['cannot read the model budget', 'GET', 'email_model_budget?select=scope&limit=1', null, denied],
  ['cannot add to the history', 'POST', 'email_events', { thread_id: NOBODY, event_type: 'owner_action', direction: 'internal' }, denied],
  ['cannot change a conversation', 'PATCH', 'email_threads?id=eq.' + NOBODY, { status_reason: 'access check' }, denied],
  ['cannot call the claim function', 'POST', 'rpc/email_fail_stuck', { p_minutes: 100000 }, denied],
];

let failed = 0;
for (const [label, method, path, body, ok] of checks) {
  let r;
  try { r = await call(method, path, body); } catch (e) { r = { status: 0, code: String(e.message).slice(0, 60) }; }
  const pass = ok(r);
  if (!pass) failed += 1;
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + '  [' + r.status + (r.code ? ' ' + r.code : '') + ']');
}
console.log(failed === 0 ? 'ALL ACCESS CHECKS PASSED' : failed + ' CHECK(S) FAILED. Do not deploy the inbox page with this token.');
process.exit(failed === 0 ? 0 : 1);
