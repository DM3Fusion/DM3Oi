"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  businessReachGeocodeBatchLimit,
  buildBusinessReachAddressBatch,
  buildBusinessReachGeocodeWrites,
  parseBusinessReachCandidates,
} from "@/lib/business-reach";
import { BusinessReachGeocoderError, geocodeBusinessReachAddresses } from "@/lib/data/business-reach-geocoder";
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
  const candidateResult = await supabase.rpc("get_business_reach_geocode_candidates", {
    target_organization_id: organizationId,
    target_limit: businessReachGeocodeBatchLimit,
  });

  if (candidateResult.error) {
    console.error("Business Reach candidate query failed", {
      code: candidateResult.error.code,
      message: candidateResult.error.message,
    });
    redirect(reportsReturnUrl(formData, "error"));
  }

  const candidates = parseBusinessReachCandidates(candidateResult.data);
  if (!candidates.length) redirect(reportsReturnUrl(formData, "empty"));
  const batch = buildBusinessReachAddressBatch(candidates);
  let geocoded;
  try {
    geocoded = await geocodeBusinessReachAddresses(batch.uniqueAddresses);
  } catch (error) {
    const providerError = error instanceof BusinessReachGeocoderError ? error : null;
    console.error("Business Reach provider request failed", {
      provider: "US_CENSUS_BATCH",
      candidateCount: candidates.length,
      uniqueAddressCount: batch.uniqueAddresses.length,
      errorClass: providerError?.kind ?? "UNKNOWN",
      status: providerError?.status ?? null,
    });
    redirect(reportsReturnUrl(formData, "error"));
  }
  const rows = [
    ...batch.invalidWrites,
    ...buildBusinessReachGeocodeWrites(batch.uniqueAddresses, geocoded),
  ];
  const saveResult = await supabase.rpc("save_business_reach_geocodes", {
    target_organization_id: organizationId,
    target_rows: rows,
  });
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
