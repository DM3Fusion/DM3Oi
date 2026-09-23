import Image from "next/image";
import { getDeploymentVersion } from "@/lib/app-version";
import {
  publishLandingPage,
  removeLandingPageWorkflowImage,
  replaceLandingPageWorkflowImage,
  revertLandingPageVersion,
  saveLandingPageDraft,
} from "./actions";

import { LandingPageDraftPreview } from "@/components/landing-page-draft-preview";
import { SubmitButton } from "@/components/submit-button";
import { requireSuperAdmin } from "@/lib/auth/context";
import {
  defaultPublicLandingPageContent,
  isPublicLandingPageContent,
  normalizePublicLandingPageContent,
} from "@/lib/public-landing-page";
import { createAdminClient } from "@/lib/supabase/admin";

type SearchParams = Promise<{
  saved?: string;
  published?: string;
  reverted?: string;
  imageReplaced?: string;
  imageRemoved?: string;
  error?: string;
}>;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export default async function LandingPageAdmin({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSuperAdmin();

  const status = await searchParams;
  const admin = createAdminClient();

  const deploymentVersion = getDeploymentVersion();

  const [
    { data: draft, error: draftError },
    { data: publication, error: publicationError },
    { data: versions, error: versionsError },
    {
      data: publicationHistory,
      error: publicationHistoryError,
    },
  ] = await Promise.all([
    admin
      .from("public_landing_page_drafts")
      .select("content,updated_at")
      .eq("page_key", "HOME")
      .maybeSingle(),

    admin
      .from("public_landing_page_publications")
      .select(
        "updated_at,version:public_landing_page_versions(version,published_at)",
      )
      .eq("page_key", "HOME")
      .maybeSingle(),

    admin
      .from("public_landing_page_versions")
      .select("id,version,published_at")
      .eq("page_key", "HOME")
      .order("version", { ascending: false }),

    admin
      .from("public_landing_page_publication_history")
      .select(
        "id,action,acted_at,from_version_id,to_version_id",
      )
      .eq("page_key", "HOME")
      .order("acted_at", { ascending: false })
      .limit(50),
  ]);

  if (draftError) {
    console.error(
      "SUPER_ADMIN landing-page draft lookup failed:",
      draftError.message,
    );
  }

  if (publicationError) {
    console.error(
      "SUPER_ADMIN landing-page publication lookup failed:",
      publicationError.message,
    );
  }

  if (versionsError) {
    console.error(
      "SUPER_ADMIN landing-page version lookup failed:",
      versionsError.message,
    );
  }

  if (publicationHistoryError) {
    console.error(
      "SUPER_ADMIN landing-page publication history lookup failed:",
      publicationHistoryError.message,
    );
  }

  const versionNumberById = new Map(
    (versions ?? []).map((version) => [
      version.id,
      version.version,
    ]),
  );

  const content =
    draft &&
    isPublicLandingPageContent(draft.content)
      ? normalizePublicLandingPageContent(
          draft.content,
        )
      : defaultPublicLandingPageContent;

  const versionValue = publication?.version;
  const publishedVersion = Array.isArray(versionValue)
    ? versionValue[0]
    : versionValue;

  const errorMessage =
    status.error === "invalid"
      ? "Review the landing-page content. One or more values are missing or invalid."
      : status.error === "save"
        ? "The landing-page draft could not be saved."
        : status.error === "confirmation"
          ? 'Enter PUBLISH exactly before publishing the draft.'
          : status.error === "publish"
            ? "The landing-page draft could not be published."
            : status.error === "revert-confirmation"
              ? "Enter the required REVERT version confirmation exactly."
              : status.error === "revert"
                ? "The published landing-page version could not be reverted."
                : status.error === "image-remove-confirmation"
                  ? "Enter REMOVE exactly before removing the workflow image."
                  : status.error === "image-remove"
                    ? "The workflow image could not be removed from the working draft."
                    : status.error === "image-required"
                      ? "Choose a workflow image to upload."
                  : status.error === "image-type"
                    ? "Workflow image must be a PNG, JPEG, or WebP file."
                    : status.error === "image-size"
                      ? "Workflow image must be 5 MB or smaller."
                      : status.error === "image-upload"
                        ? "The workflow image could not be uploaded."
                        : status.error === "image"
                          ? "The workflow image could not be saved to the working draft."
                          : null;

  return (
    <div className="landing-page-admin">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            Platform administration
          </p>
          <h1>Landing Page</h1>
          <p className="muted">
            Maintain the public DM3Oi landing-page
            content. Layout, icons, and application behavior
            remain controlled by DM3Oi.
          </p>
        </div>

        <div className="landing-page-heading-actions">
          <LandingPageDraftPreview
            content={content}
            deploymentVersion={deploymentVersion}
          />
        </div>
      </div>

      {status.saved && (
        <p className="notice success">
          Landing-page working draft saved.
        </p>
      )}

      {status.published && (
        <p className="notice success">
          Landing-page version {status.published} published.
        </p>
      )}

      {status.imageReplaced && (
        <p className="notice success">
          Workflow image replaced in the working draft. Preview
          the draft and publish when ready.
        </p>
      )}

      {status.imageRemoved && (
        <p className="notice success">
          Workflow image removed from the working draft. Existing
          published versions and historical artwork are preserved.
          Preview the draft and publish when ready.
        </p>
      )}

      {status.reverted && (
        <p className="notice success">
          Landing page restored to Version {status.reverted}.
          The exact displaced version is preserved below in
          Publication Activity. The working draft was not changed.
        </p>
      )}

      {errorMessage && (
        <p className="notice error">{errorMessage}</p>
      )}

      <form
        id="landing-page-editor-form"
        action={saveLandingPageDraft}
        className="landing-page-editor"
      >
        <section className="panel">
          <div className="email-template-heading">
            <h2>Search &amp; SEO</h2>
            <p className="muted">
              Search-result title and description for the
              public homepage.
            </p>
          </div>

          <div className="form-stack">
            <label>
              Page Title
              <input
                name="seoTitle"
                required
                maxLength={160}
                defaultValue={content.seo.title}
              />
            </label>

            <label>
              Meta Description
              <textarea
                name="seoDescription"
                required
                maxLength={320}
                defaultValue={content.seo.description}
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="email-template-heading">
            <h2>Hero</h2>
            <p className="muted">
              Primary message displayed above and below the
              DM3Oi workflow artwork.
            </p>
          </div>

          <div className="form-stack">
            <label>
              Eyebrow
              <input
                name="heroEyebrow"
                required
                maxLength={80}
                defaultValue={content.hero.eyebrow}
              />
            </label>

            <div className="landing-page-two-column">
              <label>
                Headline — Primary
                <input
                  name="heroHeadlinePrimary"
                  required
                  maxLength={120}
                  defaultValue={
                    content.hero.headlinePrimary
                  }
                />
              </label>

              <label>
                Headline — Secondary
                <input
                  name="heroHeadlineSecondary"
                  required
                  maxLength={120}
                  defaultValue={
                    content.hero.headlineSecondary
                  }
                />
              </label>
            </div>

            <label>
              Supporting Text
              <textarea
                name="heroLead"
                maxLength={600}
                defaultValue={content.hero.lead}
              />
            </label>

            <div className="landing-page-two-column">
              <label>
                Sign In Button
                <input
                  name="heroSignInLabel"
                  required
                  maxLength={80}
                  defaultValue={
                    content.hero.signInLabel
                  }
                />
              </label>

              <label>
                Trial Button
                <input
                  name="heroTrialLabel"
                  required
                  maxLength={80}
                  defaultValue={
                    content.hero.trialLabel
                  }
                />
              </label>
            </div>

            <fieldset className="landing-page-fieldset">
              <legend>Supporting Points</legend>

              {[0, 1, 2].map((index) => (
                <label key={index}>
                  Point {index + 1}
                  <input
                    name={`heroPoint${index}`}
                    maxLength={160}
                    defaultValue={content.hero.points[index] ?? ""}
                  />
                </label>
              ))}
            </fieldset>
          </div>
        </section>

        <section className="panel">
          <div className="email-template-heading">
            <h2>Business Workflow</h2>
            <p className="muted">
              Section heading and the six fixed capability
              positions shown on the public page.
            </p>
          </div>

          <div className="form-stack">
            <label>
              Eyebrow
              <input
                name="featuresEyebrow"
                required
                maxLength={80}
                defaultValue={content.features.eyebrow}
              />
            </label>

            <label>
              Heading
              <input
                name="featuresHeading"
                required
                maxLength={180}
                defaultValue={content.features.heading}
              />
            </label>

            <label>
              Supporting Text
              <textarea
                name="featuresLead"
                required
                maxLength={600}
                defaultValue={content.features.lead}
              />
            </label>

            <div className="landing-page-workflow-image-editor">
              <div className="landing-page-workflow-image-copy">
                <strong>Workflow Image</strong>
                <p className="muted">
                  Current working-draft artwork. Replacing this
                  image does not change the public landing page
                  until the draft is published.
                </p>
              </div>

              {content.features.workflowImageUrl ? (
                <div className="landing-page-workflow-image-preview">
                  <Image
                    src={content.features.workflowImageUrl}
                    alt="Current DM3Oi workflow artwork"
                  />
                </div>
              ) : (
                <p className="muted">
                  No workflow image is currently included in the
                  working draft.
                </p>
              )}

              <p className="muted">
                Use Workflow Image Management below the draft
                editor to change this artwork.
              </p>
            </div>

            <div className="landing-page-feature-editor-grid">
              {content.features.items.map((item) => (
                <fieldset
                  className="landing-page-fieldset"
                  key={item.key}
                >
                  <legend>{item.title}</legend>

                  <label>
                    Title
                    <input
                      name={`feature_${item.key}_title`}
                      required
                      maxLength={140}
                      defaultValue={item.title}
                    />
                  </label>

                  <label>
                    Description
                    <textarea
                      name={`feature_${item.key}_description`}
                      required
                      maxLength={500}
                      defaultValue={item.description}
                    />
                  </label>
                </fieldset>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="email-template-heading">
            <h2>Trial Request</h2>
            <p className="muted">
              Public-facing copy displayed in the left panel
              of the Request Trial page.
            </p>
          </div>

          <div className="form-stack">
            <label>
              Eyebrow
              <input
                name="trialRequestEyebrow"
                required
                maxLength={80}
                defaultValue={
                  content.trialRequest?.eyebrow ??
                  defaultPublicLandingPageContent
                    .trialRequest?.eyebrow
                }
              />
            </label>

            <label>
              Heading
              <input
                name="trialRequestHeading"
                required
                maxLength={220}
                defaultValue={
                  content.trialRequest?.heading ??
                  defaultPublicLandingPageContent
                    .trialRequest?.heading
                }
              />
            </label>

            <label>
              Supporting Text
              <textarea
                name="trialRequestBody"
                required
                maxLength={800}
                defaultValue={
                  content.trialRequest?.body ??
                  defaultPublicLandingPageContent
                    .trialRequest?.body
                }
              />
            </label>

            <fieldset className="landing-page-fieldset">
              <legend>Supporting Points</legend>

              {[0, 1, 2].map((index) => (
                <label key={index}>
                  Point {index + 1}
                  <input
                    name={`trialRequestPoint${index}`}
                    required
                    maxLength={220}
                    defaultValue={
                      content.trialRequest?.points[index] ??
                      defaultPublicLandingPageContent
                        .trialRequest?.points[index]
                    }
                  />
                </label>
              ))}
            </fieldset>

            <fieldset className="landing-page-fieldset">
              <legend>Trial Form</legend>

              <label>
                Form Heading
                <input
                  name="trialFormHeading"
                  required
                  maxLength={160}
                  defaultValue={
                    content.trialRequest?.formHeading ??
                    defaultPublicLandingPageContent
                      .trialRequest?.formHeading
                  }
                />
              </label>

              <label>
                Form Supporting Text
                <textarea
                  name="trialFormBody"
                  required
                  maxLength={500}
                  defaultValue={
                    content.trialRequest?.formBody ??
                    defaultPublicLandingPageContent
                      .trialRequest?.formBody
                  }
                />
              </label>
            </fieldset>

            <fieldset className="landing-page-fieldset">
              <legend>Request Confirmation</legend>

              <label>
                Eyebrow
                <input
                  name="trialSuccessEyebrow"
                  required
                  maxLength={100}
                  defaultValue={
                    content.trialRequest?.successEyebrow ??
                    defaultPublicLandingPageContent
                      .trialRequest?.successEyebrow
                  }
                />
              </label>

              <label>
                Heading
                <input
                  name="trialSuccessHeading"
                  required
                  maxLength={260}
                  defaultValue={
                    content.trialRequest?.successHeading ??
                    defaultPublicLandingPageContent
                      .trialRequest?.successHeading
                  }
                />
              </label>

              <label>
                Supporting Text
                <textarea
                  name="trialSuccessBody"
                  required
                  maxLength={800}
                  defaultValue={
                    content.trialRequest?.successBody ??
                    defaultPublicLandingPageContent
                      .trialRequest?.successBody
                  }
                />
              </label>

              <label>
                Return Button
                <input
                  name="trialReturnLabel"
                  required
                  maxLength={80}
                  defaultValue={
                    content.trialRequest?.returnLabel ??
                    defaultPublicLandingPageContent
                      .trialRequest?.returnLabel
                  }
                />
              </label>
            </fieldset>
          </div>
        </section>

        <section className="panel">
          <div className="email-template-heading">
            <h2>Business Value</h2>
          </div>

          <div className="form-stack">
            <label>
              Eyebrow
              <input
                name="valueEyebrow"
                required
                maxLength={80}
                defaultValue={content.value.eyebrow}
              />
            </label>

            <label>
              Heading
              <input
                name="valueHeading"
                required
                maxLength={220}
                defaultValue={content.value.heading}
              />
            </label>

            <label>
              Supporting Text
              <textarea
                name="valueLead"
                required
                maxLength={600}
                defaultValue={content.value.lead}
              />
            </label>

            <fieldset className="landing-page-fieldset">
              <legend>Business Value Points</legend>

              {content.value.points.map((point, index) => (
                <label key={index}>
                  Point {index + 1}
                  <input
                    name={`valuePoint${index}`}
                    required
                    maxLength={220}
                    defaultValue={point}
                  />
                </label>
              ))}
            </fieldset>

            <fieldset className="landing-page-fieldset">
              <legend>Access Panel</legend>

              <label>
                Eyebrow
                <input
                  name="valuePanelEyebrow"
                  required
                  maxLength={100}
                  defaultValue={
                    content.value.panelEyebrow
                  }
                />
              </label>

              <label>
                Heading
                <input
                  name="valuePanelHeading"
                  required
                  maxLength={260}
                  defaultValue={
                    content.value.panelHeading
                  }
                />
              </label>

              <label>
                Supporting Text
                <textarea
                  name="valuePanelBody"
                  required
                  maxLength={800}
                  defaultValue={
                    content.value.panelBody
                  }
                />
              </label>
            </fieldset>
          </div>
        </section>

        <div className="landing-page-save-bar">
          <p>
            Saving updates only the working draft. Preview it
            before publishing.
          </p>

          <SubmitButton
            className="button"
            pendingText="Saving Draft…"
          >
            Save Draft
          </SubmitButton>
        </div>
      </form>

      <section className="panel landing-page-workflow-image-management">
        <div className="email-template-heading">
          <h2>Workflow Image Management</h2>
          <p className="muted">
            Replace or remove the workflow artwork in the working
            draft. The public landing page remains unchanged until
            the draft is published.
          </p>
        </div>

        <form
          action={replaceLandingPageWorkflowImage}
          className="landing-page-workflow-image-form"
        >
          {content.features.workflowImageUrl ? (
            <div className="landing-page-workflow-image-preview">
              <Image
                src={content.features.workflowImageUrl}
                alt="Current DM3Oi workflow artwork"
              />
            </div>
          ) : (
            <p className="muted">
              No workflow image is currently included in the
              working draft.
            </p>
          )}

          <label>
            Replacement Image
            <input
              type="file"
              name="workflowImage"
              accept="image/png,image/jpeg,image/webp"
              required
            />
          </label>

          <p className="muted">
            PNG, JPEG, or WebP. Maximum 5 MB. Each replacement
            receives a unique immutable asset so historical
            published versions retain their original artwork.
          </p>

          <SubmitButton
            className="secondary-button"
            pendingText="Replacing Image…"
          >
            Replace Workflow Image
          </SubmitButton>
        </form>

        {content.features.workflowImageUrl && (
          <form
            action={removeLandingPageWorkflowImage}
            className="form-stack"
          >
            <label>
              Type <strong>REMOVE</strong> to confirm removal
              <input
                name="confirmation"
                required
                autoComplete="off"
                placeholder="REMOVE"
              />
            </label>

            <p className="muted">
              Removal affects only the working draft. The stored
              asset and historical published versions are preserved.
            </p>

            <SubmitButton
              className="secondary-button"
              pendingText="Removing Image…"
            >
              Remove Workflow Image
            </SubmitButton>
          </form>
        )}
      </section>

      <section className="panel landing-page-publish">
        <div className="email-template-heading">
          <h2>Publish Draft</h2>
          <p className="muted">
            Publishing creates a new immutable version and
            immediately makes that version current for the
            public homepage.
          </p>
        </div>

        <form
          action={publishLandingPage}
          className="form-stack"
        >
          <label>
            Type <strong>PUBLISH</strong> to confirm
            <input
              name="confirmation"
              required
              autoComplete="off"
              placeholder="PUBLISH"
            />
          </label>

          <SubmitButton
            className="button"
            pendingText="Publishing…"
          >
            Publish Current Draft
          </SubmitButton>
        </form>
      </section>
      <section className="panel landing-page-publication">
        <div className="email-template-heading">
          <h2>Publication</h2>
          <p className="muted">
            Visitors see only the current immutable published
            version. Saving the working draft does not change
            the public DM3Oi site.
          </p>
        </div>

        <dl className="legal-document-meta">
          <div>
            <dt>Published Version</dt>
            <dd>{publishedVersion?.version ?? "—"}</dd>
          </div>

          <div>
            <dt>Published</dt>
            <dd>
              {formatDate(
                publishedVersion?.published_at,
              )}
            </dd>
          </div>

          <div>
            <dt>Draft Updated</dt>
            <dd>{formatDate(draft?.updated_at)}</dd>
          </div>
        </dl>
      </section>

      <div className="landing-page-publication-grid">
        <section className="panel landing-page-version-history">
        <div className="email-template-heading">
          <h2>Published Version History</h2>
          <p className="muted">
            Published versions are immutable. Restoring changes
            only which version visitors see and does not modify
            the working draft.
          </p>
        </div>

        <div className="landing-page-version-list">
          {(versions ?? []).slice(0, 2).map((version) => {
            const isCurrent =
              version.version === publishedVersion?.version;

            return (
              <div
                className="landing-page-version-row"
                key={version.id}
              >
                <div>
                  <div className="landing-page-version-title">
                    <strong>Version {version.version}</strong>

                    {isCurrent && (
                      <span className="landing-page-current-version">
                        Current
                      </span>
                    )}
                  </div>

                  <p className="muted">
                    Published {formatDate(version.published_at)}
                  </p>
                </div>

                {!isCurrent && (
                  <form
                    action={revertLandingPageVersion}
                    className="landing-page-revert-form"
                  >
                    <input
                      type="hidden"
                      name="version"
                      value={version.version}
                    />

                    <label>
                      Type{" "}
                      <strong>
                        REVERT {version.version}
                      </strong>
                      <input
                        name="confirmation"
                        required
                        autoComplete="off"
                        placeholder={`REVERT ${version.version}`}
                      />
                    </label>

                    <SubmitButton
                      className="button secondary"
                      pendingText="Reverting…"
                    >
                      Restore Version {version.version}
                    </SubmitButton>
                  </form>
                )}
              </div>
            );
          })}

          {(versions ?? []).length > 2 && (
            <details className="landing-page-history-more">
              <summary>
                + Show {(versions ?? []).length - 2} more versions
              </summary>

              <div className="landing-page-history-more-content">
                {(versions ?? []).slice(2).map((version) => {
                  const isCurrent =
                    version.version === publishedVersion?.version;

                  return (
                    <div
                      className="landing-page-version-row"
                      key={version.id}
                    >
                      <div>
                        <div className="landing-page-version-title">
                          <strong>
                            Version {version.version}
                          </strong>

                          {isCurrent && (
                            <span className="landing-page-current-version">
                              Current
                            </span>
                          )}
                        </div>

                        <p className="muted">
                          Published{" "}
                          {formatDate(version.published_at)}
                        </p>
                      </div>

                      {!isCurrent && (
                        <form
                          action={revertLandingPageVersion}
                          className="landing-page-revert-form"
                        >
                          <input
                            type="hidden"
                            name="version"
                            value={version.version}
                          />

                          <label>
                            Type{" "}
                            <strong>
                              REVERT {version.version}
                            </strong>
                            <input
                              name="confirmation"
                              required
                              autoComplete="off"
                              placeholder={`REVERT ${version.version}`}
                            />
                          </label>

                          <SubmitButton
                            className="button secondary"
                            pendingText="Reverting…"
                          >
                            Restore Version {version.version}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      </section>

        <section className="panel landing-page-publication-activity">
        <div className="email-template-heading">
          <h2>Publication Activity</h2>
          <p className="muted">
            Immutable audit history of landing-page publication
            and restoration activity.
          </p>
        </div>

        <div className="landing-page-audit-list">
          {(publicationHistory ?? []).length === 0 ? (
            <p className="muted">
              No publication audit activity recorded yet.
            </p>
          ) : (
            <>
              {(publicationHistory ?? [])
                .slice(0, 2)
                .map((event) => {
                  const fromVersion = event.from_version_id
                    ? versionNumberById.get(
                        event.from_version_id,
                      )
                    : null;

                  const toVersion = versionNumberById.get(
                    event.to_version_id,
                  );

                  const description =
                    event.action === "BASELINE"
                      ? `Audit baseline established at Version ${toVersion ?? "—"}.`
                      : event.action === "PUBLISH"
                        ? `Published Version ${toVersion ?? "—"}, replacing Version ${fromVersion ?? "—"}.`
                        : `Restored Version ${toVersion ?? "—"}, replacing Version ${fromVersion ?? "—"}.`;

                  return (
                    <div
                      className="landing-page-audit-row"
                      key={event.id}
                    >
                      <div>
                        <div className="landing-page-audit-title">
                          <strong>{description}</strong>

                          <span
                            className={`landing-page-audit-action landing-page-audit-action-${event.action.toLowerCase()}`}
                          >
                            {event.action === "BASELINE"
                              ? "Baseline"
                              : event.action === "PUBLISH"
                                ? "Published"
                                : "Restored"}
                          </span>
                        </div>

                        <p className="muted">
                          {formatDate(event.acted_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}

              {(publicationHistory ?? []).length > 2 && (
                <details className="landing-page-history-more">
                  <summary>
                    + Show{" "}
                    {(publicationHistory ?? []).length - 2} more
                  </summary>

                  <div className="landing-page-history-more-content">
                    {(publicationHistory ?? [])
                      .slice(2)
                      .map((event) => {
                        const fromVersion =
                          event.from_version_id
                            ? versionNumberById.get(
                                event.from_version_id,
                              )
                            : null;

                        const toVersion =
                          versionNumberById.get(
                            event.to_version_id,
                          );

                        const description =
                          event.action === "BASELINE"
                            ? `Audit baseline established at Version ${toVersion ?? "—"}.`
                            : event.action === "PUBLISH"
                              ? `Published Version ${toVersion ?? "—"}, replacing Version ${fromVersion ?? "—"}.`
                              : `Restored Version ${toVersion ?? "—"}, replacing Version ${fromVersion ?? "—"}.`;

                        return (
                          <div
                            className="landing-page-audit-row"
                            key={event.id}
                          >
                            <div>
                              <div className="landing-page-audit-title">
                                <strong>
                                  {description}
                                </strong>

                                <span
                                  className={`landing-page-audit-action landing-page-audit-action-${event.action.toLowerCase()}`}
                                >
                                  {event.action ===
                                  "BASELINE"
                                    ? "Baseline"
                                    : event.action ===
                                        "PUBLISH"
                                      ? "Published"
                                      : "Restored"}
                                </span>
                              </div>

                              <p className="muted">
                                {formatDate(
                                  event.acted_at,
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
        </section>
      </div>

    </div>
  );
}
