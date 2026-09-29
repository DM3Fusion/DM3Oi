import type { Case, CaseTask, Customer, User } from "@/domain/models";
import { isIncompleteCompatibilityCaseStatus } from "./case-lifecycle";
export const isCaseOverdue = (item: Case, now = new Date()) => Boolean(item.dueAt && new Date(item.dueAt) < now && isIncompleteCompatibilityCaseStatus(item.status));
export const isCaseDueSoon = (item: Case, now = new Date(), days = 7) => Boolean(item.dueAt && isIncompleteCompatibilityCaseStatus(item.status) && new Date(item.dueAt) >= now && new Date(item.dueAt).getTime() <= now.getTime() + days * 86400000);
export const isActiveCase = (item: Case) => isIncompleteCompatibilityCaseStatus(item.status);
export const customerFor = (item: Case, customers: readonly Customer[]) => customers.find((customer) => customer.id === item.customerId);
export const userFor = (id: string | undefined, users: readonly User[]) => users.find((user) => user.id === id);
export const tasksForCase = (id: string, tasks: readonly CaseTask[]) => tasks.filter((task) => task.caseId === id).sort((a, b) => a.sequence - b.sequence);
export const fullName = (user?: User) => user ? `${user.firstName} ${user.lastName}` : "Unassigned";
