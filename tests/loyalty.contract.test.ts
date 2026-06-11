import { beforeEach, describe, expect, it } from "vitest";
import { adminPolicyVersionInputSchema, requestContextSchema, eventIngestRequestSchema, type Cart } from "@server/utils/contracts";
import { LoyaltyError } from "@server/utils/errors";
import {
  adminAdjustPoints,
  commitEarn,
  completeRule,
  createPolicyVersion,
  getConfiguration,
  getAdminLedger,
  getAdminRewardUsage,
  getCommerceSummary,
  getMember,
  ingestEvent,
  initializeSession,
  listPolicyVersions,
  previewEarn,
  publishPolicyVersion,
  refundReward,
  redeemReward,
  reverseEarn,
  simulatePolicyVersion
} from "@server/utils/services";
import { resetLoyaltyStoreForTests, useLoyaltyStore } from "@server/utils/store";

const cart: Cart = {
  subtotal: 12_800,
  discount_total: 1_000,
  tax_total: 900,
  grand_total: 12_700,
  items: [
    {
      line_id: "1",
      skums_trade_unit_id: "trade_unit_123",
      sku: "SERUM-30ML",
      quantity: 1,
      unit_price: 12_800,
      discount_total: 0,
      tax_total: 0,
      metadata: {}
    }
  ]
};

describe("headless loyalty contracts", () => {
  beforeEach(() => {
    resetLoyaltyStoreForTests();
  });

  it("requires channel context on public requests", () => {
    expect(() => requestContextSchema.parse({ country: "SG" })).toThrow();
    expect(requestContextSchema.parse({ channel: "pos", country: "sg" })).toMatchObject({
      channel: "pos",
      country: "SG"
    });
  });

  it("accepts the POS sale event vocabulary", () => {
    const parsed = eventIngestRequestSchema.parse({
      idempotency_key: "pos:event:123",
      event_id: "evt_123",
      event_type: "pos.sale.completed",
      workspace_id: "workspace_demo",
      source_system: "pos",
      actor: { type: "pos_register", id: "register_01" },
      subject: {
        customer_key: "crm:person_123",
        external_customer_refs: [{ system: "pos", id: "cust_123" }]
      },
      schema_version: "2026-06-11",
      member_key: "crm:person_123",
      channel: "pos",
      payload: {
        transaction_id: "txn_123",
        cart
      }
    });

    expect(parsed.event_type).toBe("pos.sale.completed");
  });

  it("initializes a member session without frontend state", () => {
    const response = initializeSession("demo", "crm:person_123", {
      channel: "pos",
      currency: "SGD",
      cart,
      metadata: {}
    });

    expect(response).toHaveProperty("member");
    expect(response).toHaveProperty("earn_preview");
    expect(useLoyaltyStore().listMembers("demo")).toHaveLength(1);
  });

  it("previews, commits, and reverses points with append-only ledger rows", () => {
    const preview = previewEarn("demo", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      cart,
      metadata: {}
    }) as { points: number };

    expect(preview.points).toBe(118);

    const commit = commitEarn("demo", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      cart,
      transaction_id: "txn_123",
      idempotency_key: "pos:store_001:txn_123",
      metadata: {}
    }) as {
      member: { wallet: { points_balance: number } };
      sale_link: { external_sale_id: string; sale_total_minor: number; points_earned: number; reversed_at?: string };
    };

    expect(commit.member.wallet.points_balance).toBe(118);
    expect(commit.sale_link).toMatchObject({
      external_sale_id: "txn_123",
      sale_total_minor: 12_700,
      points_earned: 118
    });

    const reversal = reverseEarn("demo", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      original_transaction_id: "txn_123",
      return_id: "return_123",
      idempotency_key: "pos_return:store_001:return_123",
      metadata: {}
    }) as { member: { wallet: { points_balance: number } }; sale_link?: { reversed_at?: string } };

    expect(reversal.member.wallet.points_balance).toBe(0);
    expect(reversal.sale_link?.reversed_at).toBeTruthy();
    expect(useLoyaltyStore().listLedgerEntries("demo")).toHaveLength(2);
    expect(useLoyaltyStore().listLedgerEntries("demo").map((entry) => entry.kind)).toEqual(["earn", "reverse"]);

    const summary = getCommerceSummary("demo", "crm:person_123", { channel: "pos", currency: "SGD" }) as {
      summary: { sale_count: number; reversed_sale_count: number; net_sale_total_minor: number; points_reversed: number };
    };
    expect(summary.summary).toMatchObject({
      sale_count: 1,
      reversed_sale_count: 1,
      net_sale_total_minor: 0,
      points_reversed: 118
    });
  });

  it("redeems a product reward through the SKUMS-aware reward kind", () => {
    initializeSession("demo", "crm:person_123", {
      channel: "pos",
      currency: "SGD",
      metadata: {}
    });
    const member = useLoyaltyStore().listMembers("demo")[0]!;
    adminAdjustPoints(member.id, {
      idempotency_key: "admin:test:grant",
      points: 1_000,
      reason: "test grant",
      metadata: {}
    });

    const redemption = redeemReward("demo", "product_reward", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      idempotency_key: "pos_redeem:txn_123:product_reward",
      metadata: {
        external_sale_id: "txn_123"
      }
    }) as {
      member: { wallet: { points_balance: number }; reward_count: number };
      claimed_reward: { id: string };
      reward_usage: { status: string; points_cost: number; external_sale_id?: string };
      redemption: { code: string; one_time_visible: boolean };
    };

    expect(redemption.member.wallet.points_balance).toBe(200);
    expect(redemption.reward_usage).toMatchObject({
      status: "issued",
      points_cost: 800,
      external_sale_id: "txn_123"
    });
    expect(redemption.redemption.one_time_visible).toBe(true);
    expect(useLoyaltyStore().events.some((event) => event.event_type === "loyalty.product_reward.reservation_requested")).toBe(
      true
    );

    const refund = refundReward("demo", "product_reward", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      claimed_reward_id: redemption.claimed_reward.id,
      refund_id: "refund_reward_123",
      idempotency_key: "pos_reward_refund:txn_123:product_reward",
      metadata: {}
    }) as { member: { wallet: { points_balance: number } }; reward_usage: { status: string; external_sale_id?: string } };

    expect(refund.member.wallet.points_balance).toBe(1_000);
    expect(refund.reward_usage).toMatchObject({
      status: "refunded",
      external_sale_id: "txn_123"
    });
  });

  it("rejects duplicate rule completions as shopper-facing business state", () => {
    initializeSession("demo", "crm:person_123", {
      channel: "pos",
      currency: "SGD",
      metadata: {}
    });
    completeRule("demo", "birthday_set", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      idempotency_key: "rule:birthday:1",
      metadata: {}
    });

    expect(() =>
      completeRule("demo", "birthday_set", {
        member_key: "crm:person_123",
        channel: "pos",
        currency: "SGD",
        idempotency_key: "rule:birthday:2",
        metadata: {}
      })
    ).toThrow(LoyaltyError);
  });

  it("processes POS sale and return events into ledger actions", () => {
    ingestEvent("demo", {
      event_id: "evt_sale_1",
      event_type: "pos.sale.completed",
      workspace_id: "workspace_demo",
      source_system: "pos",
      actor: { type: "pos_register", id: "register_01" },
      subject: {
        customer_key: "crm:person_123",
        external_customer_refs: [{ system: "pos", id: "cust_123" }]
      },
      schema_version: "2026-06-11",
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      idempotency_key: "pos:evt_sale_1",
      payload: {
        transaction_id: "txn_event_1",
        cart
      }
    });
    ingestEvent("demo", {
      event_id: "evt_return_1",
      event_type: "pos.return.completed",
      workspace_id: "workspace_demo",
      source_system: "pos",
      actor: { type: "pos_register", id: "register_01" },
      subject: {
        customer_key: "crm:person_123",
        external_customer_refs: [{ system: "pos", id: "cust_123" }]
      },
      schema_version: "2026-06-11",
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      idempotency_key: "pos:evt_return_1",
      payload: {
        original_transaction_id: "txn_event_1",
        return_id: "return_event_1"
      }
    });

    const member = getMember("demo", "crm:person_123", { channel: "pos", currency: "SGD" }) as {
      member: { wallet: { points_balance: number } };
    };
    expect(member.member.wallet.points_balance).toBe(0);
    expect(useLoyaltyStore().listLedgerEntries("demo")).toHaveLength(2);
    expect(useLoyaltyStore().listSaleLinks("demo")).toHaveLength(1);
  });

  it("exposes admin ledger and reward usage read models", () => {
    commitEarn("demo", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      cart,
      transaction_id: "txn_admin_read_1",
      idempotency_key: "pos:store_001:txn_admin_read_1",
      metadata: {}
    });
    const member = useLoyaltyStore().listMembers("demo")[0]!;
    adminAdjustPoints(member.id, {
      idempotency_key: "admin:test:grant:read",
      points: 1_000,
      reason: "test grant",
      metadata: {}
    });
    redeemReward("demo", "cart_discount", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      idempotency_key: "pos_redeem:txn_admin_read_1:cart_discount",
      metadata: {
        external_sale_id: "txn_admin_read_1"
      }
    });

    const ledger = getAdminLedger(member.id) as {
      ledger_entries: Array<{ kind: string }>;
      totals: { points_earned: number; reward_points_spent: number };
    };
    const rewardUsage = getAdminRewardUsage(member.id) as {
      reward_usage: Array<{ status: string; external_sale_id?: string }>;
      totals: { issued_count: number; points_cost: number };
    };

    expect(ledger.ledger_entries.map((entry) => entry.kind)).toContain("earn");
    expect(ledger.totals.points_earned).toBe(118);
    expect(ledger.totals.reward_points_spent).toBe(500);
    expect(rewardUsage.totals).toMatchObject({
      issued_count: 1,
      points_cost: 500
    });
    expect(rewardUsage.reward_usage[0]).toMatchObject({
      status: "issued",
      external_sale_id: "txn_admin_read_1"
    });
  });

  it("drafts, simulates, and publishes versioned policy changes", () => {
    const policyInput = adminPolicyVersionInputSchema.parse({
      name: "Launch earn policy refresh",
      version_label: "2026-06-v2",
      change_reason: "Double base earn and define commercial guardrails",
      policy: {
        earning: {
          eligible_amount_basis: "net_after_discount_excluding_tax",
          points_per_currency_unit: 2,
          currency_unit_minor: 100,
          rounding: "floor",
          earn_on_discounted_items: true
        },
        redemption: {
          points_per_currency_unit: 100,
          currency_unit_minor: 100,
          minimum_points: 300
        },
        tiers: {
          qualification_metric: "lifetime_points",
          thresholds: [
            { name: "Bronze", threshold: 0 },
            { name: "Silver", threshold: 1_000 },
            { name: "Gold", threshold: 5_000 }
          ]
        },
        campaigns: {
          default_stack_mode: "base_plus_best_promo",
          max_promotional_rules_per_transaction: 1
        },
        expiry: {
          mode: "after_inactivity",
          days: 365,
          notice_days: 30
        },
        referral: {
          enabled: true,
          trigger_event: "first_completed_purchase",
          referrer_reward: { points: 200 },
          referee_reward: { cart_discount_minor: 500 }
        },
        consent: {
          privacy_policy_version: "2026-06-privacy-v1",
          required_purposes: ["loyalty_operations", "marketing"]
        },
        rules: [
          {
            key: "birthday.non_stack",
            name: "Birthday offer does not stack with another promotional campaign",
            domain: "campaign",
            priority: 10,
            exclusive: true,
            conditions: { campaign_key: "birthday" },
            effects: { stack_group: "seasonal_bonus" }
          }
        ]
      }
    });
    const draft = createPolicyVersion("demo", policyInput) as {
      policy_version: { id: string; status: string; policy: { redemption: { minimum_points: number } } };
    };

    expect(draft.policy_version.status).toBe("draft");
    expect(draft.policy_version.policy.redemption.minimum_points).toBe(300);

    const simulation = simulatePolicyVersion("demo", draft.policy_version.id, {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      cart,
      metadata: {}
    }) as { simulation: { earn_preview: { points: number; policy: { policy_version: { id: string } } } } };
    expect(simulation.simulation.earn_preview.points).toBe(236);
    expect(simulation.simulation.earn_preview.policy.policy_version.id).toBe(draft.policy_version.id);

    const published = publishPolicyVersion("demo", draft.policy_version.id, {
      change_reason: "Approved for launch"
    }) as { active_policy_version: { id: string; status: string } };
    expect(published.active_policy_version).toMatchObject({
      id: draft.policy_version.id,
      status: "active"
    });

    const preview = previewEarn("demo", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      cart,
      metadata: {}
    }) as { points: number; policy: { kind: string; policy_version: { id: string } } };
    expect(preview.points).toBe(236);
    expect(preview.policy).toMatchObject({
      kind: "versioned_policy",
      policy_version: { id: draft.policy_version.id }
    });

    const configuration = getConfiguration("demo", { channel: "pos", currency: "SGD" }) as {
      active_policy_version: { id: string };
      policy: { consent: { privacy_policy_version?: string } };
    };
    expect(configuration.active_policy_version.id).toBe(draft.policy_version.id);
    expect(configuration.policy.consent.privacy_policy_version).toBe("2026-06-privacy-v1");

    const versions = listPolicyVersions("demo") as { policy_versions: Array<{ status: string }> };
    expect(versions.policy_versions.map((policyVersion) => policyVersion.status)).toContain("retired");
  });
});
