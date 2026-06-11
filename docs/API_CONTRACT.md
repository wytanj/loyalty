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
POST /api/v1/admin/members/{member_id}/adjust-points

GET  /api/v1/admin/connectors?program_id={program_id}
POST /api/v1/admin/connectors/crm
POST /api/v1/admin/connectors/skums
POST /api/v1/admin/connectors/pos
```

Admin keys must not be shipped to POS, storefront, mobile, or browser clients.

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
