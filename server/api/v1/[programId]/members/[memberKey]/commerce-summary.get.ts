import { getCommerceSummary } from "@server/utils/services";
import { defineLoyaltyHandler, parseQueryContext, requireApiKey, routeParam } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const memberKey = routeParam(event, "memberKey");
  await requireApiKey(event, ["loyalty:members:read"], programId);
  return getCommerceSummary(programId, memberKey, parseQueryContext(event));
});
