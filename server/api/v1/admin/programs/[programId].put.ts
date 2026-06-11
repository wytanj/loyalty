import { programInputSchema } from "@server/utils/contracts";
import { updateProgram } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const body = await readSchema(event, programInputSchema.partial());
  await requireApiKey(event, ["loyalty:admin"]);

  return runIdempotent(event, programId, "admin.programs.update", body, () => updateProgram(programId, body));
});
