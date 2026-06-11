import { eventIngestRequestSchema } from "@server/utils/contracts";
import { ingestEvent } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const programId = routeParam(event, "programId");
  const body = await readSchema(event, eventIngestRequestSchema);
  await requireApiKey(event, ["loyalty:events:write"], programId);

  return runIdempotent(event, programId, "events.ingest", body, (idempotencyKey) =>
    ingestEvent(programId, {
      ...body,
      idempotency_key: idempotencyKey
    })
  );
});
