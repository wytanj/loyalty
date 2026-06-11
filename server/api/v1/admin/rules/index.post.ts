import { adminRuleInputSchema } from "@server/utils/contracts";
import { createRule } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const body = await readSchema(event, adminRuleInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, body.program_id, "admin.rules.create", body, () =>
    createRule({
      program_id: body.program_id,
      kind: body.kind,
      name: body.name,
      reward_points: body.reward_points,
      channels: body.channels,
      active: body.active
    })
  );
});
