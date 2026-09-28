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
      className="panel settings-mobile-subnavigation"
      aria-label="Settings sections"
    >
      <div className="settings-mobile-subnavigation-parent">
        <ApplicationIcon name="settings" />
        <span>Settings</span>
      </div>
      <div className="settings-mobile-subnavigation-list">
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
