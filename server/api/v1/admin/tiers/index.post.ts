import { adminTierInputSchema } from "@server/utils/contracts";
import { createTier } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const body = await readSchema(event, adminTierInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, body.program_id, "admin.tiers.create", body, () =>
    createTier({
      program_id: body.program_id,
      name: body.name,
      min_lifetime_points: body.min_lifetime_points,
      benefits: body.benefits,
      active: body.active
    })
  );
});
