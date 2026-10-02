import { cookies } from "next/headers";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig, requireSupabaseConfig } from "./config";
import type { Database } from "@/types/database.generated";

export function isSupabaseConfigured() {
  return getSupabaseConfig().configured;
}

export const createClient = cache(async () => {
  const { url, anonKey } = requireSupabaseConfig();
  const store = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies; proxy refreshes sessions.
        }
      },
    },
  });
});
