import { adminRuleInputSchema } from "@server/utils/contracts";
import { updateRule } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const ruleId = routeParam(event, "ruleId");
  const body = await readSchema(event, adminRuleInputSchema.partial().extend({ program_id: adminRuleInputSchema.shape.program_id }));
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, body.program_id, "admin.rules.update", body, () => updateRule(ruleId, body));
});
