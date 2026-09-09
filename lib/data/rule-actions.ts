"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";

type Operator = Database["public"]["Enums"]["rule_condition_operator"];
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const fail = (message: string): never => redirect(`/questions?view=rules&error=${encodeURIComponent(message)}`);
const friendly = (message: string) =>
  message.includes("changed") ? "This Rule changed after you opened it. Reload and try again."
  : message.includes("cycle") ? "This Rule would create a Question dependency cycle."
  : message.includes("active source") ? "Select an active source Question."
  : message.includes("active target") ? "Select an active target Question."
  : message.includes("option") ? "Select a valid value for the source Question."
  : message.includes("not authorized") ? "You are not authorized to manage Rules."
  : "The Rule could not be saved. Check its condition and actions.";

export async function saveRuleAction(form: FormData) {
  const access = await requirePermission("MANAGE_RULES");
  let actions: Json = [];
  try {
    const parsed: unknown = JSON.parse(value(form, "actions"));
    if (!Array.isArray(parsed)) throw new Error("invalid");
    actions = parsed as Json;
  } catch { fail("Add at least one valid action."); }
  const db = await createClient();
  const { error } = await db.rpc("save_rule_definition", {
    target_organization_id: access.activeOrganization.id,
    target_rule_id: value(form, "ruleId") || null,
    target_name: value(form, "name"),
    target_description: value(form, "description"),
    target_source_question_id: value(form, "sourceQuestionId"),
    target_condition_operator: value(form, "operator") as Operator,
    target_condition_option_id: value(form, "conditionOptionId") || null,
    target_active: form.get("active") === "on",
    target_display_order: Number(value(form, "displayOrder") || 0),
    target_actions: actions,
    expected_updated_at: value(form, "expectedUpdatedAt") || null,
  });
  if (error) {
    console.error("Save Rule failed", { code: error.code, message: error.message });
    fail(friendly(error.message));
  }
  revalidatePath("/questions");
  redirect("/questions?view=rules&message=Rule%20saved.");
}
