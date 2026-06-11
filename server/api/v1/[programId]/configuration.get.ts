import { getConfiguration } from "@server/utils/services";
import { defineLoyaltyHandler, parseQueryContext, requireApiKey, routeParam } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  await requireApiKey(event, ["loyalty:configuration:read"], programId);
  return getConfiguration(programId, parseQueryContext(event));
});
