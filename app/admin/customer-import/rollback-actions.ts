"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/context";
import {
  getCustomerDeletionPreviewForOrganizationAction,
  permanentlyDeleteCustomerForOrganizationAction,
  type CustomerDeletionBlocker,
} from "@/lib/data/customer-permanent-deletion-actions";
import { createAdminClient } from "@/lib/supabase/admin";

const DELETE_BATCH_SIZE = 100;
const PREVIEW_CONCURRENCY = 8;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RollbackSubmission = {
  id: string;
  organization_id: string;
  original_filename: string;
  status: string;
  imported_at: string | null;
  import_result: unknown;
};

export type CustomerImportRollbackBlocker = {
  code: string;
  label: string;
  customerCount: number;
  rowCount: number;
};

export type CustomerImportRollbackPreview = {
  submissionId: string;
  organizationId: string;
  originalFilename: string;
  importedAt: string | null;
  auditedCreated: number;
  currentlyPresent: number;
  alreadyMissing: number;
  eligible: number;
  blocked: number;
  blockerCategories: CustomerImportRollbackBlocker[];
  batchSize: number;
};

type RollbackState = CustomerImportRollbackPreview & {
  eligibleCustomerIds: string[];
};

type RollbackActionResult =
  | { ok: true; preview: CustomerImportRollbackPreview }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractCreatedCustomerIds(importResult: unknown) {
  if (!isRecord(importResult) || !Array.isArray(importResult.outcomes)) {
    throw new Error("The persisted import result is malformed.");
  }

  if (
    typeof importResult.created !== "number" ||
    !Number.isSafeInteger(importResult.created) ||
    importResult.created < 0
  ) {
    throw new Error("The persisted import created count is malformed.");
  }

  const customerIds: string[] = [];
  const allowedClassifications = new Set([
    "CREATED",
    "EXACT",
    "DUPLICATE",
    "INVALID",
  ]);

  for (const outcome of importResult.outcomes) {
    if (!isRecord(outcome)) {
      throw new Error("The persisted import outcomes are malformed.");
    }

    const classification = outcome.classification;

    if (
      typeof classification !== "string" ||
      !allowedClassifications.has(classification)
    ) {
      throw new Error("The persisted import outcome classification is invalid.");
    }

    if (classification !== "CREATED") continue;

    if (
      typeof outcome.customer_id !== "string" ||
      !uuidPattern.test(outcome.customer_id)
    ) {
      throw new Error("A created import outcome has no valid Customer ID.");
    }

    customerIds.push(outcome.customer_id);
  }

  if (customerIds.length !== importResult.created) {
    throw new Error("The persisted import created count is ambiguous.");
  }

  if (new Set(customerIds).size !== customerIds.length) {
    throw new Error("The persisted import contains duplicate Customer IDs.");
  }

  return customerIds;
}

async function inConcurrentChunks<T, R>(
  items: T[],
  size: number,
  operation: (item: T) => Promise<R>,
) {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += size) {
    results.push(
      ...(await Promise.all(items.slice(index, index + size).map(operation))),
    );
  }

  return results;
}

async function loadImportedSubmission(submissionId: string) {
  if (!uuidPattern.test(submissionId)) {
    throw new Error("Select a valid Customer import submission.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customer_import_submissions")
    .select(
      "id,organization_id,original_filename,status,imported_at,import_result",
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (error) {
    console.error("Customer import rollback submission lookup failed", {
      operation: "customer_import_rollback_submission_lookup",
      submissionId,
      code: error.code,
      message: error.message,
    });
    throw new Error("The Customer import submission could not be loaded.");
  }

  if (!data) throw new Error("The Customer import submission was not found.");

  const submission = data as RollbackSubmission;

  if (submission.status !== "IMPORTED" || !submission.imported_at) {
    throw new Error("Only completed Customer imports can be rolled back.");
  }

  return { admin, submission };
}

async function loadCurrentCustomers(
  admin: ReturnType<typeof createAdminClient>,
  customerIds: string[],
) {
  const customers: { id: string; organization_id: string }[] = [];

  for (let index = 0; index < customerIds.length; index += 100) {
    const { data, error } = await admin
      .from("customers")
      .select("id,organization_id")
      .in("id", customerIds.slice(index, index + 100));

    if (error) {
      console.error("Customer import rollback Customer lookup failed", {
        operation: "customer_import_rollback_customer_lookup",
        code: error.code,
        message: error.message,
      });
      throw new Error("Imported Customers could not be verified.");
    }

    customers.push(...(data ?? []));
  }

  return customers;
}

function aggregateBlockers(
  blockedPreviews: Array<{ blockers: CustomerDeletionBlocker[] }>,
) {
  const categories = new Map<string, CustomerImportRollbackBlocker>();

  for (const preview of blockedPreviews) {
    for (const blocker of preview.blockers) {
      const current = categories.get(blocker.code) ?? {
        code: blocker.code,
        label: blocker.label,
        customerCount: 0,
        rowCount: 0,
      };

      current.customerCount += 1;
      current.rowCount += blocker.count;
      categories.set(blocker.code, current);
    }
  }

  return [...categories.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

async function buildRollbackState(submissionId: string): Promise<RollbackState> {
  await requireSuperAdmin();

  const { admin, submission } = await loadImportedSubmission(submissionId);
  const auditedCustomerIds = extractCreatedCustomerIds(submission.import_result);
  const currentCustomers = await loadCurrentCustomers(admin, auditedCustomerIds);

  if (
    currentCustomers.some(
      (customer) => customer.organization_id !== submission.organization_id,
    )
  ) {
    throw new Error(
      "An imported Customer no longer belongs to the submission organization.",
    );
  }

  const deletionPreviews = await inConcurrentChunks(
    currentCustomers,
    PREVIEW_CONCURRENCY,
    async (customer) => {
      const result = await getCustomerDeletionPreviewForOrganizationAction(
        submission.organization_id,
        customer.id,
      );

      if (!result.ok) throw new Error(result.error);

      if (
        result.preview.exists &&
        result.preview.customerId !== customer.id
      ) {
        throw new Error("A Customer deletion preview returned an ambiguous ID.");
      }

      return { customerId: customer.id, preview: result.preview };
    },
  );

  const presentPreviews = deletionPreviews.filter(
    (item) => item.preview.exists,
  );
  const eligibleCustomerIds = presentPreviews
    .filter((item) => item.preview.eligible)
    .map((item) => item.customerId);
  const blockedPreviews = presentPreviews
    .filter((item) => !item.preview.eligible)
    .map((item) => item.preview);

  return {
    submissionId: submission.id,
    organizationId: submission.organization_id,
    originalFilename: submission.original_filename,
    importedAt: submission.imported_at,
    auditedCreated: auditedCustomerIds.length,
    currentlyPresent: presentPreviews.length,
    alreadyMissing: auditedCustomerIds.length - presentPreviews.length,
    eligible: eligibleCustomerIds.length,
    blocked: blockedPreviews.length,
    blockerCategories: aggregateBlockers(blockedPreviews),
    batchSize: DELETE_BATCH_SIZE,
    eligibleCustomerIds,
  };
}

function publicPreview(state: RollbackState): CustomerImportRollbackPreview {
  const { eligibleCustomerIds: _eligibleCustomerIds, ...preview } = state;
  void _eligibleCustomerIds;
  return preview;
}

export async function previewCustomerImportRollbackAction(
  submissionId: string,
): Promise<RollbackActionResult> {
  try {
    return {
      ok: true,
      preview: publicPreview(await buildRollbackState(submissionId)),
    };
  } catch (error) {
    console.error("Customer import rollback preview failed", {
      operation: "customer_import_rollback_preview",
      submissionId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The Customer import rollback could not be previewed.",
    };
  }
}

export async function executeCustomerImportRollbackAction(
  submissionId: string,
  confirmation: string,
): Promise<
  | {
      ok: true;
      result: {
        deleted: number;
        blocked: number;
        failed: number;
        alreadyMissing: number;
        attempted: number;
        batchSize: number;
      };
    }
  | { ok: false; error: string }
> {
  try {
    const state = await buildRollbackState(submissionId);

    if (state.eligible === 0) {
      return {
        ok: false,
        error: "No currently eligible imported Customers remain to delete.",
      };
    }

    const expectedConfirmation =
      `DELETE ${state.eligible} IMPORTED CUSTOMERS`;

    if (confirmation !== expectedConfirmation) {
      return {
        ok: false,
        error: `Type “${expectedConfirmation}” exactly to continue.`,
      };
    }

    const batch = state.eligibleCustomerIds.slice(0, DELETE_BATCH_SIZE);
    let deleted = 0;
    let blocked = 0;
    let failed = 0;
    let alreadyMissing = state.alreadyMissing;

    for (const customerId of batch) {
      const freshPreview =
        await getCustomerDeletionPreviewForOrganizationAction(
          state.organizationId,
          customerId,
        );

      if (!freshPreview.ok) {
        failed += 1;
        continue;
      }

      if (!freshPreview.preview.exists) {
        alreadyMissing += 1;
        continue;
      }

      if (!freshPreview.preview.eligible) {
        blocked += 1;
        continue;
      }

      const deletion =
        await permanentlyDeleteCustomerForOrganizationAction(
          state.organizationId,
          customerId,
          "DELETE",
        );

      if (deletion.ok) {
        deleted += 1;
      } else if (deletion.kind === "blocked") {
        blocked += 1;
      } else if (deletion.kind === "missing") {
        alreadyMissing += 1;
      } else {
        failed += 1;
      }
    }

    revalidatePath("/admin/customer-import");
    revalidatePath("/customers");
    revalidatePath("/cases");
    revalidatePath("/service-desk");

    return {
      ok: true,
      result: {
        deleted,
        blocked,
        failed,
        alreadyMissing,
        attempted: batch.length,
        batchSize: DELETE_BATCH_SIZE,
      },
    };
  } catch (error) {
    console.error("Customer import rollback execution failed", {
      operation: "customer_import_rollback_execute",
      submissionId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The Customer import rollback could not be completed.",
    };
  }
}
