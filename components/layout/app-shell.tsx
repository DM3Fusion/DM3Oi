"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { selectActiveOrganizationAction } from "@/lib/auth/organization-actions";
import { returnToBackOfficeAction } from "@/lib/data/platform-actions";
import type { AccessContext } from "@/lib/auth/context";
import { AccountMenu } from "@/components/account-menu";
import { UserAvatar } from "@/components/user-avatar";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { MobileBottomNavigation } from "@/components/layout/mobile-bottom-navigation";
import { ApplicationIcon } from "@/components/application-icon";
import {
  authorizedOrganizationAdministrationNavigation,
  authorizedOrganizationNavigation,
  authorizedOrganizationSettingsNavigation,
  mobilePrimaryDestinations,
  mobileSecondaryNavigation,
  platformNavigation,
  platformTemplatesNavigation,
} from "@/lib/application-navigation";
import { hasPermission } from "@/lib/auth/permissions";
import {
  SESSION_ACTIVITY_MARKER_COOKIE,
  SESSION_ACTIVITY_MARKER_MAX_AGE_SECONDS,
} from "@/lib/auth/session-policy";

const phoneMediaQuery = "(max-width: 600px)";
const getPhoneSnapshot = () => window.matchMedia(phoneMediaQuery).matches;
const getServerPhoneSnapshot = () => false;

const SESSION_ACTIVITY_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let lastSessionActivityRefreshAt = 0;

function refreshAuthenticatedSessionActivity() {
  const now = Date.now();

  if (
    lastSessionActivityRefreshAt > 0 &&
    now - lastSessionActivityRefreshAt < SESSION_ACTIVITY_REFRESH_INTERVAL_MS
  ) {
    return;
  }

  lastSessionActivityRefreshAt = now;

  void fetch("/api/session/activity", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    // Proxy enforcement remains authoritative for session expiry.
  });
}

function markAuthenticatedActivity(event: React.SyntheticEvent) {
  if (!event.isTrusted) return;
  document.cookie = `${SESSION_ACTIVITY_MARKER_COOKIE}=1; Path=/; SameSite=Lax; Secure; Max-Age=${SESSION_ACTIVITY_MARKER_MAX_AGE_SECONDS}`;
  refreshAuthenticatedSessionActivity();
}

function usePhoneLayout(onPhoneLayout: () => void) {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(phoneMediaQuery);
    const update = () => {
      if (media.matches) onPhoneLayout();
      notify();
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [onPhoneLayout]);
  return useSyncExternalStore(subscribe, getPhoneSnapshot, getServerPhoneSnapshot);
}
const isPublic = (path: string, access: AccessContext | null) =>
  (path === "/" && !access) ||
  path === "/login" ||
  path === "/request-trial" ||
  path === "/portal" || path.startsWith("/portal/") ||
  path.startsWith("/auth/");
export function AppShell({
  children,
  access,
  applicationVersionLabel,
  communicationsDesktopBadge,
  communicationsMobileBadge,
  trialRequestsDesktopBadge,
  trialRequestsMobileBadge,
}: {
  children: React.ReactNode;
  access: AccessContext | null;
  applicationVersionLabel: string;
  communicationsDesktopBadge: React.ReactNode;
  communicationsMobileBadge: React.ReactNode;
  trialRequestsDesktopBadge: React.ReactNode;
  trialRequestsMobileBadge: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(
    pathname.startsWith("/settings") ||
      pathname.startsWith("/questions") ||
      pathname.startsWith("/administration"),
  );
  const [templatesOpen, setTemplatesOpen] = useState(
    platformTemplatesNavigation.some(
      (item) =>
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`),
    ),
  );
  const closeDrawer = useCallback(() => setOpen(false), []);
  const phoneLayout = usePhoneLayout(closeDrawer);
  if (isPublic(pathname, access))
    return (
      <main
        className="public-main"
        onPointerDownCapture={access ? markAuthenticatedActivity : undefined}
        onKeyDownCapture={access ? markAuthenticatedActivity : undefined}
      >
        {children}
      </main>
    );
  const org = access?.activeOrganization;
  const platformContext = Boolean(
    access?.isSuperAdmin && (!org || pathname.startsWith("/admin")),
  );
  const nav = platformContext
    ? platformNavigation
    : access?.internalAccess
      ? authorizedOrganizationNavigation(access)
      : [];
  const administrationNav = access?.internalAccess
    ? authorizedOrganizationAdministrationNavigation(access)
    : [];

  const settingsNavigation = access
    ? [
        ...(access.isSuperAdmin
          ? [
              {
                href: "/settings/general",
                label: "General",
                icon: "settings" as const,
              },
            ]
          : []),
        ...authorizedOrganizationSettingsNavigation(access),
      ]
    : [];

  const settingsRouteActive =
    pathname.startsWith("/settings") || pathname.startsWith("/questions");
  const secondaryNavigation = access
    ? mobileSecondaryNavigation(access, platformContext)
    : [];

  const mobileNavigation = [
    ...nav
      .filter((item) => mobilePrimaryDestinations.has(item.href))
      .map((item) => ({
        href: item.href,
        label: item.href === "/" ? "Home" : item.label,
        icon: item.icon,
        badge: item.href === "/communications" ? communicationsMobileBadge : undefined,
      })),
    ...(access
      ? [{
          href: "/account",
          label: "More",
          icon: "account" as const,
          opensPanel: true,
          badge: platformContext ? trialRequestsMobileBadge : undefined,
          activePrefixes: platformContext
            ? [
                "/account",
                ...secondaryNavigation.map((item) => item.href),
              ]
            : [
                "/account",
                ...secondaryNavigation.map((item) => item.href),
                ...(hasPermission(access, "VIEW_SETTINGS")
                  ? ["/settings", ...settingsNavigation.map((item) => item.href)]
                  : []),
              ],
        }]
      : []),
  ];
  return (
    <div
      className="app-frame"
      onPointerDownCapture={markAuthenticatedActivity}
      onKeyDownCapture={markAuthenticatedActivity}
    >
      {!phoneLayout && open && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      {!phoneLayout ? <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand-header">
          <div className="brand-row">
            <Link
              href="/"
              prefetch={true}
              className="brand brand-hero"
              aria-label="DM3Oi Operational Intelligence home"
            >
              <Image
                src="/images/dm3oi-operations-hero.jpg"
                alt=""
                width={600}
                height={349}
                priority
                sizes="240px"
                className="brand-hero-image"
              />
            </Link>
            <button
              className="close-menu"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <ApplicationIcon name="close" />
            </button>
          </div>
          <div className="sidebar-brand-version">{applicationVersionLabel}</div>
        </div>
        {access?.isSuperAdmin && org && !platformContext ? (
          <form action={returnToBackOfficeAction} className="back-office-link">
            <button><ApplicationIcon name="back" />Platform Console</button>
          </form>
        ) : null}
        <nav aria-label="Primary navigation">
          {nav.map(({ href, label, icon }) => {
            if (href === "/admin/email-templates") {
              const parentActive = platformTemplatesNavigation.some(
                (item) =>
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`),
              );

              return (
                <div className="settings-nav-group" key={href}>
                  <div
                    className={`settings-nav-parent ${parentActive ? "active" : ""}`.trim()}
                  >
                    <Link
                      href={href}
                      prefetch={true}
                      onClick={() => {
                        setOpen(false);
                        setTemplatesOpen(true);
                      }}
                      className="settings-nav-parent-link"
                    >
                      <ApplicationIcon name={icon} />
                      <span>{label}</span>
                    </Link>

                    <button
                      type="button"
                      className="settings-nav-toggle"
                      aria-label={
                        templatesOpen
                          ? "Collapse Templates"
                          : "Expand Templates"
                      }
                      aria-expanded={templatesOpen}
                      onClick={() =>
                        setTemplatesOpen((value) => !value)
                      }
                    >
                      <ApplicationIcon
                        name="forward"
                        className={`settings-nav-chevron ${templatesOpen ? "open" : ""}`.trim()}
                      />
                    </button>
                  </div>

                  {templatesOpen ? (
                    <div className="settings-subnav">
                      {platformTemplatesNavigation.map((item) => {
                        const childActive =
                          pathname === item.href ||
                          pathname.startsWith(`${item.href}/`);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            prefetch={true}
                            onClick={() => setOpen(false)}
                            className={childActive ? "active" : ""}
                            aria-current={childActive ? "page" : undefined}
                          >
                            <ApplicationIcon name={item.icon} />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            const active =
              href === "/" ? pathname === href : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                prefetch={true}
                onClick={() => setOpen(false)}
                className={`${active ? "active " : ""}${mobilePrimaryDestinations.has(href) ? "mobile-primary-nav-item" : ""}`.trim()}
              >
                <ApplicationIcon name={icon} />
                <span>{label}</span>
                {href === "/communications" ? communicationsDesktopBadge : null}
                {href === "/admin/trial-requests" ? trialRequestsDesktopBadge : null}
              </Link>
            );
          })}
        </nav>
        {!platformContext && administrationNav.length ? (
          <nav className="administration-nav" aria-label="Administration navigation">
            <span className="sidebar-section-label">Administration</span>
            {administrationNav.map(({ href, label, icon }) => {
              if (href === "/settings") {
                return (
                  <div className="settings-nav-group" key={href}>
                    <div
                      className={`settings-nav-parent ${settingsRouteActive ? "active" : ""}`.trim()}
                    >
                      <Link
                        href="/settings/case-configuration"
                        prefetch={true}
                        onClick={() => {
                          setOpen(false);
                          setSettingsOpen(true);
                        }}
                        className="settings-nav-parent-link"
                      >
                        <ApplicationIcon name={icon} />
                        <span>{label}</span>
                      </Link>
                      <button
                        type="button"
                        className="settings-nav-toggle"
                        aria-label={settingsOpen ? "Collapse Settings" : "Expand Settings"}
                        aria-expanded={settingsOpen}
                        onClick={() => setSettingsOpen((value) => !value)}
                      >
                        <ApplicationIcon
                          name="forward"
                          className={`settings-nav-chevron ${settingsOpen ? "open" : ""}`.trim()}
                        />
                      </button>
                    </div>

                    {settingsOpen && settingsNavigation.length ? (
                      <div className="settings-subnav">
                        {settingsNavigation.map((item) => {
                          const childActive =
                            item.href === "/settings/case-configuration"
                              ? pathname.startsWith("/settings/case-configuration")
                              : pathname === item.href ||
                                pathname.startsWith(`${item.href}/`);

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              prefetch={true}
                              onClick={() => setOpen(false)}
                              className={childActive ? "active" : ""}
                            >
                              <ApplicationIcon name={item.icon} />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              }

              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={true}
                  onClick={() => setOpen(false)}
                  className={active ? "active" : ""}
                >
                  <ApplicationIcon name={icon} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
        <div
          className={`organization-card ${platformContext ? "platform-context" : ""}`}
        >
          <div className="shell-context-label"><span>{platformContext ? "Platform" : "Organization"}</span></div>
          {!platformContext && org ? (
            <div>
              <OrganizationAvatar name={org.name} src={org.avatarUrl} size="sm" />
              <div className="organization-details">
                {access && access.organizations.length > 1 ? (
                  <form action={selectActiveOrganizationAction}>
                    <input type="hidden" name="next" value={pathname} />
                    <select
                      aria-label="Active organization"
                      name="organizationId"
                      defaultValue={org.id}
                      onChange={(event) =>
                        event.currentTarget.form?.requestSubmit()
                      }
                    >
                      {access.organizations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </form>
                ) : (
                  <strong>{org.name}</strong>
                )}
                <small className="sidebar-user-name">{access.displayName}</small>
              </div>
            </div>
          ) : platformContext ? (
            <div>
              <Link
                href="/account/profile"
                prefetch={true}
                aria-label="Open My Profile"
                className="avatar-profile-link"
              >
                <UserAvatar
                  displayName={access?.displayName}
                  email={access?.user.email}
                  src={access?.avatarUrl}
                />
              </Link>
              <div className="organization-details">
                <strong>DM3Oi Administration</strong>
                <small>SUPER ADMIN</small>
              </div>
            </div>
          ) : (
            <p>No active organization</p>
          )}
        </div>
        <form action={signOutAction} className="signout"><PendingSubmitButton pendingLabel="Signing out…"><ApplicationIcon name="sign-out" />Sign Out</PendingSubmitButton></form>
        <footer className="sidebar-product-footer"><span>DM3Oi™ | Operational Intelligence</span></footer>
      </aside> : null}
      <div className="main-column">
        <header className="topbar">
          {!phoneLayout ? <button
            className="menu-button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <ApplicationIcon name="menu" />
          </button> : null}
          <div className="workspace product-tagline" aria-label="People. Work. Progress. Intelligence.">
            <strong><span>People.</span> Work. Progress. Intelligence.</strong>
            <small>{platformContext ? "Platform Operations" : <span className="organization-context"><span className="organization-context-prefix">for</span><b className="organization-context-name">{org?.name ?? "No active organization"}</b></span>}</small>
          </div>
          {access ? <AccountMenu displayName={access.displayName} title={access.title} email={access.user.email} avatarUrl={access.avatarUrl} /> : null}
        </header>
        {!platformContext && access?.license && (access.license.status === "EXPIRING" || access.license.isInGrace) ? (
          <div className="license-warning" role="status">
            {access.license.isInGrace
              ? `Your DM3Oi license expired${access.license.expiresAt ? ` on ${new Date(access.license.expiresAt).toLocaleDateString()}` : ""}. Access remains available during the grace period.`
              : `Your DM3Oi license expires in ${access.license.daysRemaining ?? 0} days.`}
          </div>
        ) : null}
        <main>{children}</main>
        <MobileBottomNavigation
          items={mobileNavigation}
          moreItems={secondaryNavigation}
          settingsItems={platformContext ? [] : settingsNavigation}
          applicationVersionLabel={applicationVersionLabel}
        />
      </div>
    </div>
  );
}
