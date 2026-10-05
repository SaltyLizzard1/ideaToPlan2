# Go-live checklist for the v2 pipeline

Status as of 2026-10-04. Nothing here has been done unless it says DONE. Each item is a separate, confirmed step.

## Must change before a real customer order runs

- [ ] **Remove the fixed TEST DATA note.** In v2 Test, the `Log to Supabase` node writes a constant `notes` value
      ("TEST DATA. Created by the v2 Test workflow ..."). It must not go to production, or every customer order
      would be marked as test data.
- [ ] **Customer recipient.** In the shared workflow `YECjOQHj4oQYVdVW`, `Send to Customer` is hardcoded to
      `liz@ideatoplan.to`. Change it to the customer address.
- [ ] **Confirmation email.** `confirmation_to_client` is disabled in v2 Test because it would mail the payload
      address. Decide whether it is re-enabled and confirm its recipient.
- [ ] **Pinned webhook data.** The v2 Test `Webhook` node has pinned data that contains the webhook secret in plain
      text, as do past executions. Rotate the secret and re-pin without it.
- [ ] **Independent HOLD guard in the shared delivery workflow.** The gate lives only in v2 Test today. The shared
      workflow would deliver any version it is handed.
- [ ] **Intake cost questions.** The financial policy is in v2 Test (unresolved costs, shared headroom, conditional
      conclusion). The three founder questions that would resolve those costs are only a proposal:
      `INTAKE-COST-QUESTIONS-PROPOSAL.md`. Website, API route, database column and `Prepare Client Data` mapping
      are not done.

## Tests still to run

- [ ] A `Mark Delivered` failure after `Record Sent` succeeds raises the "Sent but not recorded" alert and never resends.
- [ ] A real HTTP call to the webhook (all runs so far used pinned data in the editor).
- [ ] A run with the current-state intake answers filled in (business stage, assets in place, prior work).
- [ ] One full generation after the 2026-10-04 commercial-claim and correction fixes and the 2026-10-05 financial
      policy. None of these has run live.

## Tests complete

- [x] **Delayed approval. DONE 2026-10-04.** Execution 63212 waited 7 hours 49 minutes, was approved once, and sent
      exactly once (Gmail ID `1a106ff6624425c7`); the version is `sent` and the submission `delivered`.
- [x] Approve, duplicate approve, request changes, timeout and alert, re-request, expired link, duplicate re-request.
- [x] Send failure classification, and "Gmail accepted but recording failed" (one delivery, one alert, no retry).
- [x] Hold branch: execution 63219 (isolated copy) and execution 63220 (v2 Test): one internal HELD notice, no
      approval email, no delivery.

## Clean-up (SQL is run by Liz)

- [ ] Test submissions and their plan versions and PDFs: `7a5b1e66-83c2-4c76-87d8-679878994370` (versions 1 to 11),
      `3e04f180-02fa-4942-b531-0b66e00231d1`, `738049e6-87ea-49ad-918b-4ca3788a1c1e`,
      `0960f01a-518b-4af2-9b3b-510513e5cdbb`. Delete `plan_versions` rows before the submissions.
- [ ] Test workflows in n8n: `ItszbZKL2nZomtor`, `QDG4mMUv2nLNEu6o`, `1bXbqtceHxloluGY`, `t6NSwjz5bEN5lWWq`,
      `ukxEo2r3HgBxOcww`, `eJPRnoXbXTa6HcaX`, `xe2cj8HCw880WCnG`, `yj5mwfATmBpgp9N1`.

## Known limits that go live with it

- Pages drawn by script and PDFs cannot be read, so their claims are excluded.
- Excerpt matching is whitespace-only; a verifier that changes a quote mark or dash loses a true claim.
- Demand, payment and pricing checks in code are pattern-based; the reviewer model is the backstop for meaning.
