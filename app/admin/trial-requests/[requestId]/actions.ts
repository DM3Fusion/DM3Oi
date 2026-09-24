"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

type ReviewStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "DECLINED";

const reviewStatuses: ReviewStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "DECLINED",
];

type TrialRequestActionDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      transition_trial_request: {
        Args: {
          target_trial_request_id: string;
          target_status: ReviewStatus;
          target_review_note?: string | null;
        };
        Returns: {
          id: string;
        };
      };
    };
  };
};

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function destination(
  path: string,
  key: "error" | "message",
  message: string,
) {
  return `${path}?${key}=${encodeURIComponent(message)}`;
}

export async function transitionTrialRequestAction(
  form: FormData,
) {
  await requireSuperAdmin();

  const requestId = value(form, "requestId");
  const targetStatus = value(
    form,
    "targetStatus",
  ) as ReviewStatus;
  const reviewNote = value(form, "reviewNote");

  const path = `/admin/trial-requests/${requestId}`;

  if (!requestId) {
    redirect(
      destination(
        "/admin/trial-requests",
        "error",
        "Trial request was not specified.",
      ),
    );
  }

  if (!reviewStatuses.includes(targetStatus)) {
    redirect(
      destination(
        path,
        "error",
        "Select a valid trial request action.",
      ),
    );
  }

  if (reviewNote.length > 1000) {
    redirect(
      destination(
        path,
        "error",
        "Review notes cannot exceed 1,000 characters.",
      ),
    );
  }

  const supabase = (await createClient()) as ReturnType<
    typeof import("@supabase/ssr").createServerClient<TrialRequestActionDatabase>
  >;

  const result = await supabase.rpc(
    "transition_trial_request",
    {
      target_trial_request_id: requestId,
      target_status: targetStatus,
      target_review_note: reviewNote || null,
    },
  );

  if (result.error) {
    console.error(
      "Trial request lifecycle transition failed",
      {
        code: result.error.code,
        message: result.error.message,
        requestId,
        targetStatus,
      },
    );

    const message =
      result.error.message?.includes(
        "invalid trial request status transition",
      )
        ? "That status change is not valid from the request's current status."
        : result.error.message?.includes(
              "converted trial requests cannot be changed",
            )
          ? "Converted trial requests cannot be changed."
          : result.error.message?.includes(
                "trial request already has that status",
              )
            ? "The trial request already has that status."
            : "The trial request status could not be updated.";

    redirect(destination(path, "error", message));
  }

  revalidatePath("/admin/trial-requests");
  revalidatePath(path);

  const messages: Record<ReviewStatus, string> = {
    NEW: "Trial request reopened.",
    CONTACTED: "Trial request marked contacted.",
    QUALIFIED: "Trial request qualified.",
    DECLINED: "Trial request declined.",
  };

  redirect(
    destination(
      path,
      "message",
      messages[targetStatus],
    ),
  );
}

type OrganizationConversionDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      convert_trial_request_to_organization: {
        Args: {
          target_trial_request_id: string;
          target_organization_name: string;
          target_organization_slug: string;
          target_conversion_note: string;
        };
        Returns: {
          id: string;
          name: string;
          slug: string;
          status: string;
        };
      };
    };
  };
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function convertTrialRequestAction(
  form: FormData,
) {
  await requireSuperAdmin();

  const requestId = value(form, "requestId");
  const organizationName = value(form, "organizationName");
  const organizationSlug = slugify(
    value(form, "organizationSlug"),
  );
  const conversionNote = value(form, "conversionNote");

  const path = requestId
    ? `/admin/trial-requests/${requestId}`
    : "/admin/trial-requests";

  if (!requestId) {
    redirect(
      destination(
        "/admin/trial-requests",
        "error",
        "Trial request was not specified.",
      ),
    );
  }

  if (!organizationName || organizationName.length > 160) {
    redirect(
      destination(
        path,
        "error",
        "Enter a valid organization name.",
      ),
    );
  }

  if (
    !organizationSlug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      organizationSlug,
    )
  ) {
    redirect(
      destination(
        path,
        "error",
        "Enter a valid organization slug.",
      ),
    );
  }

  if (
    !conversionNote ||
    conversionNote.length > 1000
  ) {
    redirect(
      destination(
        path,
        "error",
        "A conversion note is required and cannot exceed 1,000 characters.",
      ),
    );
  }

  const supabase = (await createClient()) as ReturnType<
    typeof import("@supabase/ssr").createServerClient<OrganizationConversionDatabase>
  >;

  const result = await supabase.rpc(
    "convert_trial_request_to_organization",
    {
      target_trial_request_id: requestId,
      target_organization_name: organizationName,
      target_organization_slug: organizationSlug,
      target_conversion_note: conversionNote,
    },
  );

  if (result.error) {
    console.error(
      "Trial request organization conversion failed",
      {
        code: result.error.code,
        message: result.error.message,
        requestId,
      },
    );

    const message =
      result.error.message?.includes(
        "organization slug already exists",
      )
        ? "That organization slug is already in use."
        : result.error.message?.includes(
              "trial request must be qualified",
            )
          ? "Only a qualified Trial Request can be converted."
          : result.error.message?.includes(
                "trial request already converted",
              )
            ? "This Trial Request has already been converted."
            : result.error.message?.includes(
                  "conversion note required",
                )
              ? "A conversion note is required."
              : "The Trial Request could not be converted to an organization.";

    redirect(destination(path, "error", message));
  }

  if (!result.data?.id) {
    redirect(
      destination(
        path,
        "error",
        "The organization could not be confirmed after conversion.",
      ),
    );
  }

  revalidatePath("/");
  revalidatePath("/admin/organizations");
  revalidatePath("/admin/trial-requests");
  revalidatePath(path);

  redirect(
    destination(
      `/admin/organizations/${result.data.id}`,
      "message",
      "Organization created from Trial Request.",
    ),
  );
}

type WorkflowFit =
  | "FIT"
  | "NEEDS_REVIEW"
  | "NOT_FIT";

const workflowFits: WorkflowFit[] = [
  "FIT",
  "NEEDS_REVIEW",
  "NOT_FIT",
];

type QualificationReviewDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      review_trial_request_qualification: {
        Args: {
          target_trial_request_id: string;
          target_workflow_fit: WorkflowFit;
          target_notes?: string | null;
        };
        Returns: {
          id: string;
        };
      };
    };
  };
};

export async function reviewTrialRequestQualificationAction(
  form: FormData,
) {
  await requireSuperAdmin();

  const requestId = value(form, "requestId");
  const workflowFit = value(
    form,
    "workflowFit",
  ) as WorkflowFit;
  const qualificationNotes = value(
    form,
    "qualificationNotes",
  );

  const path = requestId
    ? `/admin/trial-requests/${requestId}`
    : "/admin/trial-requests";

  if (!requestId) {
    redirect(
      destination(
        "/admin/trial-requests",
        "error",
        "Trial request was not specified.",
      ),
    );
  }

  if (!workflowFits.includes(workflowFit)) {
    redirect(
      destination(
        path,
        "error",
        "Select a valid workflow fit assessment.",
      ),
    );
  }

  if (qualificationNotes.length > 2000) {
    redirect(
      destination(
        path,
        "error",
        "Qualification notes cannot exceed 2,000 characters.",
      ),
    );
  }

  const supabase = (await createClient()) as ReturnType<
    typeof import("@supabase/ssr").createServerClient<QualificationReviewDatabase>
  >;

  const result = await supabase.rpc(
    "review_trial_request_qualification",
    {
      target_trial_request_id: requestId,
      target_workflow_fit: workflowFit,
      target_notes: qualificationNotes || null,
    },
  );

  if (result.error) {
    console.error(
      "Trial request qualification review failed",
      {
        code: result.error.code,
        message: result.error.message,
        requestId,
        workflowFit,
      },
    );

    const message =
      result.error.message?.includes(
        "converted trial requests cannot be reviewed",
      )
        ? "Converted Trial Requests cannot be reviewed."
        : result.error.message?.includes(
              "qualification notes too long",
            )
          ? "Qualification notes cannot exceed 2,000 characters."
          : "The qualification review could not be saved.";

    redirect(destination(path, "error", message));
  }

  revalidatePath("/admin/trial-requests");
  revalidatePath(path);

  redirect(
    destination(
      path,
      "message",
      "Qualification review saved.",
    ),
  );
}
