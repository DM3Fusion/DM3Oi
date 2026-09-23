import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { termsOfService } from "@/lib/legal-documents";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  title: "Terms of Service",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return <LegalDocumentPage document={termsOfService} />;
}
