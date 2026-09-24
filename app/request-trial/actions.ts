"use server";

import { redirect } from "next/navigation";

import {
  validateTrialRequest,
  type TrialRequestUseCase,
} from "@/lib/trial-requests";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

type TrialRequestDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      submit_trial_request: {
        Args: {
          p_business_email: string;
          p_business_name: string;
          p_contact_name: string;
          p_estimated_users: number;
          p_other_use_case: string;
          p_phone: string;
          p_primary_use_case: TrialRequestUseCase;
          p_privacy_acknowledged: boolean;
          p_workflow_notes: string;
        };
        Returns: string;
      };
    };
  };
};

export async function submitTrialRequest(form: FormData) {
  if (field(form, "websiteConfirmation")) {
    redirect("/request-trial?submitted=1");
  }

  const parsed = validateTrialRequest({
    businessName: field(form, "businessName"),
    contactName: field(form, "contactName"),
    businessEmail: field(form, "businessEmail"),
    phone: field(form, "phone"),
    primaryUseCase: field(form, "primaryUseCase"),
    otherUseCase: field(form, "otherUseCase"),
    estimatedUsers: field(form, "estimatedUsers"),
    workflowNotes: field(form, "workflowNotes"),
    privacyAcknowledged:
      form.get("privacyAcknowledged") === "on",
  });

  if (!parsed.success) {
    redirect("/request-trial?error=invalid");
  }

  const supabase = (await createClient()) as ReturnType<
    typeof import("@supabase/ssr").createServerClient<TrialRequestDatabase>
  >;

  const { error } = await supabase.rpc(
    "submit_trial_request",
    {
      p_business_name: parsed.data.businessName,
      p_contact_name: parsed.data.contactName,
      p_business_email: parsed.data.businessEmail,
      p_phone: parsed.data.phone,
      p_primary_use_case: parsed.data.primaryUseCase,
      p_other_use_case: parsed.data.otherUseCase ?? "",
      p_estimated_users: parsed.data.estimatedUsers,
      p_workflow_notes: parsed.data.workflowNotes ?? "",
      p_privacy_acknowledged:
        parsed.data.privacyAcknowledged,
    },
  );

  if (error) {
    console.error(
      "Trial request submission failed:",
      error,
    );
    redirect("/request-trial?error=submit");
  }

  redirect("/request-trial?submitted=1");
}
