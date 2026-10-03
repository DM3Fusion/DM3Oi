import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildBusinessReachAddressBatch,
  buildBusinessReachGeocodeWrites,
  fingerprintBusinessReachAddress,
  normalizeBusinessReachAddress,
  normalizeBusinessReachPayload,
  parseBusinessReachCandidates,
} from "../lib/business-reach.ts";
import { buildCensusAddressBatch, parseCensusAddressBatch } from "../lib/business-reach-census.ts";

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
    streetAddress: "1   research\t court",
    city: " ROCKVILLE  ",
    state: "md",
    postalCode: "20850-1234",
  }));
  assert.notEqual(fingerprint, fingerprintBusinessReachAddress({ ...address, postalCode: "20852" }));
});

test("Business Reach normalizes complete U.S. service addresses and rejects incomplete inputs", () => {
  assert.deepEqual(normalizeBusinessReachAddress(address), {
    streetAddress: "1 research court",
    city: "rockville",
    state: "MD",
    postalCode: "20850-1234",
  });
  assert.equal(normalizeBusinessReachAddress({ ...address, streetAddress: null }), null);
  assert.equal(normalizeBusinessReachAddress({ ...address, city: "" }), null);
  assert.equal(normalizeBusinessReachAddress({ ...address, state: "Maryland" }), null);
  assert.equal(normalizeBusinessReachAddress({ ...address, postalCode: "invalid" }), null);
});

test("Business Reach accepts only current-fingerprint candidates", () => {
  const valid = { customerId: "customer-1", addressFingerprint: fingerprintBusinessReachAddress(address), ...address };
  assert.equal(parseBusinessReachCandidates([valid]).length, 1);
  assert.deepEqual(parseBusinessReachCandidates([{ ...valid, addressFingerprint: "tampered" }]), []);
});

test("Business Reach deduplicates normalized addresses and maps results back to every customer", () => {
  const first = { customerId: "customer-1", addressFingerprint: fingerprintBusinessReachAddress(address), ...address };
  const duplicateAddress = { ...address, streetAddress: "1 research   court", city: "ROCKVILLE", state: "md" };
  const duplicate = { customerId: "customer-2", addressFingerprint: fingerprintBusinessReachAddress(duplicateAddress), ...duplicateAddress };
  const secondAddress = { ...address, streetAddress: "2 Research Court" };
  const second = { customerId: "customer-3", addressFingerprint: fingerprintBusinessReachAddress(secondAddress), ...secondAddress };
  const batch = buildBusinessReachAddressBatch([first, duplicate, second]);
  assert.equal(batch.uniqueAddresses.length, 2);
  assert.deepEqual(batch.uniqueAddresses.map((group) => group.candidates.length), [2, 1]);

  const results = new Map([
    [batch.uniqueAddresses[0].key, { latitude: 39.08, longitude: -77.15 }],
    [batch.uniqueAddresses[1].key, { latitude: 39.09, longitude: -77.16 }],
  ]);
  const writes = buildBusinessReachGeocodeWrites(batch.uniqueAddresses, results);
  assert.deepEqual(writes.map(({ customerId, latitude, longitude }) => ({ customerId, latitude, longitude })), [
    { customerId: "customer-1", latitude: 39.08, longitude: -77.15 },
    { customerId: "customer-2", latitude: 39.08, longitude: -77.15 },
    { customerId: "customer-3", latitude: 39.09, longitude: -77.16 },
  ]);
});

test("Business Reach caches invalid addresses as unmappable without provider input", () => {
  const incomplete = { ...address, streetAddress: null };
  const candidate = { customerId: "customer-4", addressFingerprint: fingerprintBusinessReachAddress(incomplete), ...incomplete };
  const batch = buildBusinessReachAddressBatch([candidate]);
  assert.equal(batch.uniqueAddresses.length, 0);
  assert.deepEqual(batch.invalidWrites, [{
    customerId: "customer-4",
    addressFingerprint: candidate.addressFingerprint,
    status: "UNMAPPABLE",
    locationKey: null,
    latitude: null,
    longitude: null,
  }]);
});

test("Census batch payload and response preserve opaque IDs and valid coordinates", () => {
  const candidate = { customerId: "customer-1", addressFingerprint: fingerprintBusinessReachAddress(address), ...address };
  const groups = buildBusinessReachAddressBatch([candidate]).uniqueAddresses;
  const request = buildCensusAddressBatch(groups);
  assert.match(request.csv, /^"1","1 research court","rockville","MD","20850-1234"/);
  const parsed = parseCensusAddressBatch(
    '"1","1 research court, rockville, MD, 20850-1234","Match","Exact","1 RESEARCH CT, ROCKVILLE, MD, 20850","-77.15,39.08","123","L"\n',
    request.keyByRequestId,
  );
  assert.equal(parsed.processedKeys.size, 1);
  assert.deepEqual(parsed.results.get(groups[0].key), { latitude: 39.08, longitude: -77.15 });
});

test("Business Reach filters invalid or null coordinates before map rendering", () => {
  const report = normalizeBusinessReachPayload({
    activeCustomers: 6,
    mappedCustomers: 3,
    unmappedCustomers: 3,
    pendingCustomers: 2,
    unmappableCustomers: 1,
    uniqueLocations: 2,
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

test("Business Reach map defers complete bounds fitting until its container is measured", () => {
  const map = readFileSync("components/reports/business-reach-map.tsx", "utf8");

  assert.match(
    map,
    /const bounds = leaflet\.latLngBounds\([\s\S]*points\.map\(\(point\) => \[point\.latitude, point\.longitude\]\)/,
  );
  assert.match(
    map,
    /requestAnimationFrame\(\(\) => \{[\s\S]*map\.invalidateSize\(\{ animate: false \}\)[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*map\.fitBounds\(bounds, \{[\s\S]*padding: \[34, 34\][\s\S]*maxZoom: 10[\s\S]*animate: false/,
  );
  assert.match(
    map,
    /if \(points\.length === 1\)[\s\S]*map\.setView\([\s\S]*10,[\s\S]*\{ animate: false \}/,
  );
  assert.match(map, /new ResizeObserver[\s\S]*materiallyChanged[\s\S]*scheduleViewportFit\(\)/);
  assert.match(map, /resizeObserver\?\.disconnect\(\)/);
  assert.match(map, /cancelAnimationFrame\(invalidateFrame\)[\s\S]*cancelAnimationFrame\(fitFrame\)/);
  assert.doesNotMatch(map, /zipcodes|centroid|postalCode/i);
});

test("Business Reach map renders one modestly weighted location marker per point", () => {
  const map = readFileSync("components/reports/business-reach-map.tsx", "utf8");
  const packageJson = readFileSync("package.json", "utf8");
  const packageLock = readFileSync("package-lock.json", "utf8");

  assert.match(
    map,
    /points\.forEach\(\(point\) => \{[\s\S]*leaflet\.circleMarker\(\[point\.latitude, point\.longitude\]/,
  );
  assert.match(
    map,
    /Math\.min\([\s\S]*11,[\s\S]*5 \+ Math\.sqrt\(Math\.max\(0, point\.weight - 1\)\) \* 2/,
  );
  assert.match(map, /fillColor: "#4f8fa3"[\s\S]*fillOpacity: 0\.82/);
  assert.doesNotMatch(map, /heatLayer|leaflet-heat|gradient:/);
  assert.doesNotMatch(packageJson, /leaflet-heat/);
  assert.doesNotMatch(packageLock, /leaflet-heat/);
  assert.doesNotMatch(map, /customerId|customerName|customerNumber|streetAddress|address|popup/i);
  assert.match(map, /Customer location map with \$\{points\.length\} mapped geographic/);
});

test("Business Reach is tenant-scoped, current-state, privacy-limited, and placed before period metrics", () => {
  const repository = readFileSync("lib/data/reports-repository.ts", "utf8");
  const action = readFileSync("lib/data/business-reach-actions.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20261003170000_dm3oi_business_reach_customer_geocodes.sql", "utf8");
  const upgrade = readFileSync("supabase/migrations/20261003180000_dm3oi_business_reach_street_geocoding.sql", "utf8");
  const provider = readFileSync("lib/data/business-reach-geocoder.ts", "utf8");
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
  assert.match(upgrade, /delete from public\.customer_geocodes/);
  assert.match(upgrade, /geocode_source = 'US_CENSUS_BATCH'/);
  assert.match(upgrade, /'uniqueLocations', \(select count\(\*\) from points\)/);
  assert.match(upgrade, /submitted_fingerprint is distinct from current_fingerprint/);
  assert.match(upgrade, /c\.organization_id = target_organization_id[\s\S]*c\.status = 'ACTIVE'/);
  const upgradedReportStart = upgrade.indexOf("create or replace function public.get_business_reach");
  const upgradedReport = upgrade.slice(upgradedReportStart, upgrade.indexOf("\n$$;", upgradedReportStart));
  for (const permission of ["VIEW_REPORTS", "VIEW_CUSTOMERS"]) {
    assert.match(upgradedReport, new RegExp(`has_effective_organization_permission\\(target_organization_id, '${permission}'\\)`));
  }
  assert.doesNotMatch(upgradedReport, /'EDIT_CUSTOMER'/);
  const upgradedSaveStart = upgrade.indexOf("create or replace function public.save_business_reach_geocodes");
  const upgradedSave = upgrade.slice(upgradedSaveStart, upgrade.indexOf("\n$$;", upgradedSaveStart));
  for (const permission of ["VIEW_REPORTS", "VIEW_CUSTOMERS", "EDIT_CUSTOMER"]) {
    assert.match(upgradedSave, new RegExp(`has_effective_organization_permission\\(target_organization_id, '${permission}'\\)`));
  }
  assert.match(upgradedSave, /jsonb_array_length\(target_rows\) > 500/);
  assert.match(upgradedSave, /target_location_key is distinct from current_fingerprint/);
  assert.match(upgradedSave, /target_latitude is null or target_latitude not between -90 and 90/);
  assert.match(upgradedSave, /target_longitude is null or target_longitude not between -180 and 180/);
  assert.match(action, /buildBusinessReachAddressBatch[\s\S]*geocodeBusinessReachAddresses[\s\S]*buildBusinessReachGeocodeWrites/);
  assert.match(provider, /^import "server-only";/);
  assert.match(provider, /geocoding\.geo\.census\.gov\/geocoder\/locations\/addressbatch/);
  assert.doesNotMatch(provider, /process\.env|console\./);
  assert.doesNotMatch(map, /customerId|customerName|streetAddress|email|phone|notes/i);
  assert.doesNotMatch(map, /setInterval|setTimeout|visibilitychange|focus/);
  assert.ok(dashboard.indexOf("<BusinessReach report=") < dashboard.indexOf('className="report-period-summary"'));
  assert.ok(dashboard.indexOf('className="report-period-summary"') < dashboard.indexOf('className="report-kpis"'));
});
