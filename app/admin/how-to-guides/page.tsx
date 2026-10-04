import { PageHeader } from "@/components/ui";
import { HowToGuideEditor } from "@/components/admin/how-to-guide-editor";
import { requireSuperAdmin } from "@/lib/auth/context";
import { getHowToGuideTemplateForAdmin } from "@/lib/data/how-to-guide-repository";
import {
  isHowToGuideKey,
  type HowToGuideKey,
} from "@/lib/how-to-guide-content";

export const metadata = { title: "How-to Guides" };

export default async function HowToGuidesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  await requireSuperAdmin();

  const query = await searchParams;
  const requestedGuide = query?.guide ?? "";
  const guideKey: HowToGuideKey =
    isHowToGuideKey(requestedGuide) ? requestedGuide : "OWNER_ADMIN";

  const template = await getHowToGuideTemplateForAdmin(guideKey);

  const error =
    query?.error === "invalid"
      ? "Review the guide content. One or more values are invalid."
      : query?.error === "save"
        ? "The draft could not be saved."
        : query?.error === "publish"
          ? "The guide could not be published."
          : null;

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="How-to Guides"
        description="Manage, preview, and publish the organization How to Guides. Draft changes remain private until published."
      />

      {query?.saved ? (
        <div className="form-success" role="status">
          Draft saved.
        </div>
      ) : null}

      {query?.published ? (
        <div className="form-success" role="status">
          Guide published.
        </div>
      ) : null}

      {error ? (
        <div className="form-alert" role="alert">
          {error}
        </div>
      ) : null}

      <nav
        className="settings-tabs email-template-tabs"
        aria-label="How-to Guide templates"
      >
        <a
          href="/admin/how-to-guides?guide=OWNER_ADMIN"
          className={guideKey === "OWNER_ADMIN" ? "active" : undefined}
        >
          Owner/Admin Guide
        </a>

        <a
          href="/admin/how-to-guides?guide=STAFF"
          className={guideKey === "STAFF" ? "active" : undefined}
        >
          Staff Guide
        </a>
      </nav>

      <HowToGuideEditor
        guideKey={template.guideKey}
        initialContent={template.draftContent}
        draftRevision={template.draftRevision}
        publishedRevision={template.publishedRevision}
        draftUpdatedAt={template.draftUpdatedAt}
        publishedAt={template.publishedAt}
      />
    </>
  );
}
