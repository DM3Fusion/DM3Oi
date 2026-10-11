import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path: string) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("legal review server projection uses the exact most recently accepted immutable document version", () => {
  const migration = read(
    "supabase/migrations/20261011110000_dm3oi_organization_legal_review.sql",
  );

  assert.match(
    migration,
    /get_organization_legal_review_server/,
  );
  assert.match(
    migration,
    /auth\.role\(\)\s*<>\s*'service_role'/,
  );
  assert.match(
    migration,
    /event\.event_type\s*=\s*'ACCEPTED'/,
  );
  assert.match(
    migration,
    /order by event\.acted_at desc,\s*event\.id desc/,
  );
  assert.match(
    migration,
    /event\.terms_version_id/,
  );
  assert.match(
    migration,
    /event\.privacy_version_id/,
  );
  assert.match(
    migration,
    /version\.id\s*=\s*accepted_version_id/,
  );
});

test("Account opens legal documents in organization acceptance review mode", () => {
  const account = read("app/account/page.tsx");

  assert.match(
    account,
    /href="\/terms\?review=acceptance"/,
  );
  assert.match(
    account,
    /href="\/privacy\?review=acceptance"/,
  );
});

test("legal review remains contextual and returns the Owner to Account", () => {
  const terms = read("app/terms/page.tsx");
  const privacy = read("app/privacy/page.tsx");

  for (const source of [terms, privacy]) {
    assert.match(
      source,
      /query\.review\s*===\s*"acceptance"/,
    );
    assert.match(
      source,
      /organization\.role\s*===\s*"BUSINESS_OWNER"/,
    );
    assert.match(
      source,
      /returnHref:\s*"\/account"/,
    );
    assert.match(
      source,
      /getOrganizationLegalReviewForServer/,
    );
  }
});

test("legal review identifies changed content and scrolls to the first changed area", () => {
  const renderer = read(
    "components/legal-document-page.tsx",
  );
  const scroll = read(
    "components/legal-review-scroll.tsx",
  );

  assert.match(
    renderer,
    /firstChangedId/,
  );
  assert.match(
    renderer,
    /changedIntroduction/,
  );
  assert.match(
    renderer,
    /changedSections/,
  );
  assert.match(
    renderer,
    /Updated/,
  );
  assert.match(
    renderer,
    /Return to Organization Acceptance/,
  );

  assert.match(
    scroll,
    /scrollIntoView/,
  );
  assert.match(
    scroll,
    /block:\s*"start"/,
  );
});

test("organization acceptance return control is sticky", () => {
  const css = read("app/globals.css");

  assert.match(
    css,
    /\.legal-review-return\s*\{[\s\S]*?position:\s*sticky/,
  );
});

test("legal fallback documents use the canonical product name", () => {
  const documents = read("lib/legal-documents.ts");
  const renderer = read(
    "components/legal-document-page.tsx",
  );

  assert.doesNotMatch(
    documents,
    /DM3Oi Business Operations Intelligence/,
  );
  assert.match(
    documents,
    /DM3Oi™ Operational Intelligence/,
  );
  assert.match(
    renderer,
    /<span>Operational Intelligence<\/span>/,
  );
});
