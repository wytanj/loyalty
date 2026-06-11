import { randomUUID } from "node:crypto";
import {
  type ApiKeyRecord,
  type ApiScope,
  type Channel,
  type ClaimedReward,
  type ConnectorAccount,
  type EventType,
  type IdempotencyRecord,
  type LoyaltyEvent,
  type LoyaltyRewardUsageFact,
  type LoyaltySaleLink,
  type Member,
  type MemberIdentity,
  type PointLedgerEntry,
  type Program,
  type RewardDefinition,
  type RewardKind,
  type RuleDefinition,
  type RuleKind,
  type TierDefinition,
  type WebhookSubscription
} from "./contracts";
import { hashApiKey } from "./crypto";

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function referralCode(): string {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function parseIdentity(memberKey: string): MemberIdentity {
  const [kind, ...rest] = memberKey.split(":");
  if (!kind || rest.length === 0) {
    throw new Error(`Invalid member key ${memberKey}`);
  }

  return {
    kind: kind.toLowerCase(),
    value: rest.join(":"),
    verified: kind.toLowerCase() === "crm",
    created_at: nowIso()
  };
}

export class MemoryLoyaltyStore {
  readonly programs = new Map<string, Program>();
  readonly members = new Map<string, Member>();
  readonly memberIdentityIndex = new Map<string, string>();
  readonly rewards = new Map<string, RewardDefinition>();
  readonly claimedRewards = new Map<string, ClaimedReward>();
  readonly saleLinks = new Map<string, LoyaltySaleLink>();
  readonly saleLinkIndex = new Map<string, string>();
  readonly rewardUsageFacts = new Map<string, LoyaltyRewardUsageFact>();
  readonly rewardUsageByClaimedReward = new Map<string, string>();
  readonly rules = new Map<string, RuleDefinition>();
  readonly ruleCompletions = new Map<string, { id: string; program_id: string; member_id: string; rule_kind: RuleKind; completed_at: string }>();
  readonly tiers = new Map<string, TierDefinition>();
  readonly pointLedgerEntries: PointLedgerEntry[] = [];
  readonly events: LoyaltyEvent[] = [];
  readonly apiKeys = new Map<string, ApiKeyRecord>();
  readonly idempotencyRecords = new Map<string, IdempotencyRecord>();
  readonly connectorAccounts = new Map<string, ConnectorAccount>();
  readonly webhookSubscriptions = new Map<string, WebhookSubscription>();
  readonly executionLogs: Array<Record<string, unknown>> = [];

  constructor(seed = true) {
    if (seed) {
      this.seed();
    }
  }

  private seed(): void {
    const createdAt = nowIso();
    const demoProgram: Program = {
      id: "demo",
      workspace_id: "workspace_demo",
      name: "Demo Loyalty Program",
      default_currency: "SGD",
      supported_channels: ["web", "pos", "mobile", "marketplace", "social", "agent"],
      supported_countries: ["SG", "MY", "ID", "PH"],
      supported_languages: ["en"],
      points_name: "points",
      earn_rate: {
        points_per_currency_unit: 1,
        currency_unit_minor: 100
      },
      active: true,
      created_at: createdAt,
      updated_at: createdAt
    };
    this.programs.set(demoProgram.id, demoProgram);

    this.addTier({
      program_id: "demo",
      name: "Bronze",
      min_lifetime_points: 0,
      benefits: { multiplier: 1 },
      active: true
    });
    this.addTier({
      program_id: "demo",
      name: "Silver",
      min_lifetime_points: 1_000,
      benefits: { multiplier: 1.1 },
      active: true
    });
    this.addTier({
      program_id: "demo",
      name: "Gold",
      min_lifetime_points: 5_000,
      benefits: { multiplier: 1.25 },
      active: true
    });

    this.addReward({
      program_id: "demo",
      kind: "cart_discount",
      name: "SGD 5 Cart Discount",
      cost_points: 500,
      value: { amount_minor: 500, currency: "SGD" },
      channels: ["web", "pos", "mobile"],
      countries: ["SG"],
      active: true,
      skums_refs: {}
    });
    this.addReward({
      program_id: "demo",
      kind: "free_shipping",
      name: "Free Shipping",
      cost_points: 300,
      value: { shipping_discount: "full" },
      channels: ["web", "mobile", "marketplace"],
      countries: ["SG"],
      active: true,
      skums_refs: {}
    });
    this.addReward({
      program_id: "demo",
      kind: "product_reward",
      name: "SKUMS Trade Unit Reward",
      cost_points: 800,
      value: { fulfillment: "skums_trade_unit" },
      channels: ["pos", "web"],
      countries: ["SG"],
      active: true,
      inventory: 20,
      skums_refs: { trade_unit_id: "demo_trade_unit_reward" }
    });

    this.addRule({
      program_id: "demo",
      kind: "birthday_set",
      name: "Add birthday",
      reward_points: 100,
      channels: ["web", "pos", "mobile"],
      active: true
    });
    this.addRule({
      program_id: "demo",
      kind: "email_marketing_subscribed",
      name: "Subscribe to email marketing",
      reward_points: 50,
      channels: ["web", "pos", "mobile"],
      active: true
    });
    this.addRule({
      program_id: "demo",
      kind: "purchase_completed",
      name: "Complete purchase",
      reward_points: 0,
      channels: ["web", "pos", "mobile", "marketplace"],
      active: true
    });

    this.addApiKey("dev_pos_key", {
      workspace_id: "workspace_demo",
      program_id: "demo",
      name: "Development POS/Public key",
      scopes: [
        "loyalty:configuration:read",
        "loyalty:members:read",
        "loyalty:members:write",
        "loyalty:events:write",
        "loyalty:rewards:redeem"
      ]
    });
    this.addApiKey("dev_admin_key", {
      workspace_id: "workspace_demo",
      program_id: null,
      name: "Development admin key",
      scopes: ["loyalty:admin"]
    });
  }

  addApiKey(
    rawToken: string,
    input: { workspace_id: string; program_id: string | null; name: string; scopes: ApiScope[] }
  ): ApiKeyRecord {
    const record: ApiKeyRecord = {
      id: makeId("key"),
      workspace_id: input.workspace_id,
      program_id: input.program_id,
      name: input.name,
      key_hash: hashApiKey(rawToken),
      scopes: input.scopes,
      active: true,
      created_at: nowIso()
    };
    this.apiKeys.set(record.key_hash, record);
    return record;
  }

  findApiKeyByHash(keyHash: string): ApiKeyRecord | undefined {
    const record = this.apiKeys.get(keyHash);
    return record?.active ? record : undefined;
  }

  upsertProgram(input: Omit<Program, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string }): Program {
    const existing = this.programs.get(input.id);
    const timestamp = nowIso();
    const program: Program = {
      ...input,
      created_at: existing?.created_at ?? input.created_at ?? timestamp,
      updated_at: timestamp
    };
    this.programs.set(program.id, program);
    return program;
  }

  listPrograms(): Program[] {
    return [...this.programs.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getProgram(programId: string): Program | undefined {
    return this.programs.get(programId);
  }

  addReward(input: Omit<RewardDefinition, "id" | "created_at" | "updated_at">): RewardDefinition {
    const timestamp = nowIso();
    const reward: RewardDefinition = {
      ...input,
      id: makeId("rew"),
      created_at: timestamp,
      updated_at: timestamp
    };
    this.rewards.set(reward.id, reward);
    return reward;
  }

  updateReward(rewardId: string, input: Partial<Omit<RewardDefinition, "id" | "created_at">>): RewardDefinition | undefined {
    const existing = this.rewards.get(rewardId);
    if (!existing) {
      return undefined;
    }

    const updated: RewardDefinition = {
      ...existing,
      ...input,
      updated_at: nowIso()
    };
    this.rewards.set(updated.id, updated);
    return updated;
  }

  listRewards(programId: string): RewardDefinition[] {
    return [...this.rewards.values()].filter((reward) => reward.program_id === programId);
  }

  getReward(rewardId: string): RewardDefinition | undefined {
    return this.rewards.get(rewardId);
  }

  addRule(input: Omit<RuleDefinition, "id" | "created_at" | "updated_at">): RuleDefinition {
    const timestamp = nowIso();
    const rule: RuleDefinition = {
      ...input,
      id: makeId("rule"),
      created_at: timestamp,
      updated_at: timestamp
    };
    this.rules.set(rule.id, rule);
    return rule;
  }

  updateRule(ruleId: string, input: Partial<Omit<RuleDefinition, "id" | "created_at">>): RuleDefinition | undefined {
    const existing = this.rules.get(ruleId);
    if (!existing) {
      return undefined;
    }

    const updated: RuleDefinition = {
      ...existing,
      ...input,
      updated_at: nowIso()
    };
    this.rules.set(updated.id, updated);
    return updated;
  }

  listRules(programId: string): RuleDefinition[] {
    return [...this.rules.values()].filter((rule) => rule.program_id === programId);
  }

  addTier(input: Omit<TierDefinition, "id" | "created_at" | "updated_at">): TierDefinition {
    const timestamp = nowIso();
    const tier: TierDefinition = {
      ...input,
      id: makeId("tier"),
      created_at: timestamp,
      updated_at: timestamp
    };
    this.tiers.set(tier.id, tier);
    return tier;
  }

  updateTier(tierId: string, input: Partial<Omit<TierDefinition, "id" | "created_at">>): TierDefinition | undefined {
    const existing = this.tiers.get(tierId);
    if (!existing) {
      return undefined;
    }

    const updated: TierDefinition = {
      ...existing,
      ...input,
      updated_at: nowIso()
    };
    this.tiers.set(updated.id, updated);
    return updated;
  }

  listTiers(programId: string): TierDefinition[] {
    return [...this.tiers.values()]
      .filter((tier) => tier.program_id === programId)
      .sort((a, b) => a.min_lifetime_points - b.min_lifetime_points);
  }

  private identityIndexKey(programId: string, identity: MemberIdentity): string {
    return `${programId}:${identity.kind}:${identity.value}`.toLowerCase();
  }

  private memberKeyIndexKey(programId: string, memberKey: string): string {
    return `${programId}:${memberKey}`.toLowerCase();
  }

  findMemberByKey(programId: string, memberKey: string): Member | undefined {
    const memberId = this.memberIdentityIndex.get(this.memberKeyIndexKey(programId, memberKey));
    return memberId ? this.members.get(memberId) : undefined;
  }

  findMemberById(memberId: string): Member | undefined {
    return this.members.get(memberId);
  }

  listMembers(programId?: string): Member[] {
    return [...this.members.values()].filter((member) => !programId || member.program_id === programId);
  }

  ensureMember(programId: string, memberKey: string, metadata: Record<string, unknown> = {}): Member {
    const existing = this.findMemberByKey(programId, memberKey);
    if (existing) {
      return existing;
    }

    const timestamp = nowIso();
    const identity = parseIdentity(memberKey);
    const member: Member = {
      id: makeId("mem"),
      program_id: programId,
      state: "active",
      identities: [identity],
      points_balance: 0,
      pending_points: 0,
      lifetime_points: 0,
      tier: "Bronze",
      tier_progress: 0,
      joined_at: timestamp,
      last_activity_at: timestamp,
      reward_count: 0,
      referral_code: referralCode(),
      consents: {},
      metadata
    };
    this.members.set(member.id, member);
    this.memberIdentityIndex.set(this.identityIndexKey(programId, identity), member.id);
    this.memberIdentityIndex.set(this.memberKeyIndexKey(programId, memberKey), member.id);
    return member;
  }

  saveMember(member: Member): Member {
    this.members.set(member.id, {
      ...member,
      last_activity_at: nowIso()
    });
    return this.members.get(member.id)!;
  }

  appendLedgerEntry(entry: Omit<PointLedgerEntry, "id" | "occurred_at"> & { occurred_at?: string }): PointLedgerEntry {
    const ledgerEntry: PointLedgerEntry = {
      ...entry,
      id: makeId("led"),
      occurred_at: entry.occurred_at ?? nowIso()
    };
    this.pointLedgerEntries.push(ledgerEntry);
    return ledgerEntry;
  }

  findLedgerEntriesBySource(programId: string, memberId: string, sourceType: string, sourceId: string): PointLedgerEntry[] {
    return this.pointLedgerEntries.filter(
      (entry) =>
        entry.program_id === programId &&
        entry.member_id === memberId &&
        entry.source_type === sourceType &&
        entry.source_id === sourceId
    );
  }

  listLedgerEntries(programId: string, memberId?: string): PointLedgerEntry[] {
    return this.pointLedgerEntries.filter(
      (entry) => entry.program_id === programId && (!memberId || entry.member_id === memberId)
    );
  }

  private saleLinkIndexKey(programId: string, memberId: string, source: string, externalSaleId: string): string {
    return `${programId}:${memberId}:${source}:${externalSaleId}`.toLowerCase();
  }

  upsertSaleLink(
    input: Omit<LoyaltySaleLink, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string }
  ): LoyaltySaleLink {
    const indexKey = this.saleLinkIndexKey(input.program_id, input.member_id, input.source, input.external_sale_id);
    const existingId = this.saleLinkIndex.get(indexKey);
    const existing = existingId ? this.saleLinks.get(existingId) : undefined;
    const timestamp = nowIso();
    const saleLink: LoyaltySaleLink = {
      ...input,
      id: existing?.id ?? input.id ?? makeId("sale"),
      created_at: existing?.created_at ?? input.created_at ?? timestamp,
      updated_at: timestamp
    };
    this.saleLinks.set(saleLink.id, saleLink);
    this.saleLinkIndex.set(indexKey, saleLink.id);
    return saleLink;
  }

  markSaleLinkReversed(input: {
    program_id: string;
    member_id: string;
    source: string;
    external_sale_id: string;
    reversed_at?: string;
    metadata?: Record<string, unknown>;
  }): LoyaltySaleLink | undefined {
    const indexKey = this.saleLinkIndexKey(input.program_id, input.member_id, input.source, input.external_sale_id);
    const existingId = this.saleLinkIndex.get(indexKey);
    const existing = existingId ? this.saleLinks.get(existingId) : undefined;
    if (!existing) {
      return undefined;
    }

    const reversed = {
      ...existing,
      reversed_at: input.reversed_at ?? nowIso(),
      metadata: {
        ...existing.metadata,
        ...(input.metadata ?? {})
      },
      updated_at: nowIso()
    };
    this.saleLinks.set(reversed.id, reversed);
    return reversed;
  }

  listSaleLinks(programId: string, memberId?: string): LoyaltySaleLink[] {
    return [...this.saleLinks.values()]
      .filter((saleLink) => saleLink.program_id === programId && (!memberId || saleLink.member_id === memberId))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }

  addClaimedReward(input: Omit<ClaimedReward, "id" | "issued_at">): ClaimedReward {
    const claimed: ClaimedReward = {
      ...input,
      id: makeId("claim"),
      issued_at: nowIso()
    };
    this.claimedRewards.set(claimed.id, claimed);
    return claimed;
  }

  saveClaimedReward(claimed: ClaimedReward): ClaimedReward {
    this.claimedRewards.set(claimed.id, claimed);
    return claimed;
  }

  listClaimedRewards(programId: string, memberId?: string): ClaimedReward[] {
    return [...this.claimedRewards.values()].filter(
      (claimed) => claimed.program_id === programId && (!memberId || claimed.member_id === memberId)
    );
  }

  getClaimedReward(claimedRewardId: string): ClaimedReward | undefined {
    return this.claimedRewards.get(claimedRewardId);
  }

  upsertRewardUsageFact(
    input: Omit<LoyaltyRewardUsageFact, "id" | "created_at" | "updated_at"> & {
      id?: string;
      created_at?: string;
      updated_at?: string;
    }
  ): LoyaltyRewardUsageFact {
    const existingId = this.rewardUsageByClaimedReward.get(input.claimed_reward_id);
    const existing = existingId ? this.rewardUsageFacts.get(existingId) : undefined;
    const timestamp = nowIso();
    const fact: LoyaltyRewardUsageFact = {
      ...input,
      id: existing?.id ?? input.id ?? makeId("rusage"),
      created_at: existing?.created_at ?? input.created_at ?? timestamp,
      updated_at: timestamp
    };
    this.rewardUsageFacts.set(fact.id, fact);
    this.rewardUsageByClaimedReward.set(fact.claimed_reward_id, fact.id);
    return fact;
  }

  listRewardUsageFacts(programId: string, memberId?: string): LoyaltyRewardUsageFact[] {
    return [...this.rewardUsageFacts.values()]
      .filter((fact) => fact.program_id === programId && (!memberId || fact.member_id === memberId))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }

  getRewardUsageFactByClaimedReward(claimedRewardId: string): LoyaltyRewardUsageFact | undefined {
    const factId = this.rewardUsageByClaimedReward.get(claimedRewardId);
    return factId ? this.rewardUsageFacts.get(factId) : undefined;
  }

  addRuleCompletion(programId: string, memberId: string, ruleKind: RuleKind): void {
    this.ruleCompletions.set(`${programId}:${memberId}:${ruleKind}`, {
      id: makeId("rcomp"),
      program_id: programId,
      member_id: memberId,
      rule_kind: ruleKind,
      completed_at: nowIso()
    });
  }

  hasRuleCompletion(programId: string, memberId: string, ruleKind: RuleKind): boolean {
    return this.ruleCompletions.has(`${programId}:${memberId}:${ruleKind}`);
  }

  addEvent(input: Omit<LoyaltyEvent, "id" | "created_at">): LoyaltyEvent {
    const event: LoyaltyEvent = {
      ...input,
      id: makeId("evt"),
      created_at: nowIso()
    };
    this.events.push(event);
    return event;
  }

  getIdempotency(programId: string, key: string): IdempotencyRecord | undefined {
    return this.idempotencyRecords.get(`${programId}:${key}`);
  }

  saveIdempotency(record: IdempotencyRecord): void {
    this.idempotencyRecords.set(`${record.program_id}:${record.key}`, record);
  }

  addConnector(input: Omit<ConnectorAccount, "id" | "created_at" | "updated_at">): ConnectorAccount {
    const timestamp = nowIso();
    const connector: ConnectorAccount = {
      ...input,
      id: makeId("conn"),
      created_at: timestamp,
      updated_at: timestamp
    };
    this.connectorAccounts.set(connector.id, connector);
    return connector;
  }

  listConnectors(programId?: string): ConnectorAccount[] {
    return [...this.connectorAccounts.values()].filter(
      (connector) => !programId || connector.program_id === programId
    );
  }

  addWebhookSubscription(input: Omit<WebhookSubscription, "id" | "created_at">): WebhookSubscription {
    const subscription: WebhookSubscription = {
      ...input,
      id: makeId("whsub"),
      created_at: nowIso()
    };
    this.webhookSubscriptions.set(subscription.id, subscription);
    return subscription;
  }

  deleteWebhookSubscription(webhookId: string): boolean {
    return this.webhookSubscriptions.delete(webhookId);
  }

  listWebhookSubscriptions(programId?: string): WebhookSubscription[] {
    return [...this.webhookSubscriptions.values()].filter(
      (subscription) => !programId || subscription.program_id === programId
    );
  }
}

let singletonStore = new MemoryLoyaltyStore();

export function useLoyaltyStore(): MemoryLoyaltyStore {
  return singletonStore;
}

export function resetLoyaltyStoreForTests(): MemoryLoyaltyStore {
  singletonStore = new MemoryLoyaltyStore();
  return singletonStore;
}
