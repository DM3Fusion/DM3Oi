import { PageHeader, Badge } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { saveQuestionAction } from "@/lib/data/question-actions";
import { getQuestionDefinitions } from "@/lib/data/question-repository";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { QuestionSearch } from "@/components/question-search";
import { normalizeQuestionQuery,questionMatchesSearch } from "@/lib/question-filters";
import { hasPermission } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRuleBuilderData } from "@/lib/data/rule-repository";
import { RuleBuilder } from "@/components/rule-builder";
import { RuleFilters } from "@/components/rule-filters";
import { normalizeRuleQuery,normalizeRuleStatus,ruleMatchesSearch } from "@/lib/rule-filters";
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
  searchParams: Promise<{ error?: string; message?: string; q?: string; view?: string; status?: string }>;
}) {
  const [access, query] = await Promise.all([getAccessContext(), searchParams]);
  const canViewQuestions=hasPermission(access,"VIEW_QUESTIONS");
  const canViewRules=hasPermission(access,"VIEW_RULES");
  const view=query.view==="rules"?"rules":query.view==="questions"?"questions":canViewQuestions?"questions":"rules";
  if((view==="questions"&&!canViewQuestions)||(view==="rules"&&!canViewRules))notFound();
  const questions = view==="questions"?await getQuestionDefinitions():[];
  const canManage = hasPermission(access,"MANAGE_QUESTIONS");
  const search=normalizeQuestionQuery(query.q);
  const visibleQuestions=questions.filter(question=>questionMatchesSearch(question,search));
  const ruleData=view==="rules"?await getRuleBuilderData():null;
  const ruleQuery=normalizeRuleQuery(query.q);const ruleStatus=normalizeRuleStatus(query.status);
  const questionMap=new Map((ruleData?.questions??[]).map(question=>[question.id,question]));
  const actionText=(action:NonNullable<typeof ruleData>["rules"][number]["actions"][number])=>action.action_type==="CREATE_TASK"?`CREATE TASK ${action.task_title}`:`${action.action_type.replaceAll("_"," ")} ${questionMap.get(action.target_question_id??"")?.question_text??"Unavailable Question"}`;
  const rules=(ruleData?.rules??[]).map(rule=>{const source=questionMap.get(rule.source_question_id);const option=source?.options.find(item=>item.id===rule.condition_option_id);const summary=`${source?.question_text??"Unavailable Question"} ${rule.condition_operator.replaceAll("_"," ")} ${option?.option_label??""} ${rule.actions.map(actionText).join(" ")}`;return{...rule,summary};}).filter(rule=>ruleMatchesSearch(rule,ruleQuery,ruleStatus));
  return (
    <>
      <nav className="configuration-tabs" aria-label="Questions and Rules views">
        {canViewQuestions?<Link className={view==="questions"?"active":""} href="/questions?view=questions">Questions</Link>:null}
        {canViewRules?<Link className={view==="rules"?"active":""} href="/questions?view=rules">Rules</Link>:null}
      </nav>
      <PageHeader
        eyebrow="Configuration"
        title={view==="rules"?"Rules":"Questions"}
        description={view==="rules"?"Automate requirements and work based on case responses.":"Define the information required for new organization cases."}
        action={view==="rules"&&hasPermission(access,"MANAGE_RULES")&&ruleData?<RuleBuilder questions={ruleData.questions}/>:undefined}
      />
      {query.error ? (
        <div className="form-alert page-notice">{query.error}</div>
      ) : null}
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}
      {view==="rules"?<RuleFilters q={ruleQuery} status={ruleStatus}/>:<QuestionSearch q={search} />}
      {view==="questions"?<>
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
      </>:<section className="rule-register" aria-label="Configured Rules">{rules.length?rules.map(rule=><article className="panel rule-summary" key={rule.id}><div className="rule-summary-head"><div><h2>{rule.name}</h2>{rule.description?<p>{rule.description}</p>:null}</div><Badge value={rule.active?"ACTIVE":"INACTIVE"}/></div><div className="rule-sentence"><div><strong>WHEN</strong><span>{questionMap.get(rule.source_question_id)?.question_text??"Unavailable Question"}</span><b>{rule.condition_operator.replaceAll("_"," ")}</b>{rule.condition_option_id?<em>{questionMap.get(rule.source_question_id)?.options.find(option=>option.id===rule.condition_option_id)?.option_label??"Unavailable Value"}</em>:null}</div><div><strong>THEN</strong>{rule.actions.map(action=><span key={action.id}>{actionText(action)}</span>)}</div></div>{hasPermission(access,"MANAGE_RULES")&&ruleData?<div className="rule-summary-actions"><RuleBuilder questions={ruleData.questions} rule={rule}/></div>:null}</article>):<div className="panel no-results">{ruleQuery||ruleStatus!=="all"?"No Rules match the current filters.":"No Rules configured."}</div>}</section>}
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
      <input
        type="hidden"
        name="existingOptions"
        value={JSON.stringify(
          question?.options.map(({ id, option_label, option_value }) => ({
            id,
            label: option_label,
            value: option_value,
          })) ?? [],
        )}
      />
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
