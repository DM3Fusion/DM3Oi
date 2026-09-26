"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalContext, requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";
import { hasPermission } from "@/lib/auth/permissions";
import { synchronizeCaseRuleTasks } from "@/lib/data/rule-task-synchronization";
type ResponseType = Database["public"]["Enums"]["question_response_type"];
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (path: string, message: string): never =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);
const friendly = (m: string) =>
  m.includes("rule_definitions_condition_option_fkey")
    ? "This option is used by a Rule and cannot be removed. Rename it or retire the Rule first."
    : m.includes("not authorized")
    ? "You are not authorized to manage this question."
    : m.includes("require options")
      ? "Select questions require at least one option."
      : m.includes("invalid question response")
        ? "The response is not valid for this question type."
        : "The question change could not be saved.";
type SubmittedOption = {
  id?: string;
  label: string;
  value?: string;
  is_active: boolean;
  display_order: number;
};

const submittedOptions = (form: FormData): SubmittedOption[] => {
  try {
    const parsed = JSON.parse(text(form, "optionsJson") || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((option, index) => {
      if (
        !option ||
        typeof option.label !== "string" ||
        !option.label.trim()
      ) {
        return [];
      }
      return [{
        id: typeof option.id === "string" && option.id ? option.id : undefined,
        label: option.label.trim(),
        value:
          typeof option.value === "string" && option.value
            ? option.value
            : undefined,
        is_active: option.is_active !== false,
        display_order: index,
      }];
    });
  } catch {
    return [];
  }
};

const optionValue = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function saveQuestionAction(form: FormData) {
  const access = await requireInternalContext();
  if (!hasPermission(access, "MANAGE_QUESTIONS")) {
    fail("/questions", "You are not authorized to manage this question.");
  }

  const responseType = text(form, "responseType") as ResponseType;
  const options = submittedOptions(form).map((option) => ({
    id: option.id,
    label: option.label,
    value: option.value ?? optionValue(option.label),
    is_active: option.is_active,
    display_order: option.display_order,
  })) as Json;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_question_definition", {
    target_organization_id: access.activeOrganization.id,
    target_question_id: (text(form, "questionId") || null) as unknown as string,
    target_question_text: text(form, "questionText"),
    target_description: text(form, "description"),
    target_response_type: responseType,
    target_required: form.get("required") === "on",
    target_require_all_options: form.get("requireAllOptions") === "on",
    target_active: form.get("active") === "on",
    target_display_order: Number(text(form, "displayOrder") || 0),
    target_options: options,
    target_question_group: text(form, "questionGroup") || null,
  });
  if (error) {
    console.error("Save question failed", {
      code: error.code,
      message: error.message,
    });
    fail("/questions", friendly(error.message));
  }
  revalidatePath("/questions");
  redirect("/questions?message=Question%20saved.");
}

function responseValue(form: FormData, type: ResponseType): Json {
  const raw = text(form, "response");
  if (type === "YES_NO") return raw === "true";
  if (type === "NUMBER") return Number(raw);
  if (type === "MULTI_SELECT") return form.getAll("response").map(String);
  return raw;
}
export async function saveCaseResponseAction(form: FormData) {
  const access = await requirePermission("WORK_CASES");
  const caseId = text(form, "caseId");
  const supabase = await createClient();
  const { data: saved, error } = await supabase.rpc("save_case_question_response", {
    target_case_question_id: text(form, "caseQuestionId"),
    target_response_value: responseValue(
      form,
      text(form, "responseType") as ResponseType,
    ),
  });
  if (error) {
    console.error("Save response failed", {
      code: error.code,
      message: error.message,
    });
    fail(`/cases/${caseId}`, friendly(error.message));
  }
  if (!saved) {
    return fail(`/cases/${caseId}`, friendly(""));
  }
  try {
    await synchronizeCaseRuleTasks({
      organizationId: saved.organization_id,
      caseId: saved.case_id,
      actorUserId: access.user.id,
    });
  } catch (syncError) {
    console.error("Rule-generated Task synchronization failed after response save", syncError);
    fail(`/cases/${saved.case_id}`, "The response was saved, but Rule-generated Tasks could not be synchronized. Save the response again to retry.");
  }
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/cases/${saved.case_id}`);
  redirect(`/cases/${saved.case_id}?message=Response%20saved.`);
}
