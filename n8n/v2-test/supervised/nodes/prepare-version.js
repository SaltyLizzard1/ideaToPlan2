// Picks the next version number and puts the generated PDF back on the item for upload.
// The version row carries its own text, sources and the fingerprints of the text and of the PDF.
// SHA-256 in plain JavaScript. Code nodes on this n8n instance may not load the crypto module (checked in execution 63310).
const sha256js = (u8) => {
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  const primes = []; for (let n = 2; primes.length < 64; n++) { if (primes.every((p) => n % p)) primes.push(n); }
  const frac = (x) => ((x - Math.floor(x)) * 4294967296) >>> 0;
  const K = primes.map((p) => frac(Math.cbrt(p)));
  let H = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
  const l = u8.length, n = ((l + 9 + 63) >> 6) << 6; const m = new Uint8Array(n); m.set(u8); m[l] = 128;
  const dv = new DataView(m.buffer); dv.setUint32(n - 8, Math.floor(l / 536870912)); dv.setUint32(n - 4, (l << 3) >>> 0);
  const w = new Uint32Array(64);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) { const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
    H = [a, b, c, d, e, f, g, h].map((x, i) => (x + H[i]) >>> 0);
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
};
const sub = $('Resolve Submission').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r && r.version);
const version = rows.reduce((m, r) => Math.max(m, Number(r.version) || 0), 0) + 1;
const printed = $('Fingerprint PDF').first();
if (!printed.binary || !printed.binary.pdf_data || !printed.json.pdf_sha256) throw new Error('The PDF was not fingerprinted. No plan version was created.');
const fin = $('Finalize Plan').first().json;
const text = String(fin.text || '');
if (!text.trim()) throw new Error('The plan text is empty. No plan version was created.');
const origin = fin.origin === 'hand_corrected' ? 'hand_corrected' : 'generated';
if (origin === 'hand_corrected' && !fin.parent_version_id) throw new Error('A hand-corrected version needs its parent version. No plan version was created.');
return [{
  json: {
    submission_id: sub.submission_id,
    version,
    pdf_path: sub.submission_id + '/v' + version + '.pdf',
    review_status: fin.status || '',
    review_notes: fin.report || '',
    plan_text: text,
    sources_cited: Array.isArray(fin.sources_cited) ? fin.sources_cited : [],
    plan_sha256: sha256js(new Uint8Array(Buffer.from(text, 'utf8'))),
    pdf_sha256: printed.json.pdf_sha256,
    origin,
    parent_version_id: origin === 'hand_corrected' ? fin.parent_version_id : null,
  },
  binary: { pdf_data: { ...printed.binary.pdf_data, mimeType: 'application/pdf' } },
}];
