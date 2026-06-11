import { getConfiguration } from "@server/utils/services";
import { defineLoyaltyHandler, requireApiKey, routeParam } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  await requireApiKey(event, ["loyalty:admin"]);
  return getConfiguration(programId, { channel: "agent" });
});
