import { sessionRequestSchema } from "@server/utils/contracts";
import { initializeSession } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const memberKey = routeParam(event, "memberKey");
  const body = await readSchema(event, sessionRequestSchema);
  await requireApiKey(event, ["loyalty:members:write"], programId);

  return runIdempotent(event, programId, "members.sessions", body, () =>
    initializeSession(programId, memberKey, {
      ...body
    })
  );
});
