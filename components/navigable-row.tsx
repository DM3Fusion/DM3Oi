"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  isRowNavigationKey,
  ROW_INTERACTIVE_SELECTOR,
} from "@/lib/navigation/row-navigation";

function originatedFromInteractiveControl(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(ROW_INTERACTIVE_SELECTOR))
  );
}

export function NavigableRow({
  href,
  label,
  children,
  className,
}: {
  href: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const navigate = () => router.push(href);
  const onClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (!originatedFromInteractiveControl(event.target)) navigate();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (originatedFromInteractiveControl(event.target)) return;
    if (isRowNavigationKey(event.key)) {
      event.preventDefault();
      navigate();
    }
  };
  return (
    <tr
      className={["navigable-row", className].filter(Boolean).join(" ")}
      tabIndex={0}
      aria-label={label}
      onClickCapture={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </tr>
  );
}
