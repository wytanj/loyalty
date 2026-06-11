import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, "../core/db/migrations/0001_initial_headless_loyalty.sql"),
  "utf8"
);
const commerceFactsMigration = readFileSync(
  resolve(__dirname, "../core/db/migrations/0002_loyalty_commerce_facts.sql"),
  "utf8"
);

describe("initial migration", () => {
  it("contains the core table vocabulary from the brief", () => {
    [
      "loyalty_workspaces",
      "loyalty_programs",
      "loyalty_sites",
      "loyalty_channels",
      "loyalty_api_keys",
      "loyalty_members",
      "loyalty_member_identities",
      "loyalty_member_segments",
      "loyalty_member_consents",
      "loyalty_point_accounts",
      "loyalty_point_ledger_entries",
      "loyalty_balance_snapshots",
      "loyalty_tiers",
      "loyalty_tier_snapshots",
      "loyalty_tier_rules",
      "loyalty_rules",
      "loyalty_rule_completions",
      "loyalty_earning_policies",
      "loyalty_rewards",
      "loyalty_reward_variants",
      "loyalty_claimed_rewards",
      "loyalty_redemption_codes",
      "loyalty_reward_fulfillments",
      "loyalty_events",
      "loyalty_idempotency_keys",
      "loyalty_webhook_subscriptions",
      "loyalty_webhook_deliveries",
      "loyalty_connector_accounts",
      "loyalty_external_links",
      "loyalty_sync_jobs",
      "loyalty_sync_job_steps",
      "loyalty_agent_proposals",
      "loyalty_approval_requests",
      "loyalty_execution_logs"
    ].forEach((tableName) => {
      expect(migration).toContain(`create table if not exists ${tableName}`);
    });
  });

  it("protects point ledger rows from update and delete", () => {
    expect(migration).toContain("prevent_loyalty_ledger_mutation");
    expect(migration).toContain("before update on loyalty_point_ledger_entries");
    expect(migration).toContain("before delete on loyalty_point_ledger_entries");
  });

  it("models idempotency separately from ledger rows", () => {
    expect(migration).toContain("primary key(program_id, key)");
    expect(migration).toContain("payload_hash text not null");
    expect(migration).toContain("response_body jsonb not null");
  });

  it("adds commerce fact read models without replacing the ledger", () => {
    expect(commerceFactsMigration).toContain("create table if not exists loyalty_sale_links");
    expect(commerceFactsMigration).toContain("create table if not exists loyalty_reward_usage_facts");
    expect(commerceFactsMigration).toContain("unique(program_id, member_id, source, external_sale_id)");
    expect(commerceFactsMigration).toContain("unique(program_id, claimed_reward_id)");
    expect(commerceFactsMigration).toContain("'web','pos','mobile','marketplace','social','agent','partner'");
    expect(commerceFactsMigration).toContain("alter table loyalty_sale_links enable row level security");
  });
});
