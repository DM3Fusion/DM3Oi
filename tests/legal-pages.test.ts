import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Terms and Privacy are public legal documents with DM3Oi identity", () => {
  const proxy = source("proxy.ts");
  const terms = source("app/terms/page.tsx");
  const privacy = source("app/privacy/page.tsx");
  const documents = source("lib/legal-documents.ts");
  const component = source("components/legal-document-page.tsx");

  assert.match(proxy, /"\/terms","\/privacy"/);
  assert.match(terms, /termsOfService/);
  assert.match(privacy, /privacyPolicy/);
  assert.match(terms, /index: false/);
  assert.match(privacy, /index: false/);
  assert.match(documents, /DM3Oi Business Operations Intelligence/);
  assert.doesNotMatch(documents, /DM3SR/);
  assert.match(component, /DM3Oi™/);
  assert.match(component, /href="\/terms"/);
  assert.match(component, /href="\/privacy"/);
});

test("public landing footer exposes legal documents", () => {
  const landing = source("components/public-landing-page.tsx");

  assert.match(landing, /href="\/terms"/);
  assert.match(landing, /Terms of Service/);
  assert.match(landing, /href="\/privacy"/);
  assert.match(landing, /Privacy Policy/);
});
