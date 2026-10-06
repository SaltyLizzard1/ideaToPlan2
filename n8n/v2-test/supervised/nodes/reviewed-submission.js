// The order this version belongs to: the parent's. (Node name: Resolve Submission.) There is no fallback order.
const c = $('Check Parent').first().json;
if (!c.submission_id) throw new Error('No order for this version. Nothing was created.');
return [{ json: { submission_id: c.submission_id } }];
