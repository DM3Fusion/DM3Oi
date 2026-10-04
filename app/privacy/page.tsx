import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { getPublishedLegalDocumentForServer } from "@/lib/data/legal-document-repository";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  title: "Privacy Policy",
  alternates: {
    canonical: "/privacy",
  },
};

export default async function PrivacyPage() {
  const document = await getPublishedLegalDocumentForServer("PRIVACY_POLICY");
  return <LegalDocumentPage document={document} />;
}
