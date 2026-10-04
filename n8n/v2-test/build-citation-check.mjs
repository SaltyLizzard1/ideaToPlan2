// Builds citation-check.js from the pre-fix node code plus the patches. Fails if a patch does not match exactly once.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { patches } from './citation-check.patches.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let code = readFileSync(path.join(here, 'base', 'citation-check.before.js'), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
patches.forEach((p, i) => {
  const count = code.split(p.find).length - 1;
  if (count !== 1) throw new Error('Patch ' + (i + 1) + ' matched ' + count + ' times, expected 1: ' + p.find.slice(0, 60));
  code = code.replace(p.find, () => p.replace);
});
writeFileSync(path.join(here, 'citation-check.js'), code, 'utf8');
console.log('citation-check.js written: ' + code.length + ' characters, ' + patches.length + ' patches applied.');
