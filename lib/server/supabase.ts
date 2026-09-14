import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/server/config";

let client: SupabaseClient | undefined;

export function getSupabaseAdmin() {
  if (!client) {
    const { url, serviceRoleKey } = getSupabaseConfig();
    client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
  return client;
}
