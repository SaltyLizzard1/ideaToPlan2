// The last step before the send. Fingerprints the file that the Gmail node attaches (binary "data") and compares it
// with the fingerprint that was approved. The item, with its file, is passed on unchanged.
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
const item = $input.first();
const expected = String(item.json.pdf_sha256 || '');
let found = '';
if (item.binary && item.binary.data) found = sha256js(new Uint8Array(await this.helpers.getBinaryDataBuffer(0, 'data')));
return [{ json: { ...item.json, attachment_sha256: found, attachment_ok: /^[0-9a-f]{64}$/.test(expected) && found === expected }, binary: item.binary }];
