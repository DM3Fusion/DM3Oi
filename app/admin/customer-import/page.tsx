import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { CustomerImportWorkspace } from "@/components/admin/customer-import-workspace";
import { CustomerAdministrativeImport } from "@/components/admin/customer-administrative-import";
import { CustomerImportSubmissionQueue } from "@/components/admin/customer-import-submission-queue";
import {
  getCustomerDataOrganizations,
  getCustomerImportSubmissionQueue,
} from "@/lib/data/customer-data-management-repository";

export const metadata = { title: "Customer Import" };

type CustomerImportTab =
  | "submissions"
  | "import"
  | "administrative"
  | "history";

function normalizeTab(
  value: string | undefined,
  hasReadyToImport: boolean,
): CustomerImportTab {
  if (
    value === "submissions" ||
    value === "import" ||
    value === "administrative" ||
    value === "history"
  ) {
    return value;
  }

  return hasReadyToImport ? "import" : "submissions";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [organizations, submissions, params] = await Promise.all([
    getCustomerDataOrganizations(),
    getCustomerImportSubmissionQueue(),
    searchParams,
  ]);

  const organizationSubmissions = submissions.filter(
    (submission) =>
      submission.submissionOrigin !== "ADMINISTRATIVE",
  );

  const activeSubmissions = organizationSubmissions.filter(
    (submission) => submission.status !== "IMPORTED",
  );

  const importedSubmissions = submissions.filter(
    (submission) => submission.status === "IMPORTED",
  );

  const readyCount = activeSubmissions.filter(
    (submission) => submission.status === "READY_TO_IMPORT",
  ).length;

  const activeTab = normalizeTab(params.tab, readyCount > 0);

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Customer Import"
        description="Review organization submissions, import prepared Customer data, and maintain completed import history."
      />

      <nav
        className="customer-import-tabs"
        aria-label="Customer Import sections"
      >
        <Link
          href="/admin/customer-import?tab=submissions"
          className={`customer-import-tab${
            activeTab === "submissions" ? " active" : ""
          }`}
          aria-current={activeTab === "submissions" ? "page" : undefined}
        >
          <span>Submissions</span>
          <small>{activeSubmissions.length}</small>
        </Link>

        <Link
          href="/admin/customer-import?tab=import"
          className={`customer-import-tab${
            activeTab === "import" ? " active" : ""
          }`}
          aria-current={activeTab === "import" ? "page" : undefined}
        >
          <span>Import Customers</span>
          {readyCount > 0 ? <small>{readyCount} ready</small> : null}
        </Link>

        <Link
          href="/admin/customer-import?tab=administrative"
          className={`customer-import-tab${
            activeTab === "administrative" ? " active" : ""
          }`}
          aria-current={
            activeTab === "administrative" ? "page" : undefined
          }
        >
          <span>Administrative Import</span>
        </Link>

        <Link
          href="/admin/customer-import?tab=history"
          className={`customer-import-tab${
            activeTab === "history" ? " active" : ""
          }`}
          aria-current={activeTab === "history" ? "page" : undefined}
        >
          <span>Import History</span>
          <small>{importedSubmissions.length}</small>
        </Link>
      </nav>

      {activeTab === "submissions" ? (
        <CustomerImportSubmissionQueue
          submissions={activeSubmissions}
          eyebrow="Organization submissions"
          title="Submitted Customer Files"
          description="Review submitted source files and prepare approved submissions for import."
          emptyTitle="No active Customer submissions"
          emptyDescription="New Owner/Admin Customer data submissions will appear here."
        />
      ) : null}

      {activeTab === "import" ? (
        <CustomerImportWorkspace
          organizations={organizations}
          submissions={submissions}
        />
      ) : null}

      {activeTab === "administrative" ? (
        <CustomerAdministrativeImport organizations={organizations} />
      ) : null}

      {activeTab === "history" ? (
        <CustomerImportSubmissionQueue
          submissions={importedSubmissions}
          eyebrow="Completed imports"
          title="Import History"
          description="Review completed Customer imports and perform authorized maintenance when required."
          emptyTitle="No completed Customer imports"
          emptyDescription="Completed imports will appear here after their import transaction finishes."
        />
      ) : null}
    </>
  );
}
