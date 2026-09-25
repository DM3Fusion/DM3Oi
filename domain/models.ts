export type ISODateString = string;
export type RoleKey = "SUPER_ADMIN" | "BUSINESS_ADMIN" | "BUSINESS_OWNER" | "STAFF_MANAGER" | "STAFF_USER";
export type RoleScope = "PLATFORM" | "ORGANIZATION";
export interface RoleConfiguration { key: RoleKey; displayName: string; scope: RoleScope; maximumAllowed?: number; description: string }
export interface Organization { id: string; name: string; slug: string; createdAt: ISODateString; updatedAt: ISODateString }
export interface User { id: string; organizationId?: string; firstName: string; lastName: string; email: string; role: RoleKey; title?: string; active: boolean; createdAt: ISODateString; updatedAt: ISODateString }
export interface Customer { id: string; organizationId: string; name: string; email: string; phone?: string; company?: string; createdAt: ISODateString; updatedAt: ISODateString }
export type CaseStatus = "NEW" | "UNASSIGNED" | "ASSIGNED" | "IN_PROGRESS" | "WAITING" | "REVIEW" | "COMPLETED" | "CLOSED" | "CANCELLED";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export interface Case { id: string; caseNumber: string; organizationId: string; customerId: string; title: string; description: string; caseType: string; priority: Priority; status: CaseStatus; openedAt: ISODateString; dueAt?: ISODateString; completedAt?: ISODateString; closedAt?: ISODateString; managerUserId?: string; assignedUserIds: string[]; createdByUserId: string; createdAt: ISODateString; updatedAt: ISODateString }
export interface CaseAssignment { id: string; caseId: string; userId: string; assignmentType: "MANAGER" | "STAFF"; assignedAt: ISODateString; assignedByUserId: string }
export type CaseTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "NOT_APPLICABLE";
export interface CaseTask { id: string; caseId: string; title: string; description: string; assignedUserId?: string; status: CaseTaskStatus; required: boolean; dueAt?: ISODateString; completedAt?: ISODateString; completedByUserId?: string; sequence: number; createdAt: ISODateString; updatedAt: ISODateString }
export type ActivityType = "CASE_CREATED" | "CASE_ASSIGNED" | "TASK_COMPLETED" | "CUSTOMER_RESPONSE" | "STATUS_CHANGED" | "CASE_COMPLETED";
export interface CaseActivity { id: string; caseId: string; type: ActivityType; summary: string; actorUserId?: string; occurredAt: ISODateString }
export type ServiceRequestStatus = "NEW" | "OPEN" | "PENDING_CUSTOMER" | "PENDING_STAFF" | "RESOLVED" | "CLOSED";
export interface ServiceRequest { id: string; requestNumber: string; organizationId: string; customerId: string; subject: string; description: string; status: ServiceRequestStatus; priority: Priority; linkedCaseId?: string; assignedUserId?: string; lastActivityAt: ISODateString; createdAt: ISODateString; updatedAt: ISODateString }
