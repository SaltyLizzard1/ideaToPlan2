// Runs the code of an n8n Code node outside n8n, with the upstream nodes replaced by saved outputs.
// The node code is loaded from the same file that is pasted into the workflow, so the tests exercise the real code.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const FIXTURES = path.join(ROOT, 'fixtures', 'exec-63211');
export const PAGES = path.join(ROOT, 'fixtures', 'pages', 'replay.json');

export const fixture = (name) => JSON.parse(readFileSync(path.join(FIXTURES, name + '.json'), 'utf8').replace(/^﻿/, ''));
export const fixtureText = (name) => readFileSync(path.join(FIXTURES, name), 'utf8').replace(/^﻿/, '');
export const clone = (v) => JSON.parse(JSON.stringify(v));

// stubs: { 'Node Name': jsonObject or [jsonObject, ...] }. An array stands for a node that returned several items.
// A node that is not stubbed throws, the same as a node that has not run.
// ctx becomes `this` inside the node code, so ctx.helpers.httpRequest can stand in for n8n's request helper.
export async function runNode(file, stubs, input, ctx) {
  const code = readFileSync(path.join(ROOT, file), 'utf8').replace(/^﻿/, '');
  const $ = (name) => {
    if (!(name in stubs)) throw new Error('Node has not run: ' + name);
    const items = (Array.isArray(stubs[name]) ? stubs[name] : [stubs[name]]).map((json) => ({ json }));
    return { first: () => items[0], all: () => items };
  };
  const $input = { first: () => ({ json: input || {} }), all: () => [{ json: input || {} }] };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return await new AsyncFunction('$', '$input', code).call(ctx || {}, $, $input);
}

// Replays captured HTTP responses, keyed by the exact address requested. Each redirect hop was captured separately.
// An address that was not captured answers as a network error, the same as an unreachable site.
export const replayContext = (overrides = {}) => {
  const saved = existsSync(PAGES) ? JSON.parse(readFileSync(PAGES, 'utf8')) : {};
  const calls = [];
  return {
    calls,
    helpers: {
      httpRequest: async (opts) => {
        calls.push(opts.url);
        const o = opts.url in overrides ? overrides[opts.url] : saved[opts.url];
        if (!o) { const e = new Error('getaddrinfo ENOTFOUND (not in the captured fixtures)'); e.code = 'ENOTFOUND'; throw e; }
        if (o.error) { const e = new Error(o.error); e.code = o.code; throw e; }
        return { statusCode: o.statusCode, headers: o.headers || {}, body: o.body };
      },
    },
  };
};
