# SKUMS Connector

SKUMS remains the product, channel, and commerce operating core. Loyalty asks SKUMS what was sold, where it was listed, and whether a product reward can be fulfilled.

## Loyalty Depends On

```text
GET  /api/v1/pos/catalog
POST /api/v1/pos/sales
POST /api/v1/pos/inventory-events
GET  /api/v1/events
POST /api/v1/events
POST /api/v1/attention-items
POST /api/v1/agent-proposals
```

## Incoming Event Types

```text
skums.product_identity.updated
skums.trade_unit.updated
skums.listing.updated
skums.channel_requirement.changed
skums.promotion_event.created
skums.pos_sale.completed
skums.pos_return.completed
skums.inventory_event.created
```

## Outgoing Event Types

```text
loyalty.reward.fulfillment_requested
loyalty.product_reward.reservation_requested
loyalty.cart_adjustment.authorized
loyalty.pos_discount.authorized
loyalty.inventory_hold.requested
loyalty.reward.fulfillment_cancelled
```

## Product Reward Contract

Product rewards can reference:

```text
product_identity_id
trade_unit_id
listing_id
sku_assignment_id
```

Before issuing a product reward, Loyalty should ask SKUMS if the target is sellable in the requested `channel`, `country`, and optional `listing_id`. If fulfillment fails, Loyalty should create a SKUMS attention item instead of silently falling back.
