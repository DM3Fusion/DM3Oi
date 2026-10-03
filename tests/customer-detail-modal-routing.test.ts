import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("Customers uses a parallel intercepting route while direct detail routes remain pages", () => {
  const layout = read("app/customers/layout.tsx");
  const directDetail = read("app/customers/[customerId]/page.tsx");
  const modalDetail = read("app/customers/@modal/(.)[customerId]/page.tsx");
  const directEdit = read("app/customers/[customerId]/edit/page.tsx");
  const modalEdit = read("app/customers/@modal/(.)[customerId]/edit/page.tsx");

  assert.match(layout, /children[\s\S]*modal/);
  assert.match(directDetail, /CustomerDetail[\s\S]*presentation="page"/);
  assert.match(modalDetail, /CustomerDetail[\s\S]*presentation="modal"/);
  assert.match(directEdit, /CustomerEdit[\s\S]*presentation="page"/);
  assert.match(modalEdit, /CustomerEdit[\s\S]*presentation="modal"/);
  assert.match(read("app/customers/@modal/default.tsx"), /return null/);
  assert.match(read("app/customers/@modal/[...catchAll]/page.tsx"), /return null/);
});

test("Customer list rows and semantic links use the canonical detail URL without scrolling the list", () => {
  const customers = read("app/customers/page.tsx");
  const rows = read("components/navigable-row.tsx");

  assert.match(customers, /NavigableRow[\s\S]*href={`\/customers\/\$\{customer\.id\}`}[\s\S]*scroll={false}/);
  assert.match(customers, /Link className="entity-row-link case-link" href={`\/customers\/\$\{customer\.id\}`} scroll={false}/);
  assert.match(customers, /Link className="entity-row-link" href={`\/customers\/\$\{customer\.id\}`} scroll={false}/);
  assert.match(rows, /router\.push\(href, { scroll }\)/);
});

test("The route modal uses native dialog semantics and browser history for dismissal", () => {
  const modal = read("components/customers/customer-route-modal.tsx");
  const detail = read("components/customers/customer-detail.tsx");
  const edit = read("components/customers/customer-edit.tsx");

  assert.match(modal, /<dialog[\s\S]*aria-labelledby={titleId}/);
  assert.match(modal, /showModal\(\)/);
  assert.match(modal, /onCancel=/);
  assert.match(modal, /event\.target === event\.currentTarget/);
  assert.match(modal, /router\.back\(\)/);
  assert.match(modal, /aria-label="Close customer detail"/);
  assert.match(detail, /CustomerRouteModal[\s\S]*presentation === "modal"/);
  assert.match(edit, /CustomerRouteModal[\s\S]*cancelBehavior={presentation === "modal" \? "back" : "link"}/);
});
