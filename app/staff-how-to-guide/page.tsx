import { notFound } from "next/navigation";

import { HowToGuideRenderer } from "@/components/how-to-guides/guide-renderer";
import { getAccessContext } from "@/lib/auth/context";
import { canAccessOrganizationGuide } from "@/lib/auth/permissions";
import { getPublishedHowToGuideForServer } from "@/lib/data/how-to-guide-repository";

export const metadata = { title: "Staff How to Guide" };

export default async function StaffHowToGuidePage() {
  const access = await getAccessContext();

  if (!canAccessOrganizationGuide(access, "/staff-how-to-guide")) {
    notFound();
  }

  const content = await getPublishedHowToGuideForServer("STAFF");

  return (
    <HowToGuideRenderer
      content={content}
      showFinishLink
    />
  );
}
