"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type MobileNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  unreadCount?: number;
};

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === href : pathname.startsWith(href);

export function MobileBottomNavigation({ items }: { items: readonly MobileNavigationItem[] }) {
  const pathname = usePathname();

  if (!items.length) return null;

  return (
    <nav className="mobile-bottom-navigation" aria-label="Primary mobile navigation">
      {items.map(({ href, label, icon: Icon, unreadCount = 0 }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} aria-label={unreadCount > 0 ? `${label}, ${unreadCount} unread communications` : label}>
            <span className="mobile-navigation-icon">
              <Icon aria-hidden />
              {unreadCount > 0 ? <span className="mobile-navigation-badge" aria-hidden>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
