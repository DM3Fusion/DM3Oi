import { AuthCard } from "@/components/auth-card";
import { signOutAction } from "@/lib/auth/actions";
import { getAccessContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
export const metadata={title:"Access pending"};
export default async function Page(){const access=await getAccessContext();if(access?.isSuperAdmin||access?.internalAccess)redirect("/");return <AuthCard title="Access pending" description="Your account has not yet been assigned to an organization or customer portal."><div className="auth-message">Contact your DM3Oi administrator to request access. Authentication alone does not grant access to organization data.</div><form action={signOutAction} className="auth-form"><button type="submit">Sign Out</button></form></AuthCard>}
