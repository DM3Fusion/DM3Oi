import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";
import {
  trialRequestUseCaseLabels,
  type TrialRequestUseCase,
} from "@/lib/trial-requests";
import {
  reviewTrialRequestQualificationAction,
  transitionTrialRequestAction,
} from "./actions";

type TrialRequestStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "DECLINED"
  | "CONVERTED";

type WorkflowFit =
  | "FIT"
  | "NEEDS_REVIEW"
  | "NOT_FIT";

type TrialRequestDetail = {
  id: string;
  request_number: number;
  status: TrialRequestStatus;
  business_name: string;
  contact_name: string;
  business_email: string;
  phone: string | null;
  primary_use_case: TrialRequestUseCase;
  other_use_case: string | null;
  estimated_users: number;
  workflow_notes: string | null;
  privacy_acknowledged_at: string;
  workflow_fit: WorkflowFit | null;
  qualification_notes: string | null;
  qualification_reviewed_at: string | null;
  qualification_reviewed_by: string | null;
  contacted_at: string | null;
  qualified_at: string | null;
  declined_at: string | null;
  converted_at: string | null;
  converted_organization_id: string | null;
  created_at: string;
  updated_at: string;
};

type HistoryRow = {
  id: string;
  prior_status: TrialRequestStatus;
  resulting_status: TrialRequestStatus;
  review_note: string | null;
  actor_user_id: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type SearchParams = {
  message?: string;
  error?: string;
};

type TrialRequestDetailDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      trial_requests: {
        Row: TrialRequestDetail;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      trial_request_status_history: {
        Row: HistoryRow & {
          trial_request_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

const requestColumns = [
  "id",
  "request_number",
  "status",
  "business_name",
  "contact_name",
  "business_email",
  "phone",
  "primary_use_case",
  "other_use_case",
  "estimated_users",
  "workflow_notes",
  "privacy_acknowledged_at",
  "workflow_fit",
  "qualification_notes",
  "qualification_reviewed_at",
  "qualification_reviewed_by",
  "contacted_at",
  "qualified_at",
  "declined_at",
  "converted_at",
  "converted_organization_id",
  "created_at",
  "updated_at",
].join(",");

const trialRequestTimeZone = "America/New_York";

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: trialRequestTimeZone,
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function operationalNeed(request: TrialRequestDetail) {
  if (
    request.primary_use_case ===
      "OTHER_OPERATIONAL_WORKFLOW" &&
    request.other_use_case
  ) {
    return request.other_use_case;
  }

  return trialRequestUseCaseLabels[
    request.primary_use_case
  ];
}

function allowedActions(
  status: TrialRequestStatus,
): Array<{
  status:
    | "NEW"
    | "CONTACTED"
    | "QUALIFIED"
    | "DECLINED";
  label: string;
  primary?: boolean;
}> {
  switch (status) {
    case "NEW":
      return [
        {
          status: "CONTACTED",
          label: "Mark Contacted",
          primary: true,
        },
        {
          status: "DECLINED",
          label: "Decline Request",
        },
      ];

    case "CONTACTED":
      return [
        {
          status: "QUALIFIED",
          label: "Qualify Request",
          primary: true,
        },
        {
          status: "DECLINED",
          label: "Decline Request",
        },
      ];

    case "QUALIFIED":
      return [
        {
          status: "CONTACTED",
          label: "Return to Contacted",
        },
        {
          status: "DECLINED",
          label: "Decline Request",
        },
      ];

    case "DECLINED":
      return [
        {
          status: "NEW",
          label: "Reopen Request",
          primary: true,
        },
        {
          status: "CONTACTED",
          label: "Reopen as Contacted",
        },
      ];

    default:
      return [];
  }
}

export default async function TrialRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireSuperAdmin();

  const { requestId } = await params;
  const query = await searchParams;
  const supabase = (await createClient()) as ReturnType<
    typeof import("@supabase/ssr").createServerClient<TrialRequestDetailDatabase>
  >;

  const requestResult = await supabase
    .from("trial_requests")
    .select(requestColumns)
    .eq("id", requestId)
    .maybeSingle();

  if (requestResult.error) {
    console.error("Trial request detail lookup failed", {
      code: requestResult.error.code,
      message: requestResult.error.message,
      requestId,
    });

    throw new Error("TRIAL_REQUEST_LOOKUP_FAILED");
  }

  if (!requestResult.data) {
    notFound();
  }

  const request =
    requestResult.data as unknown as TrialRequestDetail;

  const historyResult = await supabase
    .from("trial_request_status_history")
    .select(
      "id,prior_status,resulting_status,review_note,actor_user_id,created_at",
    )
    .eq("trial_request_id", requestId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (historyResult.error) {
    console.error(
      "Trial request history lookup failed",
      {
        code: historyResult.error.code,
        message: historyResult.error.message,
        requestId,
      },
    );

    throw new Error("TRIAL_REQUEST_HISTORY_LOOKUP_FAILED");
  }

  const history =
    (historyResult.data ?? []) as HistoryRow[];

  const actorIds = [
    ...new Set(history.map((item) => item.actor_user_id)),
  ];

  let profiles: ProfileRow[] = [];

  if (actorIds.length) {
    const profileResult = await supabase
      .from("profiles")
      .select("id,display_name,email")
      .in("id", actorIds);

    if (profileResult.error) {
      console.error(
        "Trial request reviewer lookup failed",
        {
          code: profileResult.error.code,
          message: profileResult.error.message,
          requestId,
        },
      );
    } else {
      profiles =
        (profileResult.data ?? []) as ProfileRow[];
    }
  }

  const profileById = new Map(
    profiles.map((profile) => [
      profile.id,
      profile,
    ]),
  );

  const qualificationReady =
    request.workflow_fit === "FIT" &&
    Boolean(request.qualification_reviewed_at) &&
    Boolean(request.qualification_reviewed_by);

  const actions = allowedActions(request.status).filter(
    (action) =>
      action.status !== "QUALIFIED" ||
      qualificationReady,
  );

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title={`Trial Request #${request.request_number}`}
        description={request.business_name}
      />

      <div className="trial-request-detail-back">
        <Link href="/admin/trial-requests">
          ← Back to Trial Requests
        </Link>
      </div>

      {query.message ? (
        <div className="form-alert success">
          {query.message}
        </div>
      ) : null}

      {query.error ? (
        <div className="form-alert">
          {query.error}
        </div>
      ) : null}

      <div className="trial-request-detail-grid">
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <h2>Trial Request</h2>
              <p>
                Information submitted by the prospective
                organization.
              </p>
            </div>

            <Badge value={request.status} />
          </div>

          <dl className="trial-request-detail-list">
            <div>
              <dt>Company</dt>
              <dd>{request.business_name}</dd>
            </div>

            <div>
              <dt>Contact</dt>
              <dd>{request.contact_name}</dd>
            </div>

            <div>
              <dt>Email</dt>
              <dd>
                <a
                  href={`mailto:${request.business_email}`}
                >
                  {request.business_email}
                </a>
              </dd>
            </div>

            <div>
              <dt>Phone</dt>
              <dd>{request.phone || "—"}</dd>
            </div>

            <div>
              <dt>Primary Operational Need</dt>
              <dd>{operationalNeed(request)}</dd>
            </div>

            <div>
              <dt>Estimated Users</dt>
              <dd>{request.estimated_users}</dd>
            </div>

            <div>
              <dt>Submitted</dt>
              <dd>{formatDate(request.created_at)}</dd>
            </div>

            <div>
              <dt>Privacy Acknowledged</dt>
              <dd>
                {formatDate(
                  request.privacy_acknowledged_at,
                )}
              </dd>
            </div>
          </dl>

          <div className="trial-request-notes">
            <h3>Workflow Notes</h3>
            <p>
              {request.workflow_notes ||
                "No workflow notes were submitted."}
            </p>
          </div>
        </section>

        <aside className="panel detail-section trial-request-review-panel">
          <div className="section-head">
            <div>
              <h2>Review</h2>
              <p>
                Manage the prospect review lifecycle.
              </p>
            </div>
          </div>

          <dl className="trial-request-review-dates">
            <div>
              <dt>Current Status</dt>
              <dd>
                <Badge value={request.status} />
              </dd>
            </div>

            <div>
              <dt>Contacted</dt>
              <dd>
                {formatDate(request.contacted_at)}
              </dd>
            </div>

            <div>
              <dt>Qualified</dt>
              <dd>
                {formatDate(request.qualified_at)}
              </dd>
            </div>

            <div>
              <dt>Declined</dt>
              <dd>
                {formatDate(request.declined_at)}
              </dd>
            </div>

            <div>
              <dt>Converted</dt>
              <dd>
                {formatDate(request.converted_at)}
              </dd>
            </div>
          </dl>

          {request.status === "CONVERTED" ? (
            <div className="trial-request-converted-note">
              This request has been converted to an
              organization and its review status is locked.
            </div>
          ) : (
            <div className="trial-request-review-guidance">
              Lifecycle actions are available after the
              qualification assessment below.
            </div>
          )}
        </aside>
      </div>

      {request.status !== "CONVERTED" ? (
        <section className="panel detail-section trial-request-qualification-panel">
          <div className="section-head">
            <div>
              <h2>Qualification Review</h2>
              <p>
                Assess whether this prospect is an appropriate operational
                fit before qualifying the Trial Request.
              </p>
            </div>
          </div>

          <form
            action={reviewTrialRequestQualificationAction}
            className="trial-request-qualification-form"
          >
            <input
              type="hidden"
              name="requestId"
              value={request.id}
            />

            <div className="trial-request-qualification-fields">
              <label>
                <span>Workflow Fit</span>
                <select
                  name="workflowFit"
                  required
                  defaultValue={request.workflow_fit ?? ""}
                >
                  <option value="" disabled>
                    Select workflow fit
                  </option>
                  <option value="FIT">Fit</option>
                  <option value="NEEDS_REVIEW">
                    Needs Review
                  </option>
                  <option value="NOT_FIT">
                    Not Fit
                  </option>
                </select>
              </label>

              <div className="trial-request-qualification-state">
                <span>Qualification Status</span>
                <strong>
                  {qualificationReady
                    ? request.status === "NEW"
                      ? "Ready After Contact"
                      : request.status === "CONTACTED"
                        ? "Ready to Qualify"
                        : request.status === "QUALIFIED"
                          ? "Qualified"
                          : "Qualification Complete"
                    : request.qualification_reviewed_at
                      ? "Review Saved — Not Ready"
                      : "Review Required"}
                </strong>
                {request.qualification_reviewed_at ? (
                  <small>
                    Last reviewed{" "}
                    {formatDate(
                      request.qualification_reviewed_at,
                    )}
                  </small>
                ) : null}
              </div>
            </div>

            <label className="trial-request-qualification-notes">
              <span>
                Qualification Notes{" "}
                <small>
                  Required for Needs Review or Not Fit
                </small>
              </span>
              <textarea
                name="qualificationNotes"
                rows={5}
                maxLength={2000}
                defaultValue={
                  request.qualification_notes ?? ""
                }
                placeholder="Document the operational fit assessment and any qualification considerations."
              />
            </label>

            <div className="trial-request-qualification-actions">
              <PendingSubmitButton
                className="secondary-button"
                pendingLabel="Saving…"
              >
                Save Qualification Review
              </PendingSubmitButton>

              {!qualificationReady ? (
                <span>
                  Workflow Fit must be saved as Fit before this
                  request can be qualified.
                </span>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {request.status !== "CONVERTED" && actions.length ? (
        <section className="panel detail-section trial-request-decision-panel">
          <div className="section-head">
            <div>
              <h2>Review Decision</h2>
              <p>
                Advance or decline this Trial Request based on
                the completed review.
              </p>
            </div>
          </div>

          <form
            action={transitionTrialRequestAction}
            className="trial-request-review-form"
          >
            <input
              type="hidden"
              name="requestId"
              value={request.id}
            />

            <label>
              <span>Review Note</span>
              <textarea
                name="reviewNote"
                rows={4}
                maxLength={1000}
                placeholder="Optional note about this review action"
              />
            </label>

            <div className="trial-request-review-actions">
              {actions.map((action) => (
                <PendingSubmitButton
                  key={action.status}
                  type="submit"
                  name="targetStatus"
                  value={action.status}
                  className={
                    action.primary
                      ? "primary-button"
                      : "secondary-button"
                  }
                  pendingLabel="Updating…"
                >
                  {action.label}
                </PendingSubmitButton>
              ))}
            </div>
          </form>
        </section>
      ) : null}

      {request.status === "QUALIFIED" ? (
        <section className="panel detail-section trial-request-conversion-panel">
          <div className="section-head">
            <div>
              <h2>Organization Setup</h2>
              <p>
                Qualification is complete. Configure the organization
                before converting this Trial Request.
              </p>
            </div>

            <Link
              href={`/admin/organizations/new?trialRequestId=${request.id}`}
              className="primary-button"
            >
              Configure Organization
            </Link>
          </div>
        </section>
      ) : null}

      {request.status === "CONVERTED" &&
      request.converted_organization_id ? (
        <section className="panel detail-section trial-request-conversion-panel">
          <div className="section-head">
            <div>
              <h2>Organization Conversion</h2>
              <p>
                This Trial Request has been converted and permanently
                linked to its organization.
              </p>
            </div>

            <Link
              href={`/admin/organizations/${request.converted_organization_id}`}
              className="primary-button"
            >
              View Organization
            </Link>
          </div>
        </section>
      ) : null}

      <section className="panel detail-section trial-request-history">
        <div className="section-head">
          <div>
            <h2>Review Activity</h2>
            <p>
              Immutable history of Trial Request lifecycle
              changes.
            </p>
          </div>
        </div>

        {history.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reviewer</th>
                  <th>Previous</th>
                  <th>Result</th>
                  <th>Review Note</th>
                </tr>
              </thead>

              <tbody>
                {history.map((item) => {
                  const profile = profileById.get(
                    item.actor_user_id,
                  );

                  return (
                    <tr key={item.id}>
                      <td>
                        {formatDate(item.created_at)}
                      </td>
                      <td>
                        {profile?.display_name ||
                          profile?.email ||
                          "SUPER_ADMIN"}
                      </td>
                      <td>
                        <Badge
                          value={item.prior_status}
                        />
                      </td>
                      <td>
                        <Badge
                          value={item.resulting_status}
                        />
                      </td>
                      <td>
                        {item.review_note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-results">
            No review activity yet.
          </div>
        )}
      </section>
    </>
  );
}
