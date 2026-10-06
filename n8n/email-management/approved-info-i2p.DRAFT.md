# IdeaToPlan approved information: DRAFT, NOT APPROVED

Status: draft for Liz's sign-off. Nothing here is in use. The inbound email workflow refuses to call the model until
approved text is pasted into its `Mailbox Config` node.

How to read this: section A is what the AI may say. Every line carries its source, a file on the deployed `master`
branch (commit 780a070). Wording is taken from that source, shortened only where marked. Section B is what the AI
never discusses, whatever section A says. Section C lists conflicts and gaps that need your decision before sign-off.

When you sign off, the text to paste is section A only.

## A. What the AI may say

**What it is**
- IdeaToPlan is an AI-assisted business planning service. You submit details about your business idea and receive a
  written business plan as a PDF. [`app/terms/page.tsx`, section 1]
- Plans are drafted using AI and reviewed by a person before they reach you. [`app/terms/page.tsx`, sections 1 and 6;
  `lib/plans.ts` feature "Reviewed by a real person, never auto-sent"]
- A plan is an informational document. It is not legal, financial, accounting, tax, investment or immigration advice,
  and carries no guarantee of any business outcome. [`app/terms/page.tsx`, section 2]

**Plans and prices**
- Starter is $25. It includes an actionable business plan built around your idea, a revenue model and pricing
  strategy, a 90-day roadmap with clear milestones, and a professional PDF. [`lib/plans.ts`, Starter]
- Growth is $50. It includes everything in Starter, plus competitor research and landscape analysis, a SWOT analysis,
  and a viability verdict with a go/no-go assessment. [`lib/plans.ts`, Growth]
- Prices are in US dollars. Payment is processed through Stripe. [`app/terms/page.tsx`, section 4]

**Delivery**
- Standard plans are delivered within 72 hours of submission. [`app/terms/page.tsx`, section 5; `lib/plans.ts`
  "Professional PDF delivered in 72 hours"]
- After payment there is a short form about your idea. Bank loan and investor plans also ask for financials.
  [`components/IdeaToPlan.tsx`, line 478, shortened]

**After delivery**
- You own the content of your plan for personal and commercial use. [`app/terms/page.tsx`, section 7]
- You can reply by email with questions about your plan. [`lib/plans.ts` "Email follow-up to answer your questions";
  `components/IdeaToPlan.tsx`, line 1008]

## B. What the AI never discusses (these always go to Liz)

The site states terms on each of these. The workflow still sends every such email to you and blocks any draft that
mentions them, so the AI neither offers nor refuses anything.

- Refunds, cancellations before delivery, and late-delivery refunds. [`app/terms/page.tsx`, section 6]
- Revisions and dissatisfaction with a delivered plan. [`app/terms/page.tsx`, sections 5 and 6]
- Payment problems, disputes and chargebacks.
- Legal, privacy and data requests, complaints, and anything sensitive.
- Questions about the content of a specific plan.
- Any delivery date or time. The AI may repeat "within 72 hours" and the recorded order status, nothing more.

## C. Conflicts and gaps for your decision

1. **72 hours: promise or estimate?** The terms say "Standard plans are delivered within 72 hours of submission" and
   in the same paragraph "Delivery times are estimates and may vary based on order volume". The refund section then
   treats 72 hours as a commitment ("Delivered late? ... I will refund you in full"). The order confirmation email
   says "Expect it within 72 hours". Decide which wording the AI uses. Section A currently uses the first sentence
   only.
2. **Revisions: "minor" or unlimited?** Section 5 of the terms says "Minor revisions are included", while section 6
   says "I will keep revising it until it is right, at no cost". The AI is kept out of this, but the two sentences
   disagree on the public page.
3. **Faster delivery has no price or timeframe.** The terms say "Faster delivery may be available on request. Email
   us to ask." The order form carries an `expedited24h` field, set to "no" by default; I found no visible option or
   price for it on `master`. The AI will send every such request to you unless you give it approved wording.
4. **Two contact addresses.** The site tells customers to write to `ideatoplanincome@gmail.com` (15 places).
   Confirmation and delivery emails come from `liz@ideatoplan.to`, which is the only mailbox the workflow reads.
   Mail sent to the Gmail address is not seen by the automation at all. Decide whether to change the site address,
   forward that mailbox, or connect it.
5. **"Reviewed by a person, never auto-sent."** This is accurate today and stays accurate under the approval gate.
   It would stop being accurate if delivery were ever sent without your approval.
6. **Promotional pricing.** The terms allow "promotional offers, such as deferred payment or satisfaction-based
   billing". None is described anywhere. The AI's approved amounts are $25 and $50 only, so any other figure in a
   draft is blocked and sent to you.
7. **Not stated anywhere on the site, so the AI cannot answer:** invoices and receipts, changing an order after it
   is submitted, what happens to submitted information, and how long plans are kept. Add wording if you want these
   answered.

## Sources read for this draft

`app/terms/page.tsx`, `lib/plans.ts`, `components/IdeaToPlan.tsx`, `app/api/submit-idea/route.ts` (payment amounts
2500 and 5000 cents, matching the two prices), and the live n8n node `confirmation_to_client` (the "Expect it within
72 hours" wording). Not read: `app/privacy/page.tsx` beyond its contact address, the FAQ if one exists, and the
`staging` branch.
