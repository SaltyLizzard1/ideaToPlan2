# Writer switched to Sonnet 5.5: what changed and the exact rollback

Applied 2026-10-07 on Liz's instruction, after the comparison in `n8n/v2-test/eval-sonnet55/COMPARISON.md`.

Changed in three places, identically: the published pipeline `tZ8blRPhX7UiDxFo` (published version `1a577958-3191-4fad-a73c-977dd889226d`), inactive v2 Test `mLyKvFeYmJHuwXQ9`, and the repository.

## 1. Node `Build Growth Payload` (file `n8n/v2-test/build-growth-payload.js`), last statement

Before:

```js
  payload: JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', max_tokens: 20000, temperature: 0.3, messages: [{ role: 'system', content: ctx.writer_system }, { role: 'user', content: user }] }),
```

After:

```js
  // Writer: Sonnet 5.5 since 2026-10-07. It does not accept a temperature, and its thinking counts against max_tokens.
  payload: JSON.stringify({ model: 'anthropic/claude-sonnet-5.5', max_tokens: 40000, messages: [{ role: 'system', content: ctx.writer_system }, { role: 'user', content: user }] }),
```

| Setting | Before | After |
|---|---|---|
| model | `anthropic/claude-sonnet-4.6` | `anthropic/claude-sonnet-5.5` |
| temperature | `0.3` | not sent |
| max_tokens | `20000` | `40000` (thinking and the plan text together) |

## 2. Node `Format Growth Output1` (file `n8n/v2-test/format-growth-output.js`)

Before, the whole node:

```js
return { text: $('Growth Plan Generator1').first().json.choices[0].message.content };
```

After: the node takes the text only, and throws when the answer is an error, was cut off (finish reason other than `stop`), or is shorter than 2,000 characters. A throw stops the run before `Assemble Plan`, so no plan is saved, no customer confirmation is sent, and the System Alert goes to Liz.

## Rollback

To go back to Sonnet 4.6, restore the "Before" line of section 1 in `Build Growth Payload` (model, `temperature: 0.3`, `max_tokens: 20000`) in the published pipeline and publish. Section 2 can stay: it works the same for either model. To undo it as well, restore its one "Before" line.

Other ways back: n8n's version history of `tZ8blRPhX7UiDxFo` (the version before this change is `d0543421-9fe1-4743-8e2a-16139cc6e6ee`), or the file `pipeline-v2-supervised.json` in this folder, which is the pipeline as cut over with Sonnet 4.6.

## Not changed

Every other model: research (Perplexity Sonar, Haiku 4.5), financial assumptions, final QA, revision, claim review and the Base plan writer stay on their previous models. The gate, the notices, the review record requirement, the Approve click, the fingerprints and the delivery workflow are untouched. `Growth Plan Generator1` keeps its credential, its 10-minute timeout and its retry setting.

## Cost of one writer call

- Most it can cost: about $0.46. Output is capped at 40,000 tokens ($0.40 at $10 per million) and the request is about 31,400 input tokens ($0.063 at $2 per million).
- Expected: $0.25 to $0.35, an estimate from one section's worth of thinking.
- The node retries on a failed request. A failed request is normally not billed; if every attempt were billed in full, three attempts would be about $1.39.

## Untested

No plan has been generated with this change. Watch the first real order: that the writer finishes inside the limit, how many tokens went to thinking, the cost, and section 9 against the forecast.
