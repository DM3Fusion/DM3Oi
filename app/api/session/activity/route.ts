import { createClient } from "@/lib/supabase/server";

type SessionPolicyState = {
  session_policy_valid?: boolean;
};

export async function POST() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("get_my_route_access_state", {
      target_is_meaningful_activity: true,
    })
    .maybeSingle();

  if (error) {
    console.error("Session activity refresh failed", {
      code: error.code,
      message: error.message,
    });

    return Response.json(
      { ok: false },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const state = data as SessionPolicyState | null;

  if (state?.session_policy_valid !== true) {
    return Response.json(
      { ok: false },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
