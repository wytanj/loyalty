import { adminTierInputSchema } from "@server/utils/contracts";
import { updateTier } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const tierId = routeParam(event, "tierId");
  const body = await readSchema(event, adminTierInputSchema.partial().extend({ program_id: adminTierInputSchema.shape.program_id }));
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, body.program_id, "admin.tiers.update", body, () => updateTier(tierId, body));
});
