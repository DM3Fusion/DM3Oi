import Link from "next/link";
import { PageHeader, Badge } from "@/components/ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  getPlatformSupportInbox,
  getPlatformSupportUnreadCount,
} from "@/lib/data/platform-support-repository";
import {
  markAllPlatformSupportReadAction,
  setPlatformSupportReadStateAction,
} from "@/lib/data/platform-support-actions";
import {
  isPlatformSupportCategory,
  isPlatformSupportStatus,
  platformSupportCategories,
  platformSupportCategoryLabels,
  platformSupportStatuses,
  platformSupportStatusLabels,
} from "@/lib/platform-support";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));

export default async function PlatformInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    q?: string;
  }>;
}) {
  const query = await searchParams;

  const status =
    query.status && isPlatformSupportStatus(query.status)
      ? query.status
      : null;

  const category =
    query.category &&
    isPlatformSupportCategory(query.category)
      ? query.category
      : null;

  const search = query.q?.trim().slice(0, 200) ?? "";

  const [items, unreadCount] = await Promise.all([
    getPlatformSupportInbox({
      status,
      category,
      query: search || null,
    }),
    getPlatformSupportUnreadCount(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Inbox"
        description="Authenticated messages sent to DM3Oi by organization users."
      />

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Platform Inbox</h2>
            <p>
              {unreadCount
                ? `${unreadCount} unread ${
                    unreadCount === 1 ? "message" : "messages"
                  }`
                : "No unread messages"}
            </p>
          </div>

          {unreadCount ? (
            <form action={markAllPlatformSupportReadAction}>
              <PendingSubmitButton
                className="secondary-button"
                pendingLabel="Updating…"
              >
                Mark All Read
              </PendingSubmitButton>
            </form>
          ) : null}
        </div>

        <form method="get" className="filter-bar">
          <label>
            <span>Status</span>
            <select
              name="status"
              defaultValue={status ?? ""}
            >
              <option value="">All</option>
              {platformSupportStatuses.map((item) => (
                <option key={item} value={item}>
                  {platformSupportStatusLabels[item]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Category</span>
            <select
              name="category"
              defaultValue={category ?? ""}
            >
              <option value="">All</option>
              {platformSupportCategories.map((item) => (
                <option key={item} value={item}>
                  {platformSupportCategoryLabels[item]}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-search">
            <span>Search</span>
            <input
              type="search"
              name="q"
              maxLength={200}
              defaultValue={search}
              placeholder="Organization, sender, subject, message"
            />
          </label>

          <button className="filter-button">Apply</button>
          <Link className="auth-link" href="/admin/inbox">
            Clear
          </Link>
        </form>

        {items.length ? (
          <div className="communications-list">
            {items.map((item) => (
              <article
                key={item.id}
                className={`communication-row ${
                  item.read ? "" : "unread"
                }`.trim()}
              >
                <div className="communication-row-main">
                  <div className="communication-row-heading">
                    <Link href={`/admin/inbox/${item.id}`}>
                      <strong>{item.subject}</strong>
                    </Link>
                    {!item.read ? (
                      <span className="nav-unread-count">1</span>
                    ) : null}
                  </div>

                  <p>{item.message}</p>

                  <div className="communication-meta">
                    <span>{item.organizationName}</span>
                    <span>{item.submitterName}</span>
                    <span>
                      {platformSupportCategoryLabels[item.category]}
                    </span>
                    <Badge
                      value={
                        platformSupportStatusLabels[item.status]
                      }
                    />
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>

                <form
                  action={setPlatformSupportReadStateAction}
                >
                  <input
                    type="hidden"
                    name="requestId"
                    value={item.id}
                  />
                  <input
                    type="hidden"
                    name="read"
                    value={item.read ? "false" : "true"}
                  />
                  <button className="secondary-button">
                    {item.read
                      ? "Mark Unread"
                      : "Mark Read"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h2>No Platform Inbox messages</h2>
            <p>
              No authenticated organization messages match the
              selected filters.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
