import "server-only";

import {
  defaultPublicLandingPageContent,
  isPublicLandingPageContent,
  normalizePublicLandingPageContent,
} from "@/lib/public-landing-page";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getPublishedLandingPageContent() {

  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("public_landing_page_publications")
      .select(
        "version:public_landing_page_versions(content)",
      )
      .eq("page_key", "HOME")
      .maybeSingle();

    if (error) {
      console.error(
        "Public landing-page publication lookup failed:",
        error.message,
      );

      return defaultPublicLandingPageContent;
    }

    const relation = data?.version;
    const version = Array.isArray(relation)
      ? relation[0]
      : relation;

    return version &&
      isPublicLandingPageContent(version.content)
      ? normalizePublicLandingPageContent(
          version.content,
        )
      : defaultPublicLandingPageContent;
  } catch (error) {
    console.error(
      "Public landing-page content fallback:",
      error,
    );

    return defaultPublicLandingPageContent;
  }
}

export async function getDraftLandingPageContent() {

  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("public_landing_page_drafts")
      .select("content")
      .eq("page_key", "HOME")
      .maybeSingle();

    if (error) {
      console.error(
        "Landing-page draft lookup failed:",
        error.message,
      );

      return defaultPublicLandingPageContent;
    }

    return data &&
      isPublicLandingPageContent(data.content)
      ? normalizePublicLandingPageContent(
          data.content,
        )
      : defaultPublicLandingPageContent;
  } catch (error) {
    console.error(
      "Landing-page draft content fallback:",
      error,
    );

    return defaultPublicLandingPageContent;
  }
}
