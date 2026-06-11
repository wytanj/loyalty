# CRM Connector

CRM remains the customer graph system of record. Loyalty writes summary fields and activity back to CRM, but does not become a CRM.

## Minimum Writeback

Custom fields on `person`:

```text
loyalty_member_id
loyalty_state
loyalty_points_balance
loyalty_pending_points
loyalty_lifetime_points
loyalty_tier
loyalty_tier_progress
loyalty_joined_at
loyalty_last_activity_at
loyalty_reward_count
loyalty_referral_code
```

Graph relationships:

```text
person -has_loyalty_membership-> loyalty_membership
person -earned_reward-> reward
person -redeemed_reward-> claimed_reward
person -belongs_to_segment-> loyalty_segment
person -referred-> person
campaign -triggered_by-> loyalty_event
```

Timeline events:

```text
loyalty.member.enrolled
loyalty.member.updated
loyalty.points.earned
loyalty.points.reversed
loyalty.tier.upgraded
loyalty.tier.downgraded
loyalty.reward.available
loyalty.reward.claimed
loyalty.reward.redeemed
loyalty.reward.expired
loyalty.referral.completed
loyalty.segment.entered
loyalty.segment.exited
```

## Minimum Read

```text
person lookup by crm_entity_id
person lookup by email/phone
consent state
campaign membership
segment membership
household/company relationships when available
```

Loyalty should not send emails. It emits campaign-ready events and lets CRM or a merchant-owned provider handle communication.
