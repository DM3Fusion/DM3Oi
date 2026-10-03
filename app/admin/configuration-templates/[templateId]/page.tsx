import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth/context";
import { publishConfigurationTemplateAction } from "@/lib/data/platform-actions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

type ConfigurationTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  source_organization_id: string | null;
  source_organization_name: string | null;
  created_at: string;
};

type ConfigurationTemplateManagementDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      get_configuration_templates: {
        Args: Record<string, never>;
        Returns: ConfigurationTemplateRow[];
      };
    };
  };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  await requireSuperAdmin();

  const [{ templateId }, query] = await Promise.all([
    params,
    searchParams,
  ]);

  const client = (await createClient()) as ReturnType<
    typeof import("@supabase/ssr").createServerClient<ConfigurationTemplateManagementDatabase>
  >;

  const result = await client.rpc("get_configuration_templates");

  if (result.error) {
    console.error("Configuration template detail lookup failed", {
      code: result.error.code,
      message: result.error.message,
      templateId,
    });
  }

  const template = (result.data ?? []).find(
    (item) => item.id === templateId,
  );

  if (!template) notFound();

  const isDraft = template.status === "DRAFT";

  return (
    <>
      <PageHeader
        eyebrow="Configuration Template"
        title={template.name}
        description={`Version ${template.version}`}
      />

      <section className="panel form-panel admin-form-panel">
        <div className="section-head">
          <div>
            <small>Template Details</small>
            <h2>{template.name}</h2>
          </div>
          <strong>{template.status}</strong>
        </div>

        {query.error ? (
          <div className="form-alert">{query.error}</div>
        ) : null}

        {query.success ? (
          <div className="form-alert success">{query.success}</div>
        ) : null}

        <dl className="configuration-template-details">
          <div>
            <dt>Version</dt>
            <dd>v{template.version}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{template.status}</dd>
          </div>
          <div>
            <dt>Source Organization</dt>
            <dd>
              {template.source_organization_name ??
                "Source organization unavailable"}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDate(template.created_at)}</dd>
          </div>
          <div className="full">
            <dt>Description</dt>
            <dd>{template.description || "No description provided."}</dd>
          </div>
        </dl>

        <div className="form-actions">
          <Link
            href="/admin/configuration-templates"
            className="secondary-button"
          >
            Back to Templates
          </Link>

          {isDraft ? (
            <form action={publishConfigurationTemplateAction}>
              <input
                type="hidden"
                name="templateId"
                value={template.id}
              />
              <button type="submit" className="primary-button">
                Publish Template
              </button>
            </form>
          ) : null}
        </div>

        {isDraft ? (
          <p className="configuration-template-publish-note">
            Publishing makes this template available when setting up a new
            organization. The captured configuration remains an independent
            snapshot.
          </p>
        ) : null}
      </section>
    </>
  );
}
