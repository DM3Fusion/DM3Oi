import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fingerprintBusinessReachAddress,
  geocodeBusinessReachCandidate,
  normalizeBusinessReachPayload,
  parseBusinessReachCandidates,
} from "../lib/business-reach.ts";

const address = {
  streetAddress: "  1 Research Court ",
  city: "Rockville",
  state: "MD",
  postalCode: "20850-1234",
};

test("Business Reach fingerprints normalized addresses and detects changes", () => {
  const fingerprint = fingerprintBusinessReachAddress(address);
  assert.equal(fingerprint.length, 32);
  assert.equal(fingerprint, fingerprintBusinessReachAddress({
    streetAddress: "1 research court",
    city: " ROCKVILLE ",
    state: "md",
    postalCode: "20850-1234",
  }));
  assert.notEqual(fingerprint, fingerprintBusinessReachAddress({ ...address, postalCode: "20852" }));
});

test("Business Reach uses cached ZIP centroids and records unusable addresses without coordinates", () => {
  const mapped = geocodeBusinessReachCandidate({
    customerId: "customer-1",
    addressFingerprint: fingerprintBusinessReachAddress(address),
    ...address,
  });
  assert.equal(mapped.status, "MAPPED");
  assert.equal(mapped.locationKey, "20850");
  assert.equal(typeof mapped.latitude, "number");
  assert.equal(typeof mapped.longitude, "number");

  const unmappable = geocodeBusinessReachCandidate({
    customerId: "customer-2",
    addressFingerprint: fingerprintBusinessReachAddress({ ...address, postalCode: null }),
    ...address,
    postalCode: null,
  });
  assert.deepEqual(unmappable, {
    customerId: "customer-2",
    addressFingerprint: fingerprintBusinessReachAddress({ ...address, postalCode: null }),
    status: "UNMAPPABLE",
    locationKey: null,
    latitude: null,
    longitude: null,
  });
});

test("Business Reach accepts only current-fingerprint candidates", () => {
  const valid = { customerId: "customer-1", addressFingerprint: fingerprintBusinessReachAddress(address), ...address };
  assert.equal(parseBusinessReachCandidates([valid]).length, 1);
  assert.deepEqual(parseBusinessReachCandidates([{ ...valid, addressFingerprint: "tampered" }]), []);
});

test("Business Reach filters invalid or null coordinates before map rendering", () => {
  const report = normalizeBusinessReachPayload({
    activeCustomers: 6,
    mappedCustomers: 3,
    unmappedCustomers: 3,
    pendingCustomers: 2,
    unmappableCustomers: 1,
    geographicCoverage: 2,
    points: [
      { latitude: 39.08, longitude: -77.15, weight: 2 },
      { latitude: null, longitude: -77.15, weight: 1 },
      { latitude: 91, longitude: 10, weight: 1 },
      { latitude: 38.9, longitude: -77.03, weight: 0 },
      { latitude: 38.9, longitude: -77.03, weight: 1 },
    ],
  }, true);
  assert.deepEqual(report.points, [
    { latitude: 39.08, longitude: -77.15, weight: 2 },
    { latitude: 38.9, longitude: -77.03, weight: 1 },
  ]);
  assert.equal(report.mappedCustomers, 3);
  assert.equal(report.unmappedCustomers, 3);
});

test("Business Reach is tenant-scoped, current-state, privacy-limited, and placed before period metrics", () => {
  const repository = readFileSync("lib/data/reports-repository.ts", "utf8");
  const action = readFileSync("lib/data/business-reach-actions.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20261003170000_dm3oi_business_reach_customer_geocodes.sql", "utf8");
  const dashboard = readFileSync("components/reports/reports-dashboard.tsx", "utf8");
  const map = readFileSync("components/reports/business-reach-map.tsx", "utf8");

  assert.match(repository, /hasPermission\(access, "VIEW_REPORTS"\)/);
  assert.match(repository, /hasPermission\(access, "VIEW_CUSTOMERS"\)/);
  assert.match(repository, /canRefresh = canViewCustomers && hasPermission\(access, "EDIT_CUSTOMER"\)/);
  assert.match(repository, /if \(!canViewCustomers\) return unavailableBusinessReach\(false\)/);
  assert.match(repository, /target_organization_id: access\.activeOrganization\.id/);
  assert.match(repository, /rpc\("get_business_reach"/);
  assert.match(action, /requirePermission\("VIEW_REPORTS"\)[\s\S]*requirePermission\("VIEW_CUSTOMERS"\)[\s\S]*requirePermission\("EDIT_CUSTOMER"\)[\s\S]*get_business_reach_geocode_candidates/);
  assert.match(migration, /where c\.organization_id = target_organization_id[\s\S]*and c\.status = 'ACTIVE'/);
  for (const functionName of ["get_business_reach_geocode_candidates", "save_business_reach_geocodes"]) {
    const functionStart = migration.indexOf(`create function public.${functionName}`);
    const authorization = migration.slice(functionStart, migration.indexOf("\n$$;", functionStart));
    for (const permission of ["VIEW_REPORTS", "VIEW_CUSTOMERS", "EDIT_CUSTOMER"]) {
      assert.match(authorization, new RegExp(`has_effective_organization_permission\\(target_organization_id, '${permission}'\\)`));
    }
  }
  assert.match(migration, /customers_invalidate_geocode_on_address_change/);
  assert.match(migration, /jsonb_array_length\(target_rows\) > 500/);
  assert.doesNotMatch(map, /customerId|customerName|streetAddress|email|phone|notes/i);
  assert.doesNotMatch(map, /setInterval|setTimeout|visibilitychange|focus/);
  assert.ok(dashboard.indexOf("<BusinessReach report=") < dashboard.indexOf('className="report-period-summary"'));
  assert.ok(dashboard.indexOf('className="report-period-summary"') < dashboard.indexOf('className="report-kpis"'));
});
