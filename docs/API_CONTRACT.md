# API Contract

This service is headless. Every client is an integration client: POS, CRM, SKUMS, storefront, mobile, marketplace, social, or agent.

## Auth

Use bearer tokens.

```http
Authorization: Bearer <loyalty_api_key>
```

Write endpoints also require an idempotency key:

```http
Idempotency-Key: pos:store_001:txn_123
```

If the same idempotency key is replayed with the same payload, the original response is returned. If the payload differs, the API returns `409 idempotency_conflict`.

## Request Context

Customer-facing reads and writes require:

```text
channel=web|pos|mobile|marketplace|social|agent
```

The generic channel set also includes `partner` for partner portals, referral partners, or external service partners that are not ordinary marketplace or social channels.

Optional context:

```text
country=SG
language=en
currency=SGD
location_id=store_001
register_id=register_01
listing_id=<SKUMS listing id>
```

## Public Headless API

```text
GET  /api/v1/{program_id}/configuration
GET  /api/v1/{program_id}/members/{member_key}
GET  /api/v1/{program_id}/members/{member_key}/commerce-summary
POST /api/v1/{program_id}/members/{member_key}/sessions
POST /api/v1/{program_id}/members/{member_key}/birthday
POST /api/v1/{program_id}/members/{member_key}/consents/email-marketing

POST /api/v1/{program_id}/earn/preview
POST /api/v1/{program_id}/earn/commit
POST /api/v1/{program_id}/earn/reverse

GET  /api/v1/{program_id}/members/{member_key}/rewards
POST /api/v1/{program_id}/rewards/{reward_kind}/redeem
POST /api/v1/{program_id}/rewards/{reward_kind}/refund

POST /api/v1/{program_id}/rules/{rule_kind}/complete
POST /api/v1/{program_id}/events
```

MVP reward kinds:

```text
cart_discount
free_shipping
product_discount
gift_card
custom_store_fulfillment
points_adjustment
product_reward
```

MVP rule kinds:

```text
purchase_completed
first_purchase
birthday_set
email_marketing_subscribed
profile_completed
custom_event
```

## Source Event Envelope

Cross-repo event writes use a stable envelope so POS, SKUMS, CRM, Loyalty, and future partners can exchange facts without double counting or losing provenance.

```http
POST /api/v1/demo/events
Authorization: Bearer dev_pos_key
Idempotency-Key: pos:store_001:txn_123
Content-Type: application/json
```

```json
{
  "event_id": "pos_sale_123",
  "event_type": "pos.sale.completed",
  "workspace_id": "workspace_demo",
  "source_system": "pos",
  "occurred_at": "2026-06-11T04:00:00.000Z",
  "idempotency_key": "pos:store_001:txn_123",
  "actor": {
    "type": "pos_register",
    "id": "register_01"
  },
  "subject": {
    "customer_key": "crm:person_123",
    "external_customer_refs": [
      { "system": "pos", "id": "cust_123" }
    ]
  },
  "channel": "pos",
  "country": "SG",
  "currency": "SGD",
  "location_id": "store_001",
  "register_id": "register_01",
  "schema_version": "2026-06-11",
  "member_key": "crm:person_123",
  "payload": {
    "transaction_id": "txn_123",
    "cart": {
      "subtotal": 12800,
      "discount_total": 1000,
      "tax_total": 900,
      "grand_total": 12700,
      "items": []
    }
  }
}
```

Required source systems:

```text
pos
skums
crm
loyalty
shopify
custom
```

When the event type is `pos.sale.completed` or `skums.pos_sale.completed` and the payload contains a valid cart, Loyalty appends earn ledger rows. When the event type is `pos.return.completed` or `skums.pos_return.completed` and the payload references the original transaction, Loyalty appends reversal ledger rows.

## POS Sale Commit

```http
POST /api/v1/demo/earn/commit
Authorization: Bearer dev_pos_key
Idempotency-Key: pos:store_001:txn_123
Content-Type: application/json
```

```json
{
  "member_key": "crm:person_123",
  "channel": "pos",
  "currency": "SGD",
  "location_id": "store_001",
  "register_id": "register_01",
  "transaction_id": "txn_123",
  "cart": {
    "subtotal": 12800,
    "discount_total": 1000,
    "tax_total": 900,
    "grand_total": 12700,
    "items": [
      {
        "line_id": "1",
        "skums_trade_unit_id": "trade_unit_123",
        "sku": "SERUM-30ML",
        "quantity": 1,
        "unit_price": 12800
      }
    ]
  }
}
```

## Return Reversal

```http
POST /api/v1/demo/earn/reverse
Authorization: Bearer dev_pos_key
Idempotency-Key: pos_return:store_001:return_123
Content-Type: application/json
```

```json
{
  "member_key": "crm:person_123",
  "channel": "pos",
  "currency": "SGD",
  "location_id": "store_001",
  "original_transaction_id": "txn_123",
  "return_id": "return_123"
}
```

The original earn ledger row is never mutated. A negative reversal ledger row is appended.

## Admin API

```text
GET  /api/v1/admin/programs
POST /api/v1/admin/programs
GET  /api/v1/admin/programs/{program_id}
PUT  /api/v1/admin/programs/{program_id}

GET  /api/v1/admin/programs/{program_id}/policy-versions
POST /api/v1/admin/programs/{program_id}/policy-versions
GET  /api/v1/admin/programs/{program_id}/policy-versions/{policy_version_id}
POST /api/v1/admin/programs/{program_id}/policy-versions/{policy_version_id}/simulate
POST /api/v1/admin/programs/{program_id}/policy-versions/{policy_version_id}/publish

GET  /api/v1/admin/rules?program_id={program_id}
POST /api/v1/admin/rules
PUT  /api/v1/admin/rules/{rule_id}

GET  /api/v1/admin/rewards?program_id={program_id}
POST /api/v1/admin/rewards
PUT  /api/v1/admin/rewards/{reward_id}

GET  /api/v1/admin/tiers?program_id={program_id}
POST /api/v1/admin/tiers
PUT  /api/v1/admin/tiers/{tier_id}

GET  /api/v1/admin/members?program_id={program_id}
GET  /api/v1/admin/members/{member_id}
GET  /api/v1/admin/members/{member_id}/ledger
GET  /api/v1/admin/members/{member_id}/reward-usage
POST /api/v1/admin/members/{member_id}/adjust-points

GET  /api/v1/admin/connectors?program_id={program_id}
POST /api/v1/admin/connectors/crm
POST /api/v1/admin/connectors/skums
POST /api/v1/admin/connectors/pos
```

Admin keys must not be shipped to POS, storefront, mobile, or browser clients.

## Policy Versions

Vocabulary:

- Program: the loyalty container for one business, region, or brand experience.
- Policy: the configurable business behavior for earning, redemption, tiers, campaigns, expiry, referral, and consent.
- Rule: one conditional statement inside a policy, such as a tier threshold or non-stacking campaign.
- Policy version: a draftable, publishable snapshot. Previews and commits return the active policy version so POS, CRM, and agents can explain outcomes.

Create a draft:

```http
POST /api/v1/admin/programs/demo/policy-versions
Authorization: Bearer dev_admin_key
Idempotency-Key: admin:policy:draft:2026-06-v2
Content-Type: application/json
```

```json
{
  "name": "June policy refresh",
  "version_label": "2026-06-v2",
  "change_reason": "Raise earn rate for launch month and set minimum redemption.",
  "policy": {
    "earning": {
      "eligible_amount_basis": "net_after_discount_excluding_tax",
      "points_per_currency_unit": 2,
      "currency_unit_minor": 100,
      "rounding": "floor",
      "earn_on_discounted_items": true
    },
    "redemption": {
      "points_per_currency_unit": 100,
      "currency_unit_minor": 100,
      "minimum_points": 300,
      "allow_partial_redemption": true
    },
    "tiers": {
      "qualification_metric": "lifetime_points",
      "thresholds": [
        { "name": "Bronze", "threshold": 0 },
        { "name": "Silver", "threshold": 1000 },
        { "name": "Gold", "threshold": 5000 }
      ]
    },
    "campaigns": {
      "default_stack_mode": "base_plus_best_promo",
      "max_promotional_rules_per_transaction": 1
    },
    "expiry": {
      "mode": "after_inactivity",
      "days": 365,
      "notice_days": 30
    },
    "referral": {
      "enabled": true,
      "trigger_event": "first_completed_purchase",
      "referrer_reward": { "points": 200 },
      "referee_reward": { "cart_discount_minor": 500 }
    },
    "consent": {
      "privacy_policy_version": "2026-06-privacy-v1",
      "required_purposes": ["loyalty_operations", "marketing"]
    },
    "rules": [
      {
        "key": "birthday.non_stack",
        "name": "Birthday offer does not stack with another promotional campaign",
        "domain": "campaign",
        "priority": 10,
        "exclusive": true,
        "conditions": { "campaign_key": "birthday" },
        "effects": { "stack_group": "seasonal_bonus" }
      }
    ]
  }
}
```

Simulate before publishing:

```http
POST /api/v1/admin/programs/demo/policy-versions/{policy_version_id}/simulate
```

Publish after approval:

```http
POST /api/v1/admin/programs/demo/policy-versions/{policy_version_id}/publish
Idempotency-Key: admin:policy:publish:2026-06-v2
```

Publishing retires the previous active policy version. Existing ledger entries remain unchanged; future previews and commits use the newly active policy.

## Commerce Summary

```http
GET /api/v1/demo/members/crm:person_123/commerce-summary?channel=pos&currency=SGD
Authorization: Bearer dev_pos_key
```

The commerce summary is a read model around loyalty economics. It is not the source of truth; the append-only point ledger remains the economic truth.

```json
{
  "member": {},
  "summary": {
    "currency": "SGD",
    "sale_count": 1,
    "active_sale_count": 1,
    "reversed_sale_count": 0,
    "gross_sale_total_minor": 12700,
    "net_sale_total_minor": 12700,
    "discount_total_minor": 1000,
    "points_earned": 118,
    "points_reversed": 0,
    "net_points_earned": 118,
    "points_redeemed": 500,
    "points_refunded": 0,
    "reward_usage_count": 1
  },
  "sale_links": [],
  "reward_usage": []
}
```

## Webhooks

```text
POST /api/v1/webhooks/crm
POST /api/v1/webhooks/skums
POST /api/v1/webhooks/pos
POST /api/v1/webhooks/shopify
POST /api/v1/webhooks/custom
```

Provider webhooks require `X-Loyalty-Signature`:

```text
t=<unix_timestamp>,v1=<hex_hmac_sha256(timestamp.raw_body)>
```

The timestamp tolerance is five minutes. Webhook bodies include `program_id` and are also idempotent.

## Error Model

```text
400 invalid_request
401 authentication_required
403 permission_denied
404 not_found
409 idempotency_conflict
422 business_rule_failed
429 rate_limited
500 internal_error
```

Business-state failures use `422`, including:

```text
member_not_enrolled
member_blocked
insufficient_points
reward_out_of_stock
reward_not_available_for_channel
reward_not_available_for_country
reward_already_claimed
rule_already_completed
cart_does_not_qualify
sale_already_reversed
consent_required
```
