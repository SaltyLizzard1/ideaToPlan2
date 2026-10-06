# I2P email management: what is live and how to stop it

State at the close of the email-management phase, 2026-10-06. Nothing in this folder contains a secret.

## What runs

| Piece | Where | ID |
|---|---|---|
| Inbox poller (reads liz@ideatoplan.to, starts the handler once per email) | n8n, published | `tDz2V2FHb8o3hCZQ` |
| Inbound handler v2 (scope filter, gate, replies, alerts) | n8n, published | `Cjn4k0oOCYmRHHLV` |
| Watchdog (flags anything stuck for 20 minutes) | n8n, published | `4KUZmXYnBub7AXIT` |
| System Alert (error workflow for all of the above) | n8n, published | `BFirlikXaAuti0bh` |
| Previous handler, kept as fallback, not called by anything | n8n, published | `NyrlhbzF91PuUiT1` |
| Lead alert for Skills Matcher captures | I2P site, `master` at `c2c17b5` | `lib/leadNotification.ts` |
| I2P Inbox page | `qylat-analytics`, `main` at `365f0ad` | `/admin/inbox` |
| Database | Supabase project "QYLAT", reference `yglmlnfsyzsvozxirlpo` | tables `email_threads`, `email_events`, `email_model_budget`, `lead_notifications` |

Test workflows, all unpublished, safe to leave: batch test `6c8APJefCBcHZTeI`, duplicate test `6ZRAlDk9Uoge7349`,
scope check `YhSSPkmN3cgOHYzT`.

## Live configuration (Mailbox Config node of `Cjn4k0oOCYmRHHLV`)

Read back from the published graph on 2026-10-06; all eleven code steps matched `nodes/*.js` exactly.

- `shadow: false`, `sending_enabled: true`, `send_only_to: []`
- `auto_send_categories: ["how_it_works", "pricing", "thanks"]`. Order status and delivery timing are drafted and held.
- `hold_forwarded: false`. Mail forwarded from `ideatoplanincome@gmail.com` is treated like direct mail.
- `max_auto_replies: 1`, `budget_scope: "i2p-{month}"`, `max_model_calls: 300`, `max_request_bytes: 14000`
- `scope.enabled: true`: existing customer, existing conversation, the public address, or IdeaToPlan named.
- Approved text: `approved-info-i2p.APPROVED.txt`. Change it there, rebuild, then update the node.

Database migrations applied, in order: `001`, `003`, `004`. Each has a note or a self-test beside it.

## Rollback

1. **Stop every customer send, keep drafts and alerts.** In the Mailbox Config node of `Cjn4k0oOCYmRHHLV`, set
   `"shadow": true`, save, then unpublish and publish the workflow so the published version picks it up.
2. **Hold forwarded mail only.** Set `"hold_forwarded": true` the same way.
3. **Limit sends to a test address.** Set `"send_only_to": ["address"]`.
4. **Go back to the previous handler.** In the poller `tDz2V2FHb8o3hCZQ`, point the node "Handle Each Email" at
   `NyrlhbzF91PuUiT1`. That handler is shadow only and handles mail from the test sender only.
5. **Stop all processing.** Unpublish the poller. Mail stays in the inbox, untouched.
6. **Lead alerts.** Revert `c2c17b5` and `e6c560a` on `master` of the I2P site and push.
7. **I2P Inbox page.** Revert `365f0ad` on `main` of `qylat-analytics` and push.

An edit made through the n8n API to a published workflow should be followed by unpublish and publish. Do not open
a published workflow in the editor unless you mean to change it: the editor saves on its own.

## Dates and dependencies

- **Inbox token expires 2027-10-06.** Renew with `owner-view/make-inbox-token.mjs`, check with
  `owner-view/check-inbox-access.mjs`, then update `INBOX_SUPABASE_READ_JWT` in the `qylat-analytics` Vercel project.
- The token is signed with the project's legacy shared secret, listed under JWT Keys as a previous key. Revoking
  that key stops the Inbox page at once. See `owner-view/DEPLOYMENT-NOTES.md`.
- The monthly call count is enforced in the database. No dollar ceiling is enforced here; a credit limit on the
  OpenRouter key is the only one.
- Forwarding from `ideatoplanincome@gmail.com` to `liz@ideatoplan.to` is switched on in that Gmail mailbox, with
  Gmail's copy kept in its inbox.

## Not part of this phase

Approval-controlled plan delivery (shared workflow `YECjOQHj4oQYVdVW`) goes live with the improved plan pipeline's
production cutover. See `n8n/v2-test/GO-LIVE-CHECKLIST.md`.
`delivery-integration.live-pipeline.PREPARED.json` is a superseded record and must not be applied.
