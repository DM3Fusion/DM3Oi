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

  return (
    <main className="public-main">
      <section className="auth-card">
        <p className="eyebrow">Account access</p>
        {membership.status === "VERIFIED" ? (
          <>
            <h1>Email verification complete</h1>
            <p>
              Your email address has been verified for {organizationName}.
            </p>
            <p>
              An administrator must activate your organization access before
              you can use DM3Oi.
            </p>
            <p>
              After activation, sign in again to continue.
            </p>
          </>
        ) : (
          <>
            <h1>Invitation verification required</h1>
            <p>
              Your invitation to {organizationName} has not completed email
              verification.
            </p>
            <p>
              Use the verification code or invitation link sent to your email.
            </p>
          </>
        )}
        <form action={signOutAction}>
          <button className="secondary-button">Sign out</button>
        </form>
      </section>
    </main>
  );
}
