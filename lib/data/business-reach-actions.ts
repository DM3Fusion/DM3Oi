"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  businessReachGeocodeBatchLimit,
  geocodeBusinessReachCandidate,
  parseBusinessReachCandidates,
} from "@/lib/business-reach";
import { reportPeriodKeys } from "@/lib/reporting";

const reportsReturnUrl = (formData: FormData, reach: "mapped" | "empty" | "error") => {
  const requestedPeriod = String(formData.get("period") ?? "30d");
  const period = reportPeriodKeys.includes(requestedPeriod as (typeof reportPeriodKeys)[number])
    ? requestedPeriod
    : "30d";
  const compare = formData.get("compare") === "previous" ? "previous" : "none";
  const params = new URLSearchParams({ period, reach });
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (period === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    params.set("from", from);
    params.set("to", to);
  }
  if (compare === "previous") params.set("compare", compare);
  return `/reports?${params.toString()}`;
};

export async function mapBusinessReachCustomersAction(formData: FormData) {
  await requirePermission("VIEW_REPORTS");
  await requirePermission("VIEW_CUSTOMERS");
  const access = await requirePermission("EDIT_CUSTOMER");
  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const candidateResult = await supabase.rpc("get_business_reach_geocode_candidates" as never, {
    target_organization_id: organizationId,
    target_limit: businessReachGeocodeBatchLimit,
  } as never);

  if (candidateResult.error) {
    console.error("Business Reach candidate query failed", {
      code: candidateResult.error.code,
      message: candidateResult.error.message,
    });
    redirect(reportsReturnUrl(formData, "error"));
  }

  const candidates = parseBusinessReachCandidates(candidateResult.data);
  if (!candidates.length) redirect(reportsReturnUrl(formData, "empty"));
  const rows = candidates.map(geocodeBusinessReachCandidate);
  const saveResult = await supabase.rpc("save_business_reach_geocodes" as never, {
    target_organization_id: organizationId,
    target_rows: rows,
  } as never);
  if (saveResult.error) {
    console.error("Business Reach geocode save failed", {
      code: saveResult.error.code,
      message: saveResult.error.message,
    });
    redirect(reportsReturnUrl(formData, "error"));
  }

  revalidatePath("/reports");
  redirect(reportsReturnUrl(formData, "mapped"));
}
