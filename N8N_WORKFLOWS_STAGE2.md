# Stage 2: the two stage assessment contract

This file is the single source of truth for what the app sends and what the two
n8n workflows must send back. The app enforces every rule below in
`lib/quiz.ts`. If a workflow breaks one, the app logs the reason, posts it to
the alert webhook, stores nothing and shows the reader a retry.

The assessment runs in two stages:

1. **quiz-ranking-v1** ranks 7 ideas as a title, a category and a one liner.
   Fast, one call per assessment.
2. **quiz-detail-v1** writes one of those 7 out in full. Up to 7 calls per
   assessment, fired in parallel from the browser, each one cached in the
   database after it succeeds.

Both webhooks are POST, both require the `X-Webhook-Secret` header carrying
`N8N_WEBHOOK_SECRET`, and both must respond with JSON.

---

## Storage

`quiz_results` is shared with QYLAT. Every IdeaToPlan read and write filters
`site = 'i2p'`.

| column | holds |
|---|---|
| `id` | the 12 character resultId in the share URL |
| `site` | always `'i2p'` for this app |
| `answers` | the 6 assessment fields, written once by `/api/quiz` |
| `matches` | the 7 rankings, written once by `/api/quiz` |
| `details` | one validated detail per match, keyed by the match's position as a string, written one key at a time by `/api/quiz-detail` |

A match's index is its position in `matches`. That is what keys `details` and
what `client_reference_id` carries into Stripe. Nothing else defines it.

Rows written before this split hold a full match in every `matches` entry and
an empty `details`. `mergeMatches` in `lib/quiz.ts` spreads `details` over
`matches`, so those rows come back exactly as they were and every reader keeps
working. Run `migrations/001_quiz_answers_details.sql` before deploying.

---

## Workflow 1: quiz-ranking-v1

Webhook path `/webhook/quiz-ranking-v1`. Called by `/api/quiz`, which times
out at 15 seconds.

### Request

Exactly these 6 keys, allowlisted and trimmed by the route. Nothing else is
forwarded.

```json
{
  "hardSkills": ["Writing & copywriting", "Web / UI design"],
  "softSkills": ["Communicating clearly", "Problem-solving"],
  "workStyle": ["People-facing", "Structured schedule", "Solo deep work", "Creating new things"],
  "values": ["Freedom & location independence"],
  "hoursPerWeek": "10–20",
  "incomeTarget": "$2,500–$5,000"
}
```

`workStyle` carries one choice per work style pair, 4 today. `hoursPerWeek` is
one of `<5`, `5–10`, `10–20`, `20–30`, `30+`. `incomeTarget` is one of
`$500–$1,000`, `$1,000–$2,500`, `$2,500–$5,000`, `$5,000–$10,000`, `$10,000+`.

### Response

```json
{
  "rankings": [
    {
      "index": 0,
      "title": "Executive Virtual Assistant",
      "category": "Freelance",
      "oneLiner": "Run the calendar, inbox and travel for two or three founders."
    }
  ]
}
```

Rules, all enforced:

- Exactly **7** entries. Not 6, not 8.
- `index` is an integer 0 to 6. Every value appears exactly once. The app sorts
  by it, so the order of the array itself does not matter.
- `title` is a non-empty string, at most 300 characters.
- `oneLiner` is a non-empty string, at most 300 characters. One sentence, it is
  the only body text the card shows until the detail arrives.
- `category` is exactly one of `Business`, `Freelance`, `Remote Job`. Nothing
  else. It is shown as the card's eyebrow and it must match the category the
  detail returns.

A bare array of 7 is also accepted, as is a single element array wrapping the
object, which is what n8n's Respond to Webhook node produces when it is set to
return all incoming items.

### Prompt notes

```
Generate exactly 7 ranked ideas for this founder, best fit first.

Each entry: index (0 to 6, in order), title (5 to 10 words),
category (exactly one of Business, Freelance, Remote Job),
oneLiner (one sentence, plain, no hype).

Rank by: uses their hard skills directly, fits their work style and values,
achievable in their stated hours, income target realistic for the idea.

No descriptions, no detail, no statistics at this stage.
```

---

## Workflow 2: quiz-detail-v1

Webhook path `/webhook/quiz-detail-v1`. Called by `/api/quiz-detail`, which
times out at 55 seconds.

### Request

```json
{
  "resultId": "abc123def456",
  "matchIndex": 0,
  "title": "Executive Virtual Assistant",
  "allTitles": [
    "Executive Virtual Assistant",
    "Copywriter for SaaS",
    "Podcast Editor for Founders",
    "Notion Systems Consultant",
    "Remote Customer Success Lead",
    "Course Operations Manager",
    "Community Manager for B2B"
  ],
  "answers": {
    "hardSkills": ["Writing & copywriting"],
    "softSkills": ["Communicating clearly"],
    "workStyle": ["People-facing", "Structured schedule", "Solo deep work", "Creating new things"],
    "values": ["Freedom & location independence"],
    "hoursPerWeek": "10–20",
    "incomeTarget": "$2,500–$5,000"
  }
}
```

`title` is the one to write up. `allTitles` is all 7 in index order, so the
write-up can stay off the other six rather than repeating them. `answers` is
the founder's own input, the same object the ranking call received.

### Response

One bare JSON object with exactly these 13 fields.

```json
{
  "title": "Executive Virtual Assistant",
  "category": "Freelance",
  "description": "Executive support for founders who are past their first hires...",
  "targetCustomer": "Founders of 5 to 20 person companies who still run their own calendar",
  "industry": "Executive Support Services",
  "problem": "Founders lose their best hours to scheduling, inbox triage and travel admin",
  "revenueModel": "Monthly retainer, roughly $1,500 to $3,000 per client, two to three clients",
  "whyYou": "You already organise other people's work and you write clearly...",
  "incomeRange": "$2,500 to $5,000 a month",
  "uniqueAngle": "Founder workflows specifically, not general admin",
  "firstSteps": [
    "Write down the 3 founder profiles you want to work with",
    "Rewrite your LinkedIn headline around executive support",
    "Send 10 plain, specific notes to founders in your own network",
    "Offer the first month at a reduced rate in exchange for a testimonial"
  ],
  "saturation": "Medium",
  "saturationNote": "Established market with steady demand. Specialising is what separates you."
}
```

Rules, all enforced:

- All 13 fields present. A missing field fails the whole detail.
- `title` must come back **exactly** as it was sent, trimmed. This is the guard
  against a detail being filed against the wrong match.
- `category` exactly one of `Business`, `Freelance`, `Remote Job`, and it must
  be the one the ranking gave this index.
- `saturation` exactly one of `Low`, `Medium`, `High`.
- `firstSteps` is an array of 4 to 8 non-empty strings.
- Every other field is a non-empty string of at most 2000 characters:
  `description`, `targetCustomer`, `industry`, `problem`, `revenueModel`,
  `whyYou`, `incomeRange`, `uniqueAngle`, `saturationNote`.
- No `index` field. The app knows the index, it sent it.

A single element array wrapping the object is unwrapped, so n8n's default
Respond to Webhook behaviour is tolerated here too.

`targetCustomer`, `industry`, `problem` and `revenueModel` are what pre-fill
the plan intake form after payment, so they have to read as answers a person
would give, not as labels.

### Prompt notes

```
Write one business idea up in full for this founder.

You are given: their assessment answers, the title to write up, its index,
and all 7 titles in the set.

Hard rules:
1. No statistics, percentages, market sizes or money figures except the
   founder's own stated income target and hours.
2. Nothing invented that sounds like research. No "90% of", no "the market
   is worth".
3. Stay off the other six titles in allTitles. This is the one they asked for.
4. industry is specific, for example "Executive Support Services", never
   "Business" and never "General".
5. category must be the same one the ranking gave this idea.
6. Return title exactly as given.
7. Neutral, plain register. No hype, no em dashes.
```

---

## What the app does when a workflow misbehaves

| Situation | HTTP | Stored | Reader sees |
|---|---|---|---|
| Ranking returns anything but 7 valid rankings | 502 | nothing | the assessment error, retry the form |
| Ranking is unreachable or not JSON | 502 | nothing | the assessment error, retry the form |
| Detail misses a field, or the title does not match | 502 | nothing | that card shows a retry |
| Detail is unreachable, times out or is not JSON | 502 | nothing | that card shows a retry |
| Detail is valid | 200 | `details['<index>']` | the finished card |

Every one of these is logged with the field that failed and the first 1000
characters of the body, and the contract violations also go to
`N8N_ALERT_WEBHOOK_URL`.

Attempt limit: a single match can be attempted **3 times an hour**, counted per
resultId and matchIndex, not per IP. That leaves room for a retry after a
failure without letting anyone hammer the workflow. The ceiling on stored
details is inherent: there are only 7 of them, one per key. A detail already in
`details` is served from the row and spends no attempt, so reloading a shared
link is free.

---

## Environment variables

```
N8N_QUIZ_WEBHOOK_URL=https://n8n.ideatoplan.to/webhook/quiz-ranking-v1
N8N_QUIZ_DETAIL_WEBHOOK_URL=https://n8n.ideatoplan.to/webhook/quiz-detail-v1
```

Set both in Preview first. Production keeps pointing at the old single stage
workflow until the new pair is tested.

---

## Testing

```bash
curl -X POST https://n8n.ideatoplan.to/webhook/quiz-ranking-v1 \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -d '{
    "hardSkills": ["Writing & copywriting", "Web / UI design"],
    "softSkills": ["Communicating clearly", "Problem-solving"],
    "workStyle": ["People-facing", "Structured schedule", "Solo deep work", "Creating new things"],
    "values": ["Freedom & location independence"],
    "hoursPerWeek": "10–20",
    "incomeTarget": "$2,500–$5,000"
  }'
```

Check: 7 entries, indices 0 to 6 with none repeated, every category one of the
three allowed values, every oneLiner one sentence.

```bash
curl -X POST https://n8n.ideatoplan.to/webhook/quiz-detail-v1 \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -d '{
    "resultId": "test123",
    "matchIndex": 0,
    "title": "Executive Virtual Assistant",
    "allTitles": ["Executive Virtual Assistant","Copywriter for SaaS","Podcast Editor for Founders","Notion Systems Consultant","Remote Customer Success Lead","Course Operations Manager","Community Manager for B2B"],
    "answers": {
      "hardSkills": ["Writing & copywriting"],
      "softSkills": ["Communicating clearly"],
      "workStyle": ["People-facing", "Structured schedule", "Solo deep work", "Creating new things"],
      "values": ["Freedom & location independence"],
      "hoursPerWeek": "10–20",
      "incomeTarget": "$2,500–$5,000"
    }
  }'
```

Check: a bare object, 13 fields and no others, `title` identical to the one
sent, `firstSteps` with 4 to 8 entries, no invented numbers anywhere.
