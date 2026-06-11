import { z } from "zod";

export const channels = ["web", "pos", "mobile", "marketplace", "social", "agent", "partner"] as const;
export const sourceSystems = ["pos", "skums", "crm", "loyalty", "shopify", "custom"] as const;
export const policyVersionStatuses = ["draft", "active", "retired"] as const;
export const policyRuleDomains = ["earning", "redemption", "tier", "campaign", "expiry", "referral", "consent", "eligibility"] as const;
export const earningAmountBases = [
  "net_after_discount_excluding_tax",
  "net_after_discount_including_tax",
  "subtotal_before_discount"
] as const;
export const policyRoundingModes = ["floor", "ceil", "nearest"] as const;
export const campaignStackModes = ["base_plus_best_promo", "exclusive", "stack_all"] as const;
export const pointExpiryModes = ["none", "fixed_from_earn", "after_inactivity"] as const;
export const referralTriggerEvents = ["signup", "first_completed_purchase", "manual_approval"] as const;
export const rewardKinds = [
  "cart_discount",
  "free_shipping",
  "product_discount",
  "gift_card",
  "custom_store_fulfillment",
  "points_adjustment",
  "product_reward"
] as const;
export const ruleKinds = [
  "purchase_completed",
  "first_purchase",
  "birthday_set",
  "email_marketing_subscribed",
  "profile_completed",
  "custom_event"
] as const;
export const eventTypes = [
  "pos.customer.attached",
  "pos.sale.preview_requested",
  "pos.sale.completed",
  "pos.return.completed",
  "pos.reward.redeem_requested",
  "pos.reward.refund_requested",
  "receipt.email.requested",
  "skums.product_identity.updated",
  "skums.trade_unit.updated",
  "skums.listing.updated",
  "skums.channel_requirement.changed",
  "skums.promotion_event.created",
  "skums.pos_sale.completed",
  "skums.pos_return.completed",
  "skums.inventory_event.created",
  "crm.person.created",
  "crm.person.updated",
  "crm.person.merged",
  "crm.consent.updated",
  "crm.segment.entered",
  "crm.segment.exited",
  "crm.campaign.sent",
  "crm.campaign.clicked",
  "crm.ticket.opened",
  "loyalty.member.enrolled",
  "loyalty.member.updated",
  "loyalty.points.earned",
  "loyalty.points.reversed",
  "loyalty.tier.upgraded",
  "loyalty.tier.downgraded",
  "loyalty.reward.available",
  "loyalty.reward.claimed",
  "loyalty.reward.redeemed",
  "loyalty.reward.expired",
  "loyalty.referral.completed",
  "loyalty.segment.entered",
  "loyalty.segment.exited",
  "loyalty.reward.fulfillment_requested",
  "loyalty.product_reward.reservation_requested",
  "loyalty.cart_adjustment.authorized",
  "loyalty.pos_discount.authorized",
  "loyalty.inventory_hold.requested",
  "loyalty.reward.fulfillment_cancelled"
] as const;
export const apiScopes = [
  "loyalty:configuration:read",
  "loyalty:members:read",
  "loyalty:members:write",
  "loyalty:events:write",
  "loyalty:rewards:redeem",
  "loyalty:admin",
  "loyalty:webhooks:write"
] as const;
export const apiErrorCodes = [
  "invalid_request",
  "authentication_required",
  "permission_denied",
  "not_found",
  "idempotency_conflict",
  "business_rule_failed",
  "rate_limited",
  "internal_error",
  "member_not_enrolled",
  "member_blocked",
  "insufficient_points",
  "reward_out_of_stock",
  "reward_not_available_for_channel",
  "reward_not_available_for_country",
  "reward_already_claimed",
  "rule_already_completed",
  "cart_does_not_qualify",
  "sale_already_reversed",
  "consent_required"
] as const;

export type Channel = (typeof channels)[number];
export type RewardKind = (typeof rewardKinds)[number];
export type RuleKind = (typeof ruleKinds)[number];
export type EventType = (typeof eventTypes)[number];
export type ApiScope = (typeof apiScopes)[number];
export type ApiErrorCode = (typeof apiErrorCodes)[number];
export type SourceSystem = (typeof sourceSystems)[number];
export type PolicyVersionStatus = (typeof policyVersionStatuses)[number];

export const channelSchema = z.enum(channels);
export const rewardKindSchema = z.enum(rewardKinds);
export const ruleKindSchema = z.enum(ruleKinds);
export const eventTypeSchema = z.enum(eventTypes);
export const apiScopeSchema = z.enum(apiScopes);
export const sourceSystemSchema = z.enum(sourceSystems);
export const policyVersionStatusSchema = z.enum(policyVersionStatuses);

const optionalTrimmed = z.string().trim().min(1).optional();
const countrySchema = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase())
  .optional();
const languageSchema = z
  .string()
  .trim()
  .min(2)
  .max(12)
  .transform((value) => value.toLowerCase())
  .optional();
const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .optional();

export const requestContextSchema = z.object({
  channel: channelSchema,
  country: countrySchema,
  language: languageSchema,
  currency: currencySchema,
  location_id: optionalTrimmed,
  register_id: optionalTrimmed,
  listing_id: optionalTrimmed
});

export const idempotencyKeySchema = z.string().trim().min(8).max(200);
export const memberKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .regex(/^[a-z0-9_-]+:.+$/i, "member_key must use a namespace prefix, for example crm:person_123");
export const moneyMinorSchema = z.number().int().min(0).max(100_000_000_000);

export const eventActorSchema = z
  .object({
    type: z.string().trim().min(1),
    id: optionalTrimmed
  })
  .passthrough()
  .default({ type: "system" });

export const eventSubjectSchema = z
  .object({
    customer_key: memberKeySchema.optional(),
    external_customer_refs: z
      .array(
        z
          .object({
            system: z.string().trim().min(1),
            id: z.string().trim().min(1)
          })
          .passthrough()
      )
      .default([])
  })
  .passthrough()
  .default({ external_customer_refs: [] });

export const cartLineItemSchema = z.object({
  line_id: z.string().trim().min(1),
  skums_product_identity_id: optionalTrimmed,
  skums_trade_unit_id: optionalTrimmed,
  skums_listing_id: optionalTrimmed,
  sku: optionalTrimmed,
  quantity: z.number().int().positive(),
  unit_price: moneyMinorSchema,
  discount_total: moneyMinorSchema.default(0),
  tax_total: moneyMinorSchema.default(0),
  metadata: z.record(z.unknown()).default({})
});

export const cartSchema = z.object({
  subtotal: moneyMinorSchema,
  discount_total: moneyMinorSchema.default(0),
  tax_total: moneyMinorSchema.default(0),
  grand_total: moneyMinorSchema,
  items: z.array(cartLineItemSchema).min(1)
});

export const sessionRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  cart: cartSchema.optional(),
  metadata: z.record(z.unknown()).default({})
});

export const birthdayRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const consentRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  consented: z.boolean(),
  source: optionalTrimmed,
  occurred_at: z.string().datetime().optional()
});

export const earnPreviewRequestSchema = requestContextSchema.extend({
  member_key: memberKeySchema,
  cart: cartSchema,
  metadata: z.record(z.unknown()).default({})
});

export const earnCommitRequestSchema = earnPreviewRequestSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  transaction_id: z.string().trim().min(1).max(200),
  occurred_at: z.string().datetime().optional()
});

export const earnReverseRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  member_key: memberKeySchema,
  original_transaction_id: z.string().trim().min(1).max(200),
  return_id: z.string().trim().min(1).max(200),
  occurred_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({})
});

export const rewardRedeemRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  member_key: memberKeySchema,
  reward_id: z.string().trim().min(1).optional(),
  cart: cartSchema.optional(),
  metadata: z.record(z.unknown()).default({})
});

export const rewardRefundRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  member_key: memberKeySchema,
  claimed_reward_id: z.string().trim().min(1),
  refund_id: z.string().trim().min(1).max(200),
  metadata: z.record(z.unknown()).default({})
});

export const ruleCompleteRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  member_key: memberKeySchema,
  metadata: z.record(z.unknown()).default({})
});

export const eventIngestRequestSchema = requestContextSchema.extend({
  idempotency_key: idempotencyKeySchema.optional(),
  event_id: z.string().trim().min(1).max(240),
  event_type: eventTypeSchema,
  workspace_id: z.string().trim().min(1).max(120).default("workspace_demo"),
  source_system: sourceSystemSchema,
  actor: eventActorSchema,
  subject: eventSubjectSchema,
  schema_version: z.string().trim().min(1).max(40).default("2026-06-11"),
  member_key: memberKeySchema.optional(),
  occurred_at: z.string().datetime().optional(),
  payload: z.record(z.unknown()).default({})
});

export const programInputSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/i).optional(),
  workspace_id: z.string().trim().min(1).max(120).default("workspace_demo"),
  name: z.string().trim().min(1).max(160),
  default_currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("SGD"),
  supported_channels: z.array(channelSchema).min(1).default(["web", "pos", "mobile"]),
  supported_countries: z.array(z.string().trim().length(2).transform((value) => value.toUpperCase())).default(["SG"]),
  supported_languages: z.array(z.string().trim().min(2).max(12).transform((value) => value.toLowerCase())).default(["en"]),
  points_name: z.string().trim().min(1).max(80).default("points"),
  earn_rate: z
    .object({
      points_per_currency_unit: z.number().int().min(0).max(10_000),
      currency_unit_minor: z.number().int().positive().default(100)
    })
    .default({ points_per_currency_unit: 1, currency_unit_minor: 100 }),
  active: z.boolean().default(true)
});

export const policyRuleSchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9_.-]+$/i),
  name: z.string().trim().min(1).max(160),
  description: optionalTrimmed,
  domain: z.enum(policyRuleDomains),
  priority: z.number().int().min(0).max(1_000_000).default(100),
  stack_key: optionalTrimmed,
  exclusive: z.boolean().default(false),
  conditions: z.record(z.unknown()).default({}),
  effects: z.record(z.unknown()).default({}),
  active: z.boolean().default(true)
});

export const programPolicyDefinitionSchema = z.object({
  earning: z
    .object({
      eligible_amount_basis: z.enum(earningAmountBases).default("net_after_discount_excluding_tax"),
      points_per_currency_unit: z.number().int().min(0).max(10_000).default(1),
      currency_unit_minor: z.number().int().positive().default(100),
      rounding: z.enum(policyRoundingModes).default("floor"),
      earn_on_discounted_items: z.boolean().default(true),
      excluded_line_tags: z.array(z.string().trim().min(1).max(80)).default([])
    })
    .default({}),
  redemption: z
    .object({
      points_per_currency_unit: z.number().int().positive().default(100),
      currency_unit_minor: z.number().int().positive().default(100),
      minimum_points: z.number().int().min(0).default(0),
      maximum_discount_minor: z.number().int().min(0).optional(),
      allow_partial_redemption: z.boolean().default(true)
    })
    .default({}),
  tiers: z
    .object({
      qualification_metric: z.enum(["lifetime_points", "rolling_spend_minor", "rolling_points"]).default("lifetime_points"),
      rolling_window_days: z.number().int().positive().optional(),
      thresholds: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(120),
            threshold: z.number().int().min(0),
            benefits: z.record(z.unknown()).default({})
          })
        )
        .default([])
    })
    .default({}),
  campaigns: z
    .object({
      default_stack_mode: z.enum(campaignStackModes).default("base_plus_best_promo"),
      max_promotional_rules_per_transaction: z.number().int().min(0).max(100).default(1),
      exclusivity_groups: z.array(z.string().trim().min(1).max(120)).default([])
    })
    .default({}),
  expiry: z
    .object({
      mode: z.enum(pointExpiryModes).default("none"),
      days: z.number().int().positive().optional(),
      notice_days: z.number().int().min(0).default(30)
    })
    .default({}),
  referral: z
    .object({
      enabled: z.boolean().default(false),
      trigger_event: z.enum(referralTriggerEvents).default("first_completed_purchase"),
      referrer_reward: z.record(z.unknown()).default({}),
      referee_reward: z.record(z.unknown()).default({}),
      cooldown_days: z.number().int().min(0).default(0),
      max_rewards_per_member_per_period: z.number().int().positive().optional()
    })
    .default({}),
  consent: z
    .object({
      privacy_policy_version: optionalTrimmed,
      required_purposes: z.array(z.string().trim().min(1).max(120)).default([])
    })
    .default({}),
  rules: z.array(policyRuleSchema).default([]),
  metadata: z.record(z.unknown()).default({})
});

export const adminPolicyVersionInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: optionalTrimmed,
  version_label: optionalTrimmed,
  change_reason: z.string().trim().min(3).max(1_000),
  effective_at: z.string().datetime().optional(),
  policy: programPolicyDefinitionSchema.default({}),
  metadata: z.record(z.unknown()).default({})
});

export const policyPublishInputSchema = z.object({
  change_reason: z.string().trim().min(3).max(1_000).optional(),
  effective_at: z.string().datetime().optional()
}).default({});

export const policySimulationInputSchema = requestContextSchema.extend({
  member_key: memberKeySchema.optional(),
  cart: cartSchema,
  metadata: z.record(z.unknown()).default({})
});

export const adminRewardInputSchema = z.object({
  program_id: z.string().trim().min(1),
  kind: rewardKindSchema,
  name: z.string().trim().min(1).max(160),
  cost_points: z.number().int().min(0),
  value: z.record(z.unknown()).default({}),
  channels: z.array(channelSchema).min(1),
  countries: z.array(z.string().trim().length(2).transform((value) => value.toUpperCase())).default([]),
  active: z.boolean().default(true),
  inventory: z.number().int().min(0).optional(),
  skums_refs: z.record(z.string()).default({})
});

export const adminRuleInputSchema = z.object({
  program_id: z.string().trim().min(1),
  kind: ruleKindSchema,
  name: z.string().trim().min(1).max(160),
  reward_points: z.number().int().min(0).default(0),
  channels: z.array(channelSchema).min(1),
  active: z.boolean().default(true)
});

export const adminTierInputSchema = z.object({
  program_id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  min_lifetime_points: z.number().int().min(0),
  benefits: z.record(z.unknown()).default({}),
  active: z.boolean().default(true)
});

export const adjustPointsRequestSchema = z.object({
  idempotency_key: idempotencyKeySchema.optional(),
  points: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, {
    message: "points must not be 0"
  }),
  reason: z.string().trim().min(3).max(500),
  metadata: z.record(z.unknown()).default({})
});

export const connectorInputSchema = z.object({
  program_id: z.string().trim().min(1),
  base_url: z.string().url(),
  api_key_ref: z.string().trim().min(1).optional(),
  settings: z.record(z.unknown()).default({}),
  active: z.boolean().default(true)
});

export const webhookSubscriptionInputSchema = z.object({
  program_id: z.string().trim().min(1),
  url: z.string().url(),
  event_types: z.array(eventTypeSchema).min(1),
  secret_ref: z.string().trim().min(1).optional(),
  active: z.boolean().default(true)
});

export type RequestContext = z.infer<typeof requestContextSchema>;
export type CartLineItem = z.infer<typeof cartLineItemSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type ProgramPolicyDefinition = z.infer<typeof programPolicyDefinitionSchema>;

export interface Program {
  id: string;
  workspace_id: string;
  name: string;
  default_currency: string;
  supported_channels: Channel[];
  supported_countries: string[];
  supported_languages: string[];
  points_name: string;
  earn_rate: {
    points_per_currency_unit: number;
    currency_unit_minor: number;
  };
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProgramPolicyVersion {
  id: string;
  program_id: string;
  version: number;
  version_label?: string;
  status: PolicyVersionStatus;
  name: string;
  description?: string;
  policy: ProgramPolicyDefinition;
  change_reason: string;
  created_by?: string;
  effective_at?: string;
  published_at?: string;
  retired_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MemberIdentity {
  kind: string;
  value: string;
  verified: boolean;
  created_at: string;
}

export interface Member {
  id: string;
  program_id: string;
  state: "active" | "blocked" | "closed";
  identities: MemberIdentity[];
  points_balance: number;
  pending_points: number;
  lifetime_points: number;
  tier: string;
  tier_progress: number;
  joined_at: string;
  last_activity_at: string;
  reward_count: number;
  referral_code: string;
  birthday?: string;
  consents: Record<string, { consented: boolean; source?: string; occurred_at: string }>;
  metadata: Record<string, unknown>;
}

export interface RewardDefinition {
  id: string;
  program_id: string;
  kind: RewardKind;
  name: string;
  cost_points: number;
  value: Record<string, unknown>;
  channels: Channel[];
  countries: string[];
  active: boolean;
  inventory?: number;
  skums_refs: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ClaimedReward {
  id: string;
  program_id: string;
  member_id: string;
  reward_id: string;
  kind: RewardKind;
  status: "issued" | "redeemed" | "refunded" | "voided";
  cost_points: number;
  redemption_code_masked?: string;
  issued_at: string;
  refunded_at?: string;
  metadata: Record<string, unknown>;
}

export interface RuleDefinition {
  id: string;
  program_id: string;
  kind: RuleKind;
  name: string;
  reward_points: number;
  channels: Channel[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TierDefinition {
  id: string;
  program_id: string;
  name: string;
  min_lifetime_points: number;
  benefits: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PointLedgerEntry {
  id: string;
  program_id: string;
  member_id: string;
  points: number;
  kind: "earn" | "reverse" | "reward_redeem" | "reward_refund" | "rule_complete" | "admin_adjust";
  source_type: string;
  source_id: string;
  idempotency_key?: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

export interface LoyaltySaleLink {
  id: string;
  program_id: string;
  member_id: string;
  external_sale_id: string;
  source: string;
  channel: Channel;
  currency: string;
  sale_total_minor: number;
  discount_total_minor: number;
  points_earned: number;
  points_redeemed: number;
  occurred_at: string;
  reversed_at?: string;
  idempotency_key?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyRewardUsageFact {
  id: string;
  program_id: string;
  member_id: string;
  claimed_reward_id: string;
  reward_id: string;
  reward_kind: RewardKind;
  external_sale_id?: string;
  source: string;
  channel: Channel;
  currency?: string;
  points_cost: number;
  discount_minor: number;
  status: "issued" | "redeemed" | "refunded" | "voided";
  occurred_at: string;
  refunded_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyEvent {
  id: string;
  program_id: string;
  event_id: string;
  event_type: EventType;
  workspace_id: string;
  source_system: SourceSystem;
  actor: Record<string, unknown>;
  subject: Record<string, unknown>;
  schema_version: string;
  member_id?: string;
  member_key?: string;
  channel: Channel;
  occurred_at: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ApiKeyRecord {
  id: string;
  workspace_id: string;
  program_id: string | null;
  name: string;
  key_hash: string;
  scopes: ApiScope[];
  active: boolean;
  created_at: string;
}

export interface IdempotencyRecord {
  program_id: string;
  key: string;
  route: string;
  payload_hash: string;
  status_code: number;
  response_body: unknown;
  created_at: string;
}

export interface ConnectorAccount {
  id: string;
  program_id: string;
  provider: "crm" | "skums" | "pos";
  base_url: string;
  api_key_ref?: string;
  settings: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookSubscription {
  id: string;
  program_id: string;
  url: string;
  event_types: EventType[];
  secret_ref?: string;
  active: boolean;
  created_at: string;
}
