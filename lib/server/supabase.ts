import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/server/config";

let client: SupabaseClient | undefined;

export function getSupabaseAdmin() {
  if (!client) {
    const { url, serviceRoleKey } = getSupabaseConfig();
    client = createClient(url, serviceRoleKey, {
      // Use the runtime's native fetch. Vercel manages its dispatcher and
      // request signals; substituting a bundled Undici transport can behave
      // differently from `next dev` inside a deployed function.
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
  return client;
}
