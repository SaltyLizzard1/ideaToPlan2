// The writer request and the extraction of its answer. Offline: no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runNode, ROOT } from './harness.mjs';

const fx = (run, name) => { const v = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', run, name + '.json'), 'utf8').replace(/^﻿/, '')); const a = Array.isArray(v) ? v[0] : v; return a && a.json ? a.json : a; };
const out = (response) => runNode('format-growth-output.js', { 'Growth Plan Generator1': response });
const PLAN = '## 1. Executive Summary\n' + 'A sentence of the plan. '.repeat(200);

test('the writer request names Sonnet 5.5, sends no temperature and allows 40000 tokens', async () => {
  const w = await runNode('build-growth-payload.js', { 'Founder Context': fx('exec-63260', 'Founder Context'), 'Build Evidence': fx('exec-63260', 'Build Evidence'), 'Compute Financials': fx('exec-63260', 'Compute Financials') });
  const p = JSON.parse(w.payload);
  assert.equal(p.model, 'anthropic/claude-sonnet-5.5');
  assert.equal(p.max_tokens, 40000);
  assert.ok(!('temperature' in p) && !('top_p' in p) && !('top_k' in p));
  assert.deepEqual(p.messages.map((m) => m.role), ['system', 'user']);
});

test('a finished answer gives its text, with or without thinking beside it', async () => {
  assert.equal((await out({ choices: [{ finish_reason: 'stop', message: { content: PLAN } }] })).text, PLAN);
  assert.equal((await out({ choices: [{ finish_reason: 'stop', message: { content: PLAN, reasoning: 'thinking that is not part of the plan', reasoning_details: [{ type: 'reasoning.text', text: 'x' }] } }] })).text, PLAN);
  // Content returned as blocks: only the text blocks are the plan.
  assert.equal((await out({ choices: [{ finish_reason: 'stop', message: { content: [{ type: 'thinking', thinking: 'not the plan' }, { type: 'text', text: PLAN }] } }] })).text, PLAN);
});

test('the saved Sonnet 5.5 response from the evaluation is read as its text only', async () => {
  const saved = JSON.parse(readFileSync(path.join(ROOT, 'eval-sonnet55', 'outputs', 'draft-sonnet-5.5.json'), 'utf8')).response;
  assert.ok(saved.usage.completion_tokens_details.reasoning_tokens > 0, 'the saved response did think');
  const t = (await out(saved)).text;
  assert.ok(t.startsWith('## 9. 90-Day Action Plan'));
  assert.equal(t, saved.choices[0].message.content);
});

test('a cut-off, empty, short or failed answer stops the run', async () => {
  await assert.rejects(out({ choices: [{ finish_reason: 'length', message: { content: PLAN } }] }), /did not finish its answer \(finish reason: length\)/);
  await assert.rejects(out({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }), /too short to be a plan/);
  await assert.rejects(out({ choices: [{ finish_reason: 'stop', message: { content: null, reasoning: 'only thinking came back' } }] }), /too short to be a plan/);
  await assert.rejects(out({ choices: [{ finish_reason: 'stop', message: { content: 'Sorry, I cannot.' } }] }), /too short to be a plan/);
  await assert.rejects(out({ choices: [{ finish_reason: 'content_filter', message: { content: PLAN } }] }), /did not finish/);
  await assert.rejects(out({ error: { message: 'Insufficient credits', code: 402 } }), /returned an error: Insufficient credits/);
  await assert.rejects(out({}), /did not finish its answer \(finish reason: none\)/);
});
