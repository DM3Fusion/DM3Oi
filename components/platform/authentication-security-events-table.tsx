"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { ApplicationIcon } from "@/components/application-icon";
import type { AuthenticationSecurityEvent } from "@/lib/data/platform-authentication-security-repository";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatEventType(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function locationLabel(event: AuthenticationSecurityEvent) {
  const location = [
    event.city,
    event.region_code,
    event.country_code,
  ].filter(Boolean).join(", ");

  return [location, event.postal_code]
    .filter(Boolean)
    .join(" ") || "Unavailable";
}

function display(value: string | number | null) {
  return value === null || value === ""
    ? "Unavailable"
    : String(value);
}

export function AuthenticationSecurityEventsTable({
  events,
}: {
  events: AuthenticationSecurityEvent[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selected, setSelected] =
    useState<AuthenticationSecurityEvent | null>(null);

  function open(event: AuthenticationSecurityEvent) {
    setSelected(event);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
    setSelected(null);
  }

  function onRowKeyDown(
    keyboardEvent: KeyboardEvent<HTMLTableRowElement>,
    event: AuthenticationSecurityEvent,
  ) {
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      open(event);
    }
  }

  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) close();
  }

  const details: Array<[string, string]> = selected
    ? [
        ["Event ID", display(selected.event_id)],
        ["Timestamp (ET)", formatDate(selected.event_timestamp)],
        ["Event Type", formatEventType(selected.event_type)],
        ["Authentication Outcome", display(selected.authentication_outcome)],
        ["Authentication Method", display(selected.authentication_method)],
        ["User UUID", display(selected.user_id)],
        ["Access Category", display(selected.access_category)],
        ["Organization UUID", display(selected.organization_id)],
        ["Application Role", display(selected.application_role)],
        ["Network Location", locationLabel(selected)],
        ["Country", display(selected.country_code)],
        ["Region", display(selected.region_code)],
        ["City", display(selected.city)],
        ["Postal Code", display(selected.postal_code)],
        ["Network Latitude", display(selected.network_latitude)],
        ["Network Longitude", display(selected.network_longitude)],
        ["Network Location Type", display(selected.network_location_type)],
        ["Device Category", display(selected.device_category)],
        ["Browser", display(selected.browser)],
        ["Operating System", display(selected.operating_system)],
        ["Event Source", display(selected.event_source)],
        ["Schema Version", display(selected.event_schema_version)],
      ]
    : [];

  return (
    <>
      <div className="authentication-security-events-table-wrap">
        <table className="authentication-security-events-table">
          <thead>
            <tr>
              <th>Timestamp (ET)</th>
              <th>Event</th>
              <th>Outcome</th>
              <th>Network Location</th>
            </tr>
          </thead>

          <tbody>
            {events.map((event) => (
              <tr
                key={event.event_id}
                tabIndex={0}
                role="button"
                aria-label={`View details for ${formatEventType(event.event_type)} on ${formatDate(event.event_timestamp)}`}
                onClick={() => open(event)}
                onKeyDown={(keyboardEvent) =>
                  onRowKeyDown(keyboardEvent, event)
                }
              >
                <td>
                  <time dateTime={event.event_timestamp}>
                    {formatDate(event.event_timestamp)}
                  </time>
                </td>
                <td>{formatEventType(event.event_type)}</td>
                <td>{event.authentication_outcome}</td>
                <td>{locationLabel(event)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialog}
        className="authentication-security-event-dialog"
        aria-labelledby={titleId}
        onClick={onBackdropClick}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="authentication-security-event-dialog-frame">
            <header className="authentication-security-event-dialog-header">
              <div>
                <p className="eyebrow">Authentication Security</p>
                <h2 id={titleId}>Event Details</h2>
                <p>{formatEventType(selected.event_type)}</p>
              </div>

              <button
                type="button"
                className="rule-dialog-close"
                aria-label="Close event details"
                onClick={close}
                autoFocus
              >
                <ApplicationIcon name="close" />
              </button>
            </header>

            <div className="authentication-security-event-dialog-body">
              <dl className="authentication-security-event-details">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
