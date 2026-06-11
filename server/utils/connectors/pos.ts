import type { Cart, Channel, RequestContext } from "../contracts";

export interface PosLoyaltySessionRequest extends RequestContext {
  member_key: string;
  cart?: Cart;
}

export interface PosDiscountAuthorization {
  authorization_id: string;
  channel: Channel;
  claimed_reward_id: string;
  discount: Record<string, unknown>;
  expires_at: string;
}

export function buildPosDiscountAuthorization(input: {
  claimed_reward_id: string;
  channel: Channel;
  discount: Record<string, unknown>;
}): PosDiscountAuthorization {
  return {
    authorization_id: `pos_auth_${input.claimed_reward_id}`,
    channel: input.channel,
    claimed_reward_id: input.claimed_reward_id,
    discount: input.discount,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };
}
