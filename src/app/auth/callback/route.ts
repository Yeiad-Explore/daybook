import { NextResponse, type NextRequest } from "next/server";
import { handOverGoogleToken } from "@/lib/auth/hand-over-token";
import { loginErrorFor } from "@/lib/auth/login-errors";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// OAuth return (PKCE): exchange the code for a session cookie, then go to Today (AUTH-1 AC1).
// A rejected sign-in (the allowlist hook, AUTH-2) arrives as error parameters instead of a code.
// GC-2: the one-time Google refresh token on this session goes straight to the server-side function that
// keeps it in Vault. A failure never blocks sign-in; /settings/calendar shows the real connection state.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const result = data.session
        ? await handOverGoogleToken(data.session, { supabaseUrl: env.supabaseUrl, publishableKey: env.supabasePublishableKey })
        : "skipped";
      if (result === "failed") console.error("Google Calendar token hand-over failed; the owner can reconnect in Settings.");
      // The code exchange put Google's provider tokens into the session cookie, which the browser can read. A refresh
      // returns a session without them and rewrites the cookie, so the refresh token lives only in Vault (GC-2).
      if (result !== "skipped" && (await supabase.auth.refreshSession()).error) console.error("Could not clear provider tokens from the session cookie.");
      return NextResponse.redirect(`${origin}${result === "failed" ? "/settings/calendar?connect=failed" : "/today"}`);
    }
    return NextResponse.redirect(`${origin}/login?error=${loginErrorFor(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${loginErrorFor(searchParams.get("error_description"))}`);
}
