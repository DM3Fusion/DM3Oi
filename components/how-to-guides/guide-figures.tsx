import type { ReactNode } from "react";
import type { HowToGuideFigureKey } from "@/lib/how-to-guide-content";

const figureTitles: Record<HowToGuideFigureKey, string> = {
  "customer-workspace": "Customer workspace example",
  "guided-intake-owner": "Guided Case Intake steps",
  "task-register-owner": "Task register example",
  "service-request-flow-owner": "Service Request conversation flow",
  "portal-access": "Portal Access controls",
  "business-reach-owner": "Business Reach map key",
  "invitation-flow": "Organization invitation flow",
  "settings-cards": "Organization settings cards",
  "customer-register": "Customer register example",
  "guided-intake-staff": "Guided Case Intake sequence",
  "task-register-staff": "Task register example",
  "service-request-flow-staff": "Service Request work flow",
  "portal-interaction": "Customer Portal interaction",
  "inbox-pattern": "Inbox review pattern",
  "business-reach-staff": "Business Reach map key",
};

function FigureFrame({ figureKey, caption, children }: {
  figureKey: HowToGuideFigureKey;
  caption: string;
  children: ReactNode;
}) {
  const title = figureTitles[figureKey];
  return <figure className="guide-figure">
    <div className="guide-figure-canvas" role="img" aria-label={title}>{children}</div>
    <figcaption><strong>{title}</strong><span>{caption}</span></figcaption>
  </figure>;
}

const IntakeSteps = () => <div className="guide-mini-steps">
  {["Customer", "Case Details", "Intake Questions", "Requirements", "Review", "Finish Intake"].map((step, index) =>
    <span key={step}><b>{index + 1}</b>{step}</span>)}
</div>;

export function GuideFigure({ figureKey, caption }: {
  figureKey: HowToGuideFigureKey;
  caption: string;
}) {
  let content: ReactNode;
  switch (figureKey) {
    case "customer-workspace":
      content = <><div className="guide-mini-toolbar"><span>Search customers…</span><b>New Customer</b></div><div className="guide-mini-row"><span><strong>Sample Customer</strong><small>Active relationship</small></span><b>Open</b></div></>;
      break;
    case "customer-register":
      content = <><div className="guide-mini-toolbar"><span>Search customers…</span><b>New Customer</b></div><div className="guide-mini-row"><span><strong>Example Customer</strong><small>Active relationship</small></span><b>Open</b></div></>;
      break;
    case "guided-intake-owner":
    case "guided-intake-staff":
      content = <IntakeSteps />;
      break;
    case "task-register-owner":
      content = <><div className="guide-mini-task"><span><strong>Verify details</strong><small>Related Case</small></span><b>Open</b></div><div className="guide-mini-task"><span><strong>Required documents</strong><small>Due today</small></span><b>Waiting on Customer</b></div></>;
      break;
    case "task-register-staff":
      content = <><div className="guide-mini-row"><span><strong>Review required information</strong><small>Due today · In progress</small></span><b>Open</b></div><div className="guide-mini-row"><span><strong>Confirm customer response</strong><small>Due tomorrow · Open</small></span><b>Open</b></div></>;
      break;
    case "service-request-flow-owner":
      content = <div className="guide-mini-flow"><span>Service Request</span><i aria-hidden="true">→</i><span>Staff Reply</span><i aria-hidden="true">→</i><span>Customer Portal</span></div>;
      break;
    case "service-request-flow-staff":
      content = <div className="guide-flow"><span>Customer Request</span><b>→</b><span>Assigned Staff</span><b>→</b><span>Reply &amp; Resolve</span></div>;
      break;
    case "portal-access":
      content = <div className="guide-mini-card"><span><strong>Portal Access</strong><small>Invitation state</small></span><b>Enable Portal Access</b><em>Resend invitation</em></div>;
      break;
    case "portal-interaction":
      content = <div className="guide-flow"><span>Customer Portal</span><b>→</b><span>Service Request</span><b>→</b><span>Staff Reply</span></div>;
      break;
    case "inbox-pattern":
      content = <><div className="guide-mini-row"><span><strong>New customer reply</strong><small>Unread · Service Request</small></span><b>Open</b></div><div className="guide-mini-row"><span><strong>Requirement update</strong><small>Read · Case activity</small></span><b>Open</b></div></>;
      break;
    case "business-reach-owner":
      content = <><div className="guide-mini-map"><i className="guide-map-dot one" aria-hidden="true" /><i className="guide-map-dot two" aria-hidden="true" /><i className="guide-map-dot three" aria-hidden="true" /></div><div className="guide-mini-key"><span><i />Mapped</span><span><i />Unmapped</span></div></>;
      break;
    case "business-reach-staff":
      content = <><div className="guide-map-mini"><span className="guide-map-point one">1</span><span className="guide-map-point two">2</span><span className="guide-map-point three">3</span></div><div className="guide-map-legend"><span><i />Mapped customers</span><span><i />Needs location review</span></div></>;
      break;
    case "invitation-flow":
      content = <div className="guide-mini-flow"><span>Add User</span><i aria-hidden="true">→</i><span>Send Invitation</span><i aria-hidden="true">→</i><span>Activate User</span></div>;
      break;
    case "settings-cards":
      content = <div className="guide-mini-settings"><span>Case Configuration</span><span>Customer Portal</span><span>User Access</span></div>;
      break;
  }
  return <FigureFrame figureKey={figureKey} caption={caption}>{content}</FigureFrame>;
}
