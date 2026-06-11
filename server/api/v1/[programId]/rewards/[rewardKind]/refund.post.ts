import { rewardKindSchema, rewardRefundRequestSchema } from "@server/utils/contracts";
import { refundReward } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const rewardKind = rewardKindSchema.parse(routeParam(event, "rewardKind"));
  const body = await readSchema(event, rewardRefundRequestSchema);
  await requireApiKey(event, ["loyalty:rewards:redeem"], programId);

  return runIdempotent(event, programId, `rewards.${rewardKind}.refund`, body, (idempotencyKey) =>
    refundReward(programId, rewardKind, {
      ...body,
      idempotency_key: idempotencyKey
    })
  );
});
