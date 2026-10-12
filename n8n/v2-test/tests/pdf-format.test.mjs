// The page the customer's PDF is printed from (Format Plan as HTML).
// Run: node --test n8n/v2-test/tests/pdf-format.test.mjs
// Offline. Two layout defects seen in the PDFs of executions 65050 and 63572 (2026-10-12):
// 1. "Action / Why it matters / Done when / Metric" were written on separate lines and printed as one run-on block.
// 2. The Sources list broke words anywhere: "Accessed: 2026-1 / 0-07", "date not s / hown", "h / ttps://".
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNode } from './harness.mjs';

const html = async (text, sources = [], pkg = 'Starter') => (await runNode('format-plan-html.js', { 'Finalize Plan': { text, sources_cited: sources }, 'Prepare Client Data': { client_name: 'test client', package: pkg, plan_goal_clean: 'Personal Roadmap' } }))[0].json.html;
// The plan itself: what stands between the page header and the page footer.
const body = (h) => h.slice(h.indexOf('<div class="content">'), h.indexOf('<div class="footer">'));
// The words a reader sees, with every tag taken out.
const words = (h) => body(h).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const ACTION = '## 7. 90-Day Action Plan\n\n**Days 1-14: Validate**\n\n**Action:** Contact the list.\nWhy it matters: It is the first test.\nDone when: All contacts are reached.\nMetric: Five replies.\n\n**Action:** Check registration.\nWhy it matters: It is a legal question.\nDone when: You have a written answer.\n';

test('fields written on separate lines are printed on separate lines', async () => {
  const h = await html(ACTION);
  assert.match(h, /Contact the list\.<br>\s*Why it matters: It is the first test\.<br>\s*Done when: All contacts are reached\.<br>\s*Metric: Five replies\./);
  // The last line of a block, and a line followed by a blank line, get no break: the paragraph ends there.
  assert.ok(!/Five replies\.<br>/.test(h));
  assert.match(h, /Five replies\.\s*<\/p>(?:<\/div><div class="tail"><div class="content">)?<p><strong>Action:<\/strong> Check registration\./);
});

test('the channel fields that start with a bold label are separated the same way', async () => {
  const h = await html('## 8. Marketing\n\n**Confidence:** Medium\n**Test:** Send a direct offer.\n**Success metric:** Five responses.\n');
  assert.match(h, /<strong>Confidence:<\/strong> Medium<br>\s*<strong>Test:<\/strong> Send a direct offer\.<br>\s*<strong>Success metric:<\/strong> Five responses\./);
});

test('tables, headings, lists and callouts are laid out as before, with no break added', async () => {
  const src = '## 4. Model\n\n| Input | Base |\n|---|---|\n| Price | $200 |\n| Customers | 5 |\n\n- First point\n- Second point\n\n>> DO THIS FIRST: Contact the list.\n\nA paragraph on one line.\n\nAnother paragraph.\n';
  const h = await html(src);
  assert.ok(!/<br>/.test(body(h)), 'a break was added where none belongs');
  assert.match(h, /<table><thead><tr><th>Input<\/th><th>Base<\/th><\/tr><\/thead><tbody><tr><td>Price<\/td><td>\$200<\/td><\/tr><tr><td>Customers<\/td><td>5<\/td><\/tr><\/tbody><\/table>/);
  assert.match(h, /<ul><li>First point<\/li>\n?<li>Second point<\/li>\n?<\/ul>/);
  assert.match(h, /<div class="callout"><span class="lab">Do this first<\/span>Contact the list\.<\/div>/);
});

test('no word is added, removed or moved by the line breaks', async () => {
  const h = await html(ACTION);
  assert.equal(words(h), '7. 90-Day Action Plan Days 1-14: Validate Action: Contact the list. Why it matters: It is the first test. Done when: All contacts are reached. Metric: Five replies. Action: Check registration. Why it matters: It is a legal question. Done when: You have a written answer.'.replace(/^/, 'How to read this plan. No external research was done for this plan. Anything described as an assumption has not been tested yet. '));
});

test('the sources list wraps prose at word boundaries, and only the address may break anywhere', async () => {
  const h = await html('## 1. Plan\n\nA claim [S1].\n', [{ id: 'S1', title: 'A page', domain: 'example.com', published: 'date not shown', accessed: '2026-10-07', url: 'https://example.com/a/very/long/address', kind: 'page' }], 'Growth');
  const li = (h.match(/\.sources li\{[^}]*\}/) || [''])[0];
  const a = (h.match(/\.sources li a\{[^}]*\}/) || [''])[0];
  assert.ok(li && !/word-break:\s*break-all/.test(li), 'the list still breaks every word anywhere: ' + li);
  assert.match(a, /word-break:\s*break-all/);
  // The address is the only thing inside the link, so nothing else can be broken mid-word.
  // A date is kept whole: a line may not end in the middle of 2026-10-07.
  assert.match(h, /\.sources \.nb\{white-space:nowrap\}/);
  assert.match(h, /Published: date not shown\. Accessed: <span class="nb">2026-10-07<\/span>\. <a href="https:\/\/example\.com\/a\/very\/long\/address">https:\/\/example\.com\/a\/very\/long\/address<\/a><\/li>/);
});

// 3. Single asterisks. Growth version 5dc66d48 printed "*Who pays:* Adults ..." with its asterisks.
const inner = async (text) => { const h = await html(text); return body(h).replace(/^[\s\S]*?<\/div>/, '').replace(/\s+/g, ' ').trim(); };

test('emphasis written with single asterisks is printed as emphasis', async () => {
  assert.match(await inner('*Who pays:* Adults aged 40-60.'), /<em>Who pays:<\/em> Adults aged 40-60\./);
  assert.match(await inner('**Bold** and *italic* and **bold again**.'), /<strong>Bold<\/strong> and <em>italic<\/em> and <strong>bold again<\/strong>\./);
  assert.match(await inner('He said "*really*" (*twice*).'), /"<em>really<\/em>" \(<em>twice<\/em>\)\./);
  // A list at the very end of the plan is split so that its last item stays with the footer; both items are there, in order.
  const list = await inner(['- a list item with *emphasis* inside', '- a second item'].join(String.fromCharCode(10)));
  assert.ok(list.indexOf('<li>a list item with <em>emphasis</em> inside</li>') >= 0 && list.indexOf('<li>a second item</li>') > list.indexOf('<em>emphasis</em>'));
});

test('an asterisk that is arithmetic, a bullet or a lone mark is left exactly as written', async () => {
  for (const t of ['Revenue is 3 * 4 * 5 = 60 and 2*3*4 = 24.', 'Monthly revenue is $200 * 5 customers = $1,000.', 'A note* with one mark, and another* later.', 'Rated 4* by one reviewer and 5* by another.']) {
    const out = await inner(t);
    assert.ok(!/<em>/.test(out), 'emphasis was made from: ' + t);
    assert.ok(out.includes(t.replace(/&/g, '&amp;')), 'the text changed: ' + out);
  }
  // A line that starts with an asterisk and a space is a bullet in the writer's hand, not emphasis.
  const bullets = await inner('* first point\n* second point');
  assert.ok(!/<em>/.test(bullets));
  assert.match(bullets, /\* first point/);
  // In a table cell the same rules hold.
  const table = await inner('| Item | Detail |\n|---|---|\n| Price | $200 * 5 = $1,000 |\n| Note | *untested* |');
  assert.match(table, /<td>\$200 \* 5 = \$1,000<\/td>/);
  assert.match(table, /<td><em>untested<\/em><\/td>/);
});

test('only the two asterisks are removed: every word and figure of the sentence is kept', async () => {
  const src = '*What they buy:* A single planning session at $500, 2 hours long.';
  assert.equal(words(await html(src)).replace(/^.*not been tested yet\. /, ''), 'What they buy: A single planning session at $500, 2 hours long.');
});

// 4. The footer.
test('the footer is kept on the page of the last block, in a container that may not be split', async () => {
  const h = await html('## 1. Plan\n\nFirst paragraph.\n\nLast paragraph.\n');
  assert.match(h, /\.tail\{break-inside:avoid;page-break-inside:avoid\}/);
  // The last paragraph and the footer are the two things inside that container, in that order.
  assert.match(h, /<div class="tail"><div class="content"><p>Last paragraph\.\s*<\/div><div class="footer"><p>Built for founders ready to leap/);
  assert.match(h, /First paragraph\.\s*<\/p><\/div><div class="tail">/);
  assert.equal((h.match(/<div class="footer">/g) || []).length, 1);
  assert.equal(words(h).replace(/^.*not been tested yet\. /, ''), '1. Plan First paragraph. Last paragraph.');
});

test('a plan that ends with the Sources list keeps only the last source with the footer, and loses none', async () => {
  const src = (n) => ({ id: 'S' + n, title: 'Page ' + n, domain: 'example.com', published: 'date not shown', accessed: '2026-10-07', url: 'https://example.com/' + n, kind: 'page' });
  const h = await html('## 1. Plan\n\nClaims [S1] [S2] [S3].\n', [src(1), src(2), src(3)], 'Growth');
  assert.deepEqual([...h.matchAll(/<li id="src-(S\d)">/g)].map((m) => m[1]), ['S1', 'S2', 'S3']);
  const tail = h.slice(h.indexOf('<div class="tail">'), h.indexOf('<div class="footer">'));
  assert.deepEqual([...tail.matchAll(/<li id="src-(S\d)">/g)].map((m) => m[1]), ['S3']);
  assert.match(tail, /<ul data-tail="1" class="sources">/);
});

test('a plan that ends with a table keeps one table, and its last row is held with the footer', async () => {
  const h = await html('## 1. Plan\n\nText.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n');
  assert.ok(!/<div class="tail">/.test(h));
  // One table, one header: the printer repeats that header on every page the table runs over.
  assert.equal((h.match(/<table/g) || []).length, 1);
  assert.equal((h.match(/<thead>/g) || []).length, 1);
  assert.match(h, /thead\{display:table-header-group\}/);
  // The earlier rows stay in the ordinary body and break over pages as before.
  assert.match(h, /<table data-end="1"><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><tr><td>3<\/td><td>4<\/td><\/tr><\/tbody>/);
  // The last row and the footer are one group that may not be split. The footer spans every column.
  assert.match(h, /<tbody class="keep"><tr><td>5<\/td><td>6<\/td><\/tr><tr class="footrow"><td colspan="2"><div class="footer"><p>Built for founders ready to leap[^<]*<\/p><\/div><\/td><\/tr><\/tbody><\/table><\/div><\/body>/);
  assert.match(h, /tbody\.keep\{break-inside:avoid;page-break-inside:avoid\}/);
  assert.equal((h.match(/<div class="footer">/g) || []).length, 1);
  assert.equal(words(h).replace(/^.*not been tested yet\. /, ''), '1. Plan Text. A B 1 2 3 4 5 6');
});

test('a table with a single row, and a table that is not the last thing in the plan', async () => {
  const one = await html('## 1. Plan\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  assert.match(one, /<thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><\/tbody><tbody class="keep"><tr><td>1<\/td><td>2<\/td><\/tr><tr class="footrow">/);
  const mid = await html('## 1. Plan\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nLast words.\n');
  assert.ok(!/footrow"|data-end=/.test(mid.slice(mid.indexOf('<body'))));
  assert.match(mid, /<table><thead>/);
  assert.match(mid, /<div class="tail"><div class="content"><p>Last words\./);
});
