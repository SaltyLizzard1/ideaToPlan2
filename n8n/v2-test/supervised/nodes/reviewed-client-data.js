// The client fields the formatter and the notice read, taken from the order row. (Node name: Prepare Client Data.)
const c = $('Check Parent').first().json;
return [{ json: { client_name: c.client_name, email: c.email, package: c.package, plan_goal_clean: c.plan_goal_clean } }];
