export type CaseCommunicationRequest = {
  id: string;
  organization_id: string;
  case_id: string | null;
  customer_id: string;
  request_number: string;
  description: string;
  created_at: string;
};

export type CaseCommunicationMessage = {
  id: string;
  organization_id: string;
  service_request_id: string;
  author_type: string;
  body: string;
  created_at: string;
};

export type RecentCaseCommunication = {
  id: string;
  serviceRequestId: string;
  serviceRequestNumber: string;
  direction: "INBOUND" | "OUTBOUND";
  participantLabel: "Customer" | "DM3Oi team";
  summary: string;
  createdAt: string;
};

const summary = (body: string) => {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}…` : normalized;
};

export function selectRecentCaseCommunications(input: {
  organizationId: string;
  caseId: string;
  caseCustomerId: string;
  requests: readonly CaseCommunicationRequest[];
  messages: readonly CaseCommunicationMessage[];
  limit?: number;
}): RecentCaseCommunication[] {
  const linkedRequests = input.requests.filter(
    (request) =>
      request.organization_id === input.organizationId &&
      request.case_id === input.caseId &&
      request.customer_id === input.caseCustomerId,
  );
  const requestById = new Map(linkedRequests.map((request) => [request.id, request]));
  const candidates: RecentCaseCommunication[] = linkedRequests.flatMap((request) => {
    const opening = summary(request.description);
    return opening
      ? [{
          id: `opening:${request.id}`,
          serviceRequestId: request.id,
          serviceRequestNumber: request.request_number,
          direction: "INBOUND" as const,
          participantLabel: "Customer" as const,
          summary: opening,
          createdAt: request.created_at,
        }]
      : [];
  });
  for (const message of input.messages) {
    if (message.organization_id !== input.organizationId) continue;
    const request = requestById.get(message.service_request_id);
    if (!request) continue;
    const messageSummary = summary(message.body);
    if (!messageSummary) continue;
    candidates.push({
      id: message.id,
      serviceRequestId: message.service_request_id,
      serviceRequestNumber: request.request_number,
      direction: message.author_type === "CUSTOMER" ? "INBOUND" : "OUTBOUND",
      participantLabel: message.author_type === "CUSTOMER" ? "Customer" : "DM3Oi team",
      summary: messageSummary,
      createdAt: message.created_at,
    });
  }
  return candidates
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, input.limit ?? 5);
}
