// Approval by explicit confirmation. Published to the approval workflow 7MAQia1N6jV4bNnc on 2026-10-12.
//
// Today the approval email carries n8n's built-in Approve button: a plain link to a signed resume address with
// approved=true. In n8n's send-and-wait handler a GET of that address resumes the execution as approved, with no
// confirmation step. The only guards are the signature in the address and a user-agent check for known bots.
//
// This change switches the node to n8n's "custom form" response. The email then carries one button that opens a page
// (a GET, which only draws the form). The decision is sent by submitting the form (a POST). A request that merely
// fetches the address can no longer approve anything.
//
// applyConfirm(workflow) returns a changed copy of an approval workflow definition. It touches three nodes and
// nothing else: Approval Email, Approved?, Changes Requested?.
export const DECISION_FIELD = 'Decision';
export const REQUEST_CHANGES = 'Request changes: hold delivery';
export const APPROVE = 'Approve: send this version to the client';

export const APPROVAL_EMAIL_PARAMETERS = (old) => ({
  operation: 'sendAndWait',
  sendTo: old.sendTo,
  subject: old.subject,
  message: old.message,
  responseType: 'customForm',
  defineForm: 'fields',
  formFields: {
    values: [{
      fieldLabel: DECISION_FIELD,
      fieldType: 'dropdown',
      // "Request changes" stands first, so a form submitted without choosing never approves.
      fieldOptions: { values: [{ option: REQUEST_CHANGES }, { option: APPROVE }] },
      requiredField: true,
    }],
  },
  options: {
    ...(old.options || {}),
    messageButtonLabel: 'Open the decision form',
    responseFormTitle: 'Plan approval',
    responseFormDescription: 'Choose a decision and submit. Nothing is sent to the client unless you choose Approve and submit this form.',
    responseFormButtonLabel: 'Submit decision',
  },
});
export const APPROVED_EXPR = `={{ $json.data?.['${DECISION_FIELD}'] === '${APPROVE}' }}`;
export const CHANGES_EXPR = `={{ $json.data?.['${DECISION_FIELD}'] === '${REQUEST_CHANGES}' }}`;

export function applyConfirm(workflow) {
  const wf = JSON.parse(JSON.stringify(workflow));
  const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error('missing node ' + name); return n; };
  const email = node('Approval Email');
  if (email.parameters.operation !== 'sendAndWait') throw new Error('Approval Email is not a send-and-wait node');
  if (email.parameters.sendTo !== 'liz@ideatoplan.to') throw new Error('unexpected approval recipient');
  email.parameters = APPROVAL_EMAIL_PARAMETERS(email.parameters);
  const setExpr = (name, was, expr) => {
    const c = node(name).parameters.conditions.conditions;
    if (c.length !== 1 || c[0].leftValue !== was) throw new Error(name + ' is not the condition this patch expects: ' + (c[0] && c[0].leftValue));
    c[0].leftValue = expr;
  };
  setExpr('Approved?', '={{ $json.data?.approved === true }}', APPROVED_EXPR);
  setExpr('Changes Requested?', '={{ $json.data?.approved === false }}', CHANGES_EXPR);
  return wf;
}
