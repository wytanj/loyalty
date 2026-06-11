import { listPrograms } from "@server/utils/services";
import { defineLoyaltyHandler, requireApiKey } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  await requireApiKey(event, ["loyalty:admin"]);
  return {
    programs: listPrograms()
  };
});
