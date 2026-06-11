import { getPolicyVersion } from "@server/utils/services";
import { defineLoyaltyHandler, requireApiKey, routeParam } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const policyVersionId = routeParam(event, "policyVersionId");
  await requireApiKey(event, ["loyalty:admin"]);
  return getPolicyVersion(programId, policyVersionId);
});
