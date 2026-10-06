import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const page = source("app/admin/customer-import/page.tsx");
const queue = source(
  "components/admin/customer-import-submission-queue.tsx",
);
const css = source("app/globals.css");

test("Customer Import uses four URL-backed task tabs", () => {
  assert.match(page, /tab=submissions/);
  assert.match(page, /tab=import/);
  assert.match(page, /tab=administrative/);
  assert.match(page, /tab=history/);

  assert.match(page, />\s*<span>Submissions<\/span>/);
  assert.match(page, />\s*<span>Import Customers<\/span>/);
  assert.match(page, />\s*<span>Administrative Import<\/span>/);
  assert.match(page, />\s*<span>Import History<\/span>/);

  assert.match(page, /aria-current=/);
});

test("ready-to-import work becomes the default task", () => {
  assert.match(
    page,
    /return hasReadyToImport \? "import" : "submissions"/,
  );
  assert.match(
    page,
    /submission\.status === "READY_TO_IMPORT"/,
  );
});

test("active submissions and completed history are separated", () => {
  assert.match(
    page,
    /submission\.status !== "IMPORTED"/,
  );
  assert.match(
    page,
    /submission\.status === "IMPORTED"/,
  );

  assert.match(
    page,
    /activeTab === "submissions"[\s\S]*submissions=\{activeSubmissions\}/,
  );
  assert.match(
    page,
    /activeTab === "history"[\s\S]*submissions=\{importedSubmissions\}/,
  );
});

test("the import workspace renders only on the import tab", () => {
  assert.match(
    page,
    /activeTab === "import"[\s\S]*<CustomerImportWorkspace/,
  );
});

test("submission queue supports task-specific headings and empty states", () => {
  assert.match(queue, /eyebrow\?: string/);
  assert.match(queue, /title\?: string/);
  assert.match(queue, /description\?: string/);
  assert.match(queue, /emptyTitle\?: string/);
  assert.match(queue, /emptyDescription\?: string/);
});

test("Customer Import tabs remain responsive without background behavior", () => {
  assert.match(css, /\.customer-import-tabs\{/);
  assert.match(css, /\.customer-import-tab\.active\{/);
  assert.match(css, /@media\(max-width:640px\)/);

  const combined = `${page}\n${queue}`;
  assert.doesNotMatch(
    combined,
    /setInterval|setTimeout|subscribe\(|channel\(|postgres_changes|realtime/i,
  );
});
