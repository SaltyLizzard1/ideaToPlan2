# Proposal: three intake questions about unresolved costs

Status: PROPOSAL for review, 2026-10-05. Nothing here is live. The intake website, the API route, the database and
the `Prepare Client Data` node are unchanged. Only `Compute Financials` in v2 Test already knows how to read the
answers, from an optional `cost_answers` object; with no answers it behaves as it does today.

## Why

In execution 63220 the financial step could not tell whether two costs apply, and one day earlier it had decided the
opposite on the same inputs. The intake asks nothing about them. These questions let the founder say.

## The questions

Each question has an applicability answer, then an amount that is asked only when the answer is Yes.
"Unknown" and "Not applicable" are different answers and are kept apart.

### 1. AI, data and API services

**Does delivering your offer, or running the tools you give customers, depend on a paid AI, data, API or research service?**

- Yes
- No, not applicable to this business
- I don't know yet

If Yes:

- **Roughly what does it cost?** Amount (number, optional) and currency (default USD).
- **How is it charged?** Per month / Per sale or per customer session / Per use (per request, per report) / One-time.
- **Which service?** Free text, optional.

### 2. Professional advice

**In your first year, do you expect to pay an accountant, lawyer or business adviser for this business?**

- Yes
- No, not applicable (for example, I already have this covered at no extra cost)
- I don't know yet

If Yes:

- **Roughly how much?** Amount (number, optional) and currency (default USD).
- **How is it charged?** Per month / One-time / Per sale.

### 3. Where the business is based

**Where is this business based or registered, or where will it be?**

- Country (list), and state or region (free text, optional).
- **Is it registered yet?** Yes / No / I don't know yet / Not applicable.

This answer does not settle whether registration, a licence or insurance is required. That stays a legal check in
every plan. It lets the plan name the right jurisdiction to check.

## How an answer is read

| Answer | Status in the plan | Effect on the figures |
|---|---|---|
| Yes, with an amount in USD, per month, per sale or one-time | Applies, amount known | Taken off year-one net cash before headroom is measured. The computed tables are not altered. Never added on top of an amount the model already carries |
| Yes, with no amount | Applies, amount not established | None. Stays unresolved |
| Yes, amount in another currency | Applies, amount not established | None. Not converted; the amount and currency are recorded |
| Yes, amount per use | Applies, amount not established | None. The number of uses per sale is not known |
| I don't know yet | Not established whether it applies | None. Stays unresolved |
| No, not applicable | Does not apply (founder-confirmed) | None |
| Question not answered (every existing submission) | Whatever the financial step decides, as today | None |

A missing value is never read as zero.

## Field mapping

| Website field (payload `body`) | Values | `cost_answers` path read by Compute Financials |
|---|---|---|
| `aiServicesApplies` | `yes`, `no`, `not_applicable`, `unknown`, or absent | `ai_services.applies` |
| `aiServicesAmount` | number or empty | `ai_services.amount` |
| `aiServicesCurrency` | ISO code, default `USD` | `ai_services.currency` |
| `aiServicesUnit` | `per_month`, `per_sale`, `per_use`, `one_time` | `ai_services.unit` |
| `aiServicesName` | text | `ai_services.name` (recorded, not used in figures) |
| `professionalAdviceApplies` | as above | `professional_advice.applies` |
| `professionalAdviceAmount` | number or empty | `professional_advice.amount` |
| `professionalAdviceCurrency` | ISO code, default `USD` | `professional_advice.currency` |
| `professionalAdviceUnit` | `per_month`, `one_time`, `per_sale` | `professional_advice.unit` |
| `businessCountry`, `businessRegion` | text | `jurisdiction.country`, `jurisdiction.region` (shown to the writer; no effect on figures) |
| `businessRegistered` | `yes`, `no`, `unknown`, `not_applicable` | `jurisdiction.registered` (shown to the writer; no effect on figures) |

In n8n this would be one new assignment in `Prepare Client Data`, building `cost_answers` from those fields, and one
line in `Founder Context` so the writer sees the answers. Neither has been made.

## Database (for Liz to review and run; not run)

Purpose: keep the answers with the submission. One nullable column, so existing rows stay valid.

```sql
alter table public.idea_submissions
  add column if not exists cost_answers jsonb;

comment on column public.idea_submissions.cost_answers is
  'Founder answers about AI/data services, professional advice and jurisdiction. Null for submissions made before the questions existed.';
```

Expected result: `ALTER TABLE`, then `COMMENT`. No rows change.

Verification:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'idea_submissions' and column_name = 'cost_answers';

select count(*) as rows_total, count(cost_answers) as rows_with_answers
from public.idea_submissions;
```

Expected: one row (`cost_answers`, `jsonb`, `YES`); `rows_with_answers` is 0.

## Not decided

- Whether the questions are required or optional on the form. Recommended: optional, with "I don't know yet" allowed.
- Whether to ask them for Starter plans as well as Growth.
- Currency conversion. Today a non-USD amount is recorded and left unresolved.
