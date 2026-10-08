import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      const result = await admin
        .from("email_deliveries")
        .update({ opened_at: now, updated_at: now })
        .eq("tracking_token", token)
        .eq("delivery_status", "SENT")
        .is("opened_at", null);
      if (result.error)
        console.error("Email open tracking failed", {
          operation: "recordFirstEmailOpen",
          code: result.error.code,
          message: result.error.message,
        });
    }
  } catch (error) {
    console.error("Email open tracking failed", {
      operation: "recordFirstEmailOpen",
      message: error instanceof Error ? error.message : "Unknown tracking error",
    });
  }

  return new NextResponse(pixel, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(pixel.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
