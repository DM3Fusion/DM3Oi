import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/auth/context";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch {
    return new NextResponse(null, {
      status: 403,
      headers: noStoreHeaders,
    });
  }

  return NextResponse.json(
    {
      city: request.headers.get("x-vercel-ip-city"),
      region: request.headers.get("x-vercel-ip-country-region"),
      country: request.headers.get("x-vercel-ip-country"),
      postalCode: request.headers.get("x-vercel-ip-postal-code"),
      latitude: request.headers.get("x-vercel-ip-latitude"),
      longitude: request.headers.get("x-vercel-ip-longitude"),
      timezone: request.headers.get("x-vercel-ip-timezone"),
      continent: request.headers.get("x-vercel-ip-continent"),
    },
    {
      headers: noStoreHeaders,
    },
  );
}
