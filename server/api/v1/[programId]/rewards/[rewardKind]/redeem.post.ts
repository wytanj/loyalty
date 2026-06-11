import { rewardKindSchema, rewardRedeemRequestSchema } from "@server/utils/contracts";
import { redeemReward } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const rewardKind = rewardKindSchema.parse(routeParam(event, "rewardKind"));
  const body = await readSchema(event, rewardRedeemRequestSchema);
  await requireApiKey(event, ["loyalty:rewards:redeem"], programId);

  return runIdempotent(event, programId, `rewards.${rewardKind}.redeem`, body, (idempotencyKey) =>
    redeemReward(programId, rewardKind, {
      ...body,
      idempotency_key: idempotencyKey
    })
  );
});
