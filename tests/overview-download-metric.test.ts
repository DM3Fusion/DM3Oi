import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createOverviewDownloadGetResponse,
  createOverviewDownloadHeadResponse,
} from "../lib/overview-download-response.ts";

const source = (path: string) => readFileSync(path, "utf8");

const route = source("app/api/public/overview-download/route.ts");
const responseHelper = source("lib/overview-download-response.ts");
const modal = source("components/public-infographic-modal.tsx");
const repository = source("lib/data/platform-analytics-repository.ts");
const page = source("app/page.tsx");
const dashboard = source("components/platform/platform-dashboard.tsx");
const proxy = source("proxy.ts");

test("successful Overview GET preserves the PNG and records exactly once", async () => {
  const png = Buffer.from([137, 80, 78, 71]);
  let recordCalls = 0;

  const response = await createOverviewDownloadGetResponse({
    readFile: async () => png,
    recordServed: async () => {
      recordCalls += 1;
    },
    onRecordFailure: () => {
      assert.fail("successful recording should not report a failure");
    },
  });

  assert.equal(recordCalls, 1);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="DM3Oi_Overview_2026.PNG"',
  );
  assert.equal(response.headers.get("content-length"), String(png.byteLength));
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
});

test("analytics persistence failure never blocks a valid PNG response", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10]);
  let reportedFailure: unknown;

  const response = await createOverviewDownloadGetResponse({
    readFile: async () => png,
    recordServed: async () => {
      throw new Error("recording unavailable");
    },
    onRecordFailure: (error) => {
      reportedFailure = error;
    },
  });

  assert.ok(reportedFailure instanceof Error);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(response.headers.get("content-type"), "image/png");
});

test("failed PNG retrieval does not attempt to record a download", async () => {
  let recordCalls = 0;

  await assert.rejects(
    createOverviewDownloadGetResponse({
      readFile: async () => {
        throw new Error("asset unavailable");
      },
      recordServed: async () => {
        recordCalls += 1;
      },
      onRecordFailure: () => {
        assert.fail("recording was never attempted");
      },
    }),
    /asset unavailable/,
  );

  assert.equal(recordCalls, 0);
});

test("HEAD returns download headers without a body or recording dependency", async () => {
  const png = Buffer.from([137, 80, 78, 71]);
  const response = await createOverviewDownloadHeadResponse({
    readFile: async () => png,
  });

  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("content-length"), String(png.byteLength));
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.match(route, /export async function HEAD\(\)/);
  assert.doesNotMatch(
    route.match(/export async function HEAD\(\)[\s\S]*$/)?.[0] ?? "",
    /recordOverviewDownloadServed|record_overview_download_served/,
  );
});

test("counted overview responses do not retain public max-age caching", () => {
  assert.match(
    responseHelper,
    /"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"/,
  );
  assert.match(responseHelper, /Pragma: "no-cache"/);
  assert.match(responseHelper, /Expires: "0"/);
  assert.doesNotMatch(responseHelper, /public\s*,?\s*max-age|max-age=3600/);
});

test("modal Save bypasses the old cache without counting modal display", () => {
  assert.match(modal, /href="\/api\/public\/overview-download\?v=2"/);
  assert.match(modal, /src="\/images\/DM3Oi_Overview_2026\.PNG"/);
  assert.equal(
    (modal.match(/\/api\/public\/overview-download/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(modal, /fetch\(|record_overview_download_served/);
});

test("the anonymous route invokes only the fixed no-argument service-role RPC", () => {
  assert.match(route, /createAdminClient\(\)/);
  assert.match(
    route,
    /\.rpc\(\s*"record_overview_download_served"\s*,?\s*\)/,
  );
  assert.match(route, /export async function GET\(\)/);
  assert.doesNotMatch(route, /OVERVIEW_DOWNLOAD_SERVED/);
  assert.doesNotMatch(route, /getUser|getClaims|requireSuperAdmin|organization|customer/);
  assert.match(proxy, /"\/api\/public\/overview-download"/);
});

test("Platform Console reads the all-time metric through its authenticated SUPER_ADMIN RPC", () => {
  const metricLoader =
    repository.match(
      /export async function getOverviewDownloadCount\(\)[\s\S]*?\n}/,
    )?.[0] ?? "";

  assert.match(metricLoader, /await requireSuperAdmin\(\)/);
  assert.ok(
    metricLoader.indexOf("await requireSuperAdmin()") <
      metricLoader.indexOf("await createClient()"),
  );
  assert.match(
    metricLoader,
    /\.rpc\(\s*"get_overview_download_count"\s*,?\s*\)/,
  );
  assert.match(metricLoader, /return 0/);
  assert.match(page, /getOverviewDownloadCount\(\)/);
  assert.match(page, /overviewDownloadCount=\{overviewDownloadCount\}/);
});

test("Overview Downloads renders in the intended independent dashboard position", () => {
  const metricPosition = dashboard.indexOf(
    'className="platform-overview-download-metric"',
  );
  const platformKpisPosition = dashboard.indexOf(
    'className="metric-grid platform-metrics"',
  );
  const analyticsPosition = dashboard.indexOf(
    'className="admin-analytics"',
  );
  const metricMarkup =
    dashboard.match(
      /<section[\s\S]*?className="platform-overview-download-metric"[\s\S]*?<\/section>/,
    )?.[0] ?? "";

  assert.ok(platformKpisPosition < metricPosition);
  assert.ok(metricPosition < analyticsPosition);
  assert.match(metricMarkup, /Overview Downloads/);
  assert.match(metricMarkup, /DM3Oi Overview served/);
  assert.match(metricMarkup, /overviewDownloadCount/);
  assert.doesNotMatch(metricMarkup, /analytics\.range|analyticsRanges|analyticsFrom/);
  assert.doesNotMatch(
    page.match(/getOverviewDownloadCount\([^)]*\)/)?.[0] ?? "",
    /query|analytics/,
  );
});

test("route and Platform Console never access the counter table directly", () => {
  for (const implementation of [route, repository, page, dashboard]) {
    assert.doesNotMatch(implementation, /analytics_event_counters/);
  }
});
