import { createClient } from "@/lib/supabase/server";

export type UserRoleHistoryEventType =
  | "BASELINE"
  | "ASSIGNED"
  | "CHANGED"
  | "REMOVED";

export type UserRoleHistoryScope =
  | "ORGANIZATION"
  | "PLATFORM";

export type UserRoleHistoryRow = {
  id: string;
  scope: UserRoleHistoryScope;
  eventType: UserRoleHistoryEventType;
  priorRole: string | null;
  newRole: string | null;
  organizationName: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  actorIsPlatform: boolean;
  createdAt: string;
};

type OrganizationRoleHistoryRpcRow = {
  id: string;
  event_type: string;
  prior_role: string | null;
  new_role: string | null;
  organization_name: string | null;
  actor_display_name: string | null;
  actor_email: string | null;
  actor_is_platform: boolean;
  created_at: string;
};

type PlatformRoleHistoryRpcRow =
  OrganizationRoleHistoryRpcRow & {
    scope: string;
  };

type RoleHistoryRpcClient = {
  rpc(
    fn: "get_organization_user_role_history",
    args: {
      target_organization_id: string;
      target_user_id: string;
    },
  ): PromiseLike<{
    data: OrganizationRoleHistoryRpcRow[] | null;
    error: { message: string; code?: string } | null;
  }>;

  rpc(
    fn: "get_platform_user_role_history",
    args: {
      target_user_id: string;
    },
  ): PromiseLike<{
    data: PlatformRoleHistoryRpcRow[] | null;
    error: { message: string; code?: string } | null;
  }>;
};

function eventType(value: string): UserRoleHistoryEventType {
  if (
    value === "BASELINE" ||
    value === "ASSIGNED" ||
    value === "CHANGED" ||
    value === "REMOVED"
  ) {
    return value;
  }

  throw new Error("Unexpected role history event type.");
}

function scope(value: string): UserRoleHistoryScope {
  if (value === "ORGANIZATION" || value === "PLATFORM") {
    return value;
  }

  throw new Error("Unexpected role history scope.");
}

function organizationRow(
  row: OrganizationRoleHistoryRpcRow,
): UserRoleHistoryRow {
  return {
    id: row.id,
    scope: "ORGANIZATION",
    eventType: eventType(row.event_type),
    priorRole: row.prior_role,
    newRole: row.new_role,
    organizationName: row.organization_name,
    actorDisplayName: row.actor_display_name,
    actorEmail: row.actor_email,
    actorIsPlatform: row.actor_is_platform,
    createdAt: row.created_at,
  };
}

function platformRow(
  row: PlatformRoleHistoryRpcRow,
): UserRoleHistoryRow {
  return {
    id: row.id,
    scope: scope(row.scope),
    eventType: eventType(row.event_type),
    priorRole: row.prior_role,
    newRole: row.new_role,
    organizationName: row.organization_name,
    actorDisplayName: row.actor_display_name,
    actorEmail: row.actor_email,
    actorIsPlatform: row.actor_is_platform,
    createdAt: row.created_at,
  };
}

export async function getOrganizationUserRoleHistory(
  organizationId: string,
  userId: string,
): Promise<UserRoleHistoryRow[]> {
  const supabase =
    (await createClient()) as unknown as RoleHistoryRpcClient;

  const { data, error } = await supabase.rpc(
    "get_organization_user_role_history",
    {
      target_organization_id: organizationId,
      target_user_id: userId,
    },
  );

  if (error) {
    console.error("Organization user role history lookup failed", {
      organizationId,
      userId,
      code: error.code ?? null,
      message: error.message,
    });

    return [];
  }

  return (data ?? []).map(organizationRow);
}

export async function getPlatformUserRoleHistory(
  userId: string,
): Promise<UserRoleHistoryRow[]> {
  const supabase =
    (await createClient()) as unknown as RoleHistoryRpcClient;

  const { data, error } = await supabase.rpc(
    "get_platform_user_role_history",
    {
      target_user_id: userId,
    },
  );

  if (error) {
    console.error("Platform user role history lookup failed", {
      userId,
      code: error.code ?? null,
      message: error.message,
    });

    return [];
  }

  return (data ?? []).map(platformRow);
}

export function roleHistoryRoleLabel(value: string | null) {
  return value ? value.replaceAll("_", " ") : "None";
}

export function roleHistoryChangeLabel(row: UserRoleHistoryRow) {
  if (row.eventType === "CHANGED") {
    return `${roleHistoryRoleLabel(row.priorRole)} → ${roleHistoryRoleLabel(row.newRole)}`;
  }

  if (row.eventType === "REMOVED") {
    return `${roleHistoryRoleLabel(row.priorRole)} removed`;
  }

  return roleHistoryRoleLabel(row.newRole);
}

export function roleHistoryEventDescription(
  row: UserRoleHistoryRow,
  platformViewer: boolean,
) {
  if (row.eventType === "BASELINE") {
    return "Role present when Role History tracking began.";
  }

  const verb =
    row.eventType === "ASSIGNED"
      ? "Assigned"
      : row.eventType === "CHANGED"
        ? "Changed"
        : "Removed";

  if (row.actorIsPlatform && !platformViewer) {
    return `${verb} by DM3Oi Platform`;
  }

  const actor =
    row.actorDisplayName ||
    row.actorEmail ||
    (row.actorIsPlatform ? "DM3Oi Platform" : "System");

  return `${verb} by ${actor}`;
}
