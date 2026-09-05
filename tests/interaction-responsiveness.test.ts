import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source=(path:string)=>readFileSync(path,"utf8");

test("shared submit control immediately exposes pending semantics and blocks duplicates",()=>{const button=source("components/pending-submit-button.tsx");assert.match(button,/useFormStatus\(\)/);assert.match(button,/disabled=\{disabled \|\| pending\}/);assert.match(button,/aria-busy=\{pending\}/);assert.match(button,/pending \? pendingLabel : children/);});

test("login password and code flows acknowledge first submit and retain authoritative redirects",()=>{const page=source("app/login/page.tsx");const actions=source("lib/auth/actions.ts");assert.match(page,/PendingSubmitButton pendingLabel="Signing in…"/);assert.match(page,/PendingSubmitButton pendingLabel="Verifying…"/);assert.match(page,/PendingSubmitButton pendingLabel="Sending…"/);assert.match(actions,/Invalid email or password/);assert.match(actions,/The email code is invalid or has expired/);assert.match(actions,/redirect\(next\)/);});

test("internal navigation gets immediate shared progress without replacing Next links",()=>{const feedback=source("components/navigation-feedback.tsx");const layout=source("app/layout.tsx");assert.match(feedback,/document\.addEventListener\("click", acknowledge, true\)/);assert.match(feedback,/anchor\.origin !== window\.location\.origin/);assert.match(feedback,/setPendingDestination\(destination\)/);assert.match(layout,/<NavigationFeedback\/>/);assert.match(layout,/<AppShell/);});

test("communications mutations use pending duplicate protection and still open their source",()=>{const page=source("app/communications/page.tsx");const actions=source("lib/data/communications-actions.ts");assert.match(page,/pendingLabel="Marking…"/);assert.match(page,/pendingLabel="Opening…"/);assert.match(page,/pendingLabel="Updating…"/);assert.match(actions,/setReadState\(value\(form, "notificationId"\), true\)/);assert.match(actions,/redirect\(safeDestination/);assert.match(actions,/revalidatePath\("\/", "layout"\)/);});

test("representative case and customer portal mutations prevent repeated submission",()=>{const casePage=source("app/cases/[caseId]/page.tsx");const questions=source("components/cases/case-questions.tsx");const portalReply=source("app/portal/service-requests/[serviceRequestId]/page.tsx");const portalCreate=source("app/portal/service-requests/new/page.tsx");assert.match(casePage,/pendingLabel="Updating…"/);assert.match(casePage,/pendingLabel="Creating…"/);assert.match(questions,/pendingLabel="Saving…"/);assert.match(portalReply,/pendingLabel="Sending…"/);assert.match(portalCreate,/pendingLabel="Submitting…"/);});

test("authenticated layout reuses resolved access scope for unread count",()=>{const layout=source("app/layout.tsx");const repository=source("lib/data/communications-repository.ts");assert.match(layout,/getUnreadNotificationCount\(\{organizationId:access\.activeOrganization\.id,userId:access\.user\.id\}\)/);assert.match(repository,/scope \? null : await requireInternalContext\(\)/);});

test("portal conversation loads independent settings and messages in parallel",()=>{const page=source("app/portal/service-requests/[serviceRequestId]/page.tsx");assert.match(page,/Promise\.all\(\[/);assert.match(page,/organization_settings/);assert.match(page,/service_request_messages/);});
