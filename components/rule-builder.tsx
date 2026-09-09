"use client";
import { useId, useRef, useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { saveRuleAction } from "@/lib/data/rule-actions";
import type { RuleDefinition, RuleQuestion } from "@/lib/data/rule-repository";
import type { Database } from "@/types/database.generated";

type Operator=Database["public"]["Enums"]["rule_condition_operator"];
type ActionType=Database["public"]["Enums"]["rule_action_type"];
type BuilderAction={id?:string;action_type:ActionType;target_question_id:string;task_title:string;task_description:string;task_priority:Database["public"]["Enums"]["priority_level"];task_required:boolean;task_blocking:boolean};
const operators:Record<string,{value:Operator;label:string}[]>={
  YES_NO:[{value:"IS_YES",label:"Is Yes"},{value:"IS_NO",label:"Is No"},{value:"IS_ANSWERED",label:"Is Answered"},{value:"IS_NOT_ANSWERED",label:"Is Not Answered"}],
  SINGLE_SELECT:[{value:"EQUALS",label:"Equals"},{value:"NOT_EQUALS",label:"Does Not Equal"},{value:"IS_ANSWERED",label:"Is Answered"},{value:"IS_NOT_ANSWERED",label:"Is Not Answered"}],
  MULTI_SELECT:[{value:"CONTAINS",label:"Contains"},{value:"NOT_CONTAINS",label:"Does Not Contain"},{value:"IS_ANSWERED",label:"Is Answered"},{value:"IS_NOT_ANSWERED",label:"Is Not Answered"}],
};
const general=[{value:"IS_ANSWERED" as Operator,label:"Is Answered"},{value:"IS_NOT_ANSWERED" as Operator,label:"Is Not Answered"}];
const optionOperators=new Set<Operator>(["EQUALS","NOT_EQUALS","CONTAINS","NOT_CONTAINS"]);
const blankAction=(questions:RuleQuestion[],source:string):BuilderAction=>({action_type:"SHOW_QUESTION",target_question_id:questions.find(q=>q.active&&q.id!==source)?.id??"",task_title:"",task_description:"",task_priority:"NORMAL",task_required:true,task_blocking:false});

export function RuleBuilder({questions,rule}:{questions:RuleQuestion[];rule?:RuleDefinition}) {
  const dialog=useRef<HTMLDialogElement>(null);const titleId=useId();
  const initialSource=rule?.source_question_id??questions.find(q=>q.active)?.id??"";
  const [source,setSource]=useState(initialSource);
  const sourceQuestion=questions.find(q=>q.id===source);
  const availableOperators=sourceQuestion?operators[sourceQuestion.response_type]??general:general;
  const [operator,setOperator]=useState<Operator>(rule?.condition_operator??availableOperators[0].value);
  const [optionId,setOptionId]=useState(rule?.condition_option_id??"");
  const [actions,setActions]=useState<BuilderAction[]>(rule?.actions.map(action=>({id:action.id,action_type:action.action_type,target_question_id:action.target_question_id??"",task_title:action.task_title??"",task_description:action.task_description??"",task_priority:action.task_priority??"NORMAL",task_required:action.task_required??true,task_blocking:action.task_blocking??false}))??[blankAction(questions,initialSource)]);
  const updateAction=(index:number,change:Partial<BuilderAction>)=>setActions(current=>current.map((action,i)=>i===index?{...action,...change}:action));
  const selectableQuestions=(current?:string)=>questions.filter(question=>question.id!==source&&(question.active||question.id===current));
  return <>
    <button type="button" className={rule?"secondary-button":"primary-button"} onClick={()=>dialog.current?.showModal()}>{rule?"Edit":"＋ Add Rule"}</button>
    <dialog ref={dialog} className="rule-builder-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();dialog.current?.close();}}>
      <form action={saveRuleAction} className="rule-builder-form">
        <header><div><p className="eyebrow">Rule Builder</p><h2 id={titleId}>{rule?"Edit Rule":"Add Rule"}</h2></div><button type="button" className="rule-dialog-close" aria-label="Close Rule Builder" onClick={()=>dialog.current?.close()}>×</button></header>
        <input type="hidden" name="ruleId" value={rule?.id??""}/><input type="hidden" name="expectedUpdatedAt" value={rule?.updated_at??""}/><input type="hidden" name="actions" value={JSON.stringify(actions)}/>
        <div className="rule-basics"><label><span>Rule Name</span><input name="name" required maxLength={160} defaultValue={rule?.name??""}/></label><label><span>Description <small>Optional</small></span><textarea name="description" rows={2} defaultValue={rule?.description??""}/></label><label><span>Display Order</span><input name="displayOrder" type="number" min="0" defaultValue={rule?.display_order??0}/></label><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={rule?.active??true}/><span>Active</span></label></div>
        <section className="rule-builder-block"><strong>WHEN</strong><label><span>Question</span><select name="sourceQuestionId" value={source} onChange={event=>{const next=event.currentTarget.value;setSource(next);const question=questions.find(q=>q.id===next);setOperator((question?operators[question.response_type]??general:general)[0].value);setOptionId("");setActions(current=>current.map(action=>action.target_question_id===next?{...action,target_question_id:""}:action));}}>{questions.filter(q=>q.active||q.id===rule?.source_question_id).map(q=><option value={q.id} key={q.id}>{q.question_text}{q.active?"":" (Inactive)"}</option>)}</select></label><label><span>Operator</span><select name="operator" value={operator} onChange={event=>{const next=event.currentTarget.value as Operator;setOperator(next);if(!optionOperators.has(next))setOptionId("");}}>{availableOperators.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>{optionOperators.has(operator)?<label><span>Value</span><select name="conditionOptionId" required value={optionId} onChange={event=>setOptionId(event.currentTarget.value)}><option value="">Select a value</option>{sourceQuestion?.options.map(option=><option value={option.id} key={option.id}>{option.option_label}</option>)}</select></label>:<input type="hidden" name="conditionOptionId" value=""/>}</section>
        <div className="rule-then-heading"><strong>THEN</strong><button type="button" className="secondary-button" onClick={()=>setActions(current=>[...current,blankAction(questions,source)])}>＋ Add Action</button></div>
        <div className="rule-actions-builder">{actions.map((action,index)=><section className="rule-action-block" key={action.id??index}><div className="rule-action-head"><b>Action {index+1}</b>{actions.length>1?<button type="button" className="text-button" onClick={()=>setActions(current=>current.filter((_,i)=>i!==index))}>Remove</button>:null}</div><label><span>Action</span><select value={action.action_type} onChange={event=>updateAction(index,{action_type:event.currentTarget.value as ActionType,target_question_id:"",task_title:"",task_description:"",task_priority:"NORMAL",task_required:true,task_blocking:false})}><option value="SHOW_QUESTION">Show Question</option><option value="REQUIRE_QUESTION">Require Question</option><option value="CREATE_TASK">Create Task</option></select></label>{action.action_type==="CREATE_TASK"?<div className="rule-task-fields"><label><span>Task Title</span><input required value={action.task_title} onChange={event=>updateAction(index,{task_title:event.currentTarget.value})}/></label><label><span>Task Description <small>Optional</small></span><textarea rows={2} value={action.task_description} onChange={event=>updateAction(index,{task_description:event.currentTarget.value})}/></label><label><span>Priority</span><select value={action.task_priority} onChange={event=>updateAction(index,{task_priority:event.currentTarget.value as BuilderAction["task_priority"]})}><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label><label className="checkbox-label"><input type="checkbox" checked={action.task_required} onChange={event=>updateAction(index,{task_required:event.currentTarget.checked})}/><span>Required</span></label><label className="checkbox-label"><input type="checkbox" checked={action.task_blocking} onChange={event=>updateAction(index,{task_blocking:event.currentTarget.checked})}/><span>Blocking</span></label></div>:<label><span>{action.action_type==="SHOW_QUESTION"?"Question to Show":"Question to Require"}</span><select required value={action.target_question_id} onChange={event=>updateAction(index,{target_question_id:event.currentTarget.value})}><option value="">Select a Question</option>{selectableQuestions(action.target_question_id).map(q=><option value={q.id} key={q.id}>{q.question_text}{q.active?"":" (Inactive)"}</option>)}</select></label>}</section>)}</div>
        <footer><button type="button" className="secondary-button" onClick={()=>dialog.current?.close()}>Cancel</button><PendingSubmitButton className="primary-button" pendingLabel="Saving…">Save Rule</PendingSubmitButton></footer>
      </form>
    </dialog>
  </>;
}
