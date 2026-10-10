// Run: node --experimental-strip-types --test tests/lead-notification.test.mjs
// Mocked: the database and the alert webhook are in-memory stand-ins. No network, no real records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordAndNotifyLead } from '../lib/leadNotification.ts';

// An in-memory stand-in for lead_notifications with its unique index on (brand, source, lower(email)).
const makeWorld = ({ notifyFails = false, insertFails = false, insertThrows = false, markFails = false } = {}) => {
  const rows = [];
  const sent = [];
  const deps = {
    insertLead: async (lead) => {
      if (insertThrows) throw new Error('connection reset');
      if (insertFails) return { inserted: false, error: 'permission denied for table lead_notifications' };
      const key = [lead.brand, lead.source, lead.email.toLowerCase()].join('|');
      if (rows.some((r) => r.key === key)) return { inserted: false };
      const row = { id: 'lead-' + (rows.length + 1), key, ...lead, notify_status: 'pending' };
      rows.push(row);
      return { inserted: true, id: row.id };
    },
    sendNotification: async (subject, body) => {
      if (notifyFails) throw new Error('alert webhook answered 503');
      sent.push({ subject, body });
    },
    markNotified: async (id, status, error) => {
      if (markFails) throw new Error('update failed');
      Object.assign(rows.find((r) => r.id === id), { notify_status: status, notify_error: error ?? null });
    },
  };
  return { rows, sent, deps };
};

test('a successful capture records one lead and sends one notification', async () => {
  const w = makeWorld();
  assert.equal(await recordAndNotifyLead('  Pat@Example.com ', 'skills-matcher', w.deps), 'notified');
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].email, 'pat@example.com');
  assert.equal(w.rows[0].notify_status, 'sent');
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].subject, 'New Skills Matcher lead');
  assert.match(w.sent[0].body, /pat@example\.com/);
});

test('retries do not duplicate: same email three times, any letter case, is one record and one notification', async () => {
  const w = makeWorld();
  const outcomes = [];
  for (const e of ['pat@example.com', 'PAT@example.com', ' pat@example.com']) outcomes.push(await recordAndNotifyLead(e, 'skills-matcher', w.deps));
  assert.deepEqual(outcomes, ['notified', 'duplicate', 'duplicate']);
  assert.equal(w.rows.length, 1);
  assert.equal(w.sent.length, 1);
});

test('two requests at the same moment still give one notification', async () => {
  const w = makeWorld();
  const outcomes = await Promise.all([recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps), recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps)]);
  assert.deepEqual(outcomes.sort(), ['duplicate', 'notified']);
  assert.equal(w.sent.length, 1);
});

test('a failed notification does not throw, and the failure is recorded on the lead', async () => {
  const w = makeWorld({ notifyFails: true });
  assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps), 'notify_failed');
  assert.equal(w.rows[0].notify_status, 'failed');
  assert.match(w.rows[0].notify_error, /503/);
});

test('a failed notification is not retried by a later visit (no duplicate email later)', async () => {
  const w = makeWorld({ notifyFails: true });
  await recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps);
  assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps), 'duplicate');
  assert.equal(w.rows.length, 1);
});

test('a database failure does not throw and sends nothing', async () => {
  for (const world of [makeWorld({ insertFails: true }), makeWorld({ insertThrows: true })]) {
    assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', world.deps), 'record_failed');
    assert.equal(world.sent.length, 0);
  }
});

test('failing to record the outcome does not throw either', async () => {
  const sentOk = makeWorld({ markFails: true });
  assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', sentOk.deps), 'notified');
  const both = makeWorld({ markFails: true, notifyFails: true });
  assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', both.deps), 'notify_failed');
});

test('a missing or malformed email records nothing and sends nothing', async () => {
  const w = makeWorld();
  for (const bad of [undefined, null, '', '   ', 'not-an-email', 42, { email: 'x@y.z' }]) {
    assert.equal(await recordAndNotifyLead(bad, 'skills-matcher', w.deps), 'invalid');
  }
  assert.equal(w.rows.length, 0);
  assert.equal(w.sent.length, 0);
});
