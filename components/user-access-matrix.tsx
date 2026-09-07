"use client";
import { useState } from "react";
import {
  saveOrganizationRolePermissionsAction,
  restoreOrganizationRolePermissionsAction,
} from "@/lib/data/organization-permission-actions";
import type {
  ConfigurableOrganizationRole,
  Permission,
} from "@/lib/auth/permissions";
type Row = { label: string; permission: Permission };
type RoleState = Record<ConfigurableOrganizationRole, Record<string, boolean>>;
const roleLabel = (role: string) =>
  role.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
export function UserAccessMatrix({
  navigationRows,
  managementRows,
  initial,
  editableRoles,
  focusedRole,
}: {
  navigationRows: Row[];
  managementRows: Row[];
  initial: RoleState;
  editableRoles: ConfigurableOrganizationRole[];
  focusedRole?: ConfigurableOrganizationRole;
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roles = Object.keys(initial) as ConfigurableOrganizationRole[];
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const update = (
    role: ConfigurableOrganizationRole,
    permission: Permission,
    allowed: boolean,
  ) => {
    setValues((current) => ({
      ...current,
      [role]: { ...current[role], [permission]: allowed },
    }));
    setMessage(null);
    setError(null);
  };
  const table = (title: string, rows: Row[]) => (
    <section className="panel detail-section user-access-section">
      <h2>{title}</h2>
      <div className="user-access-scroll">
        <table className="user-access-table">
          <thead>
            <tr>
              <th>Access</th>
              {roles.map((role) => (
                <th
                  className={
                    focusedRole === role ? "user-access-focused" : undefined
                  }
                  key={role}
                >
                  {roleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.permission}>
                <th scope="row">{row.label}</th>
                {roles.map((role) => {
                  const hierarchyEditable = editableRoles.includes(role);
                  const rolePermissionLocked =
                    row.permission === "MANAGE_ROLE_PERMISSIONS" &&
                    (role === "STAFF_MANAGER" || role === "STAFF_USER");
                  const editable = hierarchyEditable && !rolePermissionLocked;
                  const id = `${title}-${role}-${row.permission}`;
                  return (
                    <td
                      className={
                        focusedRole === role ? "user-access-focused" : undefined
                      }
                      key={role}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={Boolean(values[role][row.permission])}
                        disabled={!editable}
                        aria-label={`Allow ${roleLabel(role)} to ${row.label}`}
                        aria-describedby={
                          !editable ? `${id}-reason` : undefined
                        }
                        onChange={(event) =>
                          update(role, row.permission, event.target.checked)
                        }
                      />
                      {!editable ? (
                        <span className="sr-only" id={`${id}-reason`}>
                          {rolePermissionLocked
                            ? "This role cannot administer organization access."
                            : role === "BUSINESS_OWNER"
                            ? "Business Owner authority is protected."
                            : "You cannot configure this role."}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <>
      {table("Navigation Access", navigationRows)}
      {table("Management Access", managementRows)}
      {error ? (
        <div className="form-alert" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="success-alert" role="status">
          {message}
        </div>
      ) : null}
      <div className="user-access-actions">
        <button
          type="button"
          className="primary-button"
          disabled={pending || !dirty}
          onClick={async () => {
            setPending(true);
            setError(null);
            for (const role of editableRoles) {
              const changes = Object.fromEntries(
                Object.keys(values[role])
                  .filter((key) => values[role][key] !== saved[role][key])
                  .map((key) => [key, values[role][key]]),
              );
              if (!Object.keys(changes).length) continue;
              const result = await saveOrganizationRolePermissionsAction({
                role,
                changes,
              });
              if (!result.ok) {
                setError(result.error);
                setPending(false);
                return;
              }
            }
            setSaved(values);
            setMessage("Access Updated");
            setPending(false);
          }}
        >
          {pending ? "Saving…" : "Save Access"}
        </button>
        {editableRoles.map((role) => (
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            key={role}
            onClick={async () => {
              if (
                !window.confirm(
                  `Restore DM3Oi recommended defaults for ${roleLabel(role)}?`,
                )
              )
                return;
              setPending(true);
              setError(null);
              const result =
                await restoreOrganizationRolePermissionsAction(role);
              if (!result.ok) {
                setError(result.error);
                setPending(false);
                return;
              }
              window.location.reload();
            }}
          >
            Restore {roleLabel(role)} Defaults
          </button>
        ))}
      </div>
    </>
  );
}
