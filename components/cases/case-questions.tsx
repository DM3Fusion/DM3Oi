import { Badge } from "@/components/ui";
import type { EvaluatedCaseQuestion } from "@/lib/data/question-repository";

type Option = {
  id?: string;
  label: string;
  value: string;
};

const scalar = (value: unknown) =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? String(value)
    : "";

const optionLabel = (options: Option[], value: unknown) => {
  const normalized = scalar(value);
  return (
    options.find(
      (option) =>
        option.id === normalized ||
        option.value === normalized,
    )?.label ?? normalized
  );
};

function ResponseDisplay({
  type,
  options,
  value,
}: {
  type: EvaluatedCaseQuestion["response_type"];
  options: Option[];
  value: unknown;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="case-question-response-empty">No response</span>;
  }

  if (type === "YES_NO") {
    return (
      <span className="case-question-response-value">
        {value === true || value === "true" ? "Yes" : "No"}
      </span>
    );
  }

  if (type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value : [];

    if (!selected.length) {
      return <span className="case-question-response-empty">No response</span>;
    }

    return (
      <ul className="case-question-response-list">
        {selected.map((item) => (
          <li key={String(item)}>{optionLabel(options, item)}</li>
        ))}
      </ul>
    );
  }

  if (type === "SINGLE_SELECT") {
    return (
      <span className="case-question-response-value">
        {optionLabel(options, value)}
      </span>
    );
  }

  return (
    <span className="case-question-response-value">
      {scalar(value)}
    </span>
  );
}

export function CaseQuestions({
  questions,
}: {
  questions: EvaluatedCaseQuestion[];
}) {
  const required = questions.filter(
    (question) =>
      question.applicable &&
      question.effectiveRequired,
  );
  const answered = required.filter(
    (question) => question.response,
  ).length;

  return (
    <section className="panel detail-section">
      <div className="section-head">
        <div>
          <h2>Questions / Responses</h2>
          <p>
            Intake responses preserved from the validated Case workflow.
          </p>
        </div>
        <span className="count-pill">
          {required.length} required · {answered} answered ·{" "}
          {required.length - answered} remaining
        </span>
      </div>

      {questions.length ? (
        <div className="case-question-list">
          {questions.map((question) => {
            const options = Array.isArray(question.options_snapshot)
              ? (question.options_snapshot as unknown as Option[])
              : [];

            return (
              <article
                className={
                  !question.applicable
                    ? "not-applicable"
                    : question.effectiveRequired && !question.response
                      ? "unanswered"
                      : ""
                }
                key={question.id}
              >
                <div>
                  <b>{question.question_text}</b>
                  <p>{question.description}</p>
                  <span
                    className={
                      !question.applicable
                        ? "optional"
                        : question.effectiveRequired
                          ? "required"
                          : "optional"
                    }
                  >
                    {!question.applicable
                      ? "Not applicable"
                      : question.effectiveRequired
                        ? "Required"
                        : "Optional"}
                  </span>{" "}
                  <Badge
                    value={
                      question.response
                        ? "ANSWERED"
                        : "UNANSWERED"
                    }
                  />
                </div>

                {question.applicable ? (
                  <div
                    className="case-question-response-readonly"
                    aria-label="Validated response"
                  >
                    <small>Validated response</small>
                    <ResponseDisplay
                      type={question.response_type}
                      options={options}
                      value={question.response?.response_value}
                    />
                  </div>
                ) : (
                  <p className="question-applicability-note">
                    This Question was not applicable when this Case was
                    validated.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="no-results">
          No questions were applicable when this Case was created.
        </div>
      )}
    </section>
  );
}
