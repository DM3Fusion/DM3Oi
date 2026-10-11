import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20261011120000_dm3oi_platform_support_inbox.sql",
  "utf8",
);

const repository = fs.readFileSync(
  "lib/data/platform-support-repository.ts",
  "utf8",
);

const submitterTrackingMigration = fs.readFileSync(
  "supabase/migrations/20261011130000_dm3oi_support_submitter_tracking.sql",
  "utf8",
);

const emailService = fs.readFileSync(
  "lib/data/platform-support-email-service.ts",
  "utf8",
);

test(
  "Platform support is authenticated organization-user only",
  () => {
    assert.match(
      migration,
      /auth\.uid\(\)/,
    );

    assert.match(
      migration,
      /organization_members/,
    );

    assert.match(
      migration,
      /BUSINESS_OWNER/,
    );

    assert.doesNotMatch(
      migration,
      /CUSTOMER_PORTAL/,
    );
  },
);

test(
  "Platform support records are isolated from organization Communications",
  () => {
    assert.match(
      migration,
      /create table public\.platform_support_requests/,
    );

    assert.match(
      migration,
      /create table public\.platform_support_messages/,
    );

    assert.doesNotMatch(
      migration,
      /insert into public\.notifications/,
    );
  },
);

test(
  "Platform Inbox is SUPER_ADMIN-only with per-admin unread state",
  () => {
    assert.match(
      migration,
      /is_super_admin/,
    );

    assert.match(
      migration,
      /platform_support_request_reads/,
    );

    assert.match(
      migration,
      /get_platform_support_unread_count/,
    );

    assert.match(
      repository,
      /requireSuperAdmin/,
    );
  },
);

test(
  "Support request is durable before platform notification email",
  () => {
    assert.match(
      migration,
      /insert into public\.platform_support_requests/,
    );

    assert.match(
      emailService,
      /dm3@pobox\.com/,
    );

    assert.match(
      emailService,
      /finalize_platform_support_notification_server/,
    );
  },
);

test(
  "Platform response workflow records transport status",
  () => {
    assert.match(
      migration,
      /create_platform_support_response/,
    );

    assert.match(
      migration,
      /finalize_platform_support_response/,
    );

    assert.match(
      migration,
      /RESPONDED/,
    );

    assert.match(
      migration,
      /CLOSED/,
    );
  },
);

test(
  "Contact DM3Oi route is authenticated internal support",
  () => {
    const page = fs.readFileSync(
      "app/help/contact-dm3oi/page.tsx",
      "utf8",
    );

    const actions = fs.readFileSync(
      "lib/data/platform-support-actions.ts",
      "utf8",
    );

    assert.match(page, /requireInternalContext/);
    assert.match(actions, /requireInternalContext/);
    assert.match(actions, /submit_platform_support_request/);
    assert.match(actions, /notifyPlatformOwnerOfSupportRequest/);
  },
);

test(
  "Help navigation exposes How to Guide, Contact DM3Oi, and request tracking",
  () => {
    const navigation = fs.readFileSync(
      "lib/application-navigation.ts",
      "utf8",
    );

    assert.match(navigation, /label: "Help"/);
    assert.match(navigation, /label: "How to Guide"/);
    assert.match(navigation, /label: "Contact DM3Oi"/);
    assert.match(navigation, /\/help\/contact-dm3oi/);
    assert.match(navigation, /label: "My DM3Oi Requests"/);
    assert.match(navigation, /\/help\/my-requests/);
  },
);

test(
  "Platform navigation exposes a dedicated Platform Inbox",
  () => {
    const navigation = fs.readFileSync(
      "lib/application-navigation.ts",
      "utf8",
    );

    const page = fs.readFileSync(
      "app/admin/inbox/page.tsx",
      "utf8",
    );

    assert.match(navigation, /\/admin\/inbox/);
    assert.match(navigation, /label: "Inbox"/);
    assert.match(page, /getPlatformSupportInbox/);
    assert.match(page, /getPlatformSupportUnreadCount/);
  },
);

test(
  "Platform response is recorded before email transport",
  () => {
    const actions = fs.readFileSync(
      "lib/data/platform-support-actions.ts",
      "utf8",
    );

    const createIndex = actions.indexOf(
      "create_platform_support_response",
    );
    const emailIndex = actions.indexOf(
      "sendApplicationEmail",
      createIndex,
    );

    assert.ok(createIndex >= 0);
    assert.ok(emailIndex > createIndex);
    assert.match(
      actions,
      /finalize_platform_support_response/,
    );
  },
);

test(
  "desktop organization sidebar renders Help as expandable submenu",
  () => {
    const shell = fs.readFileSync(
      "components/layout/app-shell.tsx",
      "utf8",
    );

    assert.match(shell, /authorizedOrganizationHelpNavigation/);
    assert.match(shell, /helpOpen/);
    assert.match(shell, /Expand Help/);
    assert.match(shell, /Collapse Help/);
    assert.match(shell, /helpNavigation\.map/);
  },
);

test(
  "Platform Inbox unread attention is wired into desktop and mobile navigation",
  () => {
    const badges = fs.readFileSync(
      "components/layout/navigation-attention-badges.tsx",
      "utf8",
    );
    const layout = fs.readFileSync(
      "app/layout.tsx",
      "utf8",
    );
    const shell = fs.readFileSync(
      "components/layout/app-shell.tsx",
      "utf8",
    );
    const mobile = fs.readFileSync(
      "components/layout/mobile-bottom-navigation.tsx",
      "utf8",
    );

    assert.match(badges, /getPlatformSupportUnreadCount/);
    assert.match(badges, /PlatformInboxNavigationBadge/);
    assert.match(layout, /platformInboxDesktopBadge/);
    assert.match(layout, /platformInboxMobileBadge/);
    assert.match(shell, /href === "\/admin\/inbox"/);
    assert.match(mobile, /item\.href === "\/admin\/inbox"/);
  },
);

test(
  "Contact DM3Oi remains authenticated but is available during organization legal lockout",
  () => {
    const proxy = fs.readFileSync("proxy.ts", "utf8");

    assert.match(
      proxy,
      /authenticatedSupport=pathname==="\/help\/contact-dm3oi"/,
    );

    assert.match(
      proxy,
      /!authenticatedSupport/,
    );

    assert.doesNotMatch(
      proxy,
      /publicRoutes=.*contact-dm3oi/,
    );
  },
);


test(
  "organization users can track only support requests they personally submitted",
  () => {
    assert.match(
      submitterTrackingMigration,
      /get_my_platform_support_requests/,
    );

    assert.match(
      submitterTrackingMigration,
      /get_my_platform_support_request/,
    );

    assert.match(
      submitterTrackingMigration,
      /submitted_by_user_id = actor_id/,
    );

    assert.match(
      submitterTrackingMigration,
      /organization_id = target_organization_id/,
    );

    assert.match(
      submitterTrackingMigration,
      /BUSINESS_OWNER/,
    );

    assert.match(
      submitterTrackingMigration,
      /STAFF_USER/,
    );

    assert.doesNotMatch(
      submitterTrackingMigration,
      /is_super_admin/,
    );
  },
);

test(
  "submitter support history is read-only and does not expose platform email transport metadata",
  () => {
    assert.doesNotMatch(
      submitterTrackingMigration,
      /email_status/,
    );

    assert.doesNotMatch(
      submitterTrackingMigration,
      /sender_email/,
    );

    assert.doesNotMatch(
      submitterTrackingMigration,
      /notification_email_status/,
    );

    assert.doesNotMatch(
      submitterTrackingMigration,
      /update public\.platform_support_requests/,
    );
  },
);

test(
  "My DM3Oi Requests pages use authenticated internal context and submitter RPCs",
  () => {
    const listPage = fs.readFileSync(
      "app/help/my-requests/page.tsx",
      "utf8",
    );

    const detailPage = fs.readFileSync(
      "app/help/my-requests/[requestId]/page.tsx",
      "utf8",
    );

    assert.match(listPage, /requireInternalContext/);
    assert.match(listPage, /getMyPlatformSupportRequests/);
    assert.match(detailPage, /requireInternalContext/);
    assert.match(detailPage, /getMyPlatformSupportRequest/);
    assert.match(repository, /get_my_platform_support_requests/);
    assert.match(repository, /get_my_platform_support_request/);
  },
);
