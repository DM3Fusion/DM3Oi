import type { LucideProps } from "lucide-react";
import {
  applicationIcons,
  type ApplicationIconName,
} from "@/lib/application-icons";

type ApplicationIconProps = Omit<LucideProps, "name"> & {
  name: ApplicationIconName;
  label?: string;
};

export function ApplicationIcon({
  name,
  label,
  className,
  strokeWidth = 1.9,
  ...props
}: ApplicationIconProps) {
  const Icon = applicationIcons[name];
  return (
    <Icon
      {...props}
      className={["application-icon", className].filter(Boolean).join(" ")}
      color="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
