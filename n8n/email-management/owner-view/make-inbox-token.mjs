// Creates the read-only token for the I2P Inbox page and writes the three settings the page needs into a
// local, git-ignored env file. Run by Liz. It asks for two values with hidden input and never prints them.
//
//   node make-inbox-token.mjs
//
// It asks for:
//   1. the Supabase JWT secret   (Supabase dashboard > Project Settings > API > JWT Settings > JWT Secret;
//                                 on projects with the newer signing keys it is under "Legacy JWT secret")
//   2. the project's anon key    (same page, "Project API keys" > anon public)
// It writes INBOX_SUPABASE_URL, INBOX_SUPABASE_API_KEY and INBOX_SUPABASE_READ_JWT, and INBOX_FIXTURE=0, to
//   C:\Users\lizal\qylat-analytics-inbox\.env.development.local
// The token can only act as the database role owner_inbox_ro: read email_threads and email_events, nothing else.
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ENV_FILE = process.argv[2] || 'C:\\Users\\lizal\\qylat-analytics-inbox\\.env.development.local';
const URL = 'https://yglmlnfsyzsvozxirlpo.supabase.co';
const DAYS = 365;

// Reads one line from the terminal without showing what is typed or pasted.
const askHidden = (label) => new Promise((resolve, reject) => {
  if (!process.stdin.isTTY) return reject(new Error('Run this in a real terminal window, not through a pipe.'));
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  const onData = (buf) => {
    for (const ch of buf.toString('utf8')) {
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData);
        process.stdout.write('\n');
        return resolve(value.trim());
      }
      if (ch === '\u0003') { process.stdin.setRawMode(false); process.stdout.write('\n'); process.exit(1); }
      if (ch === '\u0008' || ch === '\u007f') value = value.slice(0, -1);
      else value += ch;
    }
  };
  process.stdin.on('data', onData);
});
const b64url = (v) => Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const secret = await askHidden('Paste the Supabase JWT secret, then Enter (nothing will show): ');
if (secret.length < 20) { console.error('That does not look like a JWT secret. Nothing was written.'); process.exit(1); }
const anon = await askHidden('Paste the anon public key, then Enter (nothing will show): ');
if (anon.split('.').length !== 3) { console.error('That does not look like the anon key. Nothing was written.'); process.exit(1); }

const now = Math.floor(Date.now() / 1000);
const exp = now + DAYS * 86400;
const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const body = b64url(JSON.stringify({ role: 'owner_inbox_ro', iss: 'supabase', iat: now, exp }));
const token = head + '.' + body + '.' + b64url(createHmac('sha256', secret).update(head + '.' + body).digest());

const set = { INBOX_SUPABASE_URL: URL, INBOX_SUPABASE_API_KEY: anon, INBOX_SUPABASE_READ_JWT: token, INBOX_FIXTURE: '0' };
const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => l && !Object.keys(set).some((k) => l.startsWith(k + '='))) : [];
for (const [k, v] of Object.entries(set)) lines.push(k + '=' + v);
writeFileSync(ENV_FILE, lines.join('\n') + '\n');

console.log('Written to ' + ENV_FILE + ' (git-ignored).');
console.log('Token role: owner_inbox_ro. Expires: ' + new Date(exp * 1000).toISOString().slice(0, 10) + '.');
console.log('Next: node check-inbox-access.mjs');
process.exit(0);
