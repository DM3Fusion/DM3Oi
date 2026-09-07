import { PageHeader, Badge } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { saveQuestionAction } from "@/lib/data/question-actions";
import { getQuestionDefinitions } from "@/lib/data/question-repository";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { QuestionSearch } from "@/components/question-search";
import { normalizeQuestionQuery,questionMatchesSearch } from "@/lib/question-filters";
import { hasPermission } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
const types = [
  "TEXT",
  "LONG_TEXT",
  "YES_NO",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
  "NUMBER",
] as const;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; q?: string }>;
}) {
  const [access, query] = await Promise.all([getAccessContext(), searchParams]);
  if(!hasPermission(access,"VIEW_QUESTIONS"))notFound();
  const questions = await getQuestionDefinitions();
  const canManage = hasPermission(access,"MANAGE_QUESTIONS");
  const search=normalizeQuestionQuery(query.q);
  const visibleQuestions=questions.filter(question=>questionMatchesSearch(question,search));
  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Questions & Responses"
        description="Define the information required for new organization cases."
      />
      {query.error ? (
        <div className="form-alert page-notice">{query.error}</div>
      ) : null}
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}
      <QuestionSearch q={search} />
      {canManage ? (
        <details className="panel question-create">
          <summary>＋ Add Question</summary>
          <QuestionForm />
        </details>
      ) : null}
      <section className="panel">
        {visibleQuestions.length ? (
          <div className="question-register">
            {visibleQuestions.map((q) => (
              <article key={q.id}>
                <div className="question-order">{q.display_order}</div>
                <div>
                  <b>{q.question_text}</b>
                  <p>{q.description || "No help text."}</p>
                  <span>
                    {q.response_type.replaceAll("_", " ")} ·{" "}
                    {q.options.map((o) => o.option_label).join(", ")}
                  </span>
                </div>
                <div>
                  <Badge value={q.active ? "ACTIVE" : "INACTIVE"} />
                  <span className={q.required ? "required" : "optional"}>
                    {q.required ? "Required" : "Optional"}
                  </span>
                </div>
                {canManage ? (
                  <details>
                    <summary>Edit</summary>
                    <QuestionForm question={q} />
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : search ? (
          <div className="no-results">No questions match the current search.</div>
        ) : (
          <div className="no-results">
            No questions configured. New cases currently have no question
            requirements.
          </div>
        )}
      </section>
    </>
  );
}
function QuestionForm({
  question,
}: {
  question?: Awaited<ReturnType<typeof getQuestionDefinitions>>[number];
}) {
  return (
    <form action={saveQuestionAction} className="mini-form question-form">
      <input type="hidden" name="questionId" value={question?.id ?? ""} />
      <label>
        <span>Question</span>
        <input
          name="questionText"
          defaultValue={question?.question_text}
          required
        />
      </label>
      <label>
        <span>Response type</span>
        <select
          name="responseType"
          defaultValue={question?.response_type ?? "TEXT"}
        >
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Help text</span>
        <input name="description" defaultValue={question?.description} />
      </label>
      <label>
        <span>Display order</span>
        <input
          name="displayOrder"
          type="number"
          min="0"
          defaultValue={question?.display_order ?? 0}
        />
      </label>
      <label className="full">
        <span>
          Selectable options <small>one per line</small>
        </span>
        <textarea
          name="options"
          rows={4}
          defaultValue={question?.options.map((o) => o.option_label).join("\n")}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          name="required"
          defaultChecked={question?.required}
        />
        <span>Required</span>
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          name="active"
          defaultChecked={question?.active ?? true}
        />
        <span>Active</span>
      </label>
      <div className="mini-actions">
        <PendingSubmitButton pendingLabel="Saving…">Save Question</PendingSubmitButton>
      </div>
    </form>
  );
}
