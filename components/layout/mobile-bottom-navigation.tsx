"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApplicationIcon } from "@/components/application-icon";
import type { ApplicationIconName } from "@/lib/application-icons";

export type MobileNavigationItem = {
  href: string;
  label: string;
  icon: ApplicationIconName;
  unreadCount?: number;
  activePrefixes?: readonly string[];
};

const matchesPath = (pathname: string, href: string) =>
  href === "/" ? pathname === href : pathname.startsWith(href);

const isActive = (
  pathname: string,
  href: string,
  activePrefixes: readonly string[] = [],
) =>
  matchesPath(pathname, href) ||
  activePrefixes.some((prefix) => matchesPath(pathname, prefix));

export function MobileBottomNavigation({ items }: { items: readonly MobileNavigationItem[] }) {
  const pathname = usePathname();

  if (!items.length) return null;

  return (
    <nav className="mobile-bottom-navigation" aria-label="Primary mobile navigation">
      {items.map(({ href, label, icon, unreadCount = 0, activePrefixes = [] }) => {
        const active = isActive(pathname, href, activePrefixes);
        return (
          <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} aria-label={unreadCount > 0 ? `${label}, ${unreadCount} unread communications` : label}>
            <span className="mobile-navigation-icon">
              <ApplicationIcon name={icon} />
              {unreadCount > 0 ? <span className="mobile-navigation-badge" aria-hidden>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
