// Three Emails (n8n Code node, run once for all items). TEST ONLY.
// Three made-up emails in one batch: two from the test sender, and between them one from another sender that
// the handler must ignore. Each is marked as a dry run with its own call limit of one, so no model call is
// made and exactly one of the two eligible emails may be granted the call.
const run = 'batchtest-' + Date.now();
const now = new Date().toISOString();
const mk = (n, address, subject, text) => ({
  json: {
    id: run + '-m' + n, threadId: run + '-t' + n, labelIds: ['INBOX', 'UNREAD'], headers: {},
    from: { value: [{ address, name: 'Batch Test' }] }, subject, text, date: now,
    _dry_run: { scope: run, max: 1 },
  },
});
return [
  mk(1, 'lizalfond@gmail.com', 'Batch test A: how it works', 'How does IdeaToPlan work?'),
  mk(2, 'someone@example.com', 'Batch test B: must be ignored', 'This sender is not the test sender.'),
  mk(3, 'lizalfond@gmail.com', 'Batch test C: pricing', 'What does the Starter plan cost?'),
];
