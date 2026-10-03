import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createConfigurationTemplateAction } from "@/lib/data/platform-actions";
import { getPlatformAdministration } from "@/lib/data/platform-repository";
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
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  await requireSuperAdmin();

  const params = await searchParams;

  const [{ organizations }, templateClient] = await Promise.all([
    getPlatformAdministration(),
    createClient(),
  ]);

  const typedTemplateClient = templateClient as ReturnType<
    typeof import("@supabase/ssr").createServerClient<ConfigurationTemplateManagementDatabase>
  >;

  const templateResult = await typedTemplateClient.rpc(
    "get_configuration_templates",
  );

  if (templateResult.error) {
    console.error("Configuration template management lookup failed", {
      code: templateResult.error.code,
      message: templateResult.error.message,
    });
  }

  const templates =
    (templateResult.data ?? []) as ConfigurationTemplateRow[];

  const sourceOrganizations = [...organizations].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Configuration Templates"
        description="Capture reusable Question and Rule configuration from an existing organization."
      />

      <section className="panel form-panel admin-form-panel">
        <div className="section-head">
          <div>
            <small>Template Library</small>
            <h2>Create Template</h2>
          </div>
        </div>

        {params.error ? (
          <div className="form-alert">{params.error}</div>
        ) : null}

        {params.success ? (
          <div className="form-alert success">{params.success}</div>
        ) : null}

        <form
          action={createConfigurationTemplateAction}
          className="entity-form"
        >
          <label>
            <span>Source Organization</span>
            <select name="sourceOrganizationId" required defaultValue="">
              <option value="" disabled>
                Select organization
              </option>
              {sourceOrganizations.map((organization) => (
                <option
                  key={organization.id}
                  value={organization.id}
                >
                  {organization.name}
                </option>
              ))}
            </select>
            <small>
              Questions, options, Rules, and Rule actions are copied into an
              independent template snapshot.
            </small>
          </label>

          <label>
            <span>Template Name</span>
            <input
              name="name"
              type="text"
              maxLength={120}
              required
              placeholder="Example: Tax Preparation Workflow"
            />
          </label>

          <label className="full">
            <span>Description</span>
            <textarea
              name="description"
              rows={3}
              maxLength={500}
              placeholder="Describe when this configuration should be used."
            />
          </label>

          <label>
            <span>Status</span>
            <select name="status" defaultValue="DRAFT">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
            <small>
              Only Published templates appear when setting up a new
              organization.
            </small>
          </label>

          <div className="form-actions full">
            <Link
              href="/admin/organizations/new"
              className="secondary-button"
            >
              Back to New Organization
            </Link>
            <button type="submit" className="primary-button">
              Create Template
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <small>Reusable Configuration</small>
            <h2>Templates</h2>
          </div>
          <span>{templates.length} version{templates.length === 1 ? "" : "s"}</span>
        </div>

        {templateResult.error ? (
          <div className="empty-state">
            Configuration templates could not be loaded.
          </div>
        ) : templates.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Source Organization</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => {
                  const detailHref =
                    `/admin/configuration-templates/${template.id}`;

                  return (
                    <tr key={template.id} className="configuration-template-row">
                      <td>
                        <Link
                          href={detailHref}
                          className="configuration-template-row-link"
                        >
                          <strong>{template.name}</strong>
                          {template.description ? (
                            <small className="table-secondary">
                              {template.description}
                            </small>
                          ) : null}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={detailHref}
                          className="configuration-template-row-link"
                        >
                          v{template.version}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={detailHref}
                          className="configuration-template-row-link"
                        >
                          {template.status}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={detailHref}
                          className="configuration-template-row-link"
                        >
                          {template.source_organization_name ??
                            "Source organization unavailable"}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={detailHref}
                          className="configuration-template-row-link"
                        >
                          {formatDate(template.created_at)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            No configuration templates have been created yet.
          </div>
        )}
      </section>
    </>
  );
}
