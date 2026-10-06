// Parse AI Answer (n8n Code node, run once for all items).
// Reads the model's JSON answer. Anything unreadable becomes parse_error, which the Decision Gate treats as
// a reason to send the email to the owner.
const r = $input.first().json || {};
if (r.no_model_call) return [{ json: { no_model_call: String(r.no_model_call) } }];
let content = '';
try { content = String(r.choices[0].message.content || ''); } catch (e) { content = ''; }
if (!content) return [{ json: { parse_error: 'the model returned no content' } }];
const start = content.indexOf('{');
const end = content.lastIndexOf('}');
if (start < 0 || end <= start) return [{ json: { parse_error: 'no JSON object in the model answer' } }];
try {
  const o = JSON.parse(content.slice(start, end + 1));
  return [{ json: {
    category: o.category,
    confidence: o.confidence,
    needs_owner: o.needs_owner === true,
    owner_reason: o.owner_reason || '',
    reply_text: o.reply_text || '',
    usage: r.usage || null,
  } }];
} catch (e) {
  return [{ json: { parse_error: 'invalid JSON: ' + e.message } }];
}
