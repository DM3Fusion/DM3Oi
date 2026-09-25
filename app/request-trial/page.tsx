import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { TrialRequestForm } from "@/components/trial-request-form";
import {
  defaultPublicLandingPageContent,
} from "@/lib/public-landing-page";
import {
  getPublishedLandingPageContent,
} from "@/lib/public-landing-page-server";

export const metadata: Metadata = {
  title: "Request a Trial | DM3Oi",
  description:
    "Request a DM3Oi Business Operations Intelligence trial.",
  robots: { index: false, follow: false },
};

type TrialRequestSearchParams = Promise<{
  submitted?: string;
  error?: string;
}>;

export default async function RequestTrialPage({
  searchParams,
}: {
  searchParams: TrialRequestSearchParams;
}) {
  const [landingContent, query] = await Promise.all([
    getPublishedLandingPageContent(),
    searchParams,
  ]);

  const content =
    landingContent.trialRequest ??
    defaultPublicLandingPageContent.trialRequest!;

  const submitted = query.submitted === "1";

  const errorMessage =
    query.error === "invalid"
      ? "Please review the required information and try again."
      : query.error === "email-exists"
        ? "A trial request or account already exists for this email address. Please use a different email address."
        : query.error === "submit"
          ? "We could not submit your trial request. Please try again."
          : null;

  return (
    <main className="trial-request-page">
      <section className="trial-request-shell">
        <div className="trial-request-rail">
          <Link
            href="/"
            className="trial-request-hero"
            aria-label="DM3Oi Business Operations Intelligence home"
          >
            <Image
              src={
                content.heroImageUrl ??
                "/images/dm3oi-operations-hero.jpg"
              }
              alt="DM3Oi Operational Intelligence"
              width={600}
              height={349}
              priority
              sizes="(max-width: 760px) 100vw, 440px"
            />
          </Link>

          <div className="trial-request-intro">
            <p className="public-home-eyebrow">
              {submitted
                ? content.successEyebrow
                : content.eyebrow}
            </p>

            <h1>
              {submitted
                ? content.successHeading
                : content.heading}
            </h1>

            <p>
              {submitted
                ? content.successBody
                : content.body}
            </p>

            {!submitted ? (
              <ul className="trial-request-intro-points">
                {content.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="trial-request-card">
          {submitted ? (
            <div role="status">
              <Link
                href="/"
                className="public-home-primary"
              >
                {content.returnLabel}
              </Link>
            </div>
          ) : (
            <>
              <div className="trial-request-card-heading">
                <h2>{content.formHeading}</h2>
                <p>{content.formBody}</p>
              </div>

              {errorMessage ? (
                <div
                  className="form-alert"
                  role="alert"
                >
                  {errorMessage}
                </div>
              ) : null}

              <TrialRequestForm />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
