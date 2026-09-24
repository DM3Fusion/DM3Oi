export const trialRequestUseCases = [
  "SERVICE_DESK",
  "CASE_MANAGEMENT",
  "TASK_WORK_MANAGEMENT",
  "COMMUNICATIONS",
  "WORKFLOW_AUTOMATION",
  "OPERATIONAL_REPORTING",
  "OTHER_OPERATIONAL_WORKFLOW",
] as const;

export type TrialRequestUseCase =
  (typeof trialRequestUseCases)[number];

export const trialRequestUseCaseLabels: Record<
  TrialRequestUseCase,
  string
> = {
  SERVICE_DESK: "Service Desk / Customer Requests",
  CASE_MANAGEMENT: "Case Management",
  TASK_WORK_MANAGEMENT: "Task & Work Management",
  COMMUNICATIONS: "Communications",
  WORKFLOW_AUTOMATION: "Workflow Rules & Automation",
  OPERATIONAL_REPORTING: "Operational Visibility & Reporting",
  OTHER_OPERATIONAL_WORKFLOW: "Other Operational Workflow",
};

export const estimatedUserOptions = [
  { value: "1", label: "1 user" },
  { value: "2", label: "2 users" },
  { value: "3", label: "3 users" },
  { value: "4", label: "4 users" },
  { value: "5", label: "5 users" },
  { value: "6", label: "6 users" },
  { value: "7", label: "7 users" },
  { value: "8", label: "8 users" },
  { value: "9", label: "9 users" },
  { value: "10", label: "10 users" },
  { value: "15", label: "11–15 users" },
  { value: "25", label: "16–25 users" },
  { value: "50", label: "26–50 users" },
  { value: "100", label: "51–100 users" },
  { value: "101", label: "More than 100 users" },
] as const;

export type TrialRequestInput = {
  businessName: string;
  contactName: string;
  businessEmail: string;
  phone: string;
  primaryUseCase: TrialRequestUseCase;
  otherUseCase?: string;
  estimatedUsers: number;
  workflowNotes?: string;
  privacyAcknowledged: boolean;
};

const emailPattern =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const phonePattern =
  /^[0-9()+.\-\s]{7,30}$/;

export function validateTrialRequest(
  input: {
    businessName: string;
    contactName: string;
    businessEmail: string;
    phone: string;
    primaryUseCase: string;
    otherUseCase: string;
    estimatedUsers: string;
    workflowNotes: string;
    privacyAcknowledged: boolean;
  },
):
  | { success: true; data: TrialRequestInput }
  | { success: false } {
  const businessName = input.businessName.trim();
  const contactName = input.contactName.trim();
  const businessEmail = input.businessEmail
    .trim()
    .toLowerCase();
  const phone = input.phone.trim();
  const otherUseCase = input.otherUseCase.trim();
  const workflowNotes = input.workflowNotes.trim();
  const estimatedUsers = Number(input.estimatedUsers);

  if (
    businessName.length < 2 ||
    businessName.length > 120 ||
    contactName.length < 2 ||
    contactName.length > 100 ||
    businessEmail.length < 3 ||
    businessEmail.length > 254 ||
    !emailPattern.test(businessEmail) ||
    (phone.length > 0 && !phonePattern.test(phone)) ||
    !trialRequestUseCases.includes(
      input.primaryUseCase as TrialRequestUseCase,
    ) ||
    !Number.isInteger(estimatedUsers) ||
    estimatedUsers < 1 ||
    estimatedUsers > 10000 ||
    workflowNotes.length > 2000 ||
    !input.privacyAcknowledged
  ) {
    return { success: false };
  }

  const primaryUseCase =
    input.primaryUseCase as TrialRequestUseCase;

  if (
    primaryUseCase === "OTHER_OPERATIONAL_WORKFLOW" &&
    (otherUseCase.length < 2 || otherUseCase.length > 300)
  ) {
    return { success: false };
  }

  return {
    success: true,
    data: {
      businessName,
      contactName,
      businessEmail,
      phone,
      primaryUseCase,
      otherUseCase:
        primaryUseCase === "OTHER_OPERATIONAL_WORKFLOW"
          ? otherUseCase
          : undefined,
      estimatedUsers,
      workflowNotes: workflowNotes || undefined,
      privacyAcknowledged: true,
    },
  };
}
