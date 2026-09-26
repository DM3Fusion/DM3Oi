export type CustomerPortalQueryError = {
  code?: string;
  message: string;
};

type CustomerPortalQueryResult = {
  error: CustomerPortalQueryError | null;
};

type CustomerPortalQueryLogger = (
  message: string,
  context: {
    operation: string;
    code: string | null;
    message: string;
  },
) => void;

export class CustomerPortalDataError extends Error {
  constructor() {
    super("Customer Portal data is temporarily unavailable.");
    this.name = "CustomerPortalDataError";
  }
}

export function requireCustomerPortalQuerySuccess<
  T extends CustomerPortalQueryResult,
>(
  result: T,
  operation: string,
  log: CustomerPortalQueryLogger = console.error,
): T {
  if (result.error) {
    log("Customer Portal query failed", {
      operation,
      code: result.error.code ?? null,
      message: result.error.message,
    });
    throw new CustomerPortalDataError();
  }
  return result;
}

export function customerPortalDataOrThrow<T>(
  result: { data: T | null; error: CustomerPortalQueryError | null },
  operation: string,
  log?: CustomerPortalQueryLogger,
): T | null {
  return requireCustomerPortalQuerySuccess(result, operation, log).data;
}
