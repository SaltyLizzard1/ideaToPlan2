// Skills Matcher lead notification: record the lead once, notify the owner once.
//
// The record is the guard. A unique index on (brand, source, lower(email)) in lead_notifications means a retry,
// a double click or a second visit inserts nothing, and nothing inserted means no second notification.
// This function never throws: whatever goes wrong here, the visitor still gets their results.
// It takes its dependencies as arguments so it can be tested without a database or a network.

export type LeadOutcome = 'notified' | 'duplicate' | 'invalid' | 'record_failed' | 'notify_failed';

export type LeadDeps = {
  /** Inserts the lead. inserted is false when it already existed. Must not throw; report problems as error. */
  insertLead: (lead: { brand: 'i2p'; source: string; email: string }) => Promise<{ inserted: boolean; id?: string; error?: string }>;
  /** Sends the owner notification. Throws when it could not be sent. */
  sendNotification: (subject: string, body: string) => Promise<void>;
  /** Records how the notification went. */
  markNotified: (id: string, status: 'sent' | 'failed', error?: string) => Promise<void>;
  /** Optional. The title of the top match for a result id, or null. Its failure never stops the notification. */
  lookupTopMatch?: (resultId: string) => Promise<string | null>;
  /** Optional clock, for tests. */
  now?: () => Date;
};

export type LeadContext = { resultId?: unknown };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A result id is 12 hex characters (see app/api/quiz/route.ts). Hyphenated ids are accepted too.
const RESULT_ID = /^[0-9a-f]{12}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The matched opportunity is read from the stored result, never taken from the browser. Anything that goes
// wrong here leaves it as "not available"; it can never stop or delay the notification itself.
async function topMatchLine(context: LeadContext, deps: LeadDeps): Promise<string[]> {
  const resultId = typeof context.resultId === 'string' && RESULT_ID.test(context.resultId) ? context.resultId : null;
  if (!resultId || !deps.lookupTopMatch) return ['Top match: not available'];
  let title: string | null = null;
  try {
    title = await deps.lookupTopMatch(resultId);
  } catch (err) {
    console.error('LEAD: looking up the top match failed', err);
  }
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return [`Top match: ${clean || 'not available'}`, `Results: https://ideatoplan.to/results/${resultId}`];
}

export async function recordAndNotifyLead(rawEmail: unknown, source: string, deps: LeadDeps, context: LeadContext = {}): Promise<LeadOutcome> {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) return 'invalid';

  let record: { inserted: boolean; id?: string; error?: string };
  try {
    record = await deps.insertLead({ brand: 'i2p', source, email });
  } catch (err) {
    console.error('LEAD: recording the lead threw', err);
    return 'record_failed';
  }
  if (record.error) {
    console.error('LEAD: recording the lead failed', record.error);
    return 'record_failed';
  }
  if (!record.inserted || !record.id) return 'duplicate';

  const capturedAt = (deps.now ? deps.now() : new Date()).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const lines = [`Email: ${email}`, `Captured: ${capturedAt}`, `Source: ${source}`, ...(await topMatchLine(context, deps))];

  try {
    await deps.sendNotification('New Skills Matcher lead', lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LEAD: the owner notification failed', message);
    try {
      await deps.markNotified(record.id, 'failed', message.slice(0, 300));
    } catch (markErr) {
      console.error('LEAD: could not record the notification failure', markErr);
    }
    return 'notify_failed';
  }

  try {
    await deps.markNotified(record.id, 'sent');
  } catch (markErr) {
    console.error('LEAD: notification sent, but recording that failed', markErr);
  }
  return 'notified';
}
