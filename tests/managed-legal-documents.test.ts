import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getFallbackLegalDocument,
  legalDocumentContent,
  parseLegalDocumentContent,
  termsOfService,
} from "../lib/legal-documents.ts";

const source = (path: string) => readFileSync(path, "utf8");

const termsSectionText = (heading: string) =>
  termsOfService.sections
    .find((section) => section.heading === heading)
    ?.paragraphs.join(" ") ?? "";
const migration = source(
  "supabase/migrations/20261004152000_dm3oi_managed_legal_documents.sql",
);
const repository = source("lib/data/legal-document-repository.ts");
const actions = source("app/admin/legal-documents/actions.ts");
const page = source("app/admin/legal-documents/page.tsx");
const editor = source("components/admin/legal-document-editor.tsx");
const navigation = source("lib/application-navigation.ts");
const termsRoute = source("app/terms/page.tsx");
const privacyRoute = source("app/privacy/page.tsx");

test("legal content parser accepts fallbacks and rejects metadata, HTML, and bounds violations", () => {
  for (const documentKey of ["TERMS_OF_SERVICE", "PRIVACY_POLICY"] as const) {
    const fallback = getFallbackLegalDocument(documentKey);
    const content = legalDocumentContent(fallback);
    assert.deepEqual(parseLegalDocumentContent(documentKey, content), content);

    assert.equal(
      parseLegalDocumentContent(documentKey, {
        ...content,
        version: fallback.version,
      }),
      null,
    );
    assert.equal(
      parseLegalDocumentContent(documentKey, {
        ...content,
        title: "<script>alert(1)</script>",
      }),
      null,
    );
    assert.equal(
      parseLegalDocumentContent(documentKey, {
        ...content,
        introduction: Array.from({ length: 13 }, () => "Bounded text"),
      }),
      null,
    );
  }
});

test("code fallbacks retain the current legal publication metadata", () => {
  const terms = getFallbackLegalDocument("TERMS_OF_SERVICE");
  assert.equal(terms.version, "1.2");
  assert.equal(terms.effectiveDate, "2026-10-09");

  const privacy = getFallbackLegalDocument("PRIVACY_POLICY");
  assert.equal(privacy.version, "1.1");
  assert.equal(privacy.effectiveDate, "2026-10-04");
});

test("Terms use the complete sequential hosted SaaS structure", () => {
  const expectedTitles = [
    "Fees",
    "Service",
    "Trial, Test Drive, and Evaluation Use",
    "Organization Accounts and Authorized Users",
    "Customer Data",
    "Acceptable Use and Security",
    "License and Access",
    "Intellectual Property",
    "Third-Party Services",
    "Service Availability and Changes",
    "Reports, Outputs, and Business Reliance",
    "Data Preservation, Export, and Loss",
    "Confidentiality and Privacy",
    "Product Measurement and Aggregated Results",
    "Electronic Communications",
    "Disclaimer of Warranties",
    "Limitation of Liability",
    "Indemnification",
    "Suspension and Termination",
    "Changes to These Terms",
    "General Contract Terms",
    "Contact",
  ];

  assert.deepEqual(
    termsOfService.sections.map((section) => section.heading),
    expectedTitles.map((title, index) => `${index + 1}. ${title}`),
  );
});

test("approved Fees language remains verbatim", () => {
  const approvedFees =
    "During this unspecified period, system access is provided to participating organizations without charge. Unless otherwise agreed in writing, participation during this period does not create an obligation to later purchase a paid subscription. DM3Oi may introduce paid plans, fees, or other commercial terms in the future. Any such terms applicable to an organization will be communicated separately before they become effective for that organization.";

  assert.deepEqual(termsOfService.sections[0]?.paragraphs, [approvedFees]);
});

test("Terms distinguish Customer Data rights from DM3Oi platform IP and limit processing", () => {
  const customerData = termsSectionText("5. Customer Data");
  const intellectualProperty = termsSectionText("8. Intellectual Property");

  assert.match(customerData, /organization retains ownership and control/);
  assert.match(customerData, /do not transfer ownership of Customer Data/);
  assert.match(
    customerData,
    /limited right to host, process, transmit, reproduce, back up, secure/,
  );
  assert.match(customerData, /only as reasonably necessary/);
  assert.match(
    intellectualProperty,
    /software, platform architecture, workflows, designs, documentation, trademarks, and reusable technology remain owned/,
  );
  assert.match(intellectualProperty, /Customer Data remains the organization's/);
});

test("Terms retain operational safeguards without promising an SLA or replacing professional advice", () => {
  const termsText = JSON.stringify(termsOfService);
  const thirdParty = termsSectionText("9. Third-Party Services");
  const outputs = termsSectionText("11. Reports, Outputs, and Business Reliance");
  const communications = termsSectionText("15. Electronic Communications");

  assert.match(thirdParty, /hosting, database, authentication/);
  assert.match(thirdParty, /mapping or geocoding/);
  assert.doesNotMatch(termsText, /service[- ]level agreement|\bSLA\b|uptime percentage/i);
  assert.match(outputs, /informational and operational support/);
  assert.match(
    outputs,
    /does not replace legal, accounting, tax, regulatory, financial, or other professional advice/,
  );
  assert.match(communications, /may be delivered electronically/);
  assert.match(communications, /marketing communications is not required/);
});

test("measurement and public-results protections remain explicit", () => {
  const measurement = termsSectionText("14. Product Measurement and Aggregated Results");

  assert.match(measurement, /service usage, workflow activity, operational performance/);
  assert.match(
    measurement,
    /product analysis, benchmarking, research, service improvement, and public descriptions/,
  );
  assert.match(measurement, /does not reasonably identify the customer organization/);
  assert.match(
    measurement,
    /Identifiable Customer Data, customer organization names, testimonials, or organization-specific results/,
  );
  assert.match(measurement, /without separate authorization/);
});

test("customer indemnification is bounded to supplied content and material acceptable-use violations", () => {
  const indemnification = termsSectionText("18. Indemnification");

  assert.match(indemnification, /Customer Data or other content supplied by the organization/);
  assert.match(indemnification, /material violation of the acceptable-use obligations/);
  assert.match(indemnification, /limited to claims caused by the organization-provided content or material misuse/);
  assert.match(indemnification, /does not apply to the extent.*DM3Oi's own acts/);
});

test("Terms intentionally defer jurisdiction and public contact facts and exclude standalone deployment terms", () => {
  const termsText = JSON.stringify(termsOfService);

  assert.doesNotMatch(
    termsText,
    /laws of the (state|commonwealth)|exclusive jurisdiction|exclusive venue|courts located in/i,
  );
  assert.doesNotMatch(termsText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(
    termsText,
    /Managed Standalone|Vercel|Supabase|owns its domain|infrastructure costs directly/i,
  );
});

test("expanded Terms remain within aligned application and migration bounds", () => {
  const content = legalDocumentContent(termsOfService);

  assert.equal(content.sections.length, 22);
  assert.ok(content.sections.length <= 30);
  assert.ok(content.introduction.length <= 12);
  assert.ok(content.introduction.every((paragraph) => paragraph.length <= 4000));
  assert.ok(content.sections.every((section) => section.heading.length <= 200));
  assert.ok(content.sections.every((section) => section.paragraphs.length <= 20));
  assert.ok(
    content.sections.every((section) =>
      section.paragraphs.every((paragraph) => paragraph.length <= 4000),
    ),
  );
  const trialSection = termsOfService.sections.find(
    (section) => section.heading === "3. Trial, Test Drive, and Evaluation Use",
  );
  assert.ok(trialSection);
  const trialText = trialSection.paragraphs.join("\n");
  assert.match(trialText, /fictitious, synthetic, anonymized/i);
  assert.match(trialText, /non-production/i);
  assert.match(trialText, /must not be relied upon as an operational system of record/i);
  assert.match(trialText, /reset, or delete an evaluation environment/i);
  assert.match(trialText, /authorized Business Owner must accept/i);
  assert.match(trialText, /clean operational environment/i);

  assert.deepEqual(parseLegalDocumentContent("TERMS_OF_SERVICE", content), content);
  assert.match(
    migration,
    /jsonb_array_length\(target_content -> 'sections'\) not between 1 and 30/,
  );
  assert.match(
    migration,
    /jsonb_array_length\(item -> 'paragraphs'\) not between 1 and 20/,
  );
});

test("migration permits only two keys and validates bounded body-only JSON", () => {
  assert.match(
    migration,
    /document_key in \('TERMS_OF_SERVICE', 'PRIVACY_POLICY'\)/,
  );
  assert.match(migration, /validate_legal_document_content/);
  assert.match(
    migration,
    /where key not in \('type', 'title', 'introduction', 'sections'\)/,
  );
  assert.doesNotMatch(migration, /insert into public\.legal_document_drafts[\s\S]*values\s*\(\s*'TERMS_OF_SERVICE'/);
});

test("all legal tables force RLS and deny direct browser and service-role table access", () => {
  for (const table of [
    "legal_document_drafts",
    "legal_document_versions",
    "legal_document_publications",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on public\\.${table}\\s+from public, anon, authenticated, service_role`,
      ),
    );
  }
});

test("management RPCs require the hardened SUPER_ADMIN predicate", () => {
  for (const functionName of [
    "get_legal_document_for_admin",
    "save_legal_document_draft",
    "publish_legal_document",
    "get_legal_document_history_for_admin",
  ]) {
    const start = migration.indexOf(
      `create or replace function public.${functionName}`,
    );
    const next = migration.indexOf("create or replace function public.", start + 1);
    const body = migration.slice(start, next === -1 ? undefined : next);
    assert.ok(start >= 0, `${functionName} is defined`);
    assert.match(body, /actor uuid := auth\.uid\(\)/);
    assert.match(body, /public\.is_super_admin\(actor\)/);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
  }
});

test("server published read is service-role-only and returns publication metadata", () => {
  assert.match(
    migration,
    /get_published_legal_document_server[\s\S]*auth\.role\(\) <> 'service_role'/,
  );
  assert.match(
    migration,
    /revoke all on function\s+public\.get_published_legal_document_server\(text\)\s+from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function\s+public\.get_published_legal_document_server\(text\)\s+to service_role/,
  );
  assert.match(migration, /'effective_date', published_row\.effective_date/);
});

test("publishing appends an immutable unique version before atomically moving the pointer", () => {
  assert.match(migration, /unique \(document_key, version\)/);
  assert.match(
    migration,
    /create trigger legal_document_versions_immutable\s+before update or delete on public\.legal_document_versions/,
  );
  assert.match(
    migration,
    /raise exception 'published legal document versions are immutable'/,
  );

  const publishStart = migration.indexOf(
    "create or replace function public.publish_legal_document",
  );
  const historyStart = migration.indexOf(
    "create or replace function public.get_legal_document_history_for_admin",
  );
  const publish = migration.slice(publishStart, historyStart);
  assert.ok(
    publish.indexOf("insert into public.legal_document_versions") <
      publish.indexOf("insert into public.legal_document_publications"),
  );
  assert.doesNotMatch(publish, /on conflict \(document_key, version\)/);
});

test("repository uses strict parsing, code fallback, and no direct table access", () => {
  assert.match(repository, /await requireSuperAdmin\(\)/);
  assert.match(repository, /createAdminClient\(\)/);
  assert.match(repository, /get_published_legal_document_server/);
  assert.match(repository, /parseLegalDocumentContent/);
  assert.match(repository, /getFallbackLegalDocument/);
  assert.match(repository, /catch \(error\)[\s\S]*return fallback/);
  assert.doesNotMatch(repository, /\.from\("legal_document_/);
});

test("public routes use the fail-safe managed server loader", () => {
  assert.match(
    termsRoute,
    /getPublishedLegalDocumentForServer\("TERMS_OF_SERVICE"\)/,
  );
  assert.match(
    privacyRoute,
    /getPublishedLegalDocumentForServer\("PRIVACY_POLICY"\)/,
  );
});

test("admin page and both actions independently require SUPER_ADMIN", () => {
  assert.match(page, /await requireSuperAdmin\(\)/);
  assert.ok((actions.match(/await requireSuperAdmin\(\)/g) ?? []).length >= 2);
  assert.match(actions, /save_legal_document_draft/);
  assert.match(actions, /publish_legal_document/);
  assert.match(actions, /confirmation !== "PUBLISH"/);
  assert.match(actions, /error=duplicate-version/);
});

test("admin UI has two tabs, structured plain-text editing, preview, publish, and immutable history", () => {
  assert.match(page, />\s*Terms of Service\s*</);
  assert.match(page, />\s*Privacy Policy\s*</);
  assert.match(editor, /Document title/);
  assert.match(editor, /Add Paragraph/);
  assert.match(editor, /Add Section/);
  assert.match(editor, /Preview Unsaved Draft/);
  assert.match(editor, /Publish Saved Draft/);
  assert.match(editor, /Publication History/);
  assert.match(editor, /Code fallback \/ not yet database-published/);
  assert.doesNotMatch(editor, /Raw JSON|JSON editor/);
});

test("Legal Documents is nested under platform Templates and no organization route is added", () => {
  assert.match(
    navigation,
    /platformTemplatesNavigation[\s\S]*href: "\/admin\/legal-documents", label: "Legal Documents"/,
  );
  const organizationNavigation = navigation.slice(
    navigation.indexOf("export const organizationNavigation"),
    navigation.indexOf("export const organizationAdministrationNavigation"),
  );
  assert.doesNotMatch(organizationNavigation, /legal-documents|Legal Documents/);
});

test("managed legal workflow adds no polling, Realtime, or background behavior", () => {
  const implementation = [repository, actions, page, editor].join("\n");
  assert.doesNotMatch(implementation, /setInterval|setTimeout|subscribe\(|channel\(|realtime/i);
});
