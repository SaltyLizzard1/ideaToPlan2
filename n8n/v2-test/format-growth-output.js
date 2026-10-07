// Format Growth Output1: takes the plan text out of the writer's answer.
// The writer may think before it answers. Thinking is returned apart from the text and is never part of the plan.
// An answer that is an error, was cut off, or is empty stops the run here: no plan is assembled, saved or sent.
const r = $('Growth Plan Generator1').first().json || {};
if (r.error) throw new Error('The plan writer returned an error: ' + String((r.error && r.error.message) || JSON.stringify(r.error)).slice(0, 300) + ' No plan was assembled.');
const ch = (r.choices || [])[0] || {};
const content = ch.message ? ch.message.content : '';
const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('') : '';
if (ch.finish_reason !== 'stop') throw new Error('The plan writer did not finish its answer (finish reason: ' + (ch.finish_reason || 'none') + '). The report may be cut off. No plan was assembled.');
if (text.trim().length < 2000) throw new Error('The plan writer returned ' + text.trim().length + ' characters, which is too short to be a plan. No plan was assembled.');
return { text };
