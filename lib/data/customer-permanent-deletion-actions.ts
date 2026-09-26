"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export type CustomerDeletionBlocker = {
  code: string;
  label: string;
  count: number;
};

export type CustomerDeletionPreview = {
  exists: boolean;
  eligible: boolean;
  customerId?: string;
  customerNumber?: string;
  customerName?: string;
  blockers: CustomerDeletionBlocker[];
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parsePreview = (value: unknown): CustomerDeletionPreview => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      exists: false,
      eligible: false,
      blockers: [
        {
          code: "CHECK_FAILED",
          label: "Dependency checks could not be completed.",
          count: 0,
        },
      ],
    };
  }

  const record = value as Record<string, unknown>;
  const rawBlockers = Array.isArray(record.blockers) ? record.blockers : [];

  const blockers = rawBlockers.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];

    const blocker = item as Record<string, unknown>;

    return [
      {
        code:
          typeof blocker.code === "string"
            ? blocker.code
            : "UNKNOWN_DEPENDENCY",
        label:
          typeof blocker.label === "string"
            ? blocker.label
            : "Protected Customer dependency exists.",
        count:
          typeof blocker.count === "number" && Number.isFinite(blocker.count)
            ? blocker.count
            : 0,
      },
    ];
  });

  return {
    exists: record.exists === true,
    eligible: record.eligible === true && blockers.length === 0,
    customerId:
      typeof record.customer_id === "string"
        ? record.customer_id
        : undefined,
    customerNumber:
      typeof record.customer_number === "string"
        ? record.customer_number
        : undefined,
    customerName:
      typeof record.customer_name === "string"
        ? record.customer_name
        : undefined,
    blockers,
  };
};

async function requireSuperAdminCustomerContext(customerId: string) {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;

  if (
    !access?.user?.id ||
    !access.isSuperAdmin ||
    !organizationId ||
    !uuidPattern.test(customerId)
  ) {
    return null;
  }

  return { access, organizationId };
}

export async function getCustomerDeletionPreviewAction(
  customerId: string,
): Promise<
  | { ok: true; preview: CustomerDeletionPreview }
  | { ok: false; error: string }
> {
  const context = await requireSuperAdminCustomerContext(customerId);

  if (!context) {
    return {
      ok: false,
      error: "You are not authorized to permanently delete this Customer.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "super_admin_customer_deletion_preview" as never,
    {
      target_organization_id: context.organizationId,
      target_customer_id: customerId,
    } as never,
  );

  if (error) {
    console.error("Customer deletion preview failed", {
      customerId,
      organizationId: context.organizationId,
      code: error.code,
      message: error.message,
    });

    return {
      ok: false,
      error: "Customer dependency checks could not be completed.",
    };
  }

  return {
    ok: true,
    preview: parsePreview(data),
  };
}

export async function permanentlyDeleteCustomerAction(
  customerId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
    }
> {
  const context = await requireSuperAdminCustomerContext(customerId);

  if (!context) {
    return {
      ok: false,
      error: "You are not authorized to permanently delete this Customer.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "super_admin_permanently_delete_customer" as never,
    {
      target_organization_id: context.organizationId,
      target_customer_id: customerId,
    } as never,
  );

  if (error) {
    console.error("Permanent Customer deletion failed", {
      customerId,
      organizationId: context.organizationId,
      code: error.code,
      message: error.message,
      details: error.details,
    });

    if (error.code === "23514") {
      return {
        ok: false,
        error:
          "This Customer now has protected history or relationships and cannot be permanently deleted.",
      };
    }

    if (error.code === "P0002") {
      return {
        ok: false,
        error: "The Customer no longer exists.",
      };
    }

    return {
      ok: false,
      error: "The Customer could not be permanently deleted.",
    };
  }

  revalidatePath("/customers");
  revalidatePath("/cases");
  revalidatePath("/service-desk");

  return { ok: true };
}
