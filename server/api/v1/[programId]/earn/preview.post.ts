import { earnPreviewRequestSchema } from "@server/utils/contracts";
import { previewEarn } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const body = await readSchema(event, earnPreviewRequestSchema);
  await requireApiKey(event, ["loyalty:members:read"], programId);
  return previewEarn(programId, body);
});
