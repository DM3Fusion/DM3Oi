export type LicenseQueryError = {
  code?: string;
  message: string;
};

export class LicenseLookupError extends Error {
  readonly queryError: LicenseQueryError;

  constructor(queryError: LicenseQueryError) {
    super("Organization license data is temporarily unavailable.");
    this.name = "LicenseLookupError";
    this.queryError = queryError;
  }
}

export function licenseQueryDataOrThrow<T>(result: {
  data: T | null;
  error: LicenseQueryError | null;
}): T | null {
  if (result.error) throw new LicenseLookupError(result.error);
  return result.data;
}
