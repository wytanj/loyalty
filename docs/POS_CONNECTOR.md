# POS Connector

POS remains the sales execution surface. POS sends facts and receives loyalty decisions.

## POS Environment

```text
VITE_LOYALTY_API_URL=https://...
VITE_LOYALTY_API_KEY=...
VITE_LOYALTY_PROGRAM_ID=...
```

Use a low-privilege POS key with:

```text
loyalty:configuration:read
loyalty:members:read
loyalty:members:write
loyalty:events:write
loyalty:rewards:redeem
```

Do not use an admin key in POS.

## Checkout Flow

1. Identify the customer by CRM person ID, phone, email hash, POS customer ID, or ecommerce customer ID.
2. Call `POST /members/{member_key}/sessions` with `channel=pos` and optional cart.
3. Show wallet, tier, rules, available rewards, and earn preview.
4. Authorize reward redemption with `POST /rewards/{reward_kind}/redeem`.
5. Apply the returned discount, product, gift, or custom fulfillment instruction.
6. Commit the sale with `POST /earn/commit` or emit `pos.sale.completed`.
7. Reverse safely with `POST /earn/reverse` or emit `pos.return.completed`.

## Idempotency

Recommended keys:

```text
pos sale:   pos:{location_id}:{transaction_id}
pos return: pos_return:{location_id}:{return_id}
redemption: pos_redeem:{location_id}:{transaction_id}:{reward_id}
```

POS offline retry should replay the exact same payload and idempotency key.
