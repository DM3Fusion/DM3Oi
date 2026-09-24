import { createClient } from "@/lib/supabase/server";

export async function getNewTrialRequestCount() {
  const supabase = await createClient();

  const trialRequests = supabase.from.bind(supabase) as unknown as (
    relation: "trial_requests",
  ) => ReturnType<typeof supabase.from>;

  const { count, error } = await trialRequests("trial_requests")
    .select("id", { count: "exact", head: true })
    .eq("status" as never, "NEW" as never);

  if (error) {
    return 0;
  }

  return count ?? 0;
}
