import "server-only";

export function getApplicationBaseUrl(): string | null {
  const value = process.env.DM3IQCM_APP_URL?.trim().replace(/\/$/, "");
  if (!value || !/^https?:\/\//i.test(value)) {
    console.error("Application URL is unavailable for email delivery");
    return null;
  }
  return value;
}
