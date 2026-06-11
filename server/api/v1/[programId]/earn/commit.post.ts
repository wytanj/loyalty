import { earnCommitRequestSchema } from "@server/utils/contracts";
import { commitEarn } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const body = await readSchema(event, earnCommitRequestSchema);
  await requireApiKey(event, ["loyalty:events:write"], programId);

  return runIdempotent(event, programId, "earn.commit", body, (idempotencyKey) =>
    commitEarn(programId, {
      ...body,
      idempotency_key: idempotencyKey
    })
  );
});
