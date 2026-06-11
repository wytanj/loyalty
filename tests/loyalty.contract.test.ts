import { beforeEach, describe, expect, it } from "vitest";
import { requestContextSchema, eventIngestRequestSchema, type Cart } from "@server/utils/contracts";
import { LoyaltyError } from "@server/utils/errors";
import {
  adminAdjustPoints,
  commitEarn,
  completeRule,
  getMember,
  ingestEvent,
  initializeSession,
  previewEarn,
  redeemReward,
  reverseEarn
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
    }) as { member: { wallet: { points_balance: number } } };

    expect(commit.member.wallet.points_balance).toBe(118);

    const reversal = reverseEarn("demo", {
      member_key: "crm:person_123",
      channel: "pos",
      currency: "SGD",
      original_transaction_id: "txn_123",
      return_id: "return_123",
      idempotency_key: "pos_return:store_001:return_123",
      metadata: {}
    }) as { member: { wallet: { points_balance: number } } };

    expect(reversal.member.wallet.points_balance).toBe(0);
    expect(useLoyaltyStore().listLedgerEntries("demo")).toHaveLength(2);
    expect(useLoyaltyStore().listLedgerEntries("demo").map((entry) => entry.kind)).toEqual(["earn", "reverse"]);
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
      metadata: {}
    }) as {
      member: { wallet: { points_balance: number }; reward_count: number };
      redemption: { code: string; one_time_visible: boolean };
    };

    expect(redemption.member.wallet.points_balance).toBe(200);
    expect(redemption.redemption.one_time_visible).toBe(true);
    expect(useLoyaltyStore().events.some((event) => event.event_type === "loyalty.product_reward.reservation_requested")).toBe(
      true
    );
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
  });
});
