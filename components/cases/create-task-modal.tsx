"use client";

import { useRef } from "react";
import { createTaskAction } from "@/lib/data/case-actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ApplicationIcon } from "@/components/application-icon";

export function CreateTaskModal({
  caseId,
  staff,
}: {
  caseId: string;
  staff: Array<{ id: string; name: string }>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="primary-button"
        onClick={() => dialog.current?.showModal()}
      >
        <ApplicationIcon name="add" />Add Task
      </button>
      <dialog
        ref={dialog}
        className="task-modal"
        onCancel={(event) => {
          event.preventDefault();
          dialog.current?.close();
        }}
      >
        <form action={createTaskAction} className="task-modal-form">
          <header>
            <div><p className="eyebrow">Case Task</p><h2>Create Task</h2></div>
            <button type="button" className="rule-dialog-close" aria-label="Close Create Task modal" onClick={() => dialog.current?.close()}><ApplicationIcon name="close" /></button>
          </header>
          <input type="hidden" name="caseId" value={caseId} />
          <label><span>Task title</span><input name="title" required maxLength={200} /></label>
          <label><span>Assigned to <small>Optional</small></span><select name="assignedUserId" defaultValue=""><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label><span>Due Date</span><input type="date" name="dueDate" required /></label>
          <label><span>Priority</span><select name="priority" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
          <label className="full"><span>Notes <small>Optional</small></span><textarea name="description" rows={3} /></label>
          <div className="task-modal-checks"><label><input type="checkbox" name="required" defaultChecked /><span>Required</span></label><label><input type="checkbox" name="blocking" /><span>Blocking</span></label></div>
          <footer><button type="button" className="secondary-button" onClick={() => dialog.current?.close()}>Cancel</button><PendingSubmitButton className="primary-button" pendingLabel="Creating…">Create Task</PendingSubmitButton></footer>
        </form>
      </dialog>
    </>
  );
}
