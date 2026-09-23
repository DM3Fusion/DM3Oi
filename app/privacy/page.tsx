import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { privacyPolicy } from "@/lib/legal-documents";

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

export default function PrivacyPage() {
  return <LegalDocumentPage document={privacyPolicy} />;
}
