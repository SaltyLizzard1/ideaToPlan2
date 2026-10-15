// Test Financial Baseline. This node exists only in the v2 Test workflow, and it is OFF: it replays nothing, so every run
// computes its financial model from its own intake and a fresh financial-model answer.
// To replay a frozen answer on purpose, paste a fixture from replay-fixtures/ into this node. A replay is applied only
// when it carries replay_label (Founder Context), and the run then reports itself as replayed (Compute Financials).
// The values of execution 63222 are kept in replay-fixtures/financial-inputs-63222.historical.js.
return { replay_label: null, fixedScenarioPrice: null, fixedFinancialAssumptions: null };
