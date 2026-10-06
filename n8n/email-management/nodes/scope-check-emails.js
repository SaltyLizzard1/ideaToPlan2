// Scope Check Emails (n8n Code node, run once for all items). TEST ONLY.
// Four made-up emails for the prepared handler. Each is a dry run with a call limit of zero, so no model
// call can be made. Expected: 1, 2 and 4 are in scope and reach the owner; 3 is left alone.
const run = 'scopecheck-' + Date.now();
const now = new Date().toISOString();
const mk = (n, address, subject, text, threadId) => ({
  json: {
    id: run + '-m' + n, threadId: threadId || run + '-t' + n, labelIds: ['INBOX', 'UNREAD'], headers: {},
    from: { value: [{ address, name: 'Scope Check' }] }, to: { value: [{ address: 'liz@ideatoplan.to' }] },
    subject, text, date: now, _dry_run: { scope: run, max: 0 },
  },
});
return [
  mk(1, 'lizalfond@gmail.com', 'Scope check 1: existing customer', 'Can you help me with something?'),
  mk(2, 'scope-check-a@example.test', 'Scope check 2: names the service', 'I saw IdeaToPlan online. How does it work?'),
  mk(3, 'scope-check-b@example.test', 'Scope check 3: where is my order', 'Hi, my order has not arrived and I am asking about the starter plan and my business plan.'),
  mk(4, 'scope-check-c@example.test', 'Scope check 4: existing conversation', 'Thanks, one more thing.', '1a110305a4d2bc2d'),
];
