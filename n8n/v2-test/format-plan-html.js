const fp = $('Finalize Plan').first().json;
let plan = fp.text || '';
const data = $('Prepare Client Data').first().json;
let sources = [];
if (Array.isArray(fp.sources_cited)) sources = fp.sources_cited;
plan = plan.replace(/\s*\u2014\s*/g, ' - ').replace(/\u2014/g, '-');
// A line of dashes is a section break in the writer's text. Sections already have headings, so the mark is dropped
// instead of being printed. A rule number in a heading is dropped too, should one reach this point.
plan = plan.replace(/^\s*-{3,}\s*$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^(\s*(?:#{1,6}\s+|\*\*)?)Rule \d+[:.]\s*/gim, '$1');
const properName = (data.client_name || '').trim().replace(/\b\w/g, c => c.toUpperCase());
const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const convertTables = (src) => {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) {
      const block = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { block.push(lines[i]); i++; }
      const rows = block
        .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
        .filter(cells => !cells.every(c => /^:?-{2,}:?$/.test(c) || c === ''));
      if (rows.length) {
        let t = '<table><thead><tr>' + rows[0].map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        for (let r = 1; r < rows.length; r++) { t += '<tr>' + rows[r].map(c => '<td>' + c + '</td>').join('') + '</tr>'; }
        t += '</tbody></table>';
        out.push(t);
      }
    } else { out.push(lines[i]); i++; }
  }
  return out.join('\n');
};
const CALLOUT_LABELS = { 'RECOMMENDS': 'IdeaToPlan recommends', 'DO THIS FIRST': 'Do this first', 'BIGGEST RISK': 'Biggest risk', 'VALIDATE THIS': 'Validate this', 'FIRST REVENUE MILESTONE': 'First revenue milestone', 'WATCH THIS NUMBER': 'Watch this number' };
const formatPlan = (text) => {
  return convertTables(text)
    .replace(/^>>\s*(RECOMMENDS|DO THIS FIRST|BIGGEST RISK|VALIDATE THIS|FIRST REVENUE MILESTONE|WATCH THIS NUMBER):\s*(.+)$/gm, (m, k, v) => '<div class="callout' + (k === 'BIGGEST RISK' ? ' risk' : '') + '"><span class="lab">' + CALLOUT_LABELS[k] + '</span>' + v + '</div>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (\d+\. .+)$/gm, '<h2>$1</h2>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    // A heading, a table, a list or a callout is not wrapped in a paragraph: the wrapper leaves an empty paragraph
    // behind it in the page, and print may then break between a heading and its text.
    .replace(/<p>(<(?:h[1-6]|table|div|ul)[ >])/g, '$1').replace(/(<\/(?:h[1-6]|table|div|ul)>)<\/p>/g, '$1')
    // A paragraph that is one bold line is a sub-heading. It is marked so that print keeps it with what follows.
    .replace(/<p><strong>([^<]{2,200})<\/strong>(?=<\/p>|\n<ul>)/g, '<p class="sub"><strong>$1</strong>')
    .trim();
};
const byId = {};
sources.forEach(s => { byId[s.id] = s; });
const cited = [];
(plan.match(/\b[SW]\d+\b/g) || []).forEach(id => { if (byId[id] && !cited.includes(id)) cited.push(id); });
const renderTags = (html) => html
  .replace(/\[((?:[SW]\d+)(?:\s*,\s*[SW]\d+)*)\]|\b([SW]\d+)\b/g, (m, group, bare) => (group || bare).split(/\s*,\s*/).map((id) => byId[id] ? '<sup class="tag src"><a href="#src-' + id + '">' + id + '</a></sup>' : '<sup class="tag bad">' + id + '?</sup>').join(''))
  .replace(/\[(F|A|C)\]/g, '');
const researched = data.package === 'Growth';
const legend = '<div class="legend"><strong>How to read this plan.</strong> ' + (researched ? 'Numbers like <sup class="tag src">S1</sup> point to the sources listed at the end. ' : 'No external research was done for this plan. ') + 'Anything described as an assumption has not been tested yet.</div>';
let sourcesHtml = '';
if (cited.length) {
  const accessed = byId[cited[0]].accessed || '';
  sourcesHtml = '<h2>' + ((plan.match(/^## \d+\. /gm) || []).length + 1) + '. Sources</h2><p class="srcnote">Sources were found by an automated research tool on ' + esc(accessed) + '. Each tag links a claim to the source the research tool attributed it to. Confirm any figure you rely on at the source itself.</p><ul class="sources">' + cited.map(id => {
    const s = byId[id];
    return '<li id="src-' + id + '"><strong>' + id + '.</strong> ' + esc(s.title) + '. ' + esc(s.domain) + '. Published: ' + esc(s.published) + '. Accessed: ' + esc(s.accessed) + '. ' + (s.kind === 'search_snippet' ? 'Search result listing only. ' : '') + '<a href="' + esc(s.url) + '">' + esc(s.url) + '</a></li>';
  }).join('') + '</ul>';
}
// The PDF is the customer's copy and is fingerprinted as rendered, before the owner reviews it. It carries no
// internal review status. A held version is held in the database and in the owner notice, not on the page.
const formattedContent = legend + renderTags(formatPlan(plan)) + sourcesHtml;
const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Georgia,serif;color:#1a1a2e;margin:0;padding:0}.header{background:#1e3a5f;padding:36px 48px;border-bottom:4px solid #e8b84b}.header h1{color:#fff;margin:0;font-size:28px;letter-spacing:2px;text-transform:uppercase}.header p{color:#dbe6f2;margin:10px 0 0;font-size:15px;letter-spacing:.5px}.meta{background:#f8f4e8;padding:16px 48px;border-left:4px solid #e8b84b;font-size:13px;color:#555}.content{padding:40px 48px;max-width:800px;margin:0 auto;line-height:1.9;font-size:15px;color:#222}h2{color:#1e3a5f;font-size:20px;margin:32px 0 12px;padding-left:12px;border-left:4px solid #e8b84b}h3{color:#1e3a5f;font-size:16px;margin:24px 0 8px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #d9d2c0;padding:8px 10px;font-size:14px;text-align:left;vertical-align:top}th{background:#f8f4e8;color:#1e3a5f}tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}h2,h3,p.sub{break-after:avoid;page-break-after:avoid}ul{margin:12px 0 12px 24px}li{margin:6px 0;line-height:1.7}.footer{background:#1e3a5f;padding:20px 48px;text-align:center;margin-top:40px}.footer p{color:#a0b8d0;margin:0;font-size:12px}.callout{background:#f8f4e8;border:1px solid #e8b84b;border-left:6px solid #e8b84b;border-radius:4px;padding:12px 16px;margin:18px 0;line-height:1.6;page-break-inside:avoid}.callout .lab{display:block;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#1e3a5f;margin-bottom:4px}.callout.risk{background:#fdf0ee;border-color:#c0564a}.callout.risk .lab{color:#9b2c1f}.legend{background:#f8f4e8;border-left:4px solid #e8b84b;padding:12px 16px;font-size:13px;line-height:1.7;margin-bottom:24px}sup.tag{font-family:Arial,sans-serif;font-size:10px;padding:0 3px;margin-left:2px;border-radius:3px;background:#eef2f7;color:#1e3a5f}sup.tag a{color:#1e3a5f;text-decoration:none}sup.tA{background:#fdf1d6;color:#7a5600}sup.bad{background:#fde2e2;color:#9b1c1c}.srcnote{font-size:13px;color:#555}ul.sources{list-style:none;margin:12px 0;padding:0}ul.sources li{font-size:12px;line-height:1.6;word-break:break-all}</style></head><body><div class="header"><h1>IDEA TO PLAN</h1><p>Business Plan - ' + (data.plan_goal_clean || 'Strategic Plan') + '</p></div><div class="meta"><strong>Prepared for:</strong> ' + properName + ' &nbsp;|&nbsp; <strong>Tier:</strong> ' + (data.package || '') + '</div><div class="content">' + formattedContent + '</div><div class="footer"><p>Built for founders ready to leap &nbsp;|&nbsp; IdeaToPlan.to</p></div></body></html>';
return [{ json: { html, client_name: properName, plan_goal_clean: data.plan_goal_clean } }];