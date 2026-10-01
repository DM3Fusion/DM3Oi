import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { GuidedCaseIntake } from "@/components/cases/guided-case-intake";
import {
  GuidedCaseIntakeDataError,
  loadGuidedCaseIntakeConfiguration,
} from "@/lib/data/guided-case-intake";
import {
  loadGuidedIntakeDraft,
  loadGuidedIntakeDraftForCase,
} from "@/lib/data/guided-case-intake-drafts";

export const metadata = { title: "Guided Case Intake" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; case?: string }>;
}) {
  const query = await searchParams;

  const savedDraft = query.case
    ? await loadGuidedIntakeDraftForCase(query.case)
    : query.draft
      ? await loadGuidedIntakeDraft(query.draft)
      : null;

  if ((query.case || query.draft) && !savedDraft) notFound();

  let configuration;
  let draftCustomerIds;
  try {
    ({ configuration, draftCustomerIds } =
      await loadGuidedCaseIntakeConfiguration(
        savedDraft?.draft.caseId ?? null,
      ));
  } catch (error) {
    if (
      error instanceof GuidedCaseIntakeDataError &&
      error.message.includes("not authorized")
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <>
      <GuidedCaseIntake
        configuration={configuration}
        draftCustomerIds={draftCustomerIds}
        submissionKey={savedDraft?.submissionKey ?? randomUUID()}
        initialDraft={savedDraft?.draft}
        initialStep={savedDraft?.currentStep}
        initialCustomerMode={savedDraft?.customerMode}
        initialNewCustomer={savedDraft?.newCustomer}
        initialNoticeSentFollowUpIds={
          savedDraft?.noticeSentFollowUpIds ?? []
        }
        initialNoticeSentAtByFollowUpId={
          savedDraft?.noticeSentAtByFollowUpId ?? {}
        }
      />
    </>
  );
}
