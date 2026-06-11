import { earnReverseRequestSchema } from "@server/utils/contracts";
import { reverseEarn } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const body = await readSchema(event, earnReverseRequestSchema);
  await requireApiKey(event, ["loyalty:events:write"], programId);

  return runIdempotent(event, programId, "earn.reverse", body, (idempotencyKey) =>
    reverseEarn(programId, {
      ...body,
      idempotency_key: idempotencyKey
    })
  );
});
