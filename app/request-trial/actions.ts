"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { notifyPlatformAdministratorsOfTrialRequest } from "@/lib/data/trial-request-notification-service";
import { validateTrialRequest } from "@/lib/trial-requests";
import { createClient } from "@/lib/supabase/server";

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

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

  const supabase = await createClient();

  const { data: trialRequestId, error } = await supabase.rpc(
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

  if (typeof trialRequestId === "string") {
    after(async () => {
      try {
        await notifyPlatformAdministratorsOfTrialRequest(trialRequestId);
      } catch (notificationError) {
        console.error("Trial request administrative email follow-up failed", {
          trialRequestId,
          code:
            (notificationError as { code?: string }).code ?? "UNKNOWN",
        });
      }
    });
  } else {
    console.error("Trial request notification could not be scheduled", {
      code: "TRIAL_REQUEST_ID_UNAVAILABLE",
    });
  }

  redirect("/request-trial?submitted=1");
}
