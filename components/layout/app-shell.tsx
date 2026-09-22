"use client";
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
  mobilePrimaryDestinations,
  platformNavigation,
} from "@/lib/application-navigation";

const phoneMediaQuery = "(max-width: 600px)";
const getPhoneSnapshot = () => window.matchMedia(phoneMediaQuery).matches;
const getServerPhoneSnapshot = () => false;

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
const isPublic = (path: string) =>
  path === "/login" ||
  path === "/portal" || path.startsWith("/portal/") ||
  path.startsWith("/auth/");
export function AppShell({
  children,
  access,
  applicationVersion,
  unreadNotificationCount,
}: {
  children: React.ReactNode;
  access: AccessContext | null;
  applicationVersion: string;
  unreadNotificationCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const phoneLayout = usePhoneLayout(closeDrawer);
  if (isPublic(pathname))
    return <main className="public-main">{children}</main>;
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
  const mobileNavigation = [
    ...nav
      .filter((item) => mobilePrimaryDestinations.has(item.href))
      .map((item) => ({
        href: item.href,
        label: item.href === "/" ? "Home" : item.label,
        icon: item.icon,
        unreadCount: item.href === "/communications" ? unreadNotificationCount : undefined,
      })),
    ...(access ? [{ href: "/account/profile", label: "Account", icon: "account" as const }] : []),
  ];
  return (
    <div className="app-frame">
      {!phoneLayout && open && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      {!phoneLayout ? <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand-row">
          <Link href="/" className="brand">
            <strong className="dm3oi-wordmark">
              <span className="dm3oi-wordmark-main">
                <span className="brand-dm3">DM3</span>
                <span className="brand-oi">Oi</span>
              </span>
              <span className="dm3oi-wordmark-tm">™</span>
            </strong>
            <span className="brand-descriptor">OPERATIONAL<br/>INTELLIGENCE</span>
          </Link>
          <button
            className="close-menu"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <ApplicationIcon name="close" />
          </button>
        </div>
        {access?.isSuperAdmin && org && !platformContext ? (
          <form action={returnToBackOfficeAction} className="back-office-link">
            <button><ApplicationIcon name="back" />Back Office</button>
          </form>
        ) : null}
        <nav aria-label="Primary navigation">
          {nav.map(({ href, label, icon }) => {
            const active =
              href === "/" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`${active ? "active " : ""}${mobilePrimaryDestinations.has(href) ? "mobile-primary-nav-item" : ""}`.trim()}
              >
                <ApplicationIcon name={icon} />
                <span>{label}</span>
                {href === "/communications" && unreadNotificationCount > 0 ? (
                  <span className="nav-unread-count" aria-label={`${unreadNotificationCount} unread notifications`}>
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        {!platformContext && administrationNav.length ? (
          <nav className="administration-nav" aria-label="Administration navigation">
            <span className="sidebar-section-label">Administration</span>
            {administrationNav.map(({ href, label, icon }) => {
              const active = pathname.startsWith(href);
              return <Link key={href} href={href} onClick={() => setOpen(false)} className={active ? "active" : ""}><ApplicationIcon name={icon} /><span>{label}</span></Link>;
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
        <footer className="sidebar-product-footer"><span>DM3Oi™ | Operational Intelligence</span><small>Ver. {applicationVersion}</small></footer>
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
            <small>{platformContext ? "Platform Administration" : <span className="organization-context"><span className="organization-context-prefix">for</span><b className="organization-context-name">{org?.name ?? "No active organization"}</b></span>}</small>
          </div>
          {access ? <AccountMenu displayName={access.displayName} email={access.user.email} avatarUrl={access.avatarUrl} /> : null}
        </header>
        {!platformContext && access?.license && (access.license.status === "EXPIRING" || access.license.isInGrace) ? (
          <div className="license-warning" role="status">
            {access.license.isInGrace
              ? `Your DM3Oi license expired${access.license.expiresAt ? ` on ${new Date(access.license.expiresAt).toLocaleDateString()}` : ""}. Access remains available during the grace period.`
              : `Your DM3Oi license expires in ${access.license.daysRemaining ?? 0} days.`}
          </div>
        ) : null}
        <main>{children}</main>
        <MobileBottomNavigation items={mobileNavigation} />
      </div>
    </div>
  );
}
