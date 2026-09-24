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
