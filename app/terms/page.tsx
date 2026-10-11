import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import {
  getOrganizationLegalReviewForServer,
  getPublishedLegalDocumentForServer,
} from "@/lib/data/legal-document-repository";

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

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>;
}) {
  const query = await searchParams;

  if (query.review === "acceptance") {
    const access = await requireAuthenticatedInternalUser();
    const organization = access.activeOrganization;

    if (
      organization &&
      organization.role === "BUSINESS_OWNER"
    ) {
      const review =
        await getOrganizationLegalReviewForServer(
          organization.id,
          "TERMS_OF_SERVICE",
        );

      if (review) {
        return (
          <LegalDocumentPage
            document={review.current}
            review={{
              returnHref: "/account",
              previousDocument: review.previous,
            }}
          />
        );
      }
    }
  }

  const document =
    await getPublishedLegalDocumentForServer(
      "TERMS_OF_SERVICE",
    );

  return <LegalDocumentPage document={document} />;
}
