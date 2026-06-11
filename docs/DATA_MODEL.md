# Data Model

The economic source of truth is `loyalty_point_ledger_entries`. Balances on members and point accounts are projections.

## Core Tables

```text
loyalty_workspaces
loyalty_programs
loyalty_sites
loyalty_channels
loyalty_api_keys

loyalty_members
loyalty_member_identities
loyalty_member_segments
loyalty_member_consents

loyalty_point_accounts
loyalty_point_ledger_entries
loyalty_balance_snapshots

loyalty_tiers
loyalty_tier_snapshots
loyalty_tier_rules

loyalty_rules
loyalty_rule_completions
loyalty_earning_policies

loyalty_rewards
loyalty_reward_variants
loyalty_claimed_rewards
loyalty_redemption_codes
loyalty_reward_fulfillments

loyalty_events
loyalty_idempotency_keys
loyalty_webhook_subscriptions
loyalty_webhook_deliveries

loyalty_connector_accounts
loyalty_external_links
loyalty_sync_jobs
loyalty_sync_job_steps

loyalty_agent_proposals
loyalty_approval_requests
loyalty_execution_logs
```

## Ledger Rules

- Earns, reversals, redemptions, refunds, rule bonuses, and admin adjustments are separate rows.
- Historical ledger rows are not updated or deleted.
- Reversals reference the original source transaction and append negative points.
- Reward refunds append positive points when points were spent.
- Idempotency keys are unique per program and prevent double-awards.

The migration creates `prevent_loyalty_ledger_mutation()` and triggers that reject update/delete operations on `loyalty_point_ledger_entries`.

## Identity

`loyalty_member_identities` maps external identities into one loyalty member:

```text
crm:<person_id>
pos:<customer_id>
email_hash:<sha256>
phone_hash:<sha256>
ecommerce:<customer_id>
```

The MVP accepts `member_key = crm:<crm_entity_id>` as the clean primary path. Additional identifiers become secondary identities.

## Reward Codes

`loyalty_redemption_codes` stores hashes and masked display values. Full voucher or gift-card codes should be generated for one-time visibility and should not be exposed again through ordinary read APIs.

## Agent Safety

Agents write `loyalty_agent_proposals`. They do not directly mutate balances, tiers, rewards, or campaign state. Economic changes require approval records and then audited execution logs.
