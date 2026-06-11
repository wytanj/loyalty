import { z } from "zod";
import { eventIngestRequestSchema } from "@server/utils/contracts";
import { ingestEvent } from "@server/utils/services";
import { defineLoyaltyHandler, readSignedWebhookBody, requireApiKey, runIdempotent } from "@server/utils/route";
import { invalidRequest } from "@server/utils/errors";

const providerSchema = z.enum(["crm", "skums", "pos", "shopify", "custom"]);
const webhookBodySchema = eventIngestRequestSchema.extend({
  program_id: z.string().trim().min(1)
});

export default defineLoyaltyHandler(async (event) => {
  const provider = providerSchema.parse(event.context.params?.provider);
  const secret = webhookSecret(provider);
  const rawBody = await readSignedWebhookBody(event, secret);
  const body = webhookBodySchema.parse(rawBody);
  await requireApiKey(event, ["loyalty:webhooks:write"], body.program_id);

  return runIdempotent(event, body.program_id, `webhooks.${provider}`, body, (idempotencyKey) =>
    ingestEvent(body.program_id, {
      ...body,
      idempotency_key: idempotencyKey,
      payload: {
        ...body.payload,
        provider
      }
    })
  );
});

function webhookSecret(provider: z.infer<typeof providerSchema>): string {
  if (provider === "pos") {
    return process.env.POS_WEBHOOK_SECRET ?? "dev_pos_webhook_secret";
  }

  if (provider === "crm") {
    return process.env.CRM_WEBHOOK_SECRET ?? "dev_crm_webhook_secret";
  }

  if (provider === "skums") {
    return process.env.SKUMS_WEBHOOK_SECRET ?? "dev_skums_webhook_secret";
  }

  const fallback = process.env.LOYALTY_SIGNING_SECRET ?? "dev_signing_secret";
  if (!fallback) {
    throw invalidRequest("Webhook signing secret is not configured");
  }

  return fallback;
}
