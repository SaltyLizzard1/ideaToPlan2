// No Model Call (n8n Code node, run once for all items).
// Reached when the model call limit is used up, or on a dry run. No request is sent to the model. The Decision
// Gate turns this into an escalation, so the owner still hears about the email.
const claim = $('Claim Model Call').first().json || {};
const built = $('Build AI Request').first().json || {};
const why = built.too_large === true
  ? 'the request is larger than the size limit (' + built.request_bytes + ' bytes)'
  : claim.allowed !== true
  ? 'the model call limit is reached (' + claim.calls_used + ' of ' + claim.calls_max + ' used)'
  : 'dry run, the model is not called';
return [{ json: { no_model_call: why } }];
