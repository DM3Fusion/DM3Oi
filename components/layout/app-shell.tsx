"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  Bell,
  FileQuestion,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { selectActiveOrganizationAction } from "@/lib/auth/organization-actions";
import { returnToBackOfficeAction } from "@/lib/data/platform-actions";
import type { AccessContext } from "@/lib/auth/context";
import { AccountMenu } from "@/components/account-menu";
import { UserAvatar } from "@/components/user-avatar";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { PendingSubmitButton } from "@/components/pending-submit-button";
const organizationNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cases", label: "Cases", icon: BriefcaseBusiness },
  { href: "/service-desk", label: "Service Desk", icon: Headphones },
  { href: "/communications", label: "Communications", icon: Bell },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/tasks", label: "Tasks", icon: ClipboardCheck },
  { href: "/questions", label: "Questions & Rules", icon: FileQuestion },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];
const administrationNav = [
  { href: "/users", label: "Users", icon: Users },
  { href: "/administration", label: "Administration", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];
const platformNav = [
  { href: "/", label: "Back Office", icon: ShieldCheck },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/users", label: "Users / Access", icon: Users },
];
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
  if (isPublic(pathname))
    return <main className="public-main">{children}</main>;
  const org = access?.activeOrganization;
  const platformContext = Boolean(
    access?.isSuperAdmin && (!org || pathname.startsWith("/admin")),
  );
  const nav = platformContext
    ? platformNav
    : access?.internalAccess
      ? organizationNav
      : [];
  return (
    <div className="app-frame">
      {open && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand-row">
          <Link href="/" className="brand">
            <strong><span className="brand-dm3">DM3</span><span className="brand-oi">Oi</span><sup>™</sup></strong>
            <span className="brand-descriptor">OPERATIONAL<br/>INTELLIGENCE</span>
          </Link>
          <button
            className="close-menu"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        {access?.isSuperAdmin && org && !platformContext ? (
          <form action={returnToBackOfficeAction} className="back-office-link">
            <button>← Back Office</button>
          </form>
        ) : null}
        <nav aria-label="Primary navigation">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={active ? "active" : ""}
              >
                <Icon aria-hidden />
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
        {!platformContext && access?.internalAccess ? (
          <nav className="administration-nav" aria-label="Administration navigation">
            <span className="sidebar-section-label">Administration</span>
            {administrationNav.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return <Link key={href} href={href} onClick={() => setOpen(false)} className={active ? "active" : ""}><Icon aria-hidden /><span>{label}</span></Link>;
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
        <form action={signOutAction} className="signout"><PendingSubmitButton pendingLabel="Signing out…"><LogOut aria-hidden />Sign Out</PendingSubmitButton></form>
        <footer className="sidebar-product-footer"><span>DM3Oi™ | Operational Intelligence</span><small>Ver. {applicationVersion}</small></footer>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="workspace product-tagline" aria-label="People. Work. Progress. Intelligence.">
            <strong><span>People.</span> Work. Progress. Intelligence.</strong>
            <small>{platformContext ? "Platform Administration" : <>for <b>{org?.name ?? "No active organization"}</b></>}</small>
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
      </div>
    </div>
  );
}
