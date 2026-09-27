import { AuthCard } from "@/components/auth-card";
import { redirect } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function PendingActivationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("status,organization:organizations(name,status)")
    .eq("user_id", user.id)
    .in("status", ["INVITED", "VERIFIED"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    const { data: activeMembership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (activeMembership) redirect("/");
    redirect("/account/unprovisioned");
  }

  const organizationValue = membership.organization;
  const organization = Array.isArray(organizationValue)
    ? organizationValue[0]
    : organizationValue;
  const organizationName = organization?.name ?? "your organization";

  const verified = membership.status === "VERIFIED";

  return (
    <AuthCard
      title={verified ? "Email verification complete" : "Invitation verification required"}
      description={
        verified
          ? `Your email address has been verified for ${organizationName}.`
          : `Your invitation to ${organizationName} has not completed email verification.`
      }
    >
      <div className="auth-message">
        {verified
          ? "An administrator must activate your organization access before you can use DM3Oi. After activation, sign in again to continue."
          : "Use the verification code or invitation link sent to your email."}
      </div>
      <div className="form-actions">
        <form action={signOutAction}>
          <button className="secondary-button">Sign out</button>
        </form>
      </div>
    </AuthCard>
  );
}
