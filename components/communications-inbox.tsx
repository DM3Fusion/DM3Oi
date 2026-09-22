"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  markNotificationReadAction,
  markNotificationUnreadAction,
  openNotificationAction,
} from "@/lib/data/communications-actions";
import type { Notification } from "@/lib/data/communications-repository";
import { communicationsDestination } from "@/lib/communications-view";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import {
  getServiceRequestInboxPreview,
  type ServiceRequestInboxPreview,
} from "@/lib/data/communications-preview";
import { createInternalServiceRequestMessageAction } from "@/lib/data/service-request-actions";

type Props = {
  notifications: Notification[];
  timezone: string;
  emptyMessage: string;
};

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceLabel(item: Notification) {
  if (item.source_domain === "SERVICE_REQUEST") return "Service Request";
  if (item.source_domain === "CASE") return "Case";
  if (item.source_domain === "TASK") return "Task";
  return humanize(item.source_domain);
}

function categoryLabel(item: Notification) {
  if (!item.category || item.category === item.source_domain) return null;
  return humanize(item.category);
}

function openLabel(item: Notification) {
  if (item.source_domain === "SERVICE_REQUEST") return "Open Service Request";
  if (item.source_domain === "CASE") return "Open Case";
  if (item.source_domain === "TASK") return "Open Task";
  return "Open";
}

function NotificationRow({
  item,
  timezone,
  selected,
  onSelect,
}: {
  item: Notification;
  timezone: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const category = categoryLabel(item);

  return (
    <button
      type="button"
      className={`notification-summary${item.read_at ? "" : " unread"}${selected ? " selected" : ""}${item.is_personal ? "" : " observed"}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${item.read_at ? "Read" : "Unread"} notification: ${item.title}`}
    >
      <span className="notification-summary-state" aria-hidden />
      <span className="notification-summary-content">
        <span className="notification-summary-heading">
          <strong>{item.title}</strong>
          <time>{formatOrganizationDateTime(item.created_at, timezone, "medium")}</time>
        </span>
        <span className="notification-summary-message">{item.message}</span>
        <span className="notification-summary-meta">
          <span>{sourceLabel(item)}</span>
          {category ? <><span aria-hidden> · </span><span>{category}</span></> : null}
          {!item.is_personal && item.recipient_display_name ? (
            <><span aria-hidden> · </span><span>To {item.recipient_display_name}</span></>
          ) : null}
        </span>
      </span>
      <ApplicationIcon name="forward" />
    </button>
  );
}

function ServiceRequestPreview({
  item,
  preview,
  timezone,
}: {
  item: Notification;
  preview: ServiceRequestInboxPreview;
  timezone: string;
}) {
  return (
    <article className="communications-preview communications-service-request-preview" aria-label="Service Request preview">
      <header className="communications-preview-header">
        <div>
          <span className="communications-preview-kicker">
            {preview.requestNumber}
          </span>
          <h2>{preview.subject}</h2>
        </div>
        <time>
          {formatOrganizationDateTime(preview.createdAt, timezone, "medium")}
        </time>
      </header>

      <dl className="communications-preview-meta service-request-preview-meta">
        <div>
          <dt>Status</dt>
          <dd>{humanize(preview.status)}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{humanize(preview.priority)}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{preview.customerName}</dd>
        </div>
        <div>
          <dt>Assigned To</dt>
          <dd>{preview.assignedName}</dd>
        </div>
      </dl>

      <section className="communications-preview-conversation">
        <h3>Conversation</h3>
        <div className="communications-preview-conversation-list">
          {preview.messages.map((message) => (
            <article
              className={`communications-preview-conversation-message ${
                message.authorType === "CUSTOMER" ? "customer" : "staff"
              }`}
              key={message.id}
            >
              <div>
                <strong>{message.authorName}</strong>
                <time>
                  {formatOrganizationDateTime(
                    message.createdAt,
                    timezone,
                    "medium",
                  )}
                </time>
              </div>
              <p>{message.body}</p>
            </article>
          ))}
        </div>

        {preview.canReply ? (
          <form
            action={createInternalServiceRequestMessageAction}
            className="communications-preview-reply"
          >
            <input
              type="hidden"
              name="serviceRequestId"
              value={preview.id}
            />
            <input type="hidden" name="fromCommunications" value="true" />
            <label>
              <span>Reply to customer</span>
              <textarea
                name="body"
                rows={4}
                required
                maxLength={4000}
                placeholder="Write a response to the customer…"
              />
            </label>
            <PendingSubmitButton
              className="primary-button"
              pendingLabel="Sending…"
            >
              Send Reply
            </PendingSubmitButton>
          </form>
        ) : null}
      </section>

      {!item.is_personal ? (
        <p className="communications-preview-observed">
          Organization notification · Recipient read status is not changed from this view.
        </p>
      ) : null}

      <div className="communications-preview-actions">
        <Link
          className="secondary-button"
          href={communicationsDestination(item.destination_path)}
        >
          Open Full Service Request
        </Link>
      </div>
    </article>
  );
}

function NotificationPreview({
  item,
  timezone,
  serviceRequestPreview,
  loading,
  error,
}: {
  item: Notification;
  timezone: string;
  serviceRequestPreview: ServiceRequestInboxPreview | null;
  loading: boolean;
  error: string | null;
}) {
  const category = categoryLabel(item);

  if (item.source_domain === "SERVICE_REQUEST") {
    if (loading) {
      return (
        <article className="communications-preview communications-preview-loading" aria-live="polite">
          <p>Loading Service Request…</p>
        </article>
      );
    }

    if (serviceRequestPreview) {
      return (
        <ServiceRequestPreview
          item={item}
          preview={serviceRequestPreview}
          timezone={timezone}
        />
      );
    }

    if (error) {
      return (
        <article className="communications-preview">
          <div className="communications-preview-error" role="alert">
            {error}
          </div>
          <div className="communications-preview-actions">
            <Link
              className="primary-button"
              href={communicationsDestination(item.destination_path)}
            >
              Open Service Request
            </Link>
          </div>
        </article>
      );
    }
  }

  return (
    <article className="communications-preview" aria-label="Communication preview">
      <header className="communications-preview-header">
        <div>
          <span className="communications-preview-kicker">{sourceLabel(item)}</span>
          <h2>{item.title}</h2>
        </div>
        <time>{formatOrganizationDateTime(item.created_at, timezone, "medium")}</time>
      </header>

      <div className="communications-preview-message">
        <p>{item.message}</p>
      </div>

      <dl className="communications-preview-meta">
        <div>
          <dt>Source</dt>
          <dd>{sourceLabel(item)}</dd>
        </div>
        {category ? (
          <div>
            <dt>Category</dt>
            <dd>{category}</dd>
          </div>
        ) : null}
        <div>
          <dt>Status</dt>
          <dd>{item.read_at ? (item.is_personal ? "Read" : "Recipient read") : (item.is_personal ? "Unread" : "Recipient unread")}</dd>
        </div>
        {!item.is_personal && item.recipient_display_name ? (
          <div>
            <dt>Recipient</dt>
            <dd>{item.recipient_display_name}</dd>
          </div>
        ) : null}
      </dl>

      {!item.is_personal ? (
        <p className="communications-preview-observed">
          Organization notification · Recipient read status is not changed from this view.
        </p>
      ) : null}

      <div className="communications-preview-actions">
        {item.is_personal ? (
          <form action={openNotificationAction}>
            <input type="hidden" name="notificationId" value={item.id} />
            <input type="hidden" name="destination" value={item.destination_path} />
            <PendingSubmitButton className="primary-button" pendingLabel="Opening…">
              {openLabel(item)}
            </PendingSubmitButton>
          </form>
        ) : (
          <Link className="primary-button" href={communicationsDestination(item.destination_path)}>
            {openLabel(item)}
          </Link>
        )}

        {item.is_personal ? (
          <form action={item.read_at ? markNotificationUnreadAction : markNotificationReadAction}>
            <input type="hidden" name="notificationId" value={item.id} />
            <PendingSubmitButton className="secondary-button" pendingLabel="Updating…">
              Mark as {item.read_at ? "unread" : "read"}
            </PendingSubmitButton>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function MobileNotification({
  item,
  timezone,
}: {
  item: Notification;
  timezone: string;
}) {
  const category = categoryLabel(item);

  const content = (
    <>
      <span className="notification-state" aria-hidden />
      <span className="notification-copy">
        <strong>{item.title}</strong>
        <span>{item.message}</span>
        <small>
          <span className="notification-read-label">
            {item.is_personal
              ? (item.read_at ? "Read" : "Unread")
              : (item.read_at ? "Recipient read" : "Recipient unread")}
          </span>
          {" · "}
          <span className="notification-source">{sourceLabel(item)}</span>
          {category ? <> · <span>{category}</span></> : null}
          {" · "}
          {formatOrganizationDateTime(item.created_at, timezone, "medium")}
        </small>
        {!item.is_personal && item.recipient_display_name ? (
          <small className="notification-recipient">
            Recipient: {item.recipient_display_name}
          </small>
        ) : null}
      </span>
      <ApplicationIcon name="forward" />
    </>
  );

  return (
    <article className={`notification-item${item.read_at ? "" : " unread"}${item.is_personal ? "" : " observed"}`}>
      {item.is_personal ? (
        <form action={openNotificationAction} className="notification-open-form">
          <input type="hidden" name="notificationId" value={item.id} />
          <input type="hidden" name="destination" value={item.destination_path} />
          <PendingSubmitButton className="notification-open" pendingLabel="Opening…">
            {content}
          </PendingSubmitButton>
        </form>
      ) : (
        <Link href={communicationsDestination(item.destination_path)} className="notification-open">
          {content}
        </Link>
      )}
      {item.is_personal ? (
        <form action={item.read_at ? markNotificationUnreadAction : markNotificationReadAction} className="notification-state-form">
          <input type="hidden" name="notificationId" value={item.id} />
          <PendingSubmitButton pendingLabel="Updating…">
            Mark as {item.read_at ? "unread" : "read"}
          </PendingSubmitButton>
        </form>
      ) : null}
    </article>
  );
}

export function CommunicationsInbox({ notifications, timezone, emptyMessage }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(notifications[0]?.id ?? null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [serviceRequestPreview, setServiceRequestPreview] =
    useState<ServiceRequestInboxPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewPending, startPreviewTransition] = useTransition();

  if (!notifications.length) {
    return (
      <section className="panel communications-center" aria-label="Notification inbox">
        <div className="no-results">{emptyMessage}</div>
      </section>
    );
  }

  const displayedNotifications = notifications.map((item) =>
    readIds.has(item.id) ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item,
  );

  const selected =
    displayedNotifications.find((item) => item.id === selectedId) ??
    displayedNotifications[0];

  const selectNotification = (item: Notification) => {
    setSelectedId(item.id);
    setServiceRequestPreview(null);
    setPreviewError(null);

    startPreviewTransition(async () => {
      try {
        if (item.is_personal && !item.read_at) {
          const form = new FormData();
          form.set("notificationId", item.id);
          await markNotificationReadAction(form);
          setReadIds((current) => {
            const next = new Set(current);
            next.add(item.id);
            return next;
          });
        }

        if (item.source_domain === "SERVICE_REQUEST") {
          const preview = await getServiceRequestInboxPreview(item.source_entity_id);
          if (!preview) {
            setPreviewError("The Service Request preview is unavailable.");
            return;
          }
          setServiceRequestPreview(preview);
        }
      } catch {
        setPreviewError("The selected communication could not be loaded.");
      }
    });
  };

  return (
    <section className="panel communications-center" aria-label="Notification inbox">
      <div className="communications-inbox-desktop">
        <div className="communications-master" aria-label="Communications list">
          {displayedNotifications.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              timezone={timezone}
              selected={item.id === selected.id}
              onSelect={() => selectNotification(item)}
            />
          ))}
        </div>
        <NotificationPreview
          item={selected}
          timezone={timezone}
          serviceRequestPreview={serviceRequestPreview}
          loading={isPreviewPending && selected.source_domain === "SERVICE_REQUEST"}
          error={previewError}
        />
      </div>

      <div className="notification-list communications-inbox-mobile">
        {displayedNotifications.map((item) => (
          <MobileNotification key={item.id} item={item} timezone={timezone} />
        ))}
      </div>
    </section>
  );
}
