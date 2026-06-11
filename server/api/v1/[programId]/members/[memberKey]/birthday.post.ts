import { birthdayRequestSchema } from "@server/utils/contracts";
import { setBirthday } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const memberKey = routeParam(event, "memberKey");
  const body = await readSchema(event, birthdayRequestSchema);
  await requireApiKey(event, ["loyalty:members:write"], programId);

  return runIdempotent(event, programId, "members.birthday", body, () => setBirthday(programId, memberKey, body));
});
