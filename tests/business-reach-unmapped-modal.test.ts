import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeBusinessReachUnmappedCustomers } from "../lib/business-reach.ts";
import { buildReportRouteHref } from "../lib/report-route-state.ts";

const migrationPath = "supabase/migrations/20261003190000_dm3oi_business_reach_unmapped_customers.sql";

test("unmapped Business Reach RPC is tenant-scoped, ACTIVE-only, and permission protected", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const functionStart = migration.indexOf("create function public.get_business_reach_unmapped_customers");
  const functionBody = migration.slice(functionStart, migration.indexOf("\n$$;", functionStart));

  assert.ok(functionStart >= 0);
  assert.match(functionBody, /security definer[\s\S]*set search_path = ''/);
  assert.match(functionBody, /actor uuid := auth\.uid\(\)/);
  assert.match(functionBody, /actor is null/);
  for (const permission of ["VIEW_REPORTS", "VIEW_CUSTOMERS"]) {
    assert.match(functionBody, new RegExp(`has_effective_organization_permission\\(target_organization_id, '${permission}'\\)`));
  }
  assert.match(functionBody, /c\.organization_id = target_organization_id/);
  assert.match(functionBody, /c\.status = 'ACTIVE'/);
  assert.match(functionBody, /g\.organization_id = c\.organization_id[\s\S]*g\.customer_id = c\.id/);
  assert.match(functionBody, /when g\.customer_id is null then 'PENDING'[\s\S]*else 'UNMAPPABLE'/);
  assert.match(functionBody, /g\.customer_id is null[\s\S]*g\.geocode_status = 'UNMAPPABLE'/);
  assert.match(migration, /revoke all on function public\.get_business_reach_unmapped_customers\(uuid\)[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.get_business_reach_unmapped_customers\(uuid\)[\s\S]*to authenticated/);
});

test("unmapped customer payload exposes only approved modal fields", () => {
  const customers = normalizeBusinessReachUnmappedCustomers([{
    customerId: "customer-1",
    customerNumber: "C-001",
    customerName: "Example Customer",
    streetAddress: "100 Main Street",
    city: "Rockville",
    state: "MD",
    postalCode: "20850",
    mappingStatus: "UNMAPPABLE",
    addressFingerprint: "private",
    latitude: 39.08,
    longitude: -77.15,
    geocode_source: "provider",
  }]);

  assert.deepEqual(customers, [{
    customerId: "customer-1",
    customerNumber: "C-001",
    customerName: "Example Customer",
    streetAddress: "100 Main Street",
    city: "Rockville",
    state: "MD",
    postalCode: "20850",
    mappingStatus: "UNMAPPABLE",
  }]);
});

test("aggregate Business Reach remains address-free and modal data stays lazy", () => {
  const aggregateMigration = readFileSync(
    "supabase/migrations/20261003180000_dm3oi_business_reach_street_geocoding.sql",
    "utf8",
  );
  const reportStart = aggregateMigration.indexOf("create or replace function public.get_business_reach");
  const aggregateFunction = aggregateMigration.slice(reportStart, aggregateMigration.indexOf("\n$$;", reportStart));
  const reportsPage = readFileSync("app/reports/page.tsx", "utf8");
  const modalContent = readFileSync("components/reports/unmapped-customer-locations.tsx", "utf8");

  assert.doesNotMatch(aggregateFunction, /customerName|customerNumber|streetAddress|postalCode/);
  assert.doesNotMatch(reportsPage, /getBusinessReachUnmappedCustomers|get_business_reach_unmapped_customers/);
  assert.match(modalContent, /await getBusinessReachUnmappedCustomers\(\)/);
});

test("unmapped KPI is interactive only for a positive count", () => {
  const dashboard = readFileSync("components/reports/reports-dashboard.tsx", "utf8");
  assert.match(dashboard, /report\.unmappedCustomers > 0 \? \([\s\S]*<Link[\s\S]*View addresses[\s\S]*\) : \([\s\S]*<strong>0<\/strong>/);
  assert.match(dashboard, /href=\{unmappedHref\}[\s\S]*scroll=\{false\}[\s\S]*prefetch=\{false\}/);
});

test("report drill-down route preserves valid report query state", () => {
  assert.equal(
    buildReportRouteHref("/reports/unmapped-customers", {
      period: "custom",
      compare: "previous",
      from: "2026-09-01",
      to: "2026-09-30",
      reach: "mapped",
    }),
    "/reports/unmapped-customers?period=custom&compare=previous&from=2026-09-01&to=2026-09-30&reach=mapped",
  );
  assert.equal(
    buildReportRouteHref("/reports", {
      period: "invalid",
      compare: "invalid",
      from: "not-a-date",
      to: "2026-10-03",
      reach: "error",
    }),
    "/reports?to=2026-10-03&reach=error",
  );

  const layout = readFileSync("app/reports/layout.tsx", "utf8");
  const interceptedRoute = readFileSync("app/reports/@modal/(.)unmapped-customers/page.tsx", "utf8");
  const directRoute = readFileSync("app/reports/unmapped-customers/page.tsx", "utf8");
  assert.match(layout, /\{children\}[\s\S]*\{modal\}/);
  assert.match(interceptedRoute, /presentation="modal"[\s\S]*buildReportRouteHref\("\/reports", state\)/);
  assert.match(directRoute, /presentation="page"[\s\S]*buildReportRouteHref\("\/reports", state\)/);
});
