import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("application-shell badges use server-rendered counts without client polling or Realtime", () => {
  const layout = source("app/layout.tsx");
  const shell = source("components/layout/app-shell.tsx");

  assert.match(layout, /getUnreadNotificationCount/);
  assert.match(layout, /getNewTrialRequestCount/);
  assert.match(shell, /unreadNotificationCount > 99 \? "99\+" : unreadNotificationCount/);
  assert.match(shell, /newTrialRequestCount > 99 \? "99\+" : newTrialRequestCount/);
  assert.doesNotMatch(
    shell,
    /setInterval|get_my_unread_notification_count|postgres_changes|\.channel\(|visibilitychange|addEventListener\("focus"|createClient|router\.refresh/,
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

  assert.doesNotMatch(dashboard, /Live Activity|activeSessions/);
  assert.doesNotMatch(repository, /analytics_live_sessions|activeSessions|activeUsers/);
  assert.match(repository, /\.rpc\("get_platform_analytics"/);
});
