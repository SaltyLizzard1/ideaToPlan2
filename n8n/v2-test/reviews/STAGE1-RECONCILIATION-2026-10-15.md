# Stage 1: version reconciliation and test-baseline provenance (2026-10-15)

Read-only analysis. Nothing in live, v2 Test, the repository code or any database was changed. No paid call.

Read today:

- **Live** `tZ8blRPhX7UiDxFo`, version `e3fbdb49-94de-4885-99de-ebb6b4410622`, last changed 2026-10-14 03:06 UTC.
- **v2 Test** `mLyKvFeYmJHuwXQ9`, version `015c2b97-3fd7-44a6-a3ac-88b9bca0cec4`, inactive.
- **Repository** `staging` at `1cc8524`.
- **The isolated copy** (worktree `wt-limits`) at `b4e3ea7`, with the Fix 1 work in progress uncommitted.

Neither workflow changed between this morning's audit and this check.

## 1. Exact differences

### 1.1 The lineage, in one picture

```
repo 5c7ec32 --- 2d0381d --- 4706fb3 (output limits) --- ee20664, 1cc8524 (reports only) = LIVE code
      \
       isolated (no branch): 5668b0b output limits (parallel copy) - 805b54d, 0ada7e6, 65500ed, fc44190 quality patch 1
                             - 0be66cd RC1 - 9623a96 RC1b - 80095d1, 72d7ad3 RC1c = v2 TEST code
                             - 1a70ee0, b1e3ee9, be4c240 RC1d - b4e3ea7 RC1e - Fix 1 (uncommitted)
```

### 1.2 Live against the repository

- **Code:** every Code node in live is byte-identical (line endings aside) to the repository file at `staging` HEAD. Live code = repository code.
- **Live's configuration** (webhook path, settings, models, which nodes exist) is not recorded in the repository in its current form. `supervised/production/pipeline-v2-supervised.json` is the 7 October cutover snapshot. 19 live nodes now differ from it, including the writer switch, the output limits and the parser fix. Some of those differences are default values the editor drops, but the snapshot is stale.
- **The remote does not have live's code.** Local `staging` is 5 commits ahead of `origin/staging`, and three of those (`2d0381d`, `5c7ec32`, `4706fb3`) are code running live. They exist only on this machine.

### 1.3 Live against v2 Test

**Test-only configuration** (intentional, and kept separate by design):

| Item | Live | v2 Test |
|---|---|---|
| Webhook path | `idea-submission-v2` | a test path, with pinned test order data (which still holds the webhook secret) |
| Log to Supabase | no note | writes the TEST DATA note |
| confirmation_to_client | enabled | disabled |
| Test Financial Baseline node and its connection | absent | present, between Log to Supabase and Founder Context |
| Setting `timeSavedMode` | absent | present (harmless; this n8n rejects writing it) |

**Code that differs** (6 nodes). In every case v2 Test equals the isolated commit `72d7ad3` (RC1c) exactly.

| Node | v2 Test carries | Kind |
|---|---|---|
| Founder Context | RC1 writer rules: spending limit, capacity, existing business, not captured is not "none"; exact budget-cap parsing | Approved test candidate (quality patch 1, RC1) |
| Build Financial Request | 3 prompt rules; schema keys `existing_customers`, `founder_other_hours` | Approved test candidate |
| Compute Financials | existing customers, founder hours, spending ceiling, recurring-unit wording | Approved test candidate |
| Citation Check | price-row check, company-profile detection, price-mention matching | Approved test candidate |
| Build Claim Review | 2 reviewer prompt paragraphs | Approved test candidate (claim review) |
| Combine Claim Review | about 219 lines of checker logic (RC1, RC1b, RC1c) | Approved test candidate (claim review) |

All other nodes, every model ID and setting, retries, timeouts and connections are identical, apart from the baseline node's connection.

### 1.4 v2 Test against the isolated copy

These are not in v2 Test, and are deliberately isolated:

| Not in v2 Test | Commits | Touches |
|---|---|---|
| RC1d | `1a70ee0`, `b1e3ee9`, `be4c240` | Compute Financials, Citation Check and the financial prompt (validation-by-level guard); Combine Claim Review (severity, research matching); Plan Revision Request |
| RC1e | `b4e3ea7` | Combine Claim Review (research summaries, quotes) |
| Fix 1 | uncommitted | Compute Financials, Assemble Plan, Citation Check, 2 tests changed, 1 new test file. The 15 files under `supervised/nodes/` that git shows as modified differ only in line endings. |

### 1.5 The test baseline

- **v2 Test's node is switched off.** Since 2026-10-13 ("quality patch validation") it returns no fixed price and no fixed financial inputs, so runs compute from their own intake.
- **The repository file still holds the replay values.** `test-financial-baseline.js` holds execution 63222's frozen financial answer and the $500 price. That answer contains the known price-validation sentence, and the node's comment says these values "are restored after the validation ends".
- **Which runs used the replay.** Founder Context applies the replayed inputs only when they are set and the workflow is v2 Test.

| Run | Financial inputs |
|---|---|
| 63211, 63221, 63222, 65050 | own model answer (independent) |
| **63223, 63225, 63226, 63257, 63260, 63547** | **replayed from 63222** (fixed price $500 and fixed financial answer): not independent model results |
| 65689, 65701, 65735, 66136, 66235, 66554, 66650 | own model answer (baseline off since 2026-10-13) |
| 63572 | live owner test, independent |
| 63237, 63256 | claim-review replays of frozen plans, by design and already labelled |

Runs 63223 to 63257 and 63547 are read from the saved Founder Context (fixed price 500 and fixed inputs present). 63547 is from its record ("unchanged $500 baseline"). 63220 has no saved Founder Context, but its own financial answer contains a near-identical sentence.

### 1.6 Intentional against drift

| Difference | Intentional or drift |
|---|---|
| Test-only configuration in v2 Test (section 1.3) | Intentional |
| 6 code nodes in v2 Test at RC1c | Intentional test candidates, approved for v2 Test |
| RC1d, RC1e and Fix 1 only in the isolated copy | Intentional isolation |
| v2 Test's code exists only in commits on no branch, held by a worktree in a temporary folder | **Drift** (source control) |
| Output limits implemented twice: repository `4706fb3`, isolated `5668b0b` | **Drift** (parallel copies of one change) |
| Live code in 3 commits that are not pushed | **Drift** |
| The repository's live snapshot is stale (19 nodes) | **Drift** |
| The baseline file holds a frozen answer with a known defect, marked for restoring | **Drift**, and a risk |
| Fix 1 in progress, uncommitted, in a temporary worktree, while another session works on it | Intentional work, at risk |

## 2. Proposed authoritative baseline

- **Production truth: live version `e3fbdb49` as stored in n8n.** Export it into the repository as a dated snapshot. Do not rebuild it from files.
- **Code truth for the redesign: a new branch from `staging`, which is live's code.** Bring onto it only the approved changes that survive the redesign:
  - quality patch 1: spending limit, founder hours, recurring units, existing business;
  - the RC1 writer and financial prompt additions;
  - the deterministic Compute Financials and Citation Check changes;
  - RC1d's validation-by-level guard;
  - Fix 1's separation of tables from notes.
- **Do not carry forward the claim-review-only changes** (Combine Claim Review and Build Claim Review from RC1 to RC1e). Those nodes are removed in the redesign. The commits are archived, not deleted.
- **v2 Test is then rebuilt from that branch** in a later stage, with your approval and its current version `015c2b97` as the rollback.

## 3. Changes needed for a clean v2 Test baseline (proposed, not applied)

| # | Change | Where | Rollback |
|---|---|---|---|
| 1 | Archive the isolated commits under a named branch (`archive/rc1-lineage` at `b4e3ea7`) so they survive the temporary worktree. Non-destructive. | repository refs | delete the branch |
| 2 | Push or otherwise secure the 3 unpushed commits that live runs on | repository | none needed |
| 3 | Export live `e3fbdb49` and v2 Test `015c2b97` as dated snapshots, without pinned data | repository files | n/a |
| 4 | Move the 63222 replay values out of `test-financial-baseline.js` into a labelled historical fixture. The header says: frozen AI answer from execution 63222, contains the known price-validation sentence, for regression only. The node file becomes the "off" version that v2 Test runs today. | repository | git revert |
| 5 | When replay is used, the run states it: the financial report says "Financial inputs replayed from 63222; not an independent model result", and the financial model's cost shows as not run. | Founder Context or Compute Financials, in the new branch | revert the commit |
| 6 | Tests that use the replay load the labelled fixture explicitly. One test confirms the shipped baseline node returns no fixed inputs. | repository tests | revert |
| 7 | Add the provenance table in section 1.5 to the diagnostics, so the earlier "recurring in eight runs" count is read correctly. Already recorded in this report. | documentation | n/a |
| 8 | v2 Test itself: no change now. It already runs with the baseline off. It is rebuilt from the new branch in the next stage. | n/a | n/a |

## 4. Historical test evidence: what exists and how safe it is

| Evidence | Where | Durability |
|---|---|---|
| Saved run fixtures (`exec-63211` to `exec-65050`, `phase2`) | `n8n/v2-test/fixtures/`, 33 MB | **Git-ignored**: on this disk only |
| Diagnostics and RC reports, saved plans and PDFs | `n8n/v2-test/diagnostics/`, 36 MB | **Untracked**: on this disk only |
| Per-node outputs of 66554 and 66650, the baseline score, the comparison workflows | the other session's scratchpad `qa/` | **Temporary folder**: at risk |
| The isolated commits and Fix 1 | worktree `wt-limits` in the same temporary folder | **At risk.** The commits are not on any branch. |
| Reports (audit, redesign, this one), the Sonnet 5.5 evaluation, backups, review records | `n8n/v2-test/reviews/`, `eval-sonnet55/`, `supervised/` | Committed. Only partly pushed (5 commits local). |
| Executions in n8n | n8n server | Subject to n8n's execution pruning; not checked today |
| Database rows and stored PDFs | Supabase | Durable, with the nightly backup |

Everything is available today. Several items exist in one place only, two of them in temporary folders. Securing them is changes 1 and 2, plus copying the `qa/` folder into the untracked diagnostics. None of that alters any evidence.

## 5. Risks to the later stages

- **Losing the RC1 lineage.** If the temporary worktree is cleaned up before change 1, the commits behind v2 Test and Fix 1 become unreachable.
- **Two sessions on one lineage.** Another session is building Fix 1 in that worktree right now. Rebasing or reconciling while it works risks conflicting edits. Its work should be committed first.
- **A silent replay.** If the baseline is "restored" as its comment says, new v2 Test runs would replay a defective 63222 answer while looking like fresh runs. Change 4 removes that path.
- **Remote drift.** A clone from GitHub today would not have the code that runs live.
- **Cherry-picking across two lines.** Output limits exist twice, and quality patch 1 and RC1 touch the same files as RC1d and Fix 1. Bringing only the surviving changes onto the new branch is careful merge work and needs the full offline suite after each step.
- **Test expectations tied to the old reviewer.** Many tests assert claim-review behaviour. When claim review is removed, they are retired, not rewritten, or they will block the redesign.

Stopped here, as instructed. Stage 2 waits for your approval of changes 1 to 7.
