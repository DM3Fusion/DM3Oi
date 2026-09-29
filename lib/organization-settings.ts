import type { Database } from "../types/database.generated.ts";
import {
  isValidTimeZone,
  resolveUsZipTimeZone,
} from "./organization-timezone.ts";

type Priority = Database["public"]["Enums"]["priority_level"];
type SettingsInsert = Database["public"]["Tables"]["organization_settings"]["Insert"];

const priorities: readonly Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export type OrganizationDefaultsInput = {
  businessPostalCode: unknown;
  timezoneMode: unknown;
  timezone: unknown;
  defaultPriority: unknown;
};

export type CustomerPortalSettingsInput = {
  portalEnabled: unknown;
  portalSubmissionEnabled: unknown;
  portalShowPriority: unknown;
  portalOnboardingMode: unknown;
  secureDocumentSystemUrl?: unknown;
  documentSubmissionInstructions?: unknown;
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const booleanField = (value: unknown): boolean | null => {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
};

export function buildOrganizationDefaultsWrite(
  input: OrganizationDefaultsInput,
  organizationId: string,
  updatedBy: string,
): ParseResult<{
  organization: { business_postal_code: string | null };
  settings: Pick<
    SettingsInsert,
    | "organization_id"
    | "default_priority"
    | "timezone"
    | "timezone_source"
    | "timezone_resolved_from_postal_code"
    | "updated_by"
  >;
}> {
  const postalCode = text(input.businessPostalCode);
  const timezoneMode = text(input.timezoneMode);
  const timezoneOverride = text(input.timezone);
  const defaultPriority = text(input.defaultPriority) as Priority;

  if (timezoneMode !== "ZIP" && timezoneMode !== "MANUAL") {
    return { ok: false, error: "Select a valid time zone mode." };
  }
  if (!priorities.includes(defaultPriority)) {
    return { ok: false, error: "Select a valid default priority." };
  }
  if (timezoneMode === "MANUAL" && !isValidTimeZone(timezoneOverride)) {
    return { ok: false, error: "Enter a valid time zone override." };
  }

  const resolvedTimezone = resolveUsZipTimeZone(postalCode);
  const timezone =
    timezoneMode === "MANUAL"
      ? timezoneOverride
      : resolvedTimezone ?? "UTC";

  return {
    ok: true,
    value: {
      organization: {
        business_postal_code: postalCode || null,
      },
      settings: {
        organization_id: organizationId,
        default_priority: defaultPriority,
        timezone,
        timezone_source:
          timezoneMode === "MANUAL"
            ? "MANUAL"
            : resolvedTimezone
              ? "ZIP"
              : "DEFAULT",
        timezone_resolved_from_postal_code: resolvedTimezone,
        updated_by: updatedBy,
      },
    },
  };
}

export function buildCustomerPortalSettingsWrite(
  input: CustomerPortalSettingsInput,
  organizationId: string,
  updatedBy: string,
): ParseResult<
  Pick<
    SettingsInsert,
    | "organization_id"
    | "portal_enabled"
    | "portal_onboarding_mode"
    | "portal_submission_enabled"
    | "portal_show_priority"
    | "secure_document_system_url"
    | "document_submission_instructions"
    | "updated_by"
  >
> {
  const portalEnabled = booleanField(input.portalEnabled);
  const portalSubmissionEnabled = booleanField(
    input.portalSubmissionEnabled,
  );
  const portalShowPriority = booleanField(input.portalShowPriority);
  const portalOnboardingMode = text(input.portalOnboardingMode);
  const secureDocumentSystemUrl = text(input.secureDocumentSystemUrl);
  const documentSubmissionInstructions = text(
    input.documentSubmissionInstructions,
  );

  if (
    portalEnabled === null ||
    portalSubmissionEnabled === null ||
    portalShowPriority === null ||
    !["MANUAL_ONLY", "PROMPT_DURING_CASE_INTAKE"].includes(
      portalOnboardingMode,
    )
  ) {
    return { ok: false, error: "Select valid Customer Portal settings." };
  }

  if (secureDocumentSystemUrl.length > 2048) {
    return {
      ok: false,
      error: "Secure Document System URL is too long.",
    };
  }

  if (secureDocumentSystemUrl) {
    try {
      const parsedUrl = new URL(secureDocumentSystemUrl);
      if (parsedUrl.protocol !== "https:") {
        return {
          ok: false,
          error: "Secure Document System URL must use HTTPS.",
        };
      }
    } catch {
      return {
        ok: false,
        error: "Enter a valid Secure Document System URL.",
      };
    }
  }

  if (documentSubmissionInstructions.length > 4000) {
    return {
      ok: false,
      error: "Document Submission Instructions are too long.",
    };
  }

  if (
    Boolean(secureDocumentSystemUrl) !==
    Boolean(documentSubmissionInstructions)
  ) {
    return {
      ok: false,
      error:
        "Configure both the Secure Document System URL and Document Submission Instructions, or leave both blank.",
    };
  }

  return {
    ok: true,
    value: {
      organization_id: organizationId,
      portal_enabled: portalEnabled,
      portal_onboarding_mode: portalOnboardingMode,
      portal_submission_enabled: portalSubmissionEnabled,
      portal_show_priority: portalShowPriority,
      secure_document_system_url: secureDocumentSystemUrl || null,
      document_submission_instructions:
        documentSubmissionInstructions || null,
      updated_by: updatedBy,
    },
  };
}
