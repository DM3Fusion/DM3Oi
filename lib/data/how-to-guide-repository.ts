import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import {
  defaultHowToGuideContent,
  isHowToGuideKey,
  parseHowToGuideContent,
  type HowToGuideContent,
  type HowToGuideKey,
} from "@/lib/how-to-guide-content";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HowToGuideTemplateAdmin = {
  guideKey: HowToGuideKey;
  draftContent: HowToGuideContent;
  publishedContent: HowToGuideContent;
  draftRevision: number;
  publishedRevision: number;
  draftUpdatedAt: string;
  draftUpdatedBy: string | null;
  publishedAt: string;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type RawGuideTemplate = {
  guide_key: string;
  draft_content: unknown;
  published_content: unknown;
  draft_revision: number;
  published_revision: number;
  draft_updated_at: string;
  draft_updated_by: string | null;
  published_at: string;
  published_by: string | null;
  created_at: string;
  updated_at: string;
};

function parseAdminTemplate(value: unknown): HowToGuideTemplateAdmin | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as RawGuideTemplate;
  if (!isHowToGuideKey(row.guide_key)) return null;

  const draftContent = parseHowToGuideContent(
    row.guide_key,
    row.draft_content,
  );
  const publishedContent = parseHowToGuideContent(
    row.guide_key,
    row.published_content,
  );

  if (!draftContent || !publishedContent) return null;

  if (
    !Number.isInteger(row.draft_revision) ||
    row.draft_revision < 1 ||
    !Number.isInteger(row.published_revision) ||
    row.published_revision < 1 ||
    typeof row.draft_updated_at !== "string" ||
    typeof row.published_at !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }

  return {
    guideKey: row.guide_key,
    draftContent,
    publishedContent,
    draftRevision: row.draft_revision,
    publishedRevision: row.published_revision,
    draftUpdatedAt: row.draft_updated_at,
    draftUpdatedBy: row.draft_updated_by,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getHowToGuideTemplateForAdmin(
  guideKey: HowToGuideKey,
): Promise<HowToGuideTemplateAdmin> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const result = await supabase.rpc(
    "get_how_to_guide_template_for_admin",
    { target_guide_key: guideKey },
  );

  if (result.error) {
    console.error("How-to Guide admin template query failed", {
      operation: "getHowToGuideTemplateForAdmin",
      guideKey,
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error("How-to Guide template data is temporarily unavailable.");
  }

  const parsed = parseAdminTemplate(result.data);
  if (!parsed) {
    console.error("How-to Guide admin template payload was invalid", {
      operation: "getHowToGuideTemplateForAdmin",
      guideKey,
    });
    throw new Error("How-to Guide template data is temporarily unavailable.");
  }

  return parsed;
}

export async function getPublishedHowToGuideForServer(
  guideKey: HowToGuideKey,
): Promise<HowToGuideContent> {
  const admin = createAdminClient();
  const result = await admin.rpc(
    "get_published_how_to_guide_server",
    { target_guide_key: guideKey },
  );

  if (result.error) {
    console.error("Published How-to Guide query failed", {
      operation: "getPublishedHowToGuideForServer",
      guideKey,
      code: result.error.code,
      message: result.error.message,
    });

    return defaultHowToGuideContent[guideKey];
  }

  const parsed = parseHowToGuideContent(guideKey, result.data);
  if (!parsed) {
    console.error("Published How-to Guide payload was invalid", {
      operation: "getPublishedHowToGuideForServer",
      guideKey,
    });

    return defaultHowToGuideContent[guideKey];
  }

  return parsed;
}
