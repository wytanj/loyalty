import {
  type Cart,
  type Channel,
  type ClaimedReward,
  type ConnectorAccount,
  type EventType,
  type LoyaltyEvent,
  type Member,
  type PointLedgerEntry,
  type Program,
  type RequestContext,
  type RewardDefinition,
  type RewardKind,
  type RuleDefinition,
  type RuleKind,
  type TierDefinition,
  type WebhookSubscription
} from "./contracts";
import { businessRule, invalidRequest, notFound } from "./errors";
import { maskCode, randomCode } from "./crypto";
import { useLoyaltyStore } from "./store";

interface EarnPreviewInput extends RequestContext {
  member_key: string;
  cart: Cart;
  metadata: Record<string, unknown>;
}

interface EarnCommitInput extends EarnPreviewInput {
  idempotency_key?: string;
  transaction_id: string;
  occurred_at?: string;
}

interface EarnReverseInput extends RequestContext {
  idempotency_key?: string;
  member_key: string;
  original_transaction_id: string;
  return_id: string;
  occurred_at?: string;
  metadata: Record<string, unknown>;
}

interface RewardRedeemInput extends RequestContext {
  idempotency_key?: string;
  member_key: string;
  reward_id?: string;
  cart?: Cart;
  metadata: Record<string, unknown>;
}

interface RewardRefundInput extends RequestContext {
  idempotency_key?: string;
  member_key: string;
  claimed_reward_id: string;
  refund_id: string;
  metadata: Record<string, unknown>;
}

interface RuleCompleteInput extends RequestContext {
  idempotency_key?: string;
  member_key: string;
  metadata: Record<string, unknown>;
}

interface EventIngestInput extends RequestContext {
  idempotency_key?: string;
  event_id: string;
  event_type: EventType;
  member_key?: string;
  occurred_at?: string;
  payload: Record<string, unknown>;
}

function assertProgram(programId: string): Program {
  const program = useLoyaltyStore().getProgram(programId);
  if (!program || !program.active) {
    throw notFound(`Program ${programId} was not found`);
  }

  return program;
}

function assertChannel(program: Program, channel: Channel): void {
  if (!program.supported_channels.includes(channel)) {
    throw invalidRequest(`Channel ${channel} is not enabled for program ${program.id}`);
  }
}

function assertActiveMember(member: Member): void {
  if (member.state === "blocked") {
    throw businessRule("member_blocked", "Member is blocked");
  }

  if (member.state !== "active") {
    throw businessRule("member_not_enrolled", "Member is not active");
  }
}

function memberOrBusinessError(programId: string, memberKey: string): Member {
  const member = useLoyaltyStore().findMemberByKey(programId, memberKey);
  if (!member) {
    throw businessRule("member_not_enrolled", "Member is not enrolled");
  }

  assertActiveMember(member);
  return member;
}

function responseMember(member: Member): Record<string, unknown> {
  return {
    id: member.id,
    program_id: member.program_id,
    state: member.state,
    identities: member.identities.map((identity) => ({
      kind: identity.kind,
      verified: identity.verified
    })),
    wallet: {
      points_balance: member.points_balance,
      pending_points: member.pending_points,
      lifetime_points: member.lifetime_points
    },
    tier: {
      name: member.tier,
      progress: member.tier_progress
    },
    joined_at: member.joined_at,
    last_activity_at: member.last_activity_at,
    reward_count: member.reward_count,
    referral_code: member.referral_code,
    consents: member.consents
  };
}

function rewardIsContextual(reward: RewardDefinition, context: RequestContext): boolean {
  if (!reward.active || !reward.channels.includes(context.channel)) {
    return false;
  }

  return !context.country || reward.countries.length === 0 || reward.countries.includes(context.country);
}

function responseReward(reward: RewardDefinition, member?: Member): Record<string, unknown> {
  const available = member ? member.points_balance >= reward.cost_points : true;
  return {
    id: reward.id,
    kind: reward.kind,
    name: reward.name,
    cost_points: reward.cost_points,
    value: reward.value,
    channels: reward.channels,
    countries: reward.countries,
    active: reward.active,
    available,
    unavailable_reason: available ? undefined : "insufficient_points",
    skums_refs: reward.skums_refs
  };
}

function responseRule(rule: RuleDefinition): Record<string, unknown> {
  return {
    id: rule.id,
    kind: rule.kind,
    name: rule.name,
    reward_points: rule.reward_points,
    channels: rule.channels,
    active: rule.active
  };
}

function availableRewards(programId: string, member: Member, context: RequestContext): RewardDefinition[] {
  return useLoyaltyStore()
    .listRewards(programId)
    .filter((reward) => rewardIsContextual(reward, context));
}

function availableRules(programId: string, context: RequestContext): RuleDefinition[] {
  return useLoyaltyStore()
    .listRules(programId)
    .filter((rule) => rule.active && rule.channels.includes(context.channel));
}

function computeTier(programId: string, lifetimePoints: number): { name: string; progress: number } {
  const tiers = useLoyaltyStore().listTiers(programId).filter((tier) => tier.active);
  const current = [...tiers].reverse().find((tier) => lifetimePoints >= tier.min_lifetime_points) ?? tiers[0];
  const next = tiers.find((tier) => tier.min_lifetime_points > lifetimePoints);

  if (!current) {
    return { name: "Member", progress: 0 };
  }

  if (!next) {
    return { name: current.name, progress: 1 };
  }

  const span = next.min_lifetime_points - current.min_lifetime_points;
  const progress = span <= 0 ? 1 : (lifetimePoints - current.min_lifetime_points) / span;
  return { name: current.name, progress: Math.max(0, Math.min(1, Number(progress.toFixed(4)))) };
}

function applyLedgerToMember(member: Member, ledgerEntry: PointLedgerEntry): Member {
  const nextBalance = member.points_balance + ledgerEntry.points;
  const nextLifetime =
    ledgerEntry.points > 0 && ["earn", "rule_complete", "admin_adjust"].includes(ledgerEntry.kind)
      ? member.lifetime_points + ledgerEntry.points
      : member.lifetime_points;
  const tier = computeTier(member.program_id, nextLifetime);

  return useLoyaltyStore().saveMember({
    ...member,
    points_balance: nextBalance,
    lifetime_points: nextLifetime,
    tier: tier.name,
    tier_progress: tier.progress
  });
}

function emitInternalEvent(
  programId: string,
  eventType: EventType,
  input: { member?: Member; member_key?: string; channel: Channel; occurred_at?: string; payload?: Record<string, unknown> }
): LoyaltyEvent {
  return useLoyaltyStore().addEvent({
    program_id: programId,
    event_id: `${eventType}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    event_type: eventType,
    member_id: input.member?.id,
    member_key: input.member_key,
    channel: input.channel,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    payload: input.payload ?? {}
  });
}

export function getConfiguration(programId: string, context: RequestContext): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, context.channel);

  return {
    program: {
      id: program.id,
      name: program.name,
      default_currency: program.default_currency,
      points_name: program.points_name,
      supported_channels: program.supported_channels,
      supported_countries: program.supported_countries,
      supported_languages: program.supported_languages
    },
    context,
    earn_rate: program.earn_rate,
    rewards: useLoyaltyStore()
      .listRewards(programId)
      .filter((reward) => rewardIsContextual(reward, context))
      .map((reward) => responseReward(reward)),
    rules: availableRules(programId, context).map((rule) => responseRule(rule)),
    errors: {
      shopper_facing_status: 422,
      retry_statuses: [429, 500],
      integration_statuses: [400, 401, 403, 404, 409]
    }
  };
}

export function getMember(programId: string, memberKey: string, context: RequestContext): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, context.channel);
  const member = memberOrBusinessError(programId, memberKey);

  return {
    member: responseMember(member),
    rewards: availableRewards(programId, member, context).map((reward) => responseReward(reward, member)),
    claimed_rewards: useLoyaltyStore().listClaimedRewards(programId, member.id)
  };
}

export function initializeSession(
  programId: string,
  memberKey: string,
  input: RequestContext & { cart?: Cart; metadata: Record<string, unknown> }
): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = useLoyaltyStore().ensureMember(programId, memberKey, input.metadata);
  assertActiveMember(member);

  const earnPreview = input.cart
    ? previewEarn(programId, {
        ...input,
        member_key: memberKey,
        cart: input.cart,
        metadata: input.metadata
      })
    : undefined;

  emitInternalEvent(programId, "loyalty.member.updated", {
    member,
    member_key: memberKey,
    channel: input.channel,
    payload: { session_initialized: true }
  });

  return {
    member: responseMember(member),
    rewards: availableRewards(programId, member, input).map((reward) => responseReward(reward, member)),
    rules: availableRules(programId, input).map((rule) => responseRule(rule)),
    earn_preview: earnPreview
  };
}

export function setBirthday(
  programId: string,
  memberKey: string,
  input: RequestContext & { birthday: string }
): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = memberOrBusinessError(programId, memberKey);
  const saved = useLoyaltyStore().saveMember({
    ...member,
    birthday: input.birthday
  });

  const rule = useLoyaltyStore()
    .listRules(programId)
    .find((candidate) => candidate.kind === "birthday_set" && candidate.active);
  const completion = rule && !useLoyaltyStore().hasRuleCompletion(programId, member.id, "birthday_set")
    ? completeRule(programId, "birthday_set", {
        ...input,
        member_key: memberKey,
        metadata: { source: "birthday_endpoint" }
      })
    : undefined;

  return {
    member: responseMember(saved),
    rule_completion: completion
  };
}

export function setEmailMarketingConsent(
  programId: string,
  memberKey: string,
  input: RequestContext & { consented: boolean; source?: string; occurred_at?: string }
): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = memberOrBusinessError(programId, memberKey);
  const occurredAt = input.occurred_at ?? new Date().toISOString();
  const saved = useLoyaltyStore().saveMember({
    ...member,
    consents: {
      ...member.consents,
      email_marketing: {
        consented: input.consented,
        source: input.source,
        occurred_at: occurredAt
      }
    }
  });

  const completion =
    input.consented && !useLoyaltyStore().hasRuleCompletion(programId, member.id, "email_marketing_subscribed")
      ? completeRule(programId, "email_marketing_subscribed", {
          ...input,
          member_key: memberKey,
          metadata: { source: "consent_endpoint" }
        })
      : undefined;

  return {
    member: responseMember(saved),
    rule_completion: completion
  };
}

export function previewEarn(programId: string, input: EarnPreviewInput): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const currency = input.currency ?? program.default_currency;

  if (currency !== program.default_currency) {
    throw businessRule("cart_does_not_qualify", `Program ${programId} currently earns only in ${program.default_currency}`);
  }

  const earnableMinor = Math.max(0, input.cart.subtotal - input.cart.discount_total);
  const points = Math.floor(
    (earnableMinor / program.earn_rate.currency_unit_minor) * program.earn_rate.points_per_currency_unit
  );

  return {
    member_key: input.member_key,
    channel: input.channel,
    currency,
    cart_total_minor: input.cart.grand_total,
    earnable_minor: earnableMinor,
    points,
    points_name: program.points_name,
    policy: {
      kind: "simple_subtotal_rate",
      points_per_currency_unit: program.earn_rate.points_per_currency_unit,
      currency_unit_minor: program.earn_rate.currency_unit_minor
    }
  };
}

export function commitEarn(programId: string, input: EarnCommitInput): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = useLoyaltyStore().ensureMember(programId, input.member_key, input.metadata);
  assertActiveMember(member);

  const existingEarn = useLoyaltyStore()
    .findLedgerEntriesBySource(programId, member.id, "sale", input.transaction_id)
    .find((entry) => entry.kind === "earn");
  if (existingEarn) {
    throw businessRule("business_rule_failed", "Sale has already been committed", {
      transaction_id: input.transaction_id
    });
  }

  const preview = previewEarn(programId, input) as { points: number };
  const ledgerEntry = useLoyaltyStore().appendLedgerEntry({
    program_id: programId,
    member_id: member.id,
    points: preview.points,
    kind: "earn",
    source_type: "sale",
    source_id: input.transaction_id,
    idempotency_key: input.idempotency_key,
    occurred_at: input.occurred_at,
    metadata: {
      channel: input.channel,
      cart: input.cart,
      context: contextForMetadata(input),
      input_metadata: input.metadata
    }
  });
  const saved = applyLedgerToMember(member, ledgerEntry);

  emitInternalEvent(programId, "loyalty.points.earned", {
    member: saved,
    member_key: input.member_key,
    channel: input.channel,
    occurred_at: input.occurred_at,
    payload: {
      transaction_id: input.transaction_id,
      points: ledgerEntry.points
    }
  });

  return {
    member: responseMember(saved),
    ledger_entry: ledgerEntry,
    earn: preview
  };
}

export function reverseEarn(programId: string, input: EarnReverseInput): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = memberOrBusinessError(programId, input.member_key);
  const entries = useLoyaltyStore().findLedgerEntriesBySource(programId, member.id, "sale", input.original_transaction_id);
  const earned = entries.filter((entry) => entry.kind === "earn").reduce((sum, entry) => sum + entry.points, 0);
  const alreadyReversed = entries.some(
    (entry) => entry.kind === "reverse" && entry.metadata.original_transaction_id === input.original_transaction_id
  );

  if (earned <= 0) {
    throw businessRule("business_rule_failed", "Original sale did not earn points", {
      original_transaction_id: input.original_transaction_id
    });
  }

  if (alreadyReversed) {
    throw businessRule("sale_already_reversed", "Sale has already been reversed", {
      original_transaction_id: input.original_transaction_id
    });
  }

  const ledgerEntry = useLoyaltyStore().appendLedgerEntry({
    program_id: programId,
    member_id: member.id,
    points: -earned,
    kind: "reverse",
    source_type: "sale",
    source_id: input.original_transaction_id,
    idempotency_key: input.idempotency_key,
    occurred_at: input.occurred_at,
    metadata: {
      return_id: input.return_id,
      original_transaction_id: input.original_transaction_id,
      context: contextForMetadata(input),
      input_metadata: input.metadata
    }
  });
  const saved = applyLedgerToMember(member, ledgerEntry);

  emitInternalEvent(programId, "loyalty.points.reversed", {
    member: saved,
    member_key: input.member_key,
    channel: input.channel,
    occurred_at: input.occurred_at,
    payload: {
      return_id: input.return_id,
      original_transaction_id: input.original_transaction_id,
      points: ledgerEntry.points
    }
  });

  return {
    member: responseMember(saved),
    ledger_entry: ledgerEntry
  };
}

export function listMemberRewards(programId: string, memberKey: string, context: RequestContext): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, context.channel);
  const member = memberOrBusinessError(programId, memberKey);

  return {
    rewards: availableRewards(programId, member, context).map((reward) => responseReward(reward, member)),
    claimed_rewards: useLoyaltyStore().listClaimedRewards(programId, member.id)
  };
}

export function redeemReward(programId: string, rewardKind: RewardKind, input: RewardRedeemInput): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = memberOrBusinessError(programId, input.member_key);
  const reward = findRewardForRedemption(programId, rewardKind, input);

  if (!rewardIsContextual(reward, input)) {
    if (!reward.channels.includes(input.channel)) {
      throw businessRule("reward_not_available_for_channel", "Reward is not available for this channel");
    }

    throw businessRule("reward_not_available_for_country", "Reward is not available for this country");
  }

  if (reward.inventory !== undefined && reward.inventory <= 0) {
    throw businessRule("reward_out_of_stock", "Reward is out of stock");
  }

  if (member.points_balance < reward.cost_points) {
    throw businessRule("insufficient_points", "Member does not have enough points", {
      balance: member.points_balance,
      required: reward.cost_points
    });
  }

  const code = randomCode(reward.kind === "gift_card" ? "GC" : "HL");
  const claimed = useLoyaltyStore().addClaimedReward({
    program_id: programId,
    member_id: member.id,
    reward_id: reward.id,
    kind: reward.kind,
    status: "issued",
    cost_points: reward.cost_points,
    redemption_code_masked: maskCode(code),
    metadata: {
      channel: input.channel,
      context: contextForMetadata(input),
      cart: input.cart,
      skums_refs: reward.skums_refs,
      input_metadata: input.metadata
    }
  });

  const ledgerEntry =
    reward.cost_points > 0
      ? useLoyaltyStore().appendLedgerEntry({
          program_id: programId,
          member_id: member.id,
          points: -reward.cost_points,
          kind: "reward_redeem",
          source_type: "claimed_reward",
          source_id: claimed.id,
          idempotency_key: input.idempotency_key,
          metadata: {
            reward_id: reward.id,
            reward_kind: reward.kind,
            context: contextForMetadata(input)
          }
        })
      : undefined;

  const saved = ledgerEntry ? applyLedgerToMember(member, ledgerEntry) : useLoyaltyStore().saveMember(member);
  const memberWithRewardCount = useLoyaltyStore().saveMember({
    ...saved,
    reward_count: saved.reward_count + 1
  });

  if (reward.inventory !== undefined) {
    useLoyaltyStore().updateReward(reward.id, { inventory: reward.inventory - 1 });
  }

  emitInternalEvent(programId, "loyalty.reward.claimed", {
    member: memberWithRewardCount,
    member_key: input.member_key,
    channel: input.channel,
    payload: {
      claimed_reward_id: claimed.id,
      reward_id: reward.id,
      reward_kind: reward.kind
    }
  });

  if (reward.kind === "product_reward") {
    emitInternalEvent(programId, "loyalty.product_reward.reservation_requested", {
      member: memberWithRewardCount,
      member_key: input.member_key,
      channel: input.channel,
      payload: {
        claimed_reward_id: claimed.id,
        skums_refs: reward.skums_refs
      }
    });
  }

  return {
    member: responseMember(memberWithRewardCount),
    reward: responseReward(reward, memberWithRewardCount),
    claimed_reward: claimed,
    redemption: {
      code,
      one_time_visible: true,
      masked: claimed.redemption_code_masked
    },
    ledger_entry: ledgerEntry
  };
}

export function refundReward(programId: string, rewardKind: RewardKind, input: RewardRefundInput): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = memberOrBusinessError(programId, input.member_key);
  const claimed = useLoyaltyStore().getClaimedReward(input.claimed_reward_id);

  if (!claimed || claimed.program_id !== programId || claimed.member_id !== member.id || claimed.kind !== rewardKind) {
    throw notFound("Claimed reward was not found");
  }

  if (claimed.status === "refunded") {
    throw businessRule("reward_already_claimed", "Claimed reward has already been refunded");
  }

  const updatedClaim = useLoyaltyStore().saveClaimedReward({
    ...claimed,
    status: "refunded",
    refunded_at: new Date().toISOString()
  });
  const ledgerEntry =
    claimed.cost_points > 0
      ? useLoyaltyStore().appendLedgerEntry({
          program_id: programId,
          member_id: member.id,
          points: claimed.cost_points,
          kind: "reward_refund",
          source_type: "claimed_reward",
          source_id: claimed.id,
          idempotency_key: input.idempotency_key,
          metadata: {
            refund_id: input.refund_id,
            context: contextForMetadata(input),
            input_metadata: input.metadata
          }
        })
      : undefined;
  const saved = ledgerEntry ? applyLedgerToMember(member, ledgerEntry) : useLoyaltyStore().saveMember(member);

  emitInternalEvent(programId, "loyalty.reward.redeemed", {
    member: saved,
    member_key: input.member_key,
    channel: input.channel,
    payload: {
      claimed_reward_id: claimed.id,
      refund_id: input.refund_id,
      refunded: true
    }
  });

  return {
    member: responseMember(saved),
    claimed_reward: updatedClaim,
    ledger_entry: ledgerEntry
  };
}

export function completeRule(programId: string, ruleKind: RuleKind, input: RuleCompleteInput): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = memberOrBusinessError(programId, input.member_key);
  const rule = useLoyaltyStore()
    .listRules(programId)
    .find((candidate) => candidate.kind === ruleKind && candidate.active && candidate.channels.includes(input.channel));

  if (!rule) {
    throw notFound(`Rule ${ruleKind} was not found`);
  }

  if (useLoyaltyStore().hasRuleCompletion(programId, member.id, ruleKind)) {
    throw businessRule("rule_already_completed", "Rule has already been completed");
  }

  useLoyaltyStore().addRuleCompletion(programId, member.id, ruleKind);
  const ledgerEntry =
    rule.reward_points > 0
      ? useLoyaltyStore().appendLedgerEntry({
          program_id: programId,
          member_id: member.id,
          points: rule.reward_points,
          kind: "rule_complete",
          source_type: "rule",
          source_id: rule.id,
          idempotency_key: input.idempotency_key,
          metadata: {
            rule_kind: ruleKind,
            context: contextForMetadata(input),
            input_metadata: input.metadata
          }
        })
      : undefined;
  const saved = ledgerEntry ? applyLedgerToMember(member, ledgerEntry) : useLoyaltyStore().saveMember(member);

  return {
    member: responseMember(saved),
    rule: responseRule(rule),
    ledger_entry: ledgerEntry
  };
}

export function ingestEvent(programId: string, input: EventIngestInput): Record<string, unknown> {
  const program = assertProgram(programId);
  assertChannel(program, input.channel);
  const member = input.member_key ? useLoyaltyStore().findMemberByKey(programId, input.member_key) : undefined;
  const event = useLoyaltyStore().addEvent({
    program_id: programId,
    event_id: input.event_id,
    event_type: input.event_type,
    member_id: member?.id,
    member_key: input.member_key,
    channel: input.channel,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    payload: input.payload
  });

  const processed_actions: string[] = [];
  if ((input.event_type === "pos.sale.completed" || input.event_type === "skums.pos_sale.completed") && input.member_key) {
    const cart = input.payload.cart;
    const transactionId = String(input.payload.transaction_id ?? input.event_id);
    if (isCart(cart)) {
      commitEarn(programId, {
        ...input,
        member_key: input.member_key,
        cart,
        transaction_id: transactionId,
        metadata: { source_event_id: input.event_id }
      });
      processed_actions.push("points_earned");
    }
  }

  if ((input.event_type === "pos.return.completed" || input.event_type === "skums.pos_return.completed") && input.member_key) {
    const originalTransactionId = input.payload.original_transaction_id;
    const returnId = input.payload.return_id ?? input.event_id;
    if (typeof originalTransactionId === "string") {
      reverseEarn(programId, {
        ...input,
        member_key: input.member_key,
        original_transaction_id: originalTransactionId,
        return_id: String(returnId),
        metadata: { source_event_id: input.event_id }
      });
      processed_actions.push("points_reversed");
    }
  }

  return {
    accepted: true,
    event,
    processed_actions
  };
}

export function listPrograms(): Program[] {
  return useLoyaltyStore().listPrograms();
}

export function upsertProgram(input: Omit<Program, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string }): Program {
  return useLoyaltyStore().upsertProgram(input);
}

export function updateProgram(programId: string, input: Partial<Omit<Program, "id" | "created_at" | "updated_at">>): Program {
  const existing = assertProgram(programId);
  return useLoyaltyStore().upsertProgram({
    ...existing,
    ...input,
    id: programId
  });
}

export function listAdminMembers(programId?: string): Member[] {
  return useLoyaltyStore().listMembers(programId);
}

export function getAdminMember(memberId: string): Record<string, unknown> {
  const member = useLoyaltyStore().findMemberById(memberId);
  if (!member) {
    throw notFound("Member was not found");
  }

  return {
    member,
    ledger_entries: useLoyaltyStore().listLedgerEntries(member.program_id, member.id),
    claimed_rewards: useLoyaltyStore().listClaimedRewards(member.program_id, member.id)
  };
}

export function adminAdjustPoints(
  memberId: string,
  input: { idempotency_key?: string; points: number; reason: string; metadata: Record<string, unknown> }
): Record<string, unknown> {
  const member = useLoyaltyStore().findMemberById(memberId);
  if (!member) {
    throw notFound("Member was not found");
  }

  const ledgerEntry = useLoyaltyStore().appendLedgerEntry({
    program_id: member.program_id,
    member_id: member.id,
    points: input.points,
    kind: "admin_adjust",
    source_type: "admin_adjustment",
    source_id: input.idempotency_key ?? `${member.id}:${Date.now()}`,
    idempotency_key: input.idempotency_key,
    metadata: {
      reason: input.reason,
      input_metadata: input.metadata
    }
  });
  const saved = applyLedgerToMember(member, ledgerEntry);

  return {
    member: responseMember(saved),
    ledger_entry: ledgerEntry
  };
}

export function listRewards(programId: string): RewardDefinition[] {
  assertProgram(programId);
  return useLoyaltyStore().listRewards(programId);
}

export function createReward(input: Omit<RewardDefinition, "id" | "created_at" | "updated_at">): RewardDefinition {
  assertProgram(input.program_id);
  return useLoyaltyStore().addReward(input);
}

export function updateReward(rewardId: string, input: Partial<Omit<RewardDefinition, "id" | "created_at">>): RewardDefinition {
  const updated = useLoyaltyStore().updateReward(rewardId, input);
  if (!updated) {
    throw notFound("Reward was not found");
  }

  return updated;
}

export function listRules(programId: string): RuleDefinition[] {
  assertProgram(programId);
  return useLoyaltyStore().listRules(programId);
}

export function createRule(input: Omit<RuleDefinition, "id" | "created_at" | "updated_at">): RuleDefinition {
  assertProgram(input.program_id);
  return useLoyaltyStore().addRule(input);
}

export function updateRule(ruleId: string, input: Partial<Omit<RuleDefinition, "id" | "created_at">>): RuleDefinition {
  const updated = useLoyaltyStore().updateRule(ruleId, input);
  if (!updated) {
    throw notFound("Rule was not found");
  }

  return updated;
}

export function listTiers(programId: string): TierDefinition[] {
  assertProgram(programId);
  return useLoyaltyStore().listTiers(programId);
}

export function createTier(input: Omit<TierDefinition, "id" | "created_at" | "updated_at">): TierDefinition {
  assertProgram(input.program_id);
  return useLoyaltyStore().addTier(input);
}

export function updateTier(tierId: string, input: Partial<Omit<TierDefinition, "id" | "created_at">>): TierDefinition {
  const updated = useLoyaltyStore().updateTier(tierId, input);
  if (!updated) {
    throw notFound("Tier was not found");
  }

  return updated;
}

export function listConnectors(programId?: string): ConnectorAccount[] {
  return useLoyaltyStore().listConnectors(programId);
}

export function createConnector(
  provider: "crm" | "skums" | "pos",
  input: Omit<ConnectorAccount, "id" | "provider" | "created_at" | "updated_at">
): ConnectorAccount {
  assertProgram(input.program_id);
  return useLoyaltyStore().addConnector({
    ...input,
    provider
  });
}

export function listWebhookSubscriptions(programId?: string): WebhookSubscription[] {
  return useLoyaltyStore().listWebhookSubscriptions(programId);
}

export function createWebhookSubscription(input: Omit<WebhookSubscription, "id" | "created_at">): WebhookSubscription {
  assertProgram(input.program_id);
  return useLoyaltyStore().addWebhookSubscription(input);
}

export function deleteWebhookSubscription(webhookId: string): Record<string, unknown> {
  return {
    deleted: useLoyaltyStore().deleteWebhookSubscription(webhookId)
  };
}

function findRewardForRedemption(programId: string, rewardKind: RewardKind, input: RewardRedeemInput): RewardDefinition {
  const rewards = useLoyaltyStore()
    .listRewards(programId)
    .filter((reward) => reward.kind === rewardKind);
  const reward = input.reward_id ? rewards.find((candidate) => candidate.id === input.reward_id) : rewards[0];

  if (!reward) {
    throw notFound(`Reward ${rewardKind} was not found`);
  }

  return reward;
}

function contextForMetadata(input: RequestContext): Record<string, unknown> {
  return {
    channel: input.channel,
    country: input.country,
    language: input.language,
    currency: input.currency,
    location_id: input.location_id,
    register_id: input.register_id,
    listing_id: input.listing_id
  };
}

function isCart(value: unknown): value is Cart {
  if (!value || typeof value !== "object") {
    return false;
  }

  const cart = value as Partial<Cart>;
  return (
    typeof cart.subtotal === "number" &&
    typeof cart.grand_total === "number" &&
    Array.isArray(cart.items) &&
    cart.items.length > 0
  );
}
