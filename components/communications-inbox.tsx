"use client";

import { useState } from "react";
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

function NotificationPreview({
  item,
  timezone,
}: {
  item: Notification;
  timezone: string;
}) {
  const category = categoryLabel(item);

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

  if (!notifications.length) {
    return (
      <section className="panel communications-center" aria-label="Notification inbox">
        <div className="no-results">{emptyMessage}</div>
      </section>
    );
  }

  const selected =
    notifications.find((item) => item.id === selectedId) ?? notifications[0];

  return (
    <section className="panel communications-center" aria-label="Notification inbox">
      <div className="communications-inbox-desktop">
        <div className="communications-master" aria-label="Communications list">
          {notifications.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              timezone={timezone}
              selected={item.id === selected.id}
              onSelect={() => setSelectedId(item.id)}
            />
          ))}
        </div>
        <NotificationPreview item={selected} timezone={timezone} />
      </div>

      <div className="notification-list communications-inbox-mobile">
        {notifications.map((item) => (
          <MobileNotification key={item.id} item={item} timezone={timezone} />
        ))}
      </div>
    </section>
  );
}
