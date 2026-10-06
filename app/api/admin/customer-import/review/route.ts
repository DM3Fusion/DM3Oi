import { NextRequest, NextResponse } from "next/server";

import { updateCustomerImportSubmissionAction } from "@/app/admin/customer-import/submission-actions";

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "The review request was not accepted." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const submissionId = String(form.get("submissionId") ?? "").trim();

  try {
    const result = await updateCustomerImportSubmissionAction(form);

    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
    });
  } catch (error) {
    console.error("Customer import submission review request failed", {
      operation: "update_review",
      submissionId: submissionId || null,
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unknown review request failure",
    });

    return NextResponse.json(
      {
        ok: false,
        error: "The Customer data submission could not be updated.",
      },
      { status: 500 },
    );
  }
}
