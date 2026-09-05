import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("communications exposes bookmarkable status, source, and date defaults", () => {
  const page = source("app/communications/page.tsx");
  const filters = source("components/communications-filters.tsx");
  assert.match(page, /status: .*\? query\?\.status : "all"/);
  assert.match(page, /source: .*\? query\?\.source : "all"/);
  assert.match(page, /range: .*\? query\?\.range : "all"/);
  for (const option of ["unread", "read", "archived", "service-request", "case", "task", "other", "today", "7d", "30d"]) assert.match(filters, new RegExp(`value="${option}"`));
  assert.match(filters, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(filters, /router\.push\(destination\)/);
  assert.match(filters, /params\.delete\(name\)/);
});

test("repository applies authorized server-side status filters and archived semantics", () => {
  const repository = source("lib/data/communications-repository.ts");
  assert.match(repository, /eq\("organization_id", context\.activeOrganization\.id\)/);
  assert.match(repository, /eq\("recipient_user_id", context\.user\.id\)/);
  assert.match(repository, /filters\.status === "archived" \? query\.not\("archived_at", "is", null\) : query\.is\("archived_at", null\)/);
  assert.match(repository, /filters\.status === "unread".*query\.is\("read_at", null\)/);
  assert.match(repository, /filters\.status === "read".*query\.not\("read_at", "is", null\)/);
  assert.match(repository, /order\("created_at", \{ ascending: false \}\)/);
  assert.match(repository, /order\("id", \{ ascending: false \}\)/);
});

test("repository maps principal source domains and groups everything else", () => {
  const repository = source("lib/data/communications-repository.ts");
  assert.match(repository, /filters\.source === "service-request".*"SERVICE_REQUEST"/);
  assert.match(repository, /filters\.source === "case".*"CASE"/);
  assert.match(repository, /filters\.source === "task".*"TASK"/);
  assert.match(repository, /filters\.source === "other".*not\("source_domain", "in"/);
});

test("date and combined filters are passed into the repository query", () => {
  const page = source("app/communications/page.tsx");
  const repository = source("lib/data/communications-repository.ts");
  assert.match(page, /values\.range === "today" \? startOfOrganizationDay/);
  assert.match(page, /values\.range === "7d" \? new Date\(now\.getTime\(\) - 7 \* 86400000\)/);
  assert.match(page, /values\.range === "30d" \? new Date\(now\.getTime\(\) - 30 \* 86400000\)/);
  assert.match(page, /getNotifications\(\{ status: values\.status, source: values\.source, createdAfter \}\)/);
  assert.match(repository, /query\.gte\("created_at", filters\.createdAfter\)/);
});

test("filtered empty state and mobile-safe controls remain distinct", () => {
  const page = source("app/communications/page.tsx");
  const css = source("app/globals.css");
  assert.match(page, /No communications match these filters\./);
  assert.match(page, /No communications yet\./);
  assert.match(css, /\.communications-filters\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:640px\)\{\.communications-filters\{grid-template-columns:1fr/);
  assert.match(css, /\.communications-filters select\{[^}]*width:100%[^}]*min-width:0/);
});
