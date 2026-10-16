import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

// Server client for Server Components, Server Actions and Route Handlers. Create one per request,
// never a shared instance: it carries that request's cookies.
// Source: supabase.com/docs/guides/auth/server-side/creating-a-client
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session on every request.
          // CONSTRAINTS.md exception E2.
        }
      },
    },
  });
}
