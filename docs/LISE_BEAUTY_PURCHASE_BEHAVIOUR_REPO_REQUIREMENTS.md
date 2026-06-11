# LISE Beauty Purchase Behaviour Repo Requirements

Source: `C:\Users\Jeremy Tan\Downloads\CRM Loyalty Requirements_WIP.xlsx - Purchase Behaviour.csv`

This document turns the LISE Beauty purchase-behaviour worksheet into repo-level implementation requirements across Headless CRM, SKUMS, POS, and Headless Loyalty.

Use this as an example merchant brief, not as the platform contract. The business-agnostic upgrade path is in `docs/BUSINESS_AGNOSTIC_4_REPO_UPGRADE_PATH.md`.

The worksheet is a requirements dictionary, not data to import. The implementation should capture raw facts once, preserve source-system boundaries, and expose agent-friendly read models that business users can access through CRM, Airtable-like grids, Slack questions, and future agent workflows.

## Source Fields

| Field | Priority | Sensitivity | Primary use |
| --- | --- | --- | --- |
| Order / transaction history | Must collect | PDPA sensitive | CRM record, loyalty calculation, analytics, recommendations |
| Last visit date | Must collect | Standard derived | Re-engagement and lapsed-customer flags |
| Visit frequency | Must collect | Standard derived | Pre/post loyalty programme measurement |
| Favourite / repeat SKUs | Good to have | Standard derived | Restock, upsell, personal selling prompts |
| Average basket size | Must collect | Standard derived | VIP and campaign targeting |
| Spend by product category | Good to have | Standard derived | Category preference and buying decisions |
| Lifetime spend | Must collect | Standard derived | VIP and tier evaluation |
| Sale-only buyer flag | Good to have | Standard derived | Price-sensitive segmentation |
| Bundle-only buyer flag | Good to have | Standard derived | Bundle campaign targeting |
| Discount sensitivity score | Good to have | Standard derived | Promotion responsiveness scoring |
| App browsing history | Must collect | PDPA sensitive | Purchase-intent and store-associate prompts |
| Wishlist / saved items | Must collect | Standard customer intent | Back-in-stock alerts and demand planning |

## Ownership Rule

Raw transactional facts should stay with the system that generated them. CRM owns the customer-facing memory and query surface.

| Data class | System of record | Query projection |
| --- | --- | --- |
| Sale, return, exchange facts | POS | CRM purchase profile, Loyalty ledger |
| Points earned, redeemed, reversed | Headless Loyalty | CRM loyalty summary |
| Product identity, category, trade unit, listing, bundle, campaign context | SKUMS | CRM product/category affinities |
| Customer identity, consent, profile, segments, notes | Headless CRM | CRM person graph |
| App browsing and wishlist intent | Headless CRM, enriched by SKUMS product refs | CRM intent profile |

## Headless CRM Repo Requirements

CRM should become the customer memory and business-user query layer. It should not calculate loyalty economics directly.

### Data Model

Add customer purchase read models:

```text
crm_customer_purchase_profiles
  id
  workspace_id
  person_id
  first_purchase_at
  last_visit_at
  days_since_last_visit
  visits_30d
  visits_90d
  visits_lifetime
  average_basket_minor
  lifetime_spend_minor
  returned_spend_minor
  currency
  sale_only_buyer
  bundle_only_buyer
  discount_sensitivity_score
  computed_at
  provenance
```

```text
crm_customer_sku_affinities
  id
  workspace_id
  person_id
  skums_product_identity_id
  skums_trade_unit_id
  sku
  product_name_snapshot
  purchase_count
  quantity_sum
  spend_minor
  last_purchased_at
  rank
  computed_at
```

```text
crm_customer_category_spend
  id
  workspace_id
  person_id
  skums_category_id
  category_name_snapshot
  spend_minor
  quantity_sum
  purchase_count
  share_of_customer_spend
  computed_at
```

```text
crm_customer_intent_events
  id
  workspace_id
  person_id
  event_type
  channel
  skums_product_identity_id
  skums_trade_unit_id
  sku
  occurred_at
  time_spent_seconds
  source_event_id
  consent_basis
  metadata
```

```text
crm_customer_wishlist_items
  id
  workspace_id
  person_id
  skums_product_identity_id
  skums_trade_unit_id
  sku
  saved_at
  removed_at
  source
  metadata
```

### REST API

```text
GET  /api/v1/people/{person_id}/purchase-behaviour
GET  /api/v1/people/{person_id}/intent-signals
GET  /api/v1/people/{person_id}/wishlist-items
POST /api/v1/intent-events
POST /api/v1/wishlist-items
DELETE /api/v1/wishlist-items/{wishlist_item_id}
GET  /api/v1/segments/candidates
POST /api/v1/segments/from-query
```

`GET /purchase-behaviour` should return a single business-friendly customer profile:

```json
{
  "person_id": "person_123",
  "last_visit_at": "2026-06-10T09:15:00Z",
  "days_since_last_visit": 1,
  "visit_frequency": {
    "visits_30d": 2,
    "visits_90d": 6,
    "visits_lifetime": 18
  },
  "spend": {
    "average_basket_minor": 12800,
    "lifetime_spend_minor": 184000,
    "currency": "SGD"
  },
  "patterns": {
    "sale_only_buyer": false,
    "bundle_only_buyer": true,
    "discount_sensitivity_score": 0.72
  },
  "favourite_skus": [],
  "category_spend": [],
  "computed_at": "2026-06-11T04:00:00Z",
  "provenance": []
}
```

### GraphQL API

CRM GraphQL should be the main business-user graph.

```graphql
type Person {
  id: ID!
  displayName: String
  mobilePhoneMasked: String
  loyalty: LoyaltySummary
  purchaseBehaviour: PurchaseBehaviourProfile
  intentSignals(first: Int = 20): IntentEventConnection!
  wishlistItems(first: Int = 20): WishlistItemConnection!
}

type PurchaseBehaviourProfile {
  lastVisitAt: DateTime
  daysSinceLastVisit: Int
  visits30d: Int!
  visits90d: Int!
  visitsLifetime: Int!
  averageBasketMinor: Int!
  lifetimeSpendMinor: Int!
  currency: String!
  saleOnlyBuyer: Boolean!
  bundleOnlyBuyer: Boolean!
  discountSensitivityScore: Float!
  favouriteSkus(limit: Int = 5): [SkuAffinity!]!
  spendByCategory: [CategorySpend!]!
  computedAt: DateTime!
  provenance: [SourceRef!]!
}

type SkuAffinity {
  sku: String!
  productIdentityId: ID
  tradeUnitId: ID
  productName: String
  purchaseCount: Int!
  quantitySum: Int!
  spendMinor: Int!
  lastPurchasedAt: DateTime
  rank: Int!
}

type CategorySpend {
  categoryId: ID
  categoryName: String!
  spendMinor: Int!
  purchaseCount: Int!
  shareOfCustomerSpend: Float!
}
```

Example:

```graphql
query LapsedSerumCustomers {
  people(
    filter: {
      daysSinceLastVisit: { gte: 60 }
      favouriteCategoryName: { eq: "Serum" }
      discountSensitivityScore: { gte: 0.6 }
    }
  ) {
    nodes {
      id
      displayName
      purchaseBehaviour {
        lastVisitAt
        averageBasketMinor
        favouriteSkus {
          sku
          productName
          purchaseCount
        }
      }
    }
  }
}
```

### Jobs And Projections

- Consume POS sale/return events and Loyalty events.
- Resolve product/category context through SKUMS.
- Recompute customer purchase profile after every sale/return and on nightly backfill.
- Store provenance so agents can explain why a customer is in a segment.
- Mask or hash phone/email fields in query results unless the actor has contact permission.

### Done When

- CRM can show last visit, average basket, lifetime spend, favourite SKUs, category spend, and pattern flags on a customer record.
- CRM GraphQL can answer lapsed, VIP, category-preference, and discount-sensitivity queries.
- Segment creation can use purchase-behaviour filters without manual CSV work.

## SKUMS Repo Requirements

SKUMS should provide product, category, bundle, promotion, listing, and sellability context. It should not store customer behaviour.

### Data Model

Confirm or add:

```text
product_identities
trade_units
sku_assignments
product_categories
product_category_edges
bundles
bundle_components
promotion_events
promotion_event_items
channel_listings
channel_capabilities
```

Add or expose customer-safe product references:

```text
skums_product_ref
  product_identity_id
  trade_unit_id
  sku
  display_name
  category_ids
  category_names
  sellable_channels
  active_promotion_ids
  bundle_ids
```

### REST API

```text
POST /api/v1/product-refs/resolve
GET  /api/v1/products/{product_identity_id}/commerce-context
GET  /api/v1/trade-units/{trade_unit_id}/commerce-context
GET  /api/v1/categories
GET  /api/v1/promotions/active
GET  /api/v1/bundles/{bundle_id}
```

`POST /product-refs/resolve` should accept POS line refs in batches:

```json
{
  "refs": [
    {
      "sku": "SERUM-30ML",
      "trade_unit_id": "trade_unit_123",
      "listing_id": "listing_123"
    }
  ],
  "context": {
    "channel": "pos",
    "country": "SG"
  }
}
```

Return:

```json
{
  "results": [
    {
      "sku": "SERUM-30ML",
      "product_identity_id": "prod_123",
      "trade_unit_id": "trade_unit_123",
      "display_name": "Vitamin C Serum 30ml",
      "categories": [
        { "id": "cat_serum", "name": "Serum" }
      ],
      "promotion_context": {
        "active_promotion_ids": ["promo_123"],
        "bundle_ids": []
      }
    }
  ]
}
```

### GraphQL API

```graphql
type ProductIdentity {
  id: ID!
  canonicalName: String!
  categories: [ProductCategory!]!
  tradeUnits: [TradeUnit!]!
}

type TradeUnit {
  id: ID!
  sku: String
  displayName: String!
  categories: [ProductCategory!]!
  activePromotions(channel: Channel, country: String): [PromotionEvent!]!
  bundles: [Bundle!]!
  sellability(channel: Channel!, country: String): Sellability!
}

type ProductCategory {
  id: ID!
  name: String!
  parent: ProductCategory
}
```

### Done When

- POS and CRM can resolve every sale line to product identity, trade unit, SKU, and category.
- CRM can derive category spend without maintaining its own product taxonomy.
- Bundle-only and sale-only buyer flags can be computed from SKUMS promotion/bundle context.

## POS Repo Requirements

POS should capture checkout facts reliably and emit them once with idempotency. It should not compute customer loyalty segments or product taxonomy.

### Data Model

Confirm or add:

```text
pos_sales
pos_sale_lines
pos_returns
pos_return_lines
pos_customers
pos_sale_discounts
pos_sale_tenders
pos_outbox_events
```

Sale lines need enough detail for CRM, Loyalty, and SKUMS:

```text
line_id
sku
skums_product_identity_id
skums_trade_unit_id
skums_listing_id
quantity
unit_price_minor
discount_total_minor
tax_total_minor
line_total_minor
bundle_id
promotion_event_id
returned_quantity
```

### API And Events

POS should emit:

```text
pos.customer.attached
pos.sale.preview_requested
pos.sale.completed
pos.return.completed
pos.reward.redeem_requested
pos.reward.refund_requested
receipt.email.requested
```

Sale event shape:

```json
{
  "event_id": "pos_evt_123",
  "event_type": "pos.sale.completed",
  "member_key": "crm:person_123",
  "channel": "pos",
  "currency": "SGD",
  "location_id": "store_001",
  "register_id": "register_01",
  "payload": {
    "transaction_id": "txn_123",
    "occurred_at": "2026-06-11T04:00:00Z",
    "customer": {
      "crm_person_id": "person_123",
      "mobile_hash": "sha256:..."
    },
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

### UI Requirements

- Capture customer identity at checkout through mobile number and resolve it to CRM person ID.
- Show loyalty session data from Headless Loyalty.
- Show "usual products", "wishlisted products", and "recently browsed" prompts from CRM, not from local POS tables.
- Support offline retry using idempotency keys.

### Done When

- Every completed sale and return creates an outbox event.
- Retry cannot double-award points or double-count spend.
- POS can request CRM customer prompts at checkout without knowing how the CRM computed them.

## Headless Loyalty Repo Requirements

Loyalty owns points, rewards, tiers, redemption, refund, and reversal economics. It should expose purchase facts as events, but CRM owns long-term behavioural read models.

### Data Model Additions

The existing schema already has the core ledger and event tables. Add explicit commerce summary support if CRM needs loyalty-side proof:

```text
loyalty_sale_links
  id
  program_id
  member_id
  external_sale_id
  source
  channel
  currency
  sale_total_minor
  discount_total_minor
  points_earned
  points_redeemed
  occurred_at
```

```text
loyalty_reward_usage_facts
  id
  program_id
  member_id
  claimed_reward_id
  reward_id
  reward_kind
  external_sale_id
  points_cost
  discount_minor
  status
  occurred_at
```

### API Additions

Keep current endpoints:

```text
POST /api/v1/{program_id}/earn/preview
POST /api/v1/{program_id}/earn/commit
POST /api/v1/{program_id}/earn/reverse
POST /api/v1/{program_id}/rewards/{reward_kind}/redeem
POST /api/v1/{program_id}/rewards/{reward_kind}/refund
POST /api/v1/{program_id}/events
```

Add internal analytics-safe endpoints:

```text
GET /api/v1/{program_id}/members/{member_key}/commerce-summary
GET /api/v1/admin/members/{member_id}/ledger
GET /api/v1/admin/members/{member_id}/reward-usage
```

### Outgoing Events To CRM

```text
loyalty.member.enrolled
loyalty.member.updated
loyalty.points.earned
loyalty.points.reversed
loyalty.reward.claimed
loyalty.reward.redeemed
loyalty.reward.expired
loyalty.tier.upgraded
loyalty.tier.downgraded
```

### Done When

- Loyalty can replay all point and reward economics from append-only rows.
- CRM can display loyalty summary fields without owning reward economics.
- Returns reverse points safely and emit CRM-visible events.

## App / Storefront Repo Requirements

If LISE Beauty has an app or storefront repo, it should own browsing and wishlist capture. It should not own product taxonomy or customer segmentation.

### Events

```text
app.product.viewed
app.product.saved
app.product.unsaved
app.search.performed
app.category.viewed
```

Intent event shape:

```json
{
  "event_id": "app_evt_123",
  "person_key": "crm:person_123",
  "channel": "mobile",
  "event_type": "app.product.viewed",
  "occurred_at": "2026-06-11T04:00:00Z",
  "payload": {
    "sku": "SERUM-30ML",
    "skums_product_identity_id": "prod_123",
    "skums_trade_unit_id": "trade_unit_123",
    "time_spent_seconds": 42
  }
}
```

### Done When

- Browsing and wishlist facts arrive in CRM with consent basis and product refs.
- Store associates can see "browsed 3x this week" and "wishlisted" prompts from CRM.

## Agent And Business User Access Requirements

Agents and non-technical interfaces should use a semantic protocol, not raw SQL and not service-specific private APIs.

### Semantic API

Add this to CRM or a dedicated agent gateway:

```text
GET  /api/v1/semantic/metrics
GET  /api/v1/semantic/entities
POST /api/v1/semantic/query
POST /api/v1/semantic/saved-views
POST /api/v1/agent/proposals
POST /api/v1/agent/proposals/{proposal_id}/approve
POST /api/v1/agent/proposals/{proposal_id}/reject
```

Example semantic query:

```json
{
  "entity": "customer",
  "select": [
    "display_name",
    "last_visit_at",
    "days_since_last_visit",
    "favourite_skus",
    "discount_sensitivity_score"
  ],
  "where": [
    { "metric": "days_since_last_visit", "op": ">=", "value": 60 },
    { "metric": "favourite_category", "op": "=", "value": "Serum" }
  ],
  "order_by": [{ "metric": "lifetime_spend_minor", "direction": "desc" }],
  "limit": 100,
  "explain": true
}
```

Response should include rows and explanations:

```json
{
  "rows": [],
  "explanation": {
    "query_plan": "Filtered CRM purchase profiles, joined SKU affinities, resolved categories from SKUMS.",
    "metrics_used": ["days_since_last_visit", "favourite_category", "lifetime_spend_minor"],
    "freshness": "computed_at <= 24h"
  },
  "allowed_actions": ["create_segment", "export_view", "draft_campaign_proposal"]
}
```

### Slack Experience

Slack should be an agent client over the semantic API.

Example questions:

```text
Which customers have not visited in 60 days and usually buy serums?
Show high lifetime spend customers who only buy during promos.
Create a draft segment for bundle-only buyers, but do not send anything.
```

Slack should return:

- A short answer.
- A table preview.
- A link to the saved CRM view.
- A proposed action requiring approval for campaigns, rewards, or bulk data changes.

### Airtable-Like Grid Experience

Expose saved semantic views as grid resources:

```text
GET /api/v1/views/{view_id}/rows
GET /api/v1/views/{view_id}/schema
POST /api/v1/views/{view_id}/comments
POST /api/v1/views/{view_id}/approval-decisions
```

Suggested default views:

- Lapsed customers, 60 days.
- Lapsed customers, 90 days.
- VIP customers by lifetime spend.
- High discount sensitivity customers.
- Bundle-only buyers.
- Most wishlisted products.
- Customers with repeated views but no purchase.

### CLI

The CLI should wrap the same semantic API:

```bash
lise metrics list
lise customers query --where "days_since_last_visit >= 60 and favourite_category = Serum"
lise views create "Lapsed serum buyers" --from-query last
lise proposals create winback-campaign --view "Lapsed serum buyers"
lise proposals approve proposal_123
```

### Agent Guardrails

- Agents can read, summarize, explain, and propose.
- Agents cannot directly mutate points, rewards, tiers, customer consent, or campaign sends.
- Any campaign, reward, bulk segment sync, or data repair requires approval.
- Every answer should carry source provenance and freshness.
- Sensitive fields must respect CRM consent/contactability and role-based access.

## Cross-Repo Event Contracts

Use these canonical event names:

```text
pos.sale.completed
pos.return.completed
loyalty.points.earned
loyalty.points.reversed
loyalty.reward.claimed
skums.trade_unit.updated
skums.listing.updated
crm.intent.product_viewed
crm.intent.product_saved
crm.segment.created
agent.proposal.created
```

Every event should include:

```text
event_id
event_type
workspace_id
occurred_at
source_system
idempotency_key
actor
payload
```

## Build Order

1. POS: emit reliable sale and return outbox events with SKUMS refs and idempotency.
2. Loyalty: consume sale/return events, write ledger entries, emit loyalty summary events.
3. SKUMS: expose product-ref batch resolution and category/promotion/bundle context.
4. CRM: build purchase profiles, SKU affinities, category spend, intent events, wishlist items, and segment queries.
5. CRM GraphQL: expose `Person.purchaseBehaviour`, intent, wishlist, and segment candidate queries.
6. Agent gateway: add semantic metrics/query protocol and proposal workflow.
7. Slack/Airtable/CLI: build thin clients over saved views and semantic queries.

## Non-Negotiables

- No manual staff entry for POS transaction fields.
- No double counting: every write path needs idempotency.
- No direct agent writes to loyalty economics.
- No duplicated product taxonomy in CRM.
- No admin keys in POS, app, Slack, or Airtable clients.
- PDPA-sensitive browsing and order history need consent basis, role checks, audit logs, and field masking.
- CRM should be the business-facing customer memory, but raw sale/return/economic/product facts stay with POS, Loyalty, and SKUMS.
