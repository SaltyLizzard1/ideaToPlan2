// Order Lookup (n8n Code node, run once for all items).
// Decides which order facts, if any, may be used for this email. Order details are released only when Gmail
// verified the sender, replies would go back to that same address, and the order's own email matches exactly.
// The database search is a pattern match, so every row is checked again here: a look-alike address gets nothing.
const msg = $('Normalize and Filter').first().json;
const sender = String(msg.customer_email || '').trim().toLowerCase();
const rows = $input.all().map((i) => i.json).filter((o) => o && o.id);
const own = rows.filter((o) => String(o.email || '').trim().toLowerCase() === sender);

let withheld = '';
if (!msg.sender_verified) withheld = 'the sender address could not be verified';
else if (msg.reply_to_differs) withheld = 'replies to this email would go to a different address than the sender';

return [{
  json: {
    withheld_reason: withheld,
    orders: withheld ? [] : own.map((o) => ({
      id: o.id, status: o.status, package: o.package,
      submitted_at: o.submitted_at, plan_generated_at: o.plan_generated_at, delivered_at: o.delivered_at,
    })),
    rows_returned: rows.length,
    rows_matching_sender: own.length,
  },
}];
