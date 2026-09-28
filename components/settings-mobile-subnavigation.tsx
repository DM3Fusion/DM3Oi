"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApplicationIcon } from "@/components/application-icon";
import type { ApplicationNavigationItem } from "@/lib/application-navigation";

export function SettingsMobileSubnavigation({
  items,
}: {
  items: readonly ApplicationNavigationItem[];
}) {
  const pathname = usePathname();

  if (!items.length) return null;

  return (
    <nav
      className="settings-mobile-subnavigation"
      aria-label="Settings sections"
    >
      <Link
        href="/settings/case-configuration"
        className="settings-mobile-subnavigation-parent active"
      >
        <ApplicationIcon name="settings" />
        <span>Settings</span>
      </Link>
      <div className="settings-mobile-subnav">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              href={item.href}
              className={`settings-mobile-subnavigation-link${
                active ? " active" : ""
              }`}
              aria-current={active ? "page" : undefined}
              key={item.href}
            >
              <ApplicationIcon name={item.icon} />
              <span>{item.label}</span>
              <ApplicationIcon name="forward" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
