import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/context";
import {
  ACTIVE_PORTAL_ACCESS_COOKIE,
  resolveEffectiveCustomerPortalAccessesForUser,
} from "@/lib/auth/customer-portal";
import { customerPortalCookieOptions } from "@/lib/auth/customer-portal-cookie";
import { getIdentityCategory } from "@/lib/auth/identity-category";
import { resolveInvitationCompletionDestination } from "@/lib/auth/invitation-completion";
import { getCustomerPortalOnboardingStatus } from "@/lib/data/customer-portal-provisioning-service";
import { createClient } from "@/lib/supabase/server";

type EffectivePortalAccesses = Awaited<
  ReturnType<typeof resolveEffectiveCustomerPortalAccessesForUser>
>["effectiveAccesses"];

const invitationRedirect = (
  request: NextRequest,
  path: "/" | "/account/pending-activation" | "/account/unprovisioned" | "/portal" | "/portal/select-account",
) => NextResponse.redirect(new URL(path, request.url));

async function reconcileAcceptedPortalInvitations(
  accesses: EffectivePortalAccesses,
  actorUserId: string,
) {
  const results = await Promise.allSettled(
    accesses.map((access) =>
      getCustomerPortalOnboardingStatus({
        organizationId: access.link.organization_id,
        customerId: access.link.customer_id,
        actorUserId,
      }),
    ),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected")
      console.error("Customer Portal invitation activation reconciliation failed", {
        operation: "inviteCompletionReconciliation",
        organizationId: accesses[index]?.link.organization_id,
        customerId: accesses[index]?.link.customer_id,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown reconciliation error",
      });
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(
      new URL(
        "/login?error=The%20invitation%20could%20not%20establish%20a%20session.",
        request.url,
      ),
    );

  const { data: verifiedMembership, error } = await supabase.rpc(
    "verify_my_membership_invitation",
  );
  if (error) {
    console.error("Invitation membership verification failed", {
      operation: "verifyMembershipInvitation",
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.redirect(
      new URL("/auth/invite?error=membership_verification", request.url),
    );
  }

  if (verifiedMembership?.length) {
    const decision = resolveInvitationCompletionDestination({
      hasVerifiedMembershipInvitation: true,
      identityCategory: "INTERNAL",
      effectivePortalAccessIds: [],
    });
    const response = invitationRedirect(request, decision.destination);
    response.cookies.delete(ACTIVE_ORGANIZATION_COOKIE);
    response.cookies.delete(ACTIVE_PORTAL_ACCESS_COOKIE);
    return response;
  }

  const identityCategory = await getIdentityCategory(user.id);
  if (identityCategory === "INTERNAL") {
    const decision = resolveInvitationCompletionDestination({
      hasVerifiedMembershipInvitation: false,
      identityCategory,
      effectivePortalAccessIds: [],
    });
    const response = invitationRedirect(request, decision.destination);
    response.cookies.delete(ACTIVE_ORGANIZATION_COOKIE);
    response.cookies.delete(ACTIVE_PORTAL_ACCESS_COOKIE);
    return response;
  }

  let effectiveAccesses: EffectivePortalAccesses = [];
  if (identityCategory === "CUSTOMER_PORTAL") {
    try {
      effectiveAccesses = (
        await resolveEffectiveCustomerPortalAccessesForUser(user.id)
      ).effectiveAccesses;
    } catch (portalError) {
      console.error("Invitation Customer Portal access resolution failed", {
        operation: "resolveInvitePortalAccess",
        message:
          portalError instanceof Error
            ? portalError.message
            : "Unknown portal access error",
      });
    }
  }

  if (effectiveAccesses.length) {
    await reconcileAcceptedPortalInvitations(effectiveAccesses, user.id);
  }

  const decision = resolveInvitationCompletionDestination({
    hasVerifiedMembershipInvitation: false,
    identityCategory,
    effectivePortalAccessIds: effectiveAccesses.map((access) => access.link.id),
  });
  const response = invitationRedirect(request, decision.destination);
  response.cookies.delete(ACTIVE_ORGANIZATION_COOKIE);
  if (decision.portalAccessId) {
    response.cookies.set(
      ACTIVE_PORTAL_ACCESS_COOKIE,
      decision.portalAccessId,
      customerPortalCookieOptions(),
    );
  } else {
    response.cookies.delete(ACTIVE_PORTAL_ACCESS_COOKIE);
  }
  return response;
}
