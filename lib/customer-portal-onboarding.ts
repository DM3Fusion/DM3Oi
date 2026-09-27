export const portalOnboardingModes = [
  "MANUAL_ONLY",
  "PROMPT_DURING_CASE_INTAKE",
] as const;

export type PortalOnboardingMode = (typeof portalOnboardingModes)[number];

export type CustomerPortalOnboardingState =
  | "ACTIVE"
  | "INVITATION_SENT"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE";

export type GuidedIntakePortalResolution = {
  resolution: "UNRESOLVED" | "INVITATION_SENT" | "ACTIVE" | "NOT_REQUIRED";
  customerId?: string;
  recipientEmail?: string;
  invitationId?: string;
};

export type CustomerPortalOnboardingStatus = {
  state: CustomerPortalOnboardingState;
  customerId: string;
  recipientEmail: string | null;
  invitationId: string | null;
  lastSentAt: string | null;
  sendCount: number;
  reason: string | null;
};

export const unresolvedPortalOnboarding = (): GuidedIntakePortalResolution => ({
  resolution: "UNRESOLVED",
});

export function parsePortalOnboardingMode(
  value: unknown,
): PortalOnboardingMode {
  return value === "PROMPT_DURING_CASE_INTAKE"
    ? value
    : "MANUAL_ONLY";
}

export function parseGuidedIntakePortalResolution(
  value: unknown,
): GuidedIntakePortalResolution {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return unresolvedPortalOnboarding();
  const candidate = value as Record<string, unknown>;
  const resolution = candidate.resolution;
  if (
    resolution !== "UNRESOLVED" &&
    resolution !== "INVITATION_SENT" &&
    resolution !== "ACTIVE" &&
    resolution !== "NOT_REQUIRED"
  )
    return unresolvedPortalOnboarding();
  return {
    resolution,
    customerId:
      typeof candidate.customerId === "string" ? candidate.customerId : undefined,
    recipientEmail:
      typeof candidate.recipientEmail === "string"
        ? candidate.recipientEmail
        : undefined,
    invitationId:
      typeof candidate.invitationId === "string"
        ? candidate.invitationId
        : undefined,
  };
}

export function portalOnboardingResolvedForIntake(
  mode: PortalOnboardingMode,
  customerId: string,
  authoritative: CustomerPortalOnboardingStatus | null,
  resolution: GuidedIntakePortalResolution,
): boolean {
  if (mode === "MANUAL_ONLY") return true;
  if (!authoritative || authoritative.customerId !== customerId) return false;
  if (authoritative.state === "ACTIVE") return true;
  if (resolution.customerId !== customerId) return false;
  if (resolution.resolution === "NOT_REQUIRED") return true;
  return (
    resolution.resolution === "INVITATION_SENT" &&
    authoritative.state === "INVITATION_SENT" &&
    Boolean(authoritative.invitationId) &&
    resolution.invitationId === authoritative.invitationId &&
    resolution.recipientEmail?.toLowerCase() ===
      authoritative.recipientEmail?.toLowerCase()
  );
}
