import { adminRewardInputSchema } from "@server/utils/contracts";
import { createReward } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const body = await readSchema(event, adminRewardInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, body.program_id, "admin.rewards.create", body, () =>
    createReward({
      program_id: body.program_id,
      kind: body.kind,
      name: body.name,
      cost_points: body.cost_points,
      value: body.value,
      channels: body.channels,
      countries: body.countries,
      active: body.active,
      inventory: body.inventory,
      skums_refs: body.skums_refs
    })
  );
});
