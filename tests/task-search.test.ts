import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { TaskRow } from "../lib/data/case-repository.ts";
import { matchesTaskFilter, matchesTaskSearch, normalizeTaskQuery } from "../lib/operational-filters.ts";
import { taskSearchUrl } from "../lib/task-search-url.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const task = (title: string, status: TaskRow["status"] = "NOT_STARTED", due_at: string | null = null) => ({ title, status, due_at }) as TaskRow;

test("task search is trimmed partial and case-insensitive across title and Case number", () => {
  const installation = task("Complete Sign Installation");
  assert.equal(normalizeTaskQuery("  installation  "), "installation");
  assert.equal(matchesTaskSearch(installation, "CASE-000010", "installation"), true);
  assert.equal(matchesTaskSearch(installation, "CASE-000010", "INSTALLATION"), true);
  assert.equal(matchesTaskSearch(installation, "CASE-000010", "case-00001"), true);
  assert.equal(matchesTaskSearch(installation, "CASE-000010", "inspection"), false);
});

test("task search composes with status and due-date filters", () => {
  const now = new Date("2026-09-08T16:00:00Z");
  const rows = [
    { item: "CASE-000010", task: task("Complete sign installation", "NOT_STARTED", "2026-09-08T18:00:00Z") },
    { item: "CASE-000011", task: task("Complete sign installation", "COMPLETED", "2026-09-08T18:00:00Z") },
    { item: "CASE-000012", task: task("Confirm materials", "NOT_STARTED", "2026-09-08T18:00:00Z") },
  ];
  const matches = rows.filter((row) => matchesTaskSearch(row.task, row.item, "installation") && matchesTaskFilter(row.task, "not-started", "today", "UTC", now));
  assert.deepEqual(matches.map((row) => row.item), ["CASE-000010"]);
});

test("Tasks search is debounced clearable URL state that preserves other parameters", () => {
  const filters = source("components/task-filters.tsx");
  const operationalFilters = source("lib/operational-filters.ts");
  assert.match(filters, /setTimeout\(\(\) => updateSearchUrl\(value\), 300\)/);
  assert.match(filters, /taskSearchUrl\(pathname, window\.location\.search, value\)/);
  assert.match(filters, /router\.replace\(destination, \{ scroll: false \}\)/);
  assert.match(filters, /placeholder="Search tasks\.\.\."/);
  assert.match(filters, /name="status"/);
  assert.match(filters, /name="due"/);
  assert.match(filters, /<form className="filters task-filters" action="\/tasks" method="get">[\s\S]*?<input type="search" name=\{search\.trim\(\) \? "q" : undefined\} value=\{search\}/);
  assert.match(filters, /aria-label="Clear task search"/);
  assert.match(operationalFilters, /"not-started": "Not Started"/);
  assert.match(operationalFilters, /"in-progress": "In Progress"/);
  assert.match(filters, /taskStatusLabels\[value\]/);
  assert.match(filters, /<select name="due"[\s\S]*?<option value="overdue">Overdue<\/option>/);
});

test("empty Task queries are omitted while every non-search filter is preserved", () => {
  assert.equal(taskSearchUrl("/tasks", "?q=&status=in-progress&due=overdue", ""), "/tasks?status=in-progress&due=overdue");
  assert.equal(taskSearchUrl("/tasks", "?q=old&status=in-progress&due=overdue", "   "), "/tasks?status=in-progress&due=overdue");
  assert.equal(taskSearchUrl("/tasks", "?q=&status=completed", ""), "/tasks?status=completed");
  assert.equal(taskSearchUrl("/tasks", "?q=", ""), "/tasks");
  assert.equal(taskSearchUrl("/tasks", "?status=in-progress&due=overdue", "field installation"), "/tasks?status=in-progress&due=overdue&q=field+installation");
});

test("Status choices mirror the authoritative workflow enum while overdue remains due-derived", () => {
  const foundation = source("supabase/migrations/20260903150000_dm3iqcm_data_foundation.sql");
  const operationalFilters = source("lib/operational-filters.ts");
  assert.match(foundation, /case_task_status as enum \('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','NOT_APPLICABLE'\)/);
  assert.match(operationalFilters, /taskStatuses = \["not-started", "in-progress", "blocked", "completed", "not-applicable"\]/);
  assert.doesNotMatch(operationalFilters, /taskStatuses = \[[^\]]*"overdue"/);
  assert.match(operationalFilters, /taskDueFilters = \["today", "overdue"\]/);
});

test("rapid typing remains local while self-authored URL responses cannot reset it", () => {
  const filters = source("components/task-filters.tsx");
  const typed = "installation".split("").reduce((value, character) => value + character, "");
  assert.equal(typed, "installation");
  assert.match(filters, /const \[search, setSearch\] = useState\(q\)/);
  assert.match(filters, /const changeSearch = \(value: string\) => \{\s*setSearch\(value\)/);
  assert.match(filters, /if \(timer\.current\) clearTimeout\(timer\.current\);\s*timer\.current = setTimeout/);
  assert.match(filters, /pendingQuery\.current = normalized;\s*router\.replace/);
  assert.match(filters, /if \(pendingQuery\.current !== null\) \{[\s\S]*?return;\s*\}\s*setSearch\(q\)/);
  assert.doesNotMatch(filters, /if \(q !== previousQuery\)/);
});

test("history navigation resynchronizes local search without a form submission", () => {
  const filters = source("components/task-filters.tsx");
  assert.match(filters, /window\.addEventListener\("popstate", resyncFromHistory\)/);
  assert.match(filters, /pendingQuery\.current = null;[\s\S]*?setSearch\(nextQuery\)/);
  assert.match(filters, /onKeyDown=\{\(event\) => \{ if \(event\.key === "Enter"\) event\.preventDefault\(\); \}\}/);
  assert.match(filters, /const prepareClearFilters = \(\) => \{[\s\S]*?pendingQuery\.current = "";[\s\S]*?setSearch\(""\)/);
});

test("Tasks filters only the existing authorized organization dataset and distinguishes empty states", () => {
  const page = source("app/tasks/page.tsx");
  const repository = source("lib/data/case-repository.ts");
  assert.match(page, /getLiveOrganizationData\(\)/);
  assert.match(page, /matchesTaskFilter\(task, status, due, data\.timezone\) && matchesTaskSearch\(task, item\.case_number, q\)/);
  assert.match(repository, /\.from\("organization_case_tasks"\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(page, /No tasks match these filters\./);
  assert.match(page, /No tasks are available\./);
});
