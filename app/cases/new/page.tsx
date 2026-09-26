import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { GuidedCaseIntake } from "@/components/cases/guided-case-intake";
import {
  GuidedCaseIntakeDataError,
  loadGuidedCaseIntakeConfiguration,
} from "@/lib/data/guided-case-intake";
import { loadGuidedIntakeDraft } from "@/lib/data/guided-case-intake-drafts";

export const metadata = { title: "Guided Case Intake" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  let configuration;
  try {
    ({ configuration } = await loadGuidedCaseIntakeConfiguration());
  } catch (error) {
    if (
      error instanceof GuidedCaseIntakeDataError &&
      error.message.includes("not authorized")
    ) {
      notFound();
    }
    throw error;
  }

  const query = await searchParams;
  const savedDraft = query.draft
    ? await loadGuidedIntakeDraft(query.draft)
    : null;

  if (query.draft && !savedDraft) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Cases"
        title="Guided Case Intake"
        description="Create one complete, validated Case without leaving the intake workflow."
      />
      <GuidedCaseIntake
        configuration={configuration}
        submissionKey={savedDraft?.submissionKey ?? randomUUID()}
        initialDraft={savedDraft?.draft}
        initialStep={savedDraft?.currentStep}
        initialCustomerMode={savedDraft?.customerMode}
        initialNewCustomer={savedDraft?.newCustomer}
      />
    </>
  );
}
