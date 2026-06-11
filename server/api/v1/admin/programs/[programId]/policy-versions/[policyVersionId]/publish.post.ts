import { policyPublishInputSchema } from "@server/utils/contracts";
import { publishPolicyVersion } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const policyVersionId = routeParam(event, "policyVersionId");
  const body = await readSchema(event, policyPublishInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, programId, `admin.policy_versions.${policyVersionId}.publish`, body, () =>
    publishPolicyVersion(programId, policyVersionId, body)
  );
});
