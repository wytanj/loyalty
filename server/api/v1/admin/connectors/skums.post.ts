import { connectorInputSchema } from "@server/utils/contracts";
import { createConnector } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const body = await readSchema(event, connectorInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);
  return runIdempotent(event, body.program_id, "admin.connectors.skums", body, () => createConnector("skums", body));
});
