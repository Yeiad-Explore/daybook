import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

// Browser client for Client Components. Source: supabase.com/docs/guides/auth/server-side/creating-a-client
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
}
