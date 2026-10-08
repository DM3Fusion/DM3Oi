import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createOverviewDownloadGetResponse,
  createOverviewDownloadHeadResponse,
} from "@/lib/overview-download-response";
import { createAdminClient } from "@/lib/supabase/admin";

const filePath = path.join(
  process.cwd(),
  "public",
  "images",
  "DM3Oi_Overview_2026.PNG",
);

function readOverviewFile() {
  return readFile(filePath);
}

async function recordOverviewDownloadServed() {
  const admin = createAdminClient();

  const { error } = await admin.rpc(
    "record_overview_download_served",
  );

  if (error) {
    throw new Error(
      typeof error.code === "string"
        ? error.code
        : "OVERVIEW_DOWNLOAD_ANALYTICS_FAILED",
    );
  }
}

function logRecordingFailure(error: unknown) {
  console.error("Overview download analytics recording failed.", {
    code:
      error instanceof Error
        ? error.message
        : "OVERVIEW_DOWNLOAD_ANALYTICS_FAILED",
  });
}

export async function GET() {
  return createOverviewDownloadGetResponse({
    readFile: readOverviewFile,
    recordServed: recordOverviewDownloadServed,
    onRecordFailure: logRecordingFailure,
  });
}

export async function HEAD() {
  return createOverviewDownloadHeadResponse({
    readFile: readOverviewFile,
  });
}
