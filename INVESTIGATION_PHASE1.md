# PHASE 1 INVESTIGATION REPORT

## A. SPEED — Quiz Skills Matcher Optimization

### Current State
- **Route**: `/api/quiz` → `N8N_QUIZ_WEBHOOK_URL` (https://n8n.ideatoplan.to/webhook/quiz-match-v2)
- **Workflow**: FFl62g1qFu7hf8Dd (Quiz Skills Matcher)
- **Timeout**: 175s (app/api/quiz/route.ts line 31)
- **Rate limit**: 5/hour per IP
- **Loading duration**: 75s (app/assessment/page.tsx line 116)
- **Current behavior**: Returns all 7 matches at once; UI shows match #1 after all complete

### Problem
Executions 63032, 63033: ~80s total. Visitors wait 60-90s before seeing first result. Only match #1 visible before payment gate.

### Proposed Two-Stage Architecture

**Stage 1: Fast Ranking (target <2s)**
- Input: assessment form data
- Output: 7 business ideas with title + one-liner only, resultId, index
- Returns immediately, client navigates to /results/[resultId]
- Workflow: `quiz-ranking-v1` (new)

**Stage 2: Detailed Matching (5-8s per match, parallel)**
- Triggered: Client requests /results/[resultId]/match?index=0
- Validates resultId and index server-side
- Fetches full match (targetCustomer, industry, problem, revenueModel, description, uniqueAngle, incomeRange, firstSteps, saturation)
- Results cached per (resultId, index) pair
- NOT rate-limited as part of 5/hour /api/quiz limit
- Protection: server tracks which indices have been fetched to prevent abuse
- Workflow: `quiz-detail-v1` (new)

### Performance Estimate

| Metric | Today | Proposed | Improvement |
|--------|-------|----------|-------------|
| Time to first match | 80s | ~7s (2s ranking + 5s detail) | 91% faster |
| Time to see all 7 | 80s | 2s + 8s (parallel) = 10s | 87% faster |
| Cost per assessment | 1 workflow call | 1 ranking + avg 1-2 details | 40% cost reduction |

### New Workflows
- `quiz-ranking-v1`: Webhook `/webhook/quiz-ranking-v1`
- `quiz-detail-v1`: Webhook `/webhook/quiz-detail-v1`

---

## B. AUTO-FILL — Pre-populate Form from Assessment Match

### Current State (Partial)
- **Email**: ✓ passed from Stripe session.customer_details.name
- **businessIdea**: ✓ from sourceMatch.description
- **differentiation**: ✓ from sourceMatch.whyYou
- **Missing**: targetAudience, industry, problem, revenueModel

### Problem
Users re-enter fields the quiz already knows (target customer, industry, problem).

### Proposed Solution

**Add 4 fields to Match interface**:
- `targetCustomer`: "Niche definition, who exactly"
- `industry`: "Specific industry/service type"
- `problem`: "Primary pain point solved"
- `revenueModel`: "How to make money"

**n8n Quiz matcher**: Include these in JSON output for each match.

**IdeaToPlan.tsx pre-fill** (lines 178-187):
```typescript
if (sourceMatch) {
  prefilled.businessIdea = sourceMatch.description || "";
  prefilled.differentiation = sourceMatch.whyYou || "";
  prefilled.targetAudience = sourceMatch.targetCustomer || "";
  prefilled.industry = sourceMatch.industry || "";
  prefilled.problem = sourceMatch.problem || "";
  prefilled.revenueModel = sourceMatch.revenueModel || "";
  prefilled.planGoal = "personal-roadmap";
}
```

**UI**: Mark pre-filled fields with "suggested from assessment — edit freely"

**Backward compatible**: Old quiz_results rows (before new fields) default to empty strings.

---

## C. NO INVENTED STATISTICS — Hard Constraint in Matcher

### Problem
Plans include made-up stats: "Fewer than 5% of VAs make over $10k/month"

### Proposed Solution

Add to n8n Quiz matcher (ranking-v1 and detail-v1) prompt:

```
Hard rule: Do NOT include statistics, percentages, market sizes, or 
figures unless explicitly provided in the user's form input.

Avoid:
- "90% of freelancers struggle with..."
- "The VA market is worth $X billion..."
- "Fewer than 5% earn more than..."

If market context needed, reference user's own numbers only.
```

---

## D. FULL PIPELINE — Use sourceMatch as Starting Context

### Current State
- sourceMatch fetched ✓ (app/api/submit-idea/route.ts lines 127-158)
- sourceMatch included in payload ✓ (line 184-186)
- Full Pipeline (Wn6ATzrXmDvKMwJk) uses sourceMatch: ❌

### Problem
Expert-generated insights from quiz (uniqueAngle, incomeRange, firstSteps, whyYou) are available but not used. Plan generated from scratch.

### Proposed Solution

Update Full Pipeline (Wn6ATzrXmDvKMwJk) prompt to receive sourceMatch as starting context:

```
Assessment match (expert insights):
- Business: {sourceMatch.description}
- Why it fits you: {sourceMatch.whyYou}
- Your unique angle: {sourceMatch.uniqueAngle}
- Income potential: {sourceMatch.incomeRange}
- First steps: {sourceMatch.firstSteps}

Form details:
[formData fields]

Build a plan personalized to this specific founder, grounded in 
the assessment insights above.
```

---

## E. PLAN QUALITY — Voice, Arithmetic, Fact-Checking

### Current Problems
1. **Arithmetic**: Startup costs summed to $3,310; correct is $3,110
2. **Voice**: "You help..." instead of "I help..."
3. **Invented figures**: Outside data stated despite prompt saying "use provided info only"

### Proposed Solution

Update Full Pipeline prompt:

**First-person voice**:
```
Write all narrative in first person: "I help...", "My unique angle...", "I will...".
Never write "You help" or "The founder should...".
```

**Arithmetic verification**:
```
BEFORE generating PDF, verify every calculation:
- Startup costs: Recompute sum of all line items
- Monthly expenses: Recompute sum
- Revenue projections: Verify formulas
- Break-even: Verify math

If any total is wrong, correct it.
```

**No outside figures** (reinforced):
```
Use ONLY figures and assumptions provided by the founder.
Do not reference industry averages or competitor data unless 
the founder provided them.
```

---

## F. REFUND GAP — Check Refund Status on Payment Verification

### Current Problem
app/api/verify-payment/route.ts line 51:
```typescript
const paid = session.payment_status === "paid";
```

If customer refunded after purchase, session still shows paid=true and form unlocks.

### Proposed Solution

Add refund check in verify-payment and submit-idea:

```typescript
const session = await stripe.checkout.sessions.retrieve(sessionId);
const paid = session.payment_status === "paid";

// NEW: Check refund status
let isRefunded = false;
if (paid && session.latest_charge) {
  try {
    const charge = await stripe.charges.retrieve(session.latest_charge as string);
    isRefunded = charge.refunded === true;
  } catch (err) {
    console.error('Refund check failed:', err);
  }
}

return { paid: paid && !isRefunded, ... };
```

**Stripe permission**: "Charges: Read" (already available on full secret key)

**Apply to**:
- app/api/verify-payment/route.ts (line 51)
- app/api/submit-idea/route.ts (line 97)

---

## G. NAVIGATION — Add "Business Plans" Link

### Current NAV_LINKS (Header.tsx line 8-14)
- How It Works
- Sample Plans
- Pricing
- About
- Contact

### Three Options

**Option 1: Link to #pricing**
```
{ label: "Business Plans", href: "/#pricing" }
```
- Simplest; links to existing pricing section (Starter/Growth/Visa tiers)
- Shows purchase options
- Placement: after "Sample Plans"

**Option 2: New page /plans**
```
{ label: "Business Plans", href: "/plans" }
```
- New page /app/plans/page.tsx
- Content: Plan types (Personal Roadmap, Bank Loan, Investor Pitch), tier comparison, sample excerpts
- More educational, positions Plans as distinct offering
- Placement: after "Sample Plans", before "Pricing"

**Option 3: Link to #sample-plan**
```
{ label: "Business Plans", href: "/#sample-plan" }
```
- Links to existing sample plan section
- Shows what finalized plans look like
- Placement: after "Sample Plans"

*Decision needed: Option 1 (pricing), 2 (new page), or 3 (sample plans)?*

---

## AFFECTED SYSTEMS

### Files (Modified)
- **app/api/quiz/route.ts**: Split into ranking only; create /api/quiz-detail
- **app/api/verify-payment/route.ts**: Add refund check
- **app/api/submit-idea/route.ts**: Add refund check
- **app/assessment/page.tsx**: Fetch details on demand instead of all at once
- **components/IdeaToPlan.tsx**: Add 4 pre-fill fields
- **components/Header.tsx**: Add Business Plans nav link
- **lib/stripe.ts**: No change (already correct)

### Database Tables
- **quiz_results**: Add 4 fields to matches array (targetCustomer, industry, problem, revenueModel)
  - Backward compatible; old rows default to ""
- **stripe_redemptions**: No change

### Environment Variables
- **N8N_QUIZ_WEBHOOK_URL**: Points to quiz-ranking-v1 (new workflow)
- **NEW: N8N_QUIZ_DETAIL_WEBHOOK_URL**: Points to quiz-detail-v1 (new workflow)
- **N8N_I2P_WEBHOOK_URL**: Points to Full Pipeline (Wn6ATzrXmDvKMwJk) — no URL change, only prompt update
- **N8N_WEBHOOK_SECRET**: No change

### n8n Workflows
- **Quiz Skills Matcher (FFl62g1qFu7hf8Dd)**: Deprecated (replaced by ranking + detail)
- **quiz-ranking-v1**: NEW
- **quiz-detail-v1**: NEW
- **Full Pipeline (Wn6ATzrXmDvKMwJk)**: Update prompt (sourceMatch context, no stats, first-person, arithmetic verification)

---

## PHASE 2 STAGES (Proposed Order)

1. **Stage 1: Navigation (G)** — Add Business Plans link (no dependencies)
2. **Stage 2: Pre-fill & Schema (B)** — Add 4 fields, update matcher output, update IdeaToPlan
3. **Stage 3: Quality (C + E)** — Update n8n prompts (no stats, voice, math, sourceMatch)
4. **Stage 4: Speed (A)** — Create ranking/detail workflows, update API routes, update UI
5. **Stage 5: Refund Check (F)** — Add refund validation to payment routes

Each stage builds on staging before advancing to production.

---

## QUESTIONS FOR USER

1. **A (Speed)**: Acceptable latency for detail fetch? (target 5-8s per match)
2. **B (Pre-fill)**: Exact text for pre-filled field marker? ("suggested from assessment" or other?)
3. **E (Quality)**: Verification approach—auto-correct mismatches or flag for founder review?
4. **G (Navigation)**: Which link option? (1=pricing, 2=new page, 3=sample-plan)
