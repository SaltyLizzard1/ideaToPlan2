// Run: node --experimental-strip-types --test tests/lead-notification-content.test.mjs
// What the owner alert says. Mocked like lead-notification.test.mjs: no network, no real records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordAndNotifyLead } from '../lib/leadNotification.ts';

const makeWorld = () => {
  const rows = [];
  const sent = [];
  const deps = {
    insertLead: async (lead) => {
      const key = [lead.brand, lead.source, lead.email.toLowerCase()].join('|');
      if (rows.some((r) => r.key === key)) return { inserted: false };
      rows.push({ id: 'lead-' + (rows.length + 1), key });
      return { inserted: true, id: 'lead-' + rows.length };
    },
    sendNotification: async (subject, body) => { sent.push({ subject, body }); },
    markNotified: async () => {},
  };
  return { rows, sent, deps };
};
const RID = '0c5c6f0e-1d2a-4b3c-8d4e-5f6a7b8c9d0e';

test('the alert carries email, capture time, source and the top match when a result id is given', async () => {
  const w = makeWorld();
  w.deps.now = () => new Date('2026-10-06T08:41:30Z');
  w.deps.lookupTopMatch = async (id) => (id === RID ? '  Remote bookkeeping\n for cafes ' : null);
  assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps, { resultId: RID }), 'notified');
  assert.equal(w.sent[0].body, ['Email: pat@example.com', 'Captured: 2026-10-06 08:41 UTC', 'Source: skills-matcher',
    'Top match: Remote bookkeeping for cafes', 'Results: https://ideatoplan.to/results/' + RID].join('\n'));
});

test('no result id, a malformed one, or a failed lookup still notifies, with the match marked not available', async () => {
  const cases = [
    [{}, async () => 'x'],
    [{ resultId: 'not-a-uuid\nBcc: someone@example.com' }, async () => 'x'],
    [{ resultId: RID }, async () => { throw new Error('db down'); }],
    [{ resultId: RID }, async () => null],
    [{ resultId: RID }, undefined],
  ];
  for (const [context, lookup] of cases) {
    const w = makeWorld();
    if (lookup) w.deps.lookupTopMatch = lookup;
    assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps, context), 'notified');
    assert.match(w.sent[0].body, /^Email: pat@example\.com\nCaptured: \d{4}-\d\d-\d\d \d\d:\d\d UTC\nSource: skills-matcher\nTop match: not available/);
    assert.doesNotMatch(w.sent[0].body, /Bcc/);
  }
});

test('a duplicate lead does no second lookup and sends nothing', async () => {
  const w = makeWorld();
  let lookups = 0;
  w.deps.lookupTopMatch = async () => { lookups += 1; return 'x'; };
  await recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps, { resultId: RID });
  assert.equal(await recordAndNotifyLead('pat@example.com', 'skills-matcher', w.deps, { resultId: RID }), 'duplicate');
  assert.equal(lookups, 1);
  assert.equal(w.sent.length, 1);
});
