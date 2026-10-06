# I2P Inbox: deployment notes

## Project
The Supabase project named QYLAT in the dashboard has the reference `yglmlnfsyzsvozxirlpo`. That is the same
project the n8n email workflows write to, and it holds `email_threads`, `email_events`, `email_model_budget`
and `lead_notifications`. Confirmed read-only on 2026-10-06 from the dashboard address and the table list.

## The read-only token
- Role: `owner_inbox_ro`. It can read `email_threads` and `email_events` and nothing else.
- Created by `make-inbox-token.mjs`, run by Liz. The signing secret is entered locally, is never printed and
  is never saved. Only the token, the anon key and the project address are written, to the git-ignored file
  `C:\Users\lizal\qylat-analytics-inbox\.env.development.local`.
- Created 2026-10-06. Expires 2027-10-06 (365 days). When it expires the Inbox page shows an error and
  nothing else is affected. Renew by running the two scripts again and updating the Vercel variable.
- Access check passed on 2026-10-06 (`check-inbox-access.mjs`, status codes only): it reads `email_threads`
  and `email_events` (200), and is refused (403, 42501) on `idea_submissions`, `plan_versions`,
  `quiz_results`, `lead_notifications`, `email_model_budget`, an insert into the history, an update of a
  conversation, and a function call.

## Dependency on the legacy signing key
This project signs new tokens with an ECC (P-256) key. The token above is signed with the older shared
secret, which the dashboard lists under JWT Keys as a previous key, "Legacy HS256 (Shared Secret)", still
trusted for verification. If that legacy key is ever revoked, the Inbox token stops working at once. The
legacy anon and service role keys depend on the same legacy key. Do not rotate or revoke it as part of this work.

## Vercel variables (analytics app, server side only, never NEXT_PUBLIC)
- `INBOX_SUPABASE_URL`
- `INBOX_SUPABASE_API_KEY`
- `INBOX_SUPABASE_READ_JWT`

Do not set `INBOX_FIXTURE` in Vercel. Without the three variables the page says it is not configured and
the rest of the app is unaffected.

## Deployment
Commit `365f0ad` on branch `owner-inbox`. Not pushed, not merged, not deployed. Pushing the branch creates a
Vercel preview only. Production changes when the commit is merged into `main` and pushed.
