import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CustomerPortalCaseSummary {
  case_number: string;
  service_label: string;
  customer_status: string;
  progress_percent: number;
  intake_finalized: boolean;
  tax_outcome: "REFUND" | "BALANCE_DUE" | "ZERO_BALANCE" | null;
}

export interface CustomerPortalCaseRequirement {
  task_id: string;
  case_number: string;
  missing_documents: string[];
  reported_sent_at: string | null;
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


export async function getCustomerPortalCaseRequirements(
  portalAccessId: string,
): Promise<CustomerPortalCaseRequirement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_customer_portal_case_requirements",
    { target_portal_access_id: portalAccessId },
  );

  if (error) {
    console.error("Customer Portal case requirements query failed", {
      code: error.code,
      message: error.message,
    });
    throw new CustomerPortalCaseDataError();
  }

  return (data ?? []).flatMap((row) => {
    const documents = Array.isArray(row.missing_documents)
      ? row.missing_documents.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
      : [];

    return documents.length
      ? [{
          task_id: row.task_id,
          case_number: row.case_number,
          missing_documents: documents,
          reported_sent_at: row.reported_sent_at,
        }]
      : [];
  });
}
