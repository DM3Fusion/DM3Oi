import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createOrganizationAction } from "@/lib/data/platform-actions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

type WorkflowFit =
  | "FIT"
  | "NEEDS_REVIEW"
  | "NOT_FIT";

type TrialRequestForOrganization = {
  id: string;
  request_number: number;
  status:
    | "NEW"
    | "CONTACTED"
    | "QUALIFIED"
    | "DECLINED"
    | "CONVERTED";
  business_name: string;
  contact_name: string;
  business_email: string;
  workflow_fit: WorkflowFit | null;
  qualification_reviewed_at: string | null;
  qualification_reviewed_by: string | null;
  converted_organization_id: string | null;
};

type OrganizationNewDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      trial_requests: {
        Row: TrialRequestForOrganization;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

function suggestedSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    trialRequestId?: string;
  }>;
}) {
  await requireSuperAdmin();

  const params = await searchParams;
  const trialRequestId =
    params.trialRequestId?.trim() || null;

  let trialRequest: TrialRequestForOrganization | null =
    null;
  let trialRequestError: string | null = null;

  if (trialRequestId) {
    const supabase = (await createClient()) as ReturnType<
      typeof import("@supabase/ssr").createServerClient<OrganizationNewDatabase>
    >;

    const result = await supabase
      .from("trial_requests")
      .select(
        "id,request_number,status,business_name,contact_name,business_email,workflow_fit,qualification_reviewed_at,qualification_reviewed_by,converted_organization_id",
      )
      .eq("id", trialRequestId)
      .maybeSingle();

    if (result.error) {
      console.error(
        "Trial Request organization configuration lookup failed",
        {
          code: result.error.code,
          message: result.error.message,
          trialRequestId,
        },
      );

      trialRequestError =
        "The Trial Request could not be loaded.";
    } else if (!result.data) {
      trialRequestError =
        "The Trial Request was not found.";
    } else {
      const candidate =
        result.data as unknown as TrialRequestForOrganization;

      const qualificationReady =
        candidate.workflow_fit === "FIT" &&
        Boolean(candidate.qualification_reviewed_at) &&
        Boolean(candidate.qualification_reviewed_by);

      if (
        candidate.status !== "QUALIFIED" ||
        candidate.converted_organization_id ||
        !qualificationReady
      ) {
        trialRequestError =
          "This Trial Request is not available for organization configuration.";
      } else {
        trialRequest = candidate;
      }
    }
  }

  const error = params.error || trialRequestError;
  const cancelHref = trialRequestId
    ? `/admin/trial-requests/${trialRequestId}`
    : "/admin/organizations";

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title={
          trialRequest
            ? "Configure organization"
            : "Create organization"
        }
        description={
          trialRequest
            ? `Trial Request #${trialRequest.request_number}`
            : undefined
        }
      />

      <section className="panel form-panel admin-form-panel">
        {error ? (
          <div className="form-alert">{error}</div>
        ) : null}

        {trialRequestId && !trialRequest ? (
          <div className="form-actions">
            <Link href={cancelHref}>
              Back to Trial Request
            </Link>
          </div>
        ) : (
          <form
            action={createOrganizationAction}
            className="entity-form"
          >
            {trialRequest ? (
              <input
                type="hidden"
                name="trialRequestId"
                value={trialRequest.id}
              />
            ) : null}

            <div className="form-grid">
              <label className="full">
                <span>Organization name</span>
                <input
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={
                    trialRequest?.business_name ?? ""
                  }
                />
              </label>

              <label className="full">
                <span>Slug</span>
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="business-name"
                  defaultValue={
                    trialRequest
                      ? suggestedSlug(
                          trialRequest.business_name,
                        )
                      : ""
                  }
                />
                <small>
                  Lowercase letters, numbers, and hyphens.
                </small>
              </label>

              {trialRequest ? (
                <>
                  <div className="full">
                    <h2>Initial Business Owner</h2>
                    <small>
                      The Trial Request contact will receive Business Owner access to this organization.
                    </small>
                  </div>

                  <label>
                    <span>Owner name</span>
                    <input
                      name="ownerDisplayName"
                      required
                      maxLength={100}
                      defaultValue={trialRequest.contact_name}
                    />
                  </label>

                  <label>
                    <span>Owner email</span>
                    <input
                      name="ownerEmail"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      defaultValue={trialRequest.business_email}
                    />
                  </label>

                  <label className="full">
                    <span>Conversion Note</span>
                    <textarea
                      name="conversionNote"
                      rows={4}
                      required
                      maxLength={1000}
                      placeholder="Document the approval or reason for creating this organization."
                    />
                    <small>
                      This note becomes part of the Trial Request
                      status history.
                    </small>
                  </label>
                </>
              ) : null}
            </div>

            <div className="form-actions">
              <Link href={cancelHref}>Cancel</Link>

              <button className="primary-button">
                Create Organization
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
