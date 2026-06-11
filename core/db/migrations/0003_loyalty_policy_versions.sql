create table if not exists loyalty_program_policy_versions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references loyalty_programs(id) on delete cascade,
  version integer not null,
  version_label text,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  name text not null,
  description text,
  policy jsonb not null,
  change_reason text not null,
  created_by text,
  effective_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, version)
);

create index if not exists loyalty_policy_versions_program_status_idx
  on loyalty_program_policy_versions(program_id, status, version desc);

create index if not exists loyalty_policy_versions_effective_idx
  on loyalty_program_policy_versions(program_id, effective_at desc)
  where status = 'active';

alter table loyalty_programs
  add column if not exists active_policy_version_id uuid references loyalty_program_policy_versions(id) on delete set null;

alter table loyalty_program_policy_versions enable row level security;
