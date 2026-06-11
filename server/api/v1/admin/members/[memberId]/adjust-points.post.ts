import { adjustPointsRequestSchema } from "@server/utils/contracts";
import { adminAdjustPoints } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";
import { useLoyaltyStore } from "@server/utils/store";
import { notFound } from "@server/utils/errors";

export default defineLoyaltyHandler(async (event) => {
  const memberId = routeParam(event, "memberId");
  const body = await readSchema(event, adjustPointsRequestSchema);
  await requireApiKey(event, ["loyalty:admin"]);
  const member = useLoyaltyStore().findMemberById(memberId);
  if (!member) {
    throw notFound("Member was not found");
  }

  return runIdempotent(event, member.program_id, "admin.members.adjust_points", body, (idempotencyKey) =>
    adminAdjustPoints(memberId, {
      ...body,
      idempotency_key: idempotencyKey
    })
  );
});
