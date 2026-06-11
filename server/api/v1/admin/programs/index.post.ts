import { programInputSchema } from "@server/utils/contracts";
import { upsertProgram } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const body = await readSchema(event, programInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);
  const programId = body.id ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  return runIdempotent(event, programId, "admin.programs.create", body, () =>
    upsertProgram({
      id: programId,
      workspace_id: body.workspace_id,
      name: body.name,
      default_currency: body.default_currency,
      supported_channels: body.supported_channels,
      supported_countries: body.supported_countries,
      supported_languages: body.supported_languages,
      points_name: body.points_name,
      earn_rate: body.earn_rate,
      active: body.active
    })
  );
});
