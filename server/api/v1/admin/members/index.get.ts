import { z } from "zod";
import { getQuery } from "h3";
import { listAdminMembers } from "@server/utils/services";
import { defineLoyaltyHandler, requireApiKey } from "@server/utils/route";

const querySchema = z.object({
  program_id: z.string().trim().min(1).optional()
});

export default defineLoyaltyHandler(async (event) => {
  await requireApiKey(event, ["loyalty:admin"]);
  const query = querySchema.parse(getQuery(event));
  return {
    members: listAdminMembers(query.program_id)
  };
});
