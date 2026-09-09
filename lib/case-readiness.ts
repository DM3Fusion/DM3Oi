import { isMeaningfulRuleAnswer } from "./rule-evaluator.ts";
import type { Database, Json } from "@/types/database.generated";

type ResponseType = Database["public"]["Enums"]["question_response_type"];
type TaskStatus = Database["public"]["Enums"]["case_task_status"];

export type ReadinessQuestion = {
  id: string;
  label: string;
  responseType: ResponseType;
  responseValue?: Json;
  applicable: boolean;
  effectiveRequired: boolean;
};

export type ReadinessTask = {
  id: string;
  label: string;
  status: TaskStatus;
  required: boolean;
  blocking: boolean;
};

export type RemainingWork =
  | { kind: "QUESTION"; id: string; label: string }
  | { kind: "TASK"; id: string; label: string; blocked: boolean };

export type CaseReadiness = {
  progressPercent: number;
  ready: boolean;
  completedUnits: number;
  totalUnits: number;
  unansweredRequiredQuestions: RemainingWork[];
  incompleteRequiredTasks: ReadinessTask[];
  incompleteBlockingTasks: ReadinessTask[];
  remainingWork: RemainingWork[];
};

export function calculateCaseReadiness({
  questions,
  tasks,
}: {
  questions: ReadinessQuestion[];
  tasks: ReadinessTask[];
}): CaseReadiness {
  const requiredQuestions = questions.filter(
    (question) => question.applicable && question.effectiveRequired,
  );
  const unansweredRequiredQuestions: RemainingWork[] = requiredQuestions
    .filter(
      (question) =>
        !isMeaningfulRuleAnswer(question.responseType, question.responseValue),
    )
    .map((question) => ({
      kind: "QUESTION",
      id: question.id,
      label: question.label,
    }));

  const applicableTaskUnits = tasks.filter(
    (task) =>
      task.status !== "NOT_APPLICABLE" && (task.required || task.blocking),
  );
  const incompleteRequiredTasks = applicableTaskUnits.filter(
    (task) => task.required && task.status !== "COMPLETED",
  );
  const incompleteBlockingTasks = applicableTaskUnits.filter(
    (task) => task.blocking && task.status !== "COMPLETED",
  );
  const incompleteTasks = applicableTaskUnits.filter(
    (task) => task.status !== "COMPLETED",
  );
  const orderedTasks = [
    ...incompleteTasks.filter(
      (task) => task.blocking && task.status === "BLOCKED",
    ),
    ...incompleteTasks.filter(
      (task) => task.blocking && task.status !== "BLOCKED",
    ),
    ...incompleteTasks.filter((task) => !task.blocking && task.required),
  ];
  const remainingWork: RemainingWork[] = [
    ...unansweredRequiredQuestions,
    ...orderedTasks.map((task) => ({
      kind: "TASK" as const,
      id: task.id,
      label: task.label,
      blocked: task.status === "BLOCKED",
    })),
  ];
  const totalUnits = requiredQuestions.length + applicableTaskUnits.length;
  const completedUnits =
    requiredQuestions.length - unansweredRequiredQuestions.length +
    applicableTaskUnits.filter((task) => task.status === "COMPLETED").length;

  return {
    progressPercent: totalUnits
      ? Math.round((completedUnits / totalUnits) * 100)
      : 100,
    ready:
      unansweredRequiredQuestions.length === 0 &&
      incompleteRequiredTasks.length === 0 &&
      incompleteBlockingTasks.length === 0,
    completedUnits,
    totalUnits,
    unansweredRequiredQuestions,
    incompleteRequiredTasks,
    incompleteBlockingTasks,
    remainingWork,
  };
}
