"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalContext, requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";
import { hasPermission } from "@/lib/auth/permissions";
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
type ExistingOption = { id: string; label: string; value: string };
const existingOptions = (form: FormData): ExistingOption[] => {
  try {
    const parsed = JSON.parse(text(form, "existingOptions"));
    return Array.isArray(parsed)
      ? parsed.filter(
          (option): option is ExistingOption =>
            typeof option?.id === "string" &&
            typeof option?.label === "string" &&
            typeof option?.value === "string",
        )
      : [];
  } catch {
    return [];
  }
};
export async function saveQuestionAction(form: FormData) {
  const access = await requireInternalContext();
  if(!hasPermission(access,"MANAGE_QUESTIONS")) fail("/questions","You are not authorized to manage this question.");
  const lines = text(form, "options")
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
  const priorOptions = existingOptions(form);
  const claimed = new Set<string>();
  const exactByLabel = new Map(priorOptions.map((option) => [option.label, option]));
  const options = lines.map((label, index) => {
    const exact = exactByLabel.get(label);
    const positional = priorOptions[index];
    const prior = exact && !claimed.has(exact.id)
      ? exact
      : positional && !claimed.has(positional.id)
        ? positional
        : undefined;
    if (prior) claimed.add(prior.id);
    return {
      id: prior?.id,
      label,
      value:
        prior?.value ??
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      display_order: index,
    };
  }) as Json;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_question_definition", {
    target_organization_id: access.activeOrganization.id,
    target_question_id: (text(form, "questionId") || null) as unknown as string,
    target_question_text: text(form, "questionText"),
    target_description: text(form, "description"),
    target_response_type: text(form, "responseType") as ResponseType,
    target_required: form.get("required") === "on",
    target_active: form.get("active") === "on",
    target_display_order: Number(text(form, "displayOrder") || 0),
    target_options: options,
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
  await requirePermission("WORK_CASES");
  const caseId = text(form, "caseId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_case_question_response", {
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
  revalidatePath(`/cases/${caseId}`);
  redirect(`/cases/${caseId}?message=Response%20saved.`);
}
