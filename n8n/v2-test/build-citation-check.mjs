// Builds citation-check.js from the pre-fix node code plus the patches. Fails if a patch does not match exactly once.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { patches as first } from './citation-check.patches.mjs';
// Later rounds of changes are kept as JSON, so the same find and replace pairs can be sent to n8n unchanged.

const here = path.dirname(fileURLToPath(import.meta.url));
let code = readFileSync(path.join(here, 'base', 'citation-check.before.js'), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const patches = first.concat(JSON.parse(readFileSync(path.join(here, 'citation-check.patches2.json'), 'utf8')), JSON.parse(readFileSync(path.join(here, 'citation-check.patches3.json'), 'utf8')), JSON.parse(readFileSync(path.join(here, 'citation-check.patches4.json'), 'utf8')), JSON.parse(readFileSync(path.join(here, 'citation-check.patches5.json'), 'utf8')));
patches.forEach((p, i) => {
  const count = code.split(p.find).length - 1;
  if (count !== 1) throw new Error('Patch ' + (i + 1) + ' matched ' + count + ' times, expected 1: ' + p.find.slice(0, 60));
  code = code.replace(p.find, () => p.replace);
});
writeFileSync(path.join(here, 'citation-check.js'), code, 'utf8');
console.log('citation-check.js written: ' + code.length + ' characters, ' + patches.length + ' patches applied.');
