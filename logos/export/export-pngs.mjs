import sharp from '../../node_modules/sharp/lib/index.js';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const jobs = [
  {
    input: 'logo.svg',
    sizes: [16, 32, 48, 192, 512, 1024, 2048],
    prefix: 'logo',
  },
  {
    input: 'logo-stacked.svg',
    sizes: [200, 400],
    prefix: 'logo-stacked',
  },
  {
    input: 'logo-icon.svg',
    sizes: [32, 180, 512],
    prefix: 'logo-icon',
  },
];

mkdirSync(join(__dirname, 'png'), { recursive: true });

for (const job of jobs) {
  const svgPath = join(__dirname, job.input);
  const svg = readFileSync(svgPath);
  for (const size of job.sizes) {
    const outPath = join(__dirname, 'png', `${job.prefix}-${size}.png`);
    await sharp(svg)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`✓ ${job.prefix}-${size}.png`);
  }
}

console.log('\nAll done → logos/export/png/');
