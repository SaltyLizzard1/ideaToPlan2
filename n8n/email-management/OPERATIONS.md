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

## Acceptance evidence, 2026-10-06 and 2026-10-07

Recorded here so it survives the removal of the test conversations. Numbers are n8n execution IDs.

| Check | Run | Result | Model cost |
|---|---|---|---|
| Batch: two eligible emails, one ignored, call limit of one | 63264 to 63267 | Independent runs; one call granted, one refused; no model call | $0.00 |
| General question with instruction text in the body | 63270 | Escalated to the owner | $0.00837 |
| Same message ID handed in twice | 63273, 63274 | Stopped at "duplicate"; no call, no alert | $0.00 |
| Pricing question (old wording) | 63278 | Routine draft held in shadow | $0.00745 |
| Refund request | 63282 | Escalated; no promise or refusal | $0.00640 |
| Late order | 63286 | Escalated; no date or order detail | $0.00662 |
| Follow-up in an open conversation | 63291 | Escalated; thread matched | $0.00677 |
| Wording and gate fixes, validation | 63307 | Plain first-person draft, gate zero objections | $0.00665 |
| Scope filter on handler v2 | 63318 to 63321 | Customer, named enquiry and known conversation in scope; generic words left alone | $0.00 |
| Send step enabled, shadow on | 63374 to 63377 | No send claim, no send | $0.00 |
| One real reply to the owner's test address | 63383 | Sent once, threaded, Gmail message `1a110ce37bcfacb5`; receipt confirmed by Liz | $0.00741 |
| Forwarded mail from the public Gmail address | 63423 | Sender, original destination and authentication intact; draft held | $0.00887 |
| Order-status question from a single-order address | 63537 | Gate approved the draft; held by the category guard; no send claim, no send; one owner alert | $0.00441 |

Total model spend for all checks: $0.0629. Database self-tests: `002` (12 checks) and `004` (send claim) both
passed and rolled back. Published handler read back on 2026-10-06: all eleven code steps identical to `nodes/*.js`.
Skills Matcher lead alert accepted on production: one capture, one alert with all five lines, no duplicate.
I2P Inbox accepted on production: behind login, real data, last navigation link.

The order-status check (63537) is the runtime proof of the category hold. It was sent from
`ideatoplanincome@gmail.com`, so it also triggered the safeguard for the business's own addresses. Both reasons
were recorded; the category hold has not been seen on its own with an outside customer.

### Test data cleanup, 2026-10-07

Sixteen test conversations with made-up message IDs (batch tests and scope checks) and their 48 history entries
were deleted, by exact ID, in one transaction. Nothing else was touched.

Eight test conversations (46 history entries) are kept on purpose. They came from real Gmail messages, and their
"received" records are the mechanism that stops a message being processed twice. Deleting them would leave only
the poller's own time tracking and the launch cutoff between those messages and a second handling, and two of them
are dated after the cutoff. They show in the I2P Inbox as Needs attention, except the one that was answered:

- `fa6011e4-18d3-415b-bf13-1235ef55f498` "Growth plan details" (a real reply was sent; its records stop a second send)
- `ab914657-ee69-414c-9f75-aa5c4ce5acc2`, `52af3a8d-9f13-4e82-93ee-69aa6baa48e1`,
  `dc087c3f-99c2-48b7-88a3-a6ec4fa093e2`, `395f7536-bf50-4ff9-b034-aa827201febd`,
  `e04098e6-b9c7-4b43-bd56-e83bb4397a74`, `20d04589-f634-42d6-9993-75376d9e3455`,
  `8616e843-24bd-4201-90b2-c8ff0fb68bea`

The lead record, every budget counter, and all orders, plan versions, reviews and PDFs were left as they were.
