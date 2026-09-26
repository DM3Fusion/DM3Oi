import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { GuidedCaseIntake } from "@/components/cases/guided-case-intake";
import {
  GuidedCaseIntakeDataError,
  loadGuidedCaseIntakeConfiguration,
} from "@/lib/data/guided-case-intake";

export const metadata = { title: "Guided Case Intake" };

export default async function Page() {
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
  return (
    <>
      <PageHeader
        eyebrow="Cases"
        title="Guided Case Intake"
        description="Create one complete, validated Case without leaving the intake workflow."
      />
      <GuidedCaseIntake
        configuration={configuration}
        submissionKey={randomUUID()}
      />
    </>
  );
}
