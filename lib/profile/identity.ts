export const MAX_DISPLAY_NAME_LENGTH = 160;

export function validateDisplayName(value: unknown) {
  const submitted = String(value ?? "");
  const displayName = submitted.trim();
  return displayName && displayName.length <= MAX_DISPLAY_NAME_LENGTH
    ? { ok: true as const, displayName }
    : {
        ok: false as const,
        displayName: submitted,
        error: `Enter a display name of ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
      };
}
