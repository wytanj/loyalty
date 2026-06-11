# Headless Loyalty

Server-only loyalty engine for POS, CRM, SKUMS, storefront, marketplace, mobile, social, and agent channels.

This repo intentionally has no frontend. It is a Nitro API service with TypeScript contracts, a ledger-first domain model, Supabase migrations, connector boundaries, and contract tests.

## Local Development

```bash
npm install
npm run dev
```

Seeded development credentials:

```text
Program ID: demo
Public/POS API key: dev_pos_key
Admin API key: dev_admin_key
```

Example:

```bash
curl "http://localhost:3000/api/v1/demo/configuration?channel=pos" \
  -H "Authorization: Bearer dev_pos_key"
```

## Verification

```bash
npm run test
npm run typecheck
npm run build
```

## Project Shape

```text
server/api/v1              Headless, admin, and webhook routes
server/utils               Contracts, auth, idempotency, services, adapters
core/db/migrations         Supabase/Postgres schema
packages/@loyalty-types    Shared TypeScript exports for sibling repos
docs                       API, data model, and connector contracts
tests                      Contract and ledger behavior tests
```

The default `LOYALTY_STORAGE_DRIVER=memory` keeps local development independent from live CRM, SKUMS, POS, or Supabase credentials. Production should use the Supabase schema in `core/db/migrations`.
