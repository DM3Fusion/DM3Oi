"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  markNotificationReadAction,
  markNotificationUnreadAction,
  openNotificationAction,
  deleteCommunicationAction,
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
  canDeleteCommunications: boolean;
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
  if (item.source_domain === "EMAIL") return "Email";
  return humanize(item.source_domain);
}

function communicationStatus(item: Notification) {
  if (item.communication_kind === "EMAIL_DELIVERY") {
    if (item.opened_at) return "Opened";
    return humanize(item.delivery_status ?? "Pending");
  }
  return item.read_at
    ? (item.is_personal ? "Read" : "Recipient read")
    : (item.is_personal ? "Unread" : "Recipient unread");
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
      className={`notification-summary${item.is_personal && !item.read_at ? " unread" : ""}${selected ? " selected" : ""}${item.is_personal ? "" : " observed"}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${item.communication_kind === "EMAIL_DELIVERY" ? "Email audit" : item.is_personal ? (item.read_at ? "Read" : "Unread") : "Observed notification"}: ${item.title}`}
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
  canDeleteCommunications,
}: {
  item: Notification;
  timezone: string;
  serviceRequestPreview: ServiceRequestInboxPreview | null;
  loading: boolean;
  error: string | null;
  canDeleteCommunications: boolean;
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
          <dd>{communicationStatus(item)}</dd>
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
          {item.communication_kind === "EMAIL_DELIVERY"
            ? "Organization email audit · Email delivery/open state is separate from Inbox read state."
            : "Organization notification · Recipient read status is not changed from this view."}
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
        ) : item.destination_path !== "/communications" ? (
          <Link className="primary-button" href={communicationsDestination(item.destination_path)}>
            {openLabel(item)}
          </Link>
        ) : null}

        {item.is_personal ? (
          <form action={item.read_at ? markNotificationUnreadAction : markNotificationReadAction}>
            <input type="hidden" name="notificationId" value={item.id} />
            <PendingSubmitButton className="secondary-button" pendingLabel="Updating…">
              Mark as {item.read_at ? "unread" : "read"}
            </PendingSubmitButton>
          </form>
        ) : null}

        {canDeleteCommunications ? (
          <form
            action={deleteCommunicationAction}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  item.communication_kind === "EMAIL_DELIVERY"
                    ? "Permanently remove this email record from DM3Oi Communications? This does not recall an email already delivered."
                    : "Permanently remove this notification from DM3Oi Communications?",
                )
              )
                event.preventDefault();
            }}
          >
            <input
              type="hidden"
              name="organizationId"
              value={item.organization_id}
            />
            <input
              type="hidden"
              name="recordKind"
              value={item.communication_kind}
            />
            <input
              type="hidden"
              name="recordId"
              value={
                item.communication_kind === "EMAIL_DELIVERY"
                  ? item.source_entity_id
                  : item.id
              }
            />
            <PendingSubmitButton
              className="secondary-button communications-delete-button"
              pendingLabel="Deleting…"
            >
              Delete communication
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
  canDeleteCommunications,
}: {
  item: Notification;
  timezone: string;
  canDeleteCommunications: boolean;
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
            {communicationStatus(item)}
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
    <article className={`notification-item${item.is_personal && !item.read_at ? " unread" : ""}${item.is_personal ? "" : " observed"}`}>
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

      {canDeleteCommunications ? (
        <form
          action={deleteCommunicationAction}
          className="notification-state-form"
          onSubmit={(event) => {
            if (
              !window.confirm(
                item.communication_kind === "EMAIL_DELIVERY"
                  ? "Permanently remove this email record from DM3Oi Communications? This does not recall an email already delivered."
                  : "Permanently remove this notification from DM3Oi Communications?",
              )
            )
              event.preventDefault();
          }}
        >
          <input
            type="hidden"
            name="organizationId"
            value={item.organization_id}
          />
          <input
            type="hidden"
            name="recordKind"
            value={item.communication_kind}
          />
          <input
            type="hidden"
            name="recordId"
            value={
              item.communication_kind === "EMAIL_DELIVERY"
                ? item.source_entity_id
                : item.id
            }
          />
          <PendingSubmitButton
            className="communications-delete-button"
            pendingLabel="Deleting…"
          >
            Delete
          </PendingSubmitButton>
        </form>
      ) : null}
    </article>
  );
}

export function CommunicationsInbox({
  notifications,
  timezone,
  emptyMessage,
  canDeleteCommunications,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(notifications[0]?.id ?? null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [serviceRequestPreview, setServiceRequestPreview] = useState<{
    notificationId: string;
    preview: ServiceRequestInboxPreview;
  } | null>(null);
  const [previewError, setPreviewError] = useState<{
    notificationId: string;
    message: string;
  } | null>(null);
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
            setPreviewError({
              notificationId: item.id,
              message: "The Service Request preview is unavailable.",
            });
            return;
          }
          setServiceRequestPreview({
            notificationId: item.id,
            preview,
          });
        }
      } catch {
        setPreviewError({
          notificationId: item.id,
          message: "The selected communication could not be loaded.",
        });
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
          serviceRequestPreview={
            serviceRequestPreview?.notificationId === selected.id
              ? serviceRequestPreview.preview
              : null
          }
          loading={
            isPreviewPending &&
            selected.source_domain === "SERVICE_REQUEST" &&
            serviceRequestPreview?.notificationId !== selected.id &&
            previewError?.notificationId !== selected.id
          }
          error={
            previewError?.notificationId === selected.id
              ? previewError.message
              : null
          }
          canDeleteCommunications={canDeleteCommunications}
        />
      </div>

      <div className="notification-list communications-inbox-mobile">
        {displayedNotifications.map((item) => (
          <MobileNotification
            key={item.id}
            item={item}
            timezone={timezone}
            canDeleteCommunications={canDeleteCommunications}
          />
        ))}
      </div>
    </section>
  );
}
