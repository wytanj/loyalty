create table if not exists loyalty_sale_links (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  external_sale_id text not null,
  source text not null,
  channel text not null check (channel in ('web','pos','mobile','marketplace','social','agent','partner')),
  currency text not null,
  sale_total_minor integer not null default 0,
  discount_total_minor integer not null default 0,
  points_earned integer not null default 0,
  points_redeemed integer not null default 0,
  occurred_at timestamptz not null,
  reversed_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, member_id, source, external_sale_id)
);

create index if not exists loyalty_sale_links_program_member_occurred_idx
  on loyalty_sale_links(program_id, member_id, occurred_at desc);

create index if not exists loyalty_sale_links_external_sale_idx
  on loyalty_sale_links(program_id, source, external_sale_id);

create table if not exists loyalty_reward_usage_facts (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  claimed_reward_id uuid not null references loyalty_claimed_rewards(id) on delete cascade,
  reward_id uuid references loyalty_rewards(id) on delete set null,
  reward_kind text not null,
  external_sale_id text,
  source text not null,
  channel text not null check (channel in ('web','pos','mobile','marketplace','social','agent','partner')),
  currency text,
  points_cost integer not null default 0,
  discount_minor integer not null default 0,
  status text not null check (status in ('issued','redeemed','refunded','voided')),
  occurred_at timestamptz not null,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, claimed_reward_id)
);

create index if not exists loyalty_reward_usage_program_member_occurred_idx
  on loyalty_reward_usage_facts(program_id, member_id, occurred_at desc);

create index if not exists loyalty_reward_usage_external_sale_idx
  on loyalty_reward_usage_facts(program_id, source, external_sale_id)
  where external_sale_id is not null;

alter table loyalty_sale_links enable row level security;
alter table loyalty_reward_usage_facts enable row level security;
