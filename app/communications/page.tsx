import { PageHeader } from "@/components/ui";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
  openNotificationAction,
} from "@/lib/data/communications-actions";
import { getNotifications } from "@/lib/data/communications-repository";
import { PendingSubmitButton } from "@/components/pending-submit-button";

const when = (value: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default async function CommunicationsPage() {
  const notifications = await getNotifications();
  const unread = notifications.filter((item) => !item.read_at).length;
  return (
    <>
      <PageHeader
        eyebrow="Shared Communications"
        title="Communications"
        description="Notifications from customer conversations and DM3iQCM workflows."
        action={unread ? <form action={markAllNotificationsReadAction}><PendingSubmitButton className="secondary-button" pendingLabel="Marking…">Mark all as read</PendingSubmitButton></form> : undefined}
      />
      <section className="panel communications-center" aria-label="Notification inbox">
        {notifications.length ? (
          <div className="notification-list">
            {notifications.map((item) => (
              <article className={`notification-item${item.read_at ? "" : " unread"}`} key={item.id}>
                <form action={openNotificationAction} className="notification-open-form">
                  <input type="hidden" name="notificationId" value={item.id} />
                  <input type="hidden" name="destination" value={item.destination_path} />
                  <PendingSubmitButton className="notification-open" pendingLabel="Opening…">
                    <span className="notification-state" aria-label={item.read_at ? "Read" : "Unread"} />
                    <span className="notification-copy">
                      <strong>{item.title}</strong>
                      <span>{item.message}</span>
                      <small>{item.category.replaceAll("_", " ")} · {when(item.created_at)}</small>
                    </span>
                    <span aria-hidden>→</span>
                  </PendingSubmitButton>
                </form>
                <form action={item.read_at ? markNotificationUnreadAction : markNotificationReadAction} className="notification-state-form">
                  <input type="hidden" name="notificationId" value={item.id} />
                  <PendingSubmitButton pendingLabel="Updating…">Mark as {item.read_at ? "unread" : "read"}</PendingSubmitButton>
                </form>
              </article>
            ))}
          </div>
        ) : <div className="no-results">No communications yet.</div>}
      </section>
    </>
  );
}
