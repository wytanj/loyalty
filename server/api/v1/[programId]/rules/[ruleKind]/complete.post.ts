import { ruleCompleteRequestSchema, ruleKindSchema } from "@server/utils/contracts";
import { completeRule } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const ruleKind = ruleKindSchema.parse(routeParam(event, "ruleKind"));
  const body = await readSchema(event, ruleCompleteRequestSchema);
  await requireApiKey(event, ["loyalty:members:write"], programId);

  return runIdempotent(event, programId, `rules.${ruleKind}.complete`, body, (idempotencyKey) =>
    completeRule(programId, ruleKind, {
      ...body,
      idempotency_key: idempotencyKey
    })
  );
});
