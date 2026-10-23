// Edge Function plumbing shared by both entry points: environment, CORS, JSON replies, caller identity.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleClient } from "./google.ts";
import type { Reply } from "./handlers.ts";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const reply = (r: Reply) => new Response(JSON.stringify(r.body), { status: r.status, headers: { ...CORS, "Content-Type": "application/json" } });

const env = (name: string) => Deno.env.get(name) || undefined;

/** The project's secret keys: the legacy service-role key and any key in SUPABASE_SECRET_KEYS (a name to key map). */
function secretKeys(): string[] {
  const keys: string[] = [];
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) keys.push(legacy);
  try {
    const map = JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    keys.push(...Object.values(map).filter((k) => typeof k === "string"));
  } catch {
    // ignore a malformed value
  }
  return keys;
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function adminClient(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const key = secretKeys()[0];
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export function googleClient(): GoogleClient | null {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  // The URL overrides exist for the local fake-Google run; production leaves them unset.
  return new GoogleClient({
    clientId,
    clientSecret,
    tokenUrl: env("GOOGLE_TOKEN_URL"),
    revokeUrl: env("GOOGLE_REVOKE_URL"),
    tokenInfoUrl: env("GOOGLE_TOKENINFO_URL"),
    apiBase: env("GOOGLE_API_BASE"),
  });
}

export const appUrl = () => env("APP_URL");

export type Caller = { mode: "secret" } | { mode: "user"; userId: string; email: string | null };

/** Who is calling: the project's secret key (cron) or a signed-in user's JWT. Anything else is null. */
export async function identify(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const apikey = req.headers.get("apikey");
  if (apikey && secretKeys().some((k) => safeEqual(k, apikey))) return { mode: "secret" };
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data.user) return null;
  return { mode: "user", userId: data.user.id, email: data.user.email ?? null };
}
