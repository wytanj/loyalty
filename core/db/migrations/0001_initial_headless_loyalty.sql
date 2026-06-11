create extension if not exists pgcrypto;

create table if not exists loyalty_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_programs (
  id text primary key,
  workspace_id uuid references loyalty_workspaces(id) on delete cascade,
  name text not null,
  default_currency text not null default 'SGD',
  supported_channels text[] not null default array['web','pos','mobile'],
  supported_countries text[] not null default array['SG'],
  supported_languages text[] not null default array['en'],
  points_name text not null default 'points',
  earn_rate jsonb not null default '{"points_per_currency_unit":1,"currency_unit_minor":100}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_sites (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  external_key text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(program_id, external_key)
);

create table if not exists loyalty_channels (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  channel text not null check (channel in ('web','pos','mobile','marketplace','social','agent')),
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(program_id, channel)
);

create table if not exists loyalty_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references loyalty_workspaces(id) on delete cascade,
  program_id text references loyalty_programs(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  scopes text[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists loyalty_members (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  state text not null default 'active' check (state in ('active','blocked','closed')),
  points_balance integer not null default 0,
  pending_points integer not null default 0,
  lifetime_points integer not null default 0,
  tier text not null default 'Bronze',
  tier_progress numeric(8,4) not null default 0,
  joined_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  reward_count integer not null default 0,
  referral_code text not null,
  birthday date,
  consents jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique(program_id, referral_code)
);

create table if not exists loyalty_member_identities (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  kind text not null,
  value text not null,
  normalized_hash text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(program_id, kind, value)
);

create table if not exists loyalty_member_segments (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  segment_key text not null,
  source text not null default 'loyalty',
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(program_id, member_id, segment_key)
);

create table if not exists loyalty_member_consents (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  consent_type text not null,
  consented boolean not null,
  source text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists loyalty_point_accounts (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  currency text not null default 'points',
  balance integer not null default 0,
  pending_balance integer not null default 0,
  lifetime_earned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, member_id, currency)
);

create table if not exists loyalty_point_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  point_account_id uuid references loyalty_point_accounts(id) on delete set null,
  points integer not null,
  kind text not null check (kind in ('earn','reverse','reward_redeem','reward_refund','rule_complete','admin_adjust','expire')),
  source_type text not null,
  source_id text not null,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists loyalty_point_ledger_program_member_idx
  on loyalty_point_ledger_entries(program_id, member_id, occurred_at desc);

create unique index if not exists loyalty_point_ledger_idempotency_idx
  on loyalty_point_ledger_entries(program_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists loyalty_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  point_account_id uuid references loyalty_point_accounts(id) on delete cascade,
  points_balance integer not null,
  pending_points integer not null,
  lifetime_points integer not null,
  computed_at timestamptz not null default now()
);

create table if not exists loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  name text not null,
  min_lifetime_points integer not null,
  benefits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, name)
);

create table if not exists loyalty_tier_snapshots (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  tier_id uuid references loyalty_tiers(id) on delete set null,
  tier_name text not null,
  progress numeric(8,4) not null,
  computed_at timestamptz not null default now()
);

create table if not exists loyalty_tier_rules (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  tier_id uuid not null references loyalty_tiers(id) on delete cascade,
  rule jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  kind text not null,
  name text not null,
  reward_points integer not null default 0,
  channels text[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_rule_completions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  rule_id uuid references loyalty_rules(id) on delete set null,
  rule_kind text not null,
  completed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(program_id, member_id, rule_kind)
);

create table if not exists loyalty_earning_policies (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  name text not null,
  policy jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  kind text not null,
  name text not null,
  cost_points integer not null default 0,
  value jsonb not null default '{}'::jsonb,
  channels text[] not null,
  countries text[] not null default '{}'::text[],
  active boolean not null default true,
  inventory integer,
  skums_refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_reward_variants (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  reward_id uuid not null references loyalty_rewards(id) on delete cascade,
  variant_key text not null,
  value jsonb not null default '{}'::jsonb,
  channels text[] not null default '{}'::text[],
  countries text[] not null default '{}'::text[],
  active boolean not null default true,
  unique(reward_id, variant_key)
);

create table if not exists loyalty_claimed_rewards (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  reward_id uuid references loyalty_rewards(id) on delete set null,
  kind text not null,
  status text not null default 'issued' check (status in ('issued','redeemed','refunded','voided','expired')),
  cost_points integer not null default 0,
  redemption_code_id uuid,
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists loyalty_redemption_codes (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  claimed_reward_id uuid references loyalty_claimed_rewards(id) on delete cascade,
  code_hash text not null,
  code_masked text not null,
  one_time_visible boolean not null default true,
  status text not null default 'issued',
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table loyalty_claimed_rewards
  add constraint loyalty_claimed_rewards_redemption_code_fk
  foreign key (redemption_code_id) references loyalty_redemption_codes(id) deferrable initially deferred;

create table if not exists loyalty_reward_fulfillments (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  claimed_reward_id uuid not null references loyalty_claimed_rewards(id) on delete cascade,
  provider text not null,
  status text not null default 'pending',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_events (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  member_id uuid references loyalty_members(id) on delete set null,
  member_key text,
  channel text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(program_id, event_id)
);

create table if not exists loyalty_idempotency_keys (
  program_id text not null references loyalty_programs(id) on delete cascade,
  key text not null,
  route text not null,
  payload_hash text not null,
  status_code integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key(program_id, key)
);

create table if not exists loyalty_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  url text not null,
  event_types text[] not null,
  secret_ref text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists loyalty_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  subscription_id uuid references loyalty_webhook_subscriptions(id) on delete set null,
  event_id uuid references loyalty_events(id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_connector_accounts (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  provider text not null check (provider in ('crm','skums','pos','shopify','custom')),
  base_url text not null,
  api_key_ref text,
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, provider, base_url)
);

create table if not exists loyalty_external_links (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  local_type text not null,
  local_id text not null,
  provider text not null,
  external_type text not null,
  external_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(program_id, provider, external_type, external_id)
);

create table if not exists loyalty_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  provider text not null,
  job_type text not null,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists loyalty_sync_job_steps (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references loyalty_sync_jobs(id) on delete cascade,
  step_key text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_agent_proposals (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  proposal_type text not null,
  risk text not null check (risk in ('low','medium','high')),
  affected_objects jsonb not null default '[]'::jsonb,
  proposed_steps jsonb not null default '[]'::jsonb,
  approval_required boolean not null default true,
  rollback jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists loyalty_approval_requests (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  proposal_id uuid references loyalty_agent_proposals(id) on delete cascade,
  status text not null default 'pending',
  requested_by text,
  decided_by text,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now()
);

create table if not exists loyalty_execution_logs (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  actor_type text not null,
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function prevent_loyalty_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'loyalty_point_ledger_entries is append-only';
end;
$$;

drop trigger if exists loyalty_point_ledger_entries_append_only_update on loyalty_point_ledger_entries;
create trigger loyalty_point_ledger_entries_append_only_update
before update on loyalty_point_ledger_entries
for each row execute function prevent_loyalty_ledger_mutation();

drop trigger if exists loyalty_point_ledger_entries_append_only_delete on loyalty_point_ledger_entries;
create trigger loyalty_point_ledger_entries_append_only_delete
before delete on loyalty_point_ledger_entries
for each row execute function prevent_loyalty_ledger_mutation();

alter table loyalty_workspaces enable row level security;
alter table loyalty_programs enable row level security;
alter table loyalty_members enable row level security;
alter table loyalty_point_ledger_entries enable row level security;
alter table loyalty_events enable row level security;
