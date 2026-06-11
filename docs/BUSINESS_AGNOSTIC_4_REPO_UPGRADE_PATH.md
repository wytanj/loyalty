# Business-Agnostic Four-Repo Upgrade Path

This is the platform upgrade path for Headless CRM, SKUMS, POS, and Headless Loyalty.

LISE Beauty purchase behaviour is a useful example, but it must not become the platform contract. The durable platform should support any business that has customers, transactions, products or services, channels, benefits, and business-user workflows.

## Design Principle

Separate facts, projections, semantics, and actions.

```text
facts        Raw events from source systems
projections  Computed read models for workflows and analytics
semantics    Business-friendly metric/entity vocabulary
actions      Proposed or approved mutations with audit trails
```

Each repo should own one layer of truth:

| Repo | Owns | Does not own |
| --- | --- | --- |
| POS | Checkout, sale, return, tender, cashier facts | Customer intelligence, product taxonomy, loyalty economics |
| SKUMS | Product/service identity, units, listings, channels, categories, bundles, offer context | Customer behaviour and loyalty balances |
| Loyalty | Points, rewards, tiers, redemptions, reversals, reward economics | CRM profiles and campaign delivery |
| CRM | Customer graph, consent, customer memory, segments, semantic query layer | POS execution, product master, loyalty ledger |

## Core Abstractions

Use generic abstractions and let each business configure vocabulary on top.

| Generic abstraction | Examples by business |
| --- | --- |
| Customer / account / household / company | Shopper, patient, merchant, corporate buyer |
| Transaction | Sale, booking, subscription invoice, service order |
| Line item | SKU, trade unit, service package, subscription plan |
| Offering | Product, service, bundle, membership, add-on |
| Channel | POS, web, mobile, marketplace, social, agent, partner |
| Benefit | Points, voucher, discount, free product, store credit, access |
| Intent event | Product view, saved item, quote request, consultation booking |
| Segment | Lapsed customers, high value, price sensitive, category loyal |
| Proposal | Campaign, reward, data repair, fulfillment action |

Do not hardcode business-specific labels such as `serum`, `cleanser`, or `beauty`. These belong in taxonomy, saved views, prompt packs, and workspace configuration.

## Cross-Repo Contract

Every write contract should include:

```text
event_id
event_type
workspace_id
source_system
occurred_at
idempotency_key
actor
subject
context
payload
schema_version
```

Recommended context shape:

```json
{
  "channel": "pos",
  "country": "SG",
  "currency": "SGD",
  "location_id": "store_001",
  "register_id": "register_01",
  "listing_id": "listing_123"
}
```

Recommended subject shape:

```json
{
  "customer_key": "crm:person_123",
  "external_customer_refs": [
    { "system": "pos", "id": "cust_123" }
  ]
}
```

## Phase 1: Source Events And Idempotency

Goal: all repos can exchange facts safely without double counting.

### POS

Add or confirm:

```text
pos_sales
pos_sale_lines
pos_returns
pos_return_lines
pos_outbox_events
```

Required events:

```text
pos.customer.attached
pos.sale.completed
pos.return.completed
pos.reward.redeem_requested
pos.reward.refund_requested
```

Requirements:

- Use an outbox pattern for sale and return events.
- Use stable idempotency keys such as `pos:{location_id}:{transaction_id}`.
- Include product/service refs but do not require POS to understand the master taxonomy.
- Support offline retry without duplicate event effects.

### SKUMS

Add or confirm:

```text
product_identities
trade_units
service_units
sku_assignments
category_taxonomies
category_edges
channel_listings
offer_rules
promotion_events
bundle_definitions
```

Required APIs:

```text
POST /api/v1/refs/resolve
GET  /api/v1/offerings/{offering_id}/context
GET  /api/v1/categories
GET  /api/v1/channel-capabilities
```

Requirements:

- Resolve external refs in batches.
- Keep pagination bounded for catalog-style endpoints.
- Return `has_more` and `next_offset` or cursor fields.
- Avoid exact counts on large catalogs.

### Loyalty

Already started:

```text
loyalty_events
loyalty_point_ledger_entries
loyalty_claimed_rewards
loyalty_idempotency_keys
```

Required APIs:

```text
POST /api/v1/{program_id}/events
POST /api/v1/{program_id}/earn/commit
POST /api/v1/{program_id}/earn/reverse
POST /api/v1/{program_id}/rewards/{reward_kind}/redeem
POST /api/v1/{program_id}/rewards/{reward_kind}/refund
```

Requirements:

- Keep ledger rows append-only.
- Treat balances as projections.
- Emit CRM-facing loyalty summary events.
- Never let agents directly mutate points, tiers, or rewards without approval.

### CRM

Add or confirm:

```text
crm_events
crm_external_links
crm_customer_facts
crm_customer_profiles
crm_segment_memberships
crm_consent_records
```

Required APIs:

```text
POST /api/v1/events
GET  /api/v1/people/{person_id}
GET  /api/v1/people/{person_id}/timeline
GET  /api/v1/people/{person_id}/computed-profile
```

Requirements:

- Link external customer identities from POS, Loyalty, ecommerce, and partner channels.
- Store consent/contactability in CRM.
- Store customer-facing read models and timelines.
- Keep raw financial/economic truth in source repos.

## Phase 2: Generic Behaviour Metrics

Goal: support LISE-like requirements without making LISE-specific metrics the core.

Create a CRM-owned metric registry:

```text
crm_metric_definitions
  id
  workspace_id
  key
  display_name
  entity_type
  value_type
  source_dependencies
  calculation_kind
  calculation_config
  freshness_sla
  sensitivity_level
  enabled
```

Baseline generic metrics:

```text
last_transaction_at
days_since_last_transaction
transaction_count_30d
transaction_count_90d
transaction_count_lifetime
average_transaction_value_minor
lifetime_value_minor
return_rate
repeat_offering_refs
category_affinity
promotion_sensitivity_score
bundle_affinity_score
benefit_redemption_rate
intent_event_count_7d
saved_item_count
```

These become LISE-facing labels through workspace config:

```text
transaction -> purchase
offering -> SKU
category_affinity -> spend by product category
promotion_sensitivity_score -> discount sensitivity score
saved_item -> wishlist item
```

Do not create a metric table named after a vertical unless it is inside a vertical app or template package.

## Phase 3: Read Models And Projections

Goal: business users can query fast, stable views without scanning raw events.

CRM read models:

```text
crm_customer_activity_profiles
crm_customer_value_profiles
crm_customer_affinity_profiles
crm_customer_intent_profiles
crm_customer_segment_scores
```

Each projection should include:

```text
workspace_id
subject_id
metric_values
computed_at
input_watermark
provenance
sensitivity_level
```

Projection jobs should:

- Consume source events from POS, Loyalty, SKUMS, and app channels.
- Recompute incrementally after writes.
- Run nightly backfills.
- Preserve source event IDs for explanation.

## Phase 4: GraphQL Gateway

Goal: provide a stable graph for apps, internal tools, and agents.

CRM should expose the customer graph and delegate product/economics details to SKUMS and Loyalty.

```graphql
type Customer {
  id: ID!
  displayName: String
  consent: ConsentSummary!
  loyalty: LoyaltySummary
  activityProfile: ActivityProfile
  valueProfile: ValueProfile
  affinities: [Affinity!]!
  intentSignals(first: Int = 20): IntentSignalConnection!
  segments: [SegmentMembership!]!
}

type ActivityProfile {
  lastTransactionAt: DateTime
  daysSinceLastTransaction: Int
  transactionCount30d: Int!
  transactionCount90d: Int!
  transactionCountLifetime: Int!
}

type ValueProfile {
  averageTransactionValueMinor: Int!
  lifetimeValueMinor: Int!
  currency: String!
  returnRate: Float
}

type Affinity {
  kind: AffinityKind!
  refId: ID
  label: String!
  score: Float!
  evidenceCount: Int!
  lastSeenAt: DateTime
}

enum AffinityKind {
  OFFERING
  CATEGORY
  CHANNEL
  PROMOTION
  BUNDLE
}
```

Business-specific GraphQL aliases should be client/query-layer concerns, not schema forks.

## Phase 5: Semantic API For Agents And Non-Technical Users

Goal: Slack, Airtable-like grids, BI tools, and CLIs all use one safe protocol.

Add a semantic gateway, preferably in CRM or as a thin agent-facing service:

```text
GET  /api/v1/semantic/entities
GET  /api/v1/semantic/metrics
GET  /api/v1/semantic/actions
POST /api/v1/semantic/query
POST /api/v1/semantic/saved-views
POST /api/v1/agent/proposals
POST /api/v1/agent/proposals/{proposal_id}/approve
POST /api/v1/agent/proposals/{proposal_id}/reject
```

Semantic query shape:

```json
{
  "entity": "customer",
  "select": [
    "display_name",
    "days_since_last_transaction",
    "lifetime_value_minor",
    "category_affinity"
  ],
  "where": [
    { "metric": "days_since_last_transaction", "op": ">=", "value": 60 },
    { "metric": "promotion_sensitivity_score", "op": ">=", "value": 0.6 }
  ],
  "order_by": [
    { "metric": "lifetime_value_minor", "direction": "desc" }
  ],
  "limit": 100,
  "explain": true
}
```

Response shape:

```json
{
  "rows": [],
  "explanation": {
    "metrics_used": [],
    "source_systems": ["crm", "pos", "skums", "loyalty"],
    "freshness": "computed_at <= 24h",
    "policy_notes": []
  },
  "allowed_actions": [
    "create_saved_view",
    "create_segment",
    "draft_proposal"
  ]
}
```

Agents can:

- Read and summarize.
- Explain how a metric was computed.
- Create saved views.
- Draft proposals.

Agents cannot directly:

- Change points.
- Issue rewards.
- Modify customer consent.
- Send campaigns.
- Bulk-edit customer data.

Those actions require approval workflows and execution logs.

## Phase 6: Business Configuration And Vertical Packs

Goal: support LISE Beauty, restaurants, supplements, services, B2B distributors, and future businesses without schema forks.

Use workspace configuration:

```text
business_profile
  workspace_id
  industry
  vocabulary
  default_channels
  metric_labels
  saved_view_templates
  prompt_templates
  consent_policies
```

Example vocabulary config:

```json
{
  "transaction_label": "purchase",
  "offering_label": "SKU",
  "saved_item_label": "wishlist item",
  "category_examples": ["Cleanser", "Serum", "Moisturiser"]
}
```

This config changes labels and saved templates. It must not change the underlying platform contracts.

## Per-Repo Upgrade Checklist

### POS

- Add sale/return outbox events.
- Add idempotency and replay safety.
- Add customer identity attach flow.
- Add product/service ref fields to line items.
- Add low-privilege connector key flow.
- Add contract tests for sale, return, offline retry, and duplicate idempotency.

### SKUMS

- Add generic offering refs, not only SKU refs.
- Add batch ref resolution.
- Add category taxonomy APIs.
- Add offer/promotion/bundle context.
- Add cursor pagination for catalog endpoints.
- Add shared type exports and OpenAPI updates.

### Loyalty

- Keep ledger-first economic model.
- Add event-to-ledger processors for POS sale and return facts.
- Add reward usage facts and commerce summary reads only where useful.
- Emit CRM-friendly loyalty summary events.
- Add proposal and approval paths for any agent-initiated economic change.
- Add contract tests for idempotency, returns, reward refund, and event replay.

### CRM

- Add external identity links.
- Add consent and sensitivity-aware query policies.
- Add generic customer activity/value/affinity/intent projections.
- Add metric registry and semantic query API.
- Add GraphQL customer graph fields.
- Add saved views, segment candidates, and proposal workflows.
- Add Slack/Airtable/CLI clients only as thin clients over the semantic API.

## Cross-Repo Done Criteria

- A sale in POS can update Loyalty economics and CRM customer memory without duplicate counting.
- SKUMS product/category/promotion context enriches CRM projections without CRM duplicating taxonomy.
- CRM can answer business questions through GraphQL and semantic query APIs.
- Business-specific requirements can be added through config, metric definitions, saved views, and prompt packs.
- Agents can explain, propose, and prepare actions, but approvals guard mutations.
- No repo has LISE-specific schema, route names, or hardcoded category labels in core code.

## What LISE Beauty Should Become

LISE should be represented as:

```text
workspace config
taxonomy data
metric labels
saved view templates
prompt templates
consent policy settings
```

LISE should not become:

```text
hardcoded database tables
hardcoded GraphQL fields
hardcoded route names
hardcoded agent tools
hardcoded product categories in core code
```
