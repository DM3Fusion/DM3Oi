import { notFound } from "next/navigation";

import { HowToGuideRenderer } from "@/components/how-to-guides/guide-renderer";
import { getAccessContext } from "@/lib/auth/context";
import { canAccessOrganizationGuide } from "@/lib/auth/permissions";
import { getPublishedHowToGuideForServer } from "@/lib/data/how-to-guide-repository";

export const metadata = { title: "How to Guide" };

export default async function HowToGuidePage() {
  const access = await getAccessContext();

  if (!canAccessOrganizationGuide(access, "/how-to-guide")) {
    notFound();
  }

  const content = await getPublishedHowToGuideForServer("OWNER_ADMIN");

  return (
    <HowToGuideRenderer
      content={content}
      showFinishLink
    />
  );
}
