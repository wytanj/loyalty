import { webhookSubscriptionInputSchema } from "@server/utils/contracts";
import { createWebhookSubscription } from "@server/utils/services";
import { defineLoyaltyHandler, readSchema, requireApiKey, runIdempotent } from "@server/utils/route";

export default defineLoyaltyHandler(async (event) => {
  const body = await readSchema(event, webhookSubscriptionInputSchema);
  await requireApiKey(event, ["loyalty:admin"]);
  return runIdempotent(event, body.program_id, "admin.webhooks.create", body, () => createWebhookSubscription(body));
});
