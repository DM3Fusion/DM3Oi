import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

async function resolveNewTrialRequestCount() {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("trial_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "NEW");

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export const getNewTrialRequestCount = cache(resolveNewTrialRequestCount);
