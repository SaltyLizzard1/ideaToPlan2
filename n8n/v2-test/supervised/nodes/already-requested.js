// Zero rows changed: a duplicate request, or the status moved between the check and the update.
const c = $('Check Version').first().json;
throw new Error('No row changed for plan version ' + c.plan_version_id + '. It was already requested or its status changed. No approval email sent.');
