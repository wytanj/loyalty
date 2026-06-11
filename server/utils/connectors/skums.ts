import type { CartLineItem, Channel, ClaimedReward, RewardDefinition } from "../contracts";

export interface SkumsRewardFulfillmentRequest {
  claimed_reward_id: string;
  reward_id: string;
  reward_kind: RewardDefinition["kind"];
  channel: Channel;
  skums_refs: Record<string, string>;
}

export function buildSkumsRewardFulfillmentRequest(
  reward: RewardDefinition,
  claimedReward: ClaimedReward,
  channel: Channel
): SkumsRewardFulfillmentRequest {
  return {
    claimed_reward_id: claimedReward.id,
    reward_id: reward.id,
    reward_kind: reward.kind,
    channel,
    skums_refs: reward.skums_refs
  };
}

export function extractSkumsLineRefs(lineItem: CartLineItem): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      product_identity_id: lineItem.skums_product_identity_id,
      trade_unit_id: lineItem.skums_trade_unit_id,
      listing_id: lineItem.skums_listing_id,
      sku: lineItem.sku
    }).filter(([, value]) => typeof value === "string" && value.length > 0)
  ) as Record<string, string>;
}
