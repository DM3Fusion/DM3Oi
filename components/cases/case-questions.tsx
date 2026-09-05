import { Badge } from "@/components/ui";
import { saveCaseResponseAction } from "@/lib/data/question-actions";
import type { CaseQuestion } from "@/lib/data/question-repository";
import { PendingSubmitButton } from "@/components/pending-submit-button";
type Option = { label: string; value: string };
const scalar = (value: unknown) =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? String(value)
    : "";
export function CaseQuestions({
  caseId,
  questions,
}: {
  caseId: string;
  questions: CaseQuestion[];
}) {
  const required = questions.filter((q) => q.required);
  const answered = required.filter((q) => q.response).length;
  return (
    <section className="panel detail-section">
      <div className="section-head">
        <div>
          <h2>Questions / Responses</h2>
          <p>Snapshot requirements preserved for this case</p>
        </div>
        <span className="count-pill">
          {required.length} required · {answered} answered ·{" "}
          {required.length - answered} remaining
        </span>
      </div>
      {questions.length ? (
        <div className="case-question-list">
          {questions.map((q) => {
            const options = Array.isArray(q.options_snapshot)
              ? (q.options_snapshot as unknown as Option[])
              : [];
            return (
              <article
                className={q.required && !q.response ? "unanswered" : ""}
                key={q.id}
              >
                <div>
                  <b>{q.question_text}</b>
                  <p>{q.description}</p>
                  <span className={q.required ? "required" : "optional"}>
                    {q.required ? "Required" : "Optional"}
                  </span>{" "}
                  <Badge value={q.response ? "ANSWERED" : "UNANSWERED"} />
                </div>
                <form
                  action={saveCaseResponseAction}
                  className="question-response-form"
                >
                  <input type="hidden" name="caseId" value={caseId} />
                  <input type="hidden" name="caseQuestionId" value={q.id} />
                  <input
                    type="hidden"
                    name="responseType"
                    value={q.response_type}
                  />
                  <ResponseInput
                    type={q.response_type}
                    options={options}
                    value={q.response?.response_value}
                  />
                  <PendingSubmitButton pendingLabel="Saving…">Save</PendingSubmitButton>
                </form>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="no-results">
          No questions were applicable when this case was created.
        </div>
      )}
    </section>
  );
}
function ResponseInput({
  type,
  options,
  value,
}: {
  type: CaseQuestion["response_type"];
  options: Option[];
  value: unknown;
}) {
  if (type === "LONG_TEXT")
    return (
      <textarea
        name="response"
        rows={3}
        defaultValue={scalar(value)}
        required
      />
    );
  if (type === "YES_NO")
    return (
      <select name="response" defaultValue={scalar(value)} required>
        <option value="" disabled>
          Select…
        </option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  if (type === "SINGLE_SELECT")
    return (
      <select name="response" defaultValue={scalar(value)} required>
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  if (type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="response-options">
        {options.map((o) => (
          <label key={o.value}>
            <input
              type="checkbox"
              name="response"
              value={o.value}
              defaultChecked={selected.includes(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  return (
    <input
      name="response"
      type={type === "DATE" ? "date" : type === "NUMBER" ? "number" : "text"}
      defaultValue={scalar(value)}
      required
    />
  );
}
