import type { LoyaltyEvent, Member } from "../contracts";

export interface CrmLoyaltySummary {
  loyalty_member_id: string;
  loyalty_state: Member["state"];
  loyalty_points_balance: number;
  loyalty_pending_points: number;
  loyalty_lifetime_points: number;
  loyalty_tier: string;
  loyalty_tier_progress: number;
  loyalty_joined_at: string;
  loyalty_last_activity_at: string;
  loyalty_reward_count: number;
  loyalty_referral_code: string;
}

export function buildCrmLoyaltySummary(member: Member): CrmLoyaltySummary {
  return {
    loyalty_member_id: member.id,
    loyalty_state: member.state,
    loyalty_points_balance: member.points_balance,
    loyalty_pending_points: member.pending_points,
    loyalty_lifetime_points: member.lifetime_points,
    loyalty_tier: member.tier,
    loyalty_tier_progress: member.tier_progress,
    loyalty_joined_at: member.joined_at,
    loyalty_last_activity_at: member.last_activity_at,
    loyalty_reward_count: member.reward_count,
    loyalty_referral_code: member.referral_code
  };
}

export function buildCrmTimelineEvent(event: LoyaltyEvent): Record<string, unknown> {
  return {
    external_event_id: event.event_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    channel: event.channel,
    loyalty_member_id: event.member_id,
    payload: event.payload
  };
}
