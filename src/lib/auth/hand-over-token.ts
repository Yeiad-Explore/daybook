// GC-2: Supabase Auth does not keep Google's tokens. Right after the sign-in code exchange (on the server, in
// /auth/callback) the one-time refresh token goes to the store-google-token function, which keeps it in Vault.
// Browser JavaScript never sees it, and nothing here logs or returns it.
export interface ProviderSession {
  access_token: string;
  provider_token?: string | null;
  provider_refresh_token?: string | null;
}

export type HandOver = "stored" | "skipped" | "failed";

export async function handOverGoogleToken(
  session: ProviderSession,
  config: { supabaseUrl: string; publishableKey: string },
  fetchFn: typeof fetch = fetch,
): Promise<HandOver> {
  // Without both tokens there is nothing to store: an ordinary sign-in with no Calendar grant.
  if (!session.provider_refresh_token || !session.provider_token) return "skipped";
  try {
    const res = await fetchFn(`${config.supabaseUrl}/functions/v1/store-google-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: config.publishableKey,
      },
      body: JSON.stringify({ refresh_token: session.provider_refresh_token, access_token: session.provider_token }),
    });
    return res.ok ? "stored" : "failed";
  } catch {
    return "failed";
  }
}
