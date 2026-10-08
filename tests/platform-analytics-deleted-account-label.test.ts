import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261008230000_dm3oi_deleted_analytics_account_label.sql",
  "utf8",
);

const component = readFileSync(
  "components/platform/authenticated-access-analytics.tsx",
  "utf8",
);

test("deleted historical analytics identities use the explicit Deleted Account label", () => {
  assert.match(
    migration,
    /'user',\s*coalesce\([\s\S]*'Deleted Account'/,
  );
  assert.doesNotMatch(
    migration,
    /Unavailable account/,
  );
});

test("deleted analytics identities retain their stable account identifier", () => {
  assert.match(
    migration,
    /'accountIdentifier',\s*coalesce\([\s\S]*'Account '\s*\|\|\s*left\(rollup\.analytics_user_key::text,\s*8\)/,
  );
});

test("analytics history remains joined by retained analytics UUID without fabrication", () => {
  assert.match(
    migration,
    /left join public\.profiles profile[\s\S]*profile\.id\s*=\s*rollup\.analytics_user_key/,
  );
  assert.match(
    migration,
    /'identityKey',\s*rollup\.analytics_user_key/,
  );
});

test("SUPER_ADMIN analytics authorization and execution boundary remain intact", () => {
  assert.match(
    migration,
    /actor uuid := auth\.uid\(\)/,
  );
  assert.match(
    migration,
    /not public\.is_super_admin\(actor\)/,
  );
  assert.match(
    migration,
    /revoke all[\s\S]*from public,\s*anon,\s*authenticated;/,
  );
  assert.match(
    migration,
    /grant execute[\s\S]*to authenticated;/,
  );
});

test("client fallback agrees with the authoritative Deleted Account terminology", () => {
  assert.equal(
    (component.match(/"Deleted Account"/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(
    component,
    /Unavailable account/,
  );
});
