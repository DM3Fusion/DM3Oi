import "server-only";

import { getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { getNewTrialRequestCount } from "@/lib/data/trial-request-repository";
import { getPlatformSupportUnreadCount } from "@/lib/data/platform-support-repository";

type NavigationAttentionBadgeProps = {
  mobile?: boolean;
  accessibleLabel: string;
  count: number;
};

function NavigationAttentionBadge({
  mobile = false,
  accessibleLabel,
  count,
}: NavigationAttentionBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={mobile ? "mobile-navigation-badge" : "nav-unread-count"}
      aria-label={`${count} ${accessibleLabel}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export async function UnreadCommunicationsNavigationBadge({
  organizationId,
  userId,
  mobile = false,
}: {
  organizationId: string;
  userId: string;
  mobile?: boolean;
}) {
  const count = await getUnreadNotificationCount({ organizationId, userId });

  return (
    <NavigationAttentionBadge
      mobile={mobile}
      accessibleLabel="unread notifications"
      count={count}
    />
  );
}

export async function NewTrialRequestsNavigationBadge({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const count = await getNewTrialRequestCount();

  return (
    <NavigationAttentionBadge
      mobile={mobile}
      accessibleLabel="new Trial Requests"
      count={count}
    />
  );
}


export async function PlatformInboxNavigationBadge({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const count = await getPlatformSupportUnreadCount();

  return (
    <NavigationAttentionBadge
      mobile={mobile}
      accessibleLabel="unread Platform Inbox messages"
      count={count}
    />
  );
}
