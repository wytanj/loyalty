import { adminRewardInputSchema } from "@server/utils/contracts";
import { updateReward } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const rewardId = routeParam(event, "rewardId");
  const body = await readSchema(event, adminRewardInputSchema.partial().extend({ program_id: adminRewardInputSchema.shape.program_id }));
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, body.program_id, "admin.rewards.update", body, () => updateReward(rewardId, body));
});
