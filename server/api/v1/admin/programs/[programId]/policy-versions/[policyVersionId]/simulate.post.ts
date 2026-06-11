import { policySimulationInputSchema } from "@server/utils/contracts";
import { simulatePolicyVersion } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const policyVersionId = routeParam(event, "policyVersionId");
  const body = await readSchema(event, policySimulationInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);
  return simulatePolicyVersion(programId, policyVersionId, body);
});
