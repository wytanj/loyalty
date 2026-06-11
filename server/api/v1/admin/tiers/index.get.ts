import { z } from "zod";
import { getQuery } from "h3";
import { listTiers } from "@server/utils/services";
import { defineLoyaltyHandler, requireApiKey } from "@server/utils/route";

const querySchema = z.object({
  program_id: z.string().trim().min(1)
});

export default defineLoyaltyHandler(async (event) => {
  await requireApiKey(event, ["loyalty:admin"]);
  const query = querySchema.parse(getQuery(event));
  return {
    tiers: listTiers(query.program_id)
  };
});
