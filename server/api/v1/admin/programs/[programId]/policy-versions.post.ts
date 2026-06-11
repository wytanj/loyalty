import { adminPolicyVersionInputSchema } from "@server/utils/contracts";
import { createPolicyVersion } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const body = await readSchema(event, adminPolicyVersionInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, programId, "admin.policy_versions.create", body, () => createPolicyVersion(programId, body));
});
