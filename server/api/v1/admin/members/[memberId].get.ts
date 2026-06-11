import { getAdminMember } from "@server/utils/services";
import { defineLoyaltyHandler, requireApiKey, routeParam } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  await requireApiKey(event, ["loyalty:admin"]);
  return getAdminMember(routeParam(event, "memberId"));
});
