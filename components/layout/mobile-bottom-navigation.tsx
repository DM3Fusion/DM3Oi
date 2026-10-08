"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { signOutAction } from "@/lib/auth/actions";
import {
  platformTemplatesNavigation,
  type ApplicationNavigationItem,
} from "@/lib/application-navigation";
import type { ApplicationIconName } from "@/lib/application-icons";

export type MobileNavigationItem = {
  href: string;
  label: string;
  icon: ApplicationIconName;
  badge?: React.ReactNode;
  activePrefixes?: readonly string[];
  opensPanel?: boolean;
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

export function MobileBottomNavigation({
  items,
  moreItems,
  settingsItems,
  applicationVersionLabel,
}: {
  items: readonly MobileNavigationItem[];
  moreItems: readonly ApplicationNavigationItem[];
  settingsItems: readonly ApplicationNavigationItem[];
  applicationVersionLabel: string;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);

  if (!items.length) return null;

  return (
    <>
      {moreOpen ? (
        <>
          <button
            type="button"
            className="mobile-navigation-scrim"
            aria-label="Close More navigation"
            onClick={() => setMoreOpen(false)}
          />
          <aside
            id={panelId}
            className="mobile-more-panel"
            aria-label="More navigation"
          >
            <div className="mobile-more-panel-header">
              <strong>More</strong>
              <button
                type="button"
                aria-label="Close More navigation"
                onClick={() => setMoreOpen(false)}
              >
                <ApplicationIcon name="close" />
              </button>
            </div>
            <nav aria-label="Secondary mobile navigation">
              {moreItems.map((item) => {
                const settingsParent =
                  item.href === "/settings/case-configuration";
                const templatesParent =
                  item.href === "/admin/email-templates";
                const active = settingsParent
                  ? pathname.startsWith("/settings") ||
                    settingsItems.some((child) => matchesPath(pathname, child.href))
                  : templatesParent
                    ? platformTemplatesNavigation.some(
                        (child) =>
                          pathname === child.href ||
                          pathname.startsWith(`${child.href}/`),
                      )
                    : matchesPath(pathname, item.href);

                if (templatesParent) {
                  return (
                    <div className="mobile-settings-nav-group" key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={true}
                        className={`mobile-settings-nav-parent${active ? " active" : ""}`}
                        onClick={() => setMoreOpen(false)}
                      >
                        <ApplicationIcon name={item.icon} />
                        <span>{item.label}</span>
                      </Link>

                      <div className="mobile-settings-subnav">
                        {platformTemplatesNavigation.map((child) => {
                          const childActive =
                            pathname === child.href ||
                            pathname.startsWith(`${child.href}/`);

                          return (
                            <Link
                              href={child.href}
                              prefetch={true}
                              className={childActive ? "active" : ""}
                              aria-current={childActive ? "page" : undefined}
                              onClick={() => setMoreOpen(false)}
                              key={child.href}
                            >
                              <ApplicationIcon name={child.icon} />
                              <span>{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (settingsParent) {
                  return (
                    <div className="mobile-settings-nav-group" key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={true}
                        className={`mobile-settings-nav-parent${active ? " active" : ""}`}
                        onClick={() => setMoreOpen(false)}
                      >
                        <ApplicationIcon name={item.icon} />
                        <span>{item.label}</span>
                      </Link>
                      {settingsItems.length ? (
                        <div className="mobile-settings-subnav">
                          {settingsItems.map((settingsItem) => {
                            const childActive =
                              pathname === settingsItem.href ||
                              pathname.startsWith(`${settingsItem.href}/`);
                            return (
                              <Link
                                href={settingsItem.href}
                                prefetch={true}
                                className={childActive ? "active" : ""}
                                aria-current={childActive ? "page" : undefined}
                                onClick={() => setMoreOpen(false)}
                                key={settingsItem.href}
                              >
                                <ApplicationIcon name={settingsItem.icon} />
                                <span>{settingsItem.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <Link
                    href={item.href}
                    prefetch={true}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    key={item.href}
                  >
                    <ApplicationIcon name={item.icon} />
                    <span>{item.label}</span>
                    <ApplicationIcon name="forward" />
                  </Link>
                );
              })}
            </nav>
            <div className="mobile-more-panel-actions">
              <form action={signOutAction}>
                <PendingSubmitButton pendingLabel="Signing out…">
                  <ApplicationIcon name="sign-out" />
                  Sign Out
                </PendingSubmitButton>
              </form>
              <small>{applicationVersionLabel}</small>
            </div>
          </aside>
        </>
      ) : null}
      <nav className="mobile-bottom-navigation" aria-label="Primary mobile navigation">
      {items.map(({ href, label, icon, badge, activePrefixes = [], opensPanel = false }) => {
        const active = isActive(pathname, href, activePrefixes);
        const content = (
          <>
            <span className="mobile-navigation-icon">
              <ApplicationIcon name={icon} />
              {badge}
            </span>
            <span>{label}</span>
          </>
        );

        if (opensPanel) {
          return (
            <button
              key={href}
              type="button"
              className={active || moreOpen ? "active" : undefined}
              aria-expanded={moreOpen}
              aria-controls={panelId}
              onClick={() => setMoreOpen((value) => !value)}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            prefetch={true}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
      </nav>
    </>
  );
}
