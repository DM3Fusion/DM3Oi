export function customerPortalWelcomeCopy(activeCaseCount: number) {
  if (activeCaseCount === 0) {
    return "Here's a summary of your service requests.";
  }
  if (activeCaseCount === 1) {
    return "Here's the status of your case and service requests.";
  }
  return "Here's the status of your cases and service requests.";
}
