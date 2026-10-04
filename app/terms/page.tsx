import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { getPublishedLegalDocumentForServer } from "@/lib/data/legal-document-repository";

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

export default async function TermsPage() {
  const document = await getPublishedLegalDocumentForServer("TERMS_OF_SERVICE");
  return <LegalDocumentPage document={document} />;
}
