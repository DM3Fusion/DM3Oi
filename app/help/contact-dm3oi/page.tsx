import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireInternalContext } from "@/lib/auth/context";
import { submitPlatformSupportRequestAction } from "@/lib/data/platform-support-actions";
import {
  platformSupportCategories,
  platformSupportCategoryLabels,
} from "@/lib/platform-support";

export default async function ContactDM3OiPage({
  searchParams,
}: {
  searchParams: Promise<{
    sent?: string;
    error?: string;
  }>;
}) {
  const context = await requireInternalContext();
  const query = await searchParams;

  return (
    <>
      <PageHeader
        eyebrow="Help"
        title="Contact DM3Oi"
        description="Send a message directly to DM3Oi platform support."
      />

      {query.sent === "1" ? (
        <div className="success-alert page-notice" role="status">
          Your message was sent to DM3Oi.
        </div>
      ) : null}

      {query.error ? (
        <div className="form-alert page-notice" role="alert">
          {query.error}
        </div>
      ) : null}

      <section className="panel form-panel">
        <div className="detail-grid">
          <div>
            <span>Organization</span>
            <strong>
              {context.activeOrganization.displayName ??
                context.activeOrganization.name}
            </strong>
          </div>
          <div>
            <span>Signed in as</span>
            <strong>{context.displayName}</strong>
          </div>
        </div>

        <form
          action={submitPlatformSupportRequestAction}
          className="entity-form"
        >
          <label>
            <span>Category</span>
            <select name="category" defaultValue="TECHNICAL" required>
              {platformSupportCategories.map((category) => (
                <option key={category} value={category}>
                  {platformSupportCategoryLabels[category]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Subject</span>
            <input
              name="subject"
              type="text"
              maxLength={240}
              required
              placeholder="Briefly describe what you need help with"
            />
          </label>

          <label>
            <span>Message</span>
            <textarea
              name="message"
              rows={9}
              maxLength={5000}
              required
              placeholder="Provide the details DM3Oi needs to understand your question or issue."
            />
          </label>

          <div className="portal-privacy-settings-note">
            <strong>Authenticated support channel</strong>
            <span>
              Your organization and account identity are attached
              automatically. Do not include passwords, authentication
              codes, or sensitive customer documents.
            </span>
          </div>

          <div className="form-actions">
            <Link href="/">Cancel</Link>
            <PendingSubmitButton
              className="primary-button"
              pendingLabel="Sending…"
            >
              Send to DM3Oi
            </PendingSubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
