import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("application-shell badges use server-rendered counts without client polling or Realtime", () => {
  const layout = source("app/layout.tsx");
  const shell = source("components/layout/app-shell.tsx");
  const mobileNavigation = source("components/layout/mobile-bottom-navigation.tsx");
  const badges = source("components/layout/navigation-attention-badges.tsx");
  const communicationsRepository = source("lib/data/communications-repository.ts");
  const trialRequestRepository = source("lib/data/trial-request-repository.ts");

  assert.doesNotMatch(layout, /getUnreadNotificationCount|getNewTrialRequestCount/);
  assert.match(layout, /<Suspense fallback=\{null\}>/);
  assert.match(layout, /<UnreadCommunicationsNavigationBadge/);
  assert.match(layout, /<NewTrialRequestsNavigationBadge/);
  assert.match(badges, /await getUnreadNotificationCount/);
  assert.match(badges, /await getNewTrialRequestCount/);
  assert.match(badges, /count > 99 \? "99\+" : count/);
  assert.match(communicationsRepository, /getUnreadNotificationCountForScope = cache/);
  assert.match(trialRequestRepository, /getNewTrialRequestCount = cache/);
  assert.doesNotMatch(
    `${shell}\n${mobileNavigation}`,
    /setInterval|setTimeout|get_my_unread_notification_count|postgres_changes|\.channel\(|visibilitychange|addEventListener\("focus"|createClient|router\.refresh/,
  );
});

test("analytics remains navigation and interaction driven without presence heartbeats", () => {
  const tracker = source("components/analytics-tracker.tsx");

  assert.match(tracker, /fetch\("\/api\/analytics\/page-view"/);
  assert.match(tracker, /\}, \[pathname\]\);/);
  assert.match(tracker, /fetch\("\/api\/analytics\/interaction"/);
  assert.match(tracker, /pointerdown/);
  assert.match(tracker, /keydown/);
  assert.match(tracker, /touchstart/);
  assert.doesNotMatch(
    tracker,
    /analytics\/presence|HEARTBEAT|heartbeat|setInterval|visibilitychange|addEventListener\(\s*"focus"/,
  );
});

test("pending activation refreshes only through the explicit user control", () => {
  const reconciler = source("components/pending-activation-reconciler.tsx");
  const page = source("app/account/pending-activation/page.tsx");

  assert.match(reconciler, /type="button"/);
  assert.match(reconciler, /Check activation/);
  assert.match(reconciler, /onClick=.*router\.refresh\(\)/);
  assert.doesNotMatch(reconciler, /useEffect|setInterval|setTimeout|visibilitychange|focus/);
  assert.match(page, /<form action=\{signOutAction\}>/);
});

test("Platform Analytics does not present heartbeat-derived activity as live", () => {
  const dashboard = source("components/platform/platform-dashboard.tsx");
  const repository = source("lib/data/platform-analytics-repository.ts");
  const loader = repository.slice(
    repository.indexOf("export async function getPlatformAnalytics"),
  );

  assert.doesNotMatch(dashboard, /Live Activity|activeSessions/);
  assert.doesNotMatch(loader, /analytics_live_sessions|activeSessions|activeUsers/);
  assert.match(loader, /supabase\.rpc\(\s*"get_platform_analytics"/);
});
