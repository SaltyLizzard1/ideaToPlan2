// Runs the code of an n8n Code node outside n8n, with the upstream nodes replaced by saved outputs.
// The node code is loaded from the same file that is pasted into the workflow, so the tests exercise the real code.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const FIXTURES = path.join(ROOT, 'fixtures', 'exec-63211');

export const fixture = (name) => JSON.parse(readFileSync(path.join(FIXTURES, name + '.json'), 'utf8').replace(/^﻿/, ''));
export const fixtureText = (name) => readFileSync(path.join(FIXTURES, name), 'utf8').replace(/^﻿/, '');
export const clone = (v) => JSON.parse(JSON.stringify(v));

// stubs: { 'Node Name': jsonObject }. A node that is not stubbed throws, the same as a node that has not run.
export async function runNode(file, stubs, input) {
  const code = readFileSync(path.join(ROOT, file), 'utf8').replace(/^﻿/, '');
  const $ = (name) => {
    if (!(name in stubs)) throw new Error('Node has not run: ' + name);
    return { first: () => ({ json: stubs[name] }), all: () => [{ json: stubs[name] }] };
  };
  const $input = { first: () => ({ json: input || {} }), all: () => [{ json: input || {} }] };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return await new AsyncFunction('$', '$input', code)($, $input);
}
