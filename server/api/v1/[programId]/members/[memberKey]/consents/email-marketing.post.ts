import { consentRequestSchema } from "@server/utils/contracts";
import { setEmailMarketingConsent } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const memberKey = routeParam(event, "memberKey");
  const body = await readSchema(event, consentRequestSchema);
  await requireApiKey(event, ["loyalty:members:write"], programId);

  return runIdempotent(event, programId, "members.consents.email_marketing", body, () =>
    setEmailMarketingConsent(programId, memberKey, body)
  );
});
