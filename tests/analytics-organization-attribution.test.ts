import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isExcludedAnalyticsGeo } from "../lib/analytics.ts";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const pageViewRoute = source(
  "app/api/analytics/page-view/route.ts",
);

function geographicExclusionApplies(
  accessType: string,
  organizationId: string | null,
) {
  const bypassGeographicExclusion =
    accessType === "INTERNAL" &&
    organizationId !== null;

  return (
    !bypassGeographicExclusion &&
    isExcludedAnalyticsGeo(
      "US",
      "NY",
      "New York",
    )
  );
}

test("only a resolved INTERNAL organization context bypasses excluded geography", () => {
  const originalExcludedGeos =
    process.env.ANALYTICS_EXCLUDED_GEOS;

  process.env.ANALYTICS_EXCLUDED_GEOS =
    "us:ny:new york";

  try {
    assert.equal(
      geographicExclusionApplies(
        "INTERNAL",
        "325d4f4a-8a48-4874-9b72-133169a1bd52",
      ),
      false,
    );
    assert.equal(
      geographicExclusionApplies("PUBLIC", null),
      true,
    );
    assert.equal(
      geographicExclusionApplies(
        "CUSTOMER_PORTAL",
        "325d4f4a-8a48-4874-9b72-133169a1bd52",
      ),
      true,
    );
    assert.equal(
      geographicExclusionApplies(
        "AUTHENTICATED_UNCLASSIFIED",
        null,
      ),
      true,
    );
    assert.equal(
      geographicExclusionApplies("INTERNAL", null),
      true,
    );
  } finally {
    if (originalExcludedGeos === undefined) {
      delete process.env.ANALYTICS_EXCLUDED_GEOS;
    } else {
      process.env.ANALYTICS_EXCLUDED_GEOS =
        originalExcludedGeos;
    }
  }
});

test("an unmatched geography does not exclude existing accepted traffic", () => {
  const originalExcludedGeos =
    process.env.ANALYTICS_EXCLUDED_GEOS;

  process.env.ANALYTICS_EXCLUDED_GEOS =
    "us:ca:san francisco";

  try {
    assert.equal(
      geographicExclusionApplies("PUBLIC", null),
      false,
    );
    assert.equal(
      geographicExclusionApplies(
        "CUSTOMER_PORTAL",
        "325d4f4a-8a48-4874-9b72-133169a1bd52",
      ),
      false,
    );
  } finally {
    if (originalExcludedGeos === undefined) {
      delete process.env.ANALYTICS_EXCLUDED_GEOS;
    } else {
      process.env.ANALYTICS_EXCLUDED_GEOS =
        originalExcludedGeos;
    }
  }
});

test("page-view attribution uses the self-only analytics identity resolver", () => {
  assert.match(
    pageViewRoute,
    /rpc\(\s*"get_my_analytics_identity_context"/,
  );
  assert.match(
    pageViewRoute,
    /target_organization_id:\s*selectedOrganizationId/,
  );
  assert.match(
    pageViewRoute,
    /target_portal_access_id:\s*selectedPortalAccessId/,
  );
  assert.doesNotMatch(
    pageViewRoute,
    /\.from\("organization_members"\)/,
  );
  assert.doesNotMatch(
    pageViewRoute,
    /\.from\("customer_portal_users"\)/,
  );
});

test("page-view geography bypass consumes only the resolved identity context", () => {
  assert.match(
    pageViewRoute,
    /accessType\s*=\s*typeof identity\?\.access_type === "string"[\s\S]*?organizationId\s*=\s*typeof identity\?\.organization_id === "string"/,
  );
  assert.match(
    pageViewRoute,
    /const bypassGeographicExclusion\s*=\s*accessType === "INTERNAL" &&\s*organizationId !== null/,
  );
  assert.match(
    pageViewRoute,
    /if \(\s*!bypassGeographicExclusion &&\s*isExcludedAnalyticsGeo\(/,
  );

  const resolverAt = pageViewRoute.indexOf(
    '"get_my_analytics_identity_context"',
  );
  const bypassAt = pageViewRoute.indexOf(
    "const bypassGeographicExclusion",
  );
  const ingestionAt = pageViewRoute.indexOf(
    '"record_analytics_page_view_guarded"',
  );

  assert.ok(resolverAt >= 0);
  assert.ok(bypassAt > resolverAt);
  assert.ok(ingestionAt > bypassAt);
});

test("page-view attribution retains SUPER_ADMIN exclusion", () => {
  assert.match(pageViewRoute, /rpc\("is_super_admin"\)/);
  assert.match(pageViewRoute, /isSuperAdmin === true/);
  assert.match(pageViewRoute, /ignored: true/);

  assert.ok(
    pageViewRoute.indexOf("isSuperAdmin === true") <
      pageViewRoute.indexOf(
        "const bypassGeographicExclusion",
      ),
  );
});

test("IP exclusion remains ahead of authentication and geography", () => {
  assert.match(
    pageViewRoute,
    /process\.env\.ANALYTICS_EXCLUDED_IPS/,
  );
  assert.match(
    pageViewRoute,
    /export async function POST[\s\S]*?if \(isExcludedIp\(requestIp\(request\)\)\)[\s\S]*?ignored: true/,
  );

  assert.ok(
    pageViewRoute.indexOf(
      "if (isExcludedIp(requestIp(request)))",
    ) < pageViewRoute.indexOf("await supabase.auth.getClaims()"),
  );
});

test("page-view identity lookup failures remain observable", () => {
  assert.match(pageViewRoute, /identityError/);
  assert.match(
    pageViewRoute,
    /Analytics identity context lookup failed[\s\S]*?status: 500/,
  );
});

test("accepted INTERNAL events retain verified attribution and guarded rate limiting", () => {
  assert.match(
    pageViewRoute,
    /target_user_id:\s*userId/,
  );
  assert.match(
    pageViewRoute,
    /target_organization_id:\s*organizationId/,
  );
  assert.match(
    pageViewRoute,
    /target_access_type:\s*accessType/,
  );
  assert.match(
    pageViewRoute,
    /target_access_role:\s*accessRole/,
  );
  assert.match(
    pageViewRoute,
    /record_analytics_page_view_guarded[\s\S]*?if \(accepted !== true\)[\s\S]*?ignored: true/,
  );
});

test("retired analytics presence ingestion surface stays removed", () => {
  const proxy = source("proxy.ts");

  assert.doesNotMatch(
    proxy,
    /\/api\/analytics\/presence/,
  );

  assert.throws(
    () => source("app/api/analytics/presence/route.ts"),
  );
});
