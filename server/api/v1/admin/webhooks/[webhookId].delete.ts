import { z } from "zod";
import { getQuery } from "h3";
import { deleteWebhookSubscription } from "@server/utils/services";
import { defineLoyaltyHandler, requireApiKey, routeParam, runIdempotent } from "@server/utils/route";

const querySchema = z.object({
  program_id: z.string().trim().min(1)
});

export default defineLoyaltyHandler(async (event) => {
  await requireApiKey(event, ["loyalty:admin"]);
  const query = querySchema.parse(getQuery(event));
  const webhookId = routeParam(event, "webhookId");
  return runIdempotent(event, query.program_id, "admin.webhooks.delete", { webhook_id: webhookId }, () =>
    deleteWebhookSubscription(webhookId)
  );
});
