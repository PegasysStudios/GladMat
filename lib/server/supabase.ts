import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Agent, fetch as undiciFetch } from "undici";
import { getSupabaseConfig } from "@/lib/server/config";

let client: SupabaseClient | undefined;

export function getSupabaseAdmin() {
  if (!client) {
    const { url, serviceRoleKey } = getSupabaseConfig();
    // Keep storage transfers off Node's shared HTTP/2 pool: a destroyed
    // session can otherwise make every later upload fail until restart.
    const dispatcher = new Agent({ allowH2: false });
    // Use the matching fetch implementation; Node releases can bundle a
    // different dispatcher interface than the installed Undici version.
    const storageFetch: typeof undiciFetch = (input, init) =>
      undiciFetch(input, { ...init, dispatcher, signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
    client = createClient(url, serviceRoleKey, {
      global: {
        fetch: storageFetch as unknown as typeof fetch,
      },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
  return client;
}
