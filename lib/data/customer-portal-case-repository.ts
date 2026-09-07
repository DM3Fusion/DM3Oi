import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CustomerPortalCaseSummary {
  case_number: string;
  service_label: string;
  customer_status: string;
  progress_percent: number;
}

export class CustomerPortalCaseDataError extends Error {
  constructor() {
    super("Customer Portal case information is temporarily unavailable.");
    this.name = "CustomerPortalCaseDataError";
  }
}

export async function getCustomerPortalCases(portalAccessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_customer_portal_cases" as never,
    { target_portal_access_id: portalAccessId } as never,
  );
  if (error) {
    console.error("Customer Portal case summary query failed", {
      code: error.code,
      message: error.message,
    });
    throw new CustomerPortalCaseDataError();
  }
  return (data ?? []) as CustomerPortalCaseSummary[];
}
